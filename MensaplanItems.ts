export class Meal {
	name: string;

	price_students: string;
	price_workers: string;
	price_guest: string;
	image_url: string;

	constructor(name: string, prices: string[], image_url: string) {
		this.name = name;
		this.price_students = prices[0].replace(",", ".");
		this.price_workers = prices[1].replace(",", ".");
		this.price_guest = prices[2].replace(",", ".");
		this.image_url = image_url;
	}

	to_markdown(): string {
		const image_format = `<img src="${this.image_url}" width="200"/>`;
		return `|${image_format}|${this.name}|${this.price_students}|${this.price_workers}|${this.price_guest}|`;
	}
}

export class Weekday {
	date: Date;
	suppen: Meal[];
	hauptspeisen: Meal[];
	beilagen: Meal[];
	nachspeisen: Meal[];

	constructor(date: Date) {
		this.date = date;
		this.suppen = [];
		this.hauptspeisen = [];
		this.beilagen = [];
		this.nachspeisen = [];
	}

	add_meal(meal: Meal, meal_type: string) {
		switch (meal_type.toLowerCase()) {
			case "hauptgerichte":
				this.hauptspeisen.push(meal);
				break;
			case "beilagen":
				this.beilagen.push(meal);
				break;
			case "suppen":
				this.suppen.push(meal);
				break;
			case "nachspeisen":
				this.nachspeisen.push(meal);
				break;
			default:
				throw new Error(`Unknown meal type: ${meal_type}`);
		}
	}

	get_markdown_table_header(): string {
		let res = "| Bilder | Name | Studentenpreis | Mitarbeiterpreis | Gästepreis |\n";
		res += "|--------|------|----------------|------------------|------------|\n";
		return res;
	}
	
	to_markdown_str(): string {
		let res = "## Suppen\n";
		res += this.get_markdown_table_header();
		for (const su of this.suppen) {
			res += `${su.to_markdown()}\n`;
		}
		res += "## Beilagen\n";
		res += this.get_markdown_table_header();
		for (const vs of this.beilagen) {
			res += `${vs.to_markdown()}\n`;
		}
		res += "## Hauptspeisen\n";
		res += this.get_markdown_table_header();
		for (const hs of this.hauptspeisen) {
			res += `${hs.to_markdown()}\n`;
		}
		res += "## Nachspeisen\n";
		res += this.get_markdown_table_header();
		for (const ns of this.nachspeisen) {
			res += `${ns.to_markdown()}\n`;
		}

		return res;
	}
}
