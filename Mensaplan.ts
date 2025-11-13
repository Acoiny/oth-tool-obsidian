import { requestUrl } from "obsidian";
import * as cheerio from "cheerio";
import { Meal, Weekday } from "./MensaplanItems";

/**
 * Get all weekday dates (Monday-Friday) for current or next week
 * @param useNextWeek - If true, returns next week's dates. If false, returns current week's dates
 * @returns Array of Date objects for Monday through Friday
 */
export function getWeekDates(useNextWeek = false): Date[] {
	const today = new Date();
	const currentDay = today.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday

	// Calculate days to subtract to get to Monday of current week
	// If Sunday (0), go back 6 days; otherwise go back (currentDay - 1) days
	const daysToMonday = currentDay === 0 ? -6 : 1 - currentDay;

	// Get Monday of the target week
	const monday = new Date(today);
	monday.setDate(today.getDate() + daysToMonday + (useNextWeek ? 7 : 0));
	monday.setHours(12, 0, 0, 0);

	// Generate Monday through Friday
	const dates: Date[] = [];
	for (let i = 0; i < 5; i++) {
		const date = new Date(monday);
		date.setDate(monday.getDate() + i);
		dates.push(date);
	}

	return dates;
}

export class Mensaplan {
	readonly url: string;
	readonly base_url: string;
	days: Map<Date, Weekday>;

	constructor(base_url: string, rest_url: string) {
		this.base_url = base_url;
		this.url = base_url + rest_url;
		this.days = new Map();
	}

	async fetchDay(date: Date) {
		const data = {
			date: date.toISOString().split("T")[0],
			func: "make_spl",
			lang: "de",
			locId: "HS-R-tag",
			w: "",
		};

		const res = await requestUrl({
			url: this.url,
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
			},
			body: new URLSearchParams(data).toString(),
		});

		const $ = cheerio.load(res.text);

		let day = this.days.get(date);
		if (!day) {
			day = new Weekday(date);
			this.days.set(date, day);
		}

		let current_meal_type = "";

		const headers = $("tr");

		headers.each((_, header) => {
			const $header = $(header);
			const cl = $header.attr("class");
			if (!cl) return;

			if (cl.includes("gruppenkopf")) {
				const raw = $header.find("td").text();
				current_meal_type = raw.split(/[\s\u00A0]+/)[0];
			}

			if (cl.includes("essenzeile")) {
				const contents = $header.find("td");
				const preise: string[] = [];
				$header.find("td.preis").each((_, el) => {
					preise.push($(el).text().trim());
				});

				const name = contents.eq(1).text().trim();
				let img_url = "";
				const img = contents.eq(0).find("img");
				if (img.length > 0) {
					const src = img.attr("src");

					if (src) img_url = this.base_url + src;
				}

				if (day)
					day.add_meal(
						new Meal(name, preise, img_url),
						current_meal_type
					);
			}
		});
	}

	to_markdown_str(): string {
		let res = "";
		const weekdays = [
			"Montag",
			"Dienstag",
			"Mittwoch",
			"Donnerstag",
			"Freitag",
			"Samstag",
			"Sonntag",
		];

		for (const [d, day] of this.days) {
			try {
				const weekdayIndex = d.getDay() === 0 ? 6 : d.getDay() - 1; // Convert Sunday (0) to 6, and shift Monday-Saturday
				const dateStr = d.toLocaleDateString("de-DE", {
					day: "2-digit",
					month: "2-digit",
					year: "numeric",
				});
				res += `# ${weekdays[weekdayIndex]} (${dateStr})\n`;
				res += day.to_markdown_str() + "\n";
			} catch (e) {
				res += "> [!WARNING]\n> No mensaplan!\n";
			}
		}

		return res;
	}
}
