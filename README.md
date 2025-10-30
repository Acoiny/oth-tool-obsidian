# OTH-Tool Obsidian Plugin
This plugin integrates the [oth-scrape-tool](https://github.com/Acoiny/oth-scrape-tool)
into obsidian. It can automatically get the tool and then executes
the tool and dumps the mensaplan into a specified file.

## Configuration
The tool contains some settings, the python3 executable's path has to be
manually set to a `python3` executable, that has access to the
`request` and `BeautifulSoup4` packages. It can be the executable
in a virtual environment.

## Future plans
- Make the tool automatically generate a virtual environment inside the pulled folder and use that python executable.
- allow selection of today or whole week
- execute tool when opening obsidian for the first time of the day and display file
