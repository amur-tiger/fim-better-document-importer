import Util from "./Util";
import defaultFormats from "./defaultFormats";

export enum FormatMode {
	UNCHANGED, BOOK, WEB
}

export interface FormatDefinitionOptions {
	baseSize: number;
}

export interface FormatDefinition {
	test: (element: HTMLElement, options: FormatDefinitionOptions) => any;
	tag?: string;
	prefix?: (test: any, element: HTMLElement) => string;
	postfix?: (test: any, element: HTMLElement) => string;
}

export class Formatter {
	public formatDefinitions: FormatDefinition[] = defaultFormats;

	public indentation: FormatMode = FormatMode.UNCHANGED;
	public spacing: FormatMode = FormatMode.UNCHANGED;
	public customCaptions: boolean = true;
	public sizeAutoScale: boolean = true;

	private doc: HTMLElement[] = [];
	private heading: HTMLElement = null;

	constructor(doc: string, private context: HTMLDocument) {
		// The doc contains style links for fonts. Edge will complain about them and we don't need them
		// anyway, so to be sure, we remove the whole head.
		doc = doc.replace(/<head>.*?<\/head>/, "");

		const template = this.context.createElement("template");
		template.innerHTML = doc;
		const elements = template.content.querySelectorAll("*");

		for (let i = 0; i < elements.length; i++) {
			this.doc.push(elements[i] as HTMLElement);
		}
	}

	/**
	 * Extracts headings from the document to allow the user to choose a smaller part of
	 * the document to import.
	 * @return {HTMLElement[]}
	 */
	getHeadings(): HTMLElement[] {
		return this.doc.filter(e => /^H\d$/.test(e.nodeName));
	}

	/**
	 * Returns the heading element that has the same text as the given text.
	 * @param {string} name
	 * @return {HTMLElement}
	 */
	getHeadingWithName(name: string): HTMLElement {
		const elements = this.getHeadings();
		for (const element of elements) {
			if (element.textContent === name) {
				return element;
			}
		}

		return null;
	}

	/**
	 * Returns the currently selected heading or null if there is no heading selected.
	 * @returns {HTMLElement}
	 */
	getSelectedHeading() {
		return this.heading;
	}

	/**
	 * Filters the document by discarding elements that are not part of the selected heading. This action can neither
	 * be repeated nor undone.
	 * @param heading
	 */
	setSelectedHeading(heading: HTMLElement) {
		if (this.heading) {
			throw new Error("There is already a heading selected.");
		}

		if (!heading) {
			return;
		}

		if (this.doc.filter(e => e === heading).length === 0) {
			throw new Error("The heading to import must be part of the document.");
		}

		this.heading = heading;
		this.filterDocByHeading();
	}

	/**
	 * Extracts all elements of a chapter after a heading until the next heading of the same or higher level
	 * or the end of the document. The header itself is not included.
	 */
	private filterDocByHeading() {
		if (!this.heading) {
			return;
		}

		const result = [];
		const level = this.heading.nodeName.slice(-1);

		let skipping = true;
		for (const element of this.doc) {
			if (skipping) {
				if (element === this.heading) {
					skipping = false;
				}
			} else {
				if (/^H\d$/.test(element.nodeName)) {
					const nextLevel = element.nodeName.slice(-1);
					if (nextLevel <= level) break;
				}

				result.push(element);
			}
		}

		this.doc = result;
	}

	/**
	 * Converts a document to BBCode, including CSS styles, paragraph indenting and paragraph spacing. The
	 * given document elements get altered in the process!
	 * @return {string}
	 */
	format() {
		this.styleParagraphs();
		this.indentParagraphs();
		this.spaceParagraphs();

		return this.doc.map((e: HTMLParagraphElement) => e.textContent).join("").replace(/^[\r\n]+|\s+$/g, "");
	}

	/**
	 * Walks an element recursively and returns a string where selected CSS styles are turned into BBCode tags.
	 * @param {HTMLElement} element
	 * @param {number} [baseSize]
	 * @param {boolean} [skipParentStyle]
	 * @returns {string}
	 * @private
	 */
	private walkRecursive(element: HTMLElement, baseSize?: number, skipParentStyle?: boolean): string {
		if (element.nodeType == 3) {
			return element.textContent;
		}

		if (element.children.length == 1 && element.children[0].nodeName == "A") {
			const link = element.children[0] as HTMLLinkElement;
			if (link.id.indexOf("cmnt_") === 0) {
				// Ignore GDocs comments.
				return "";
			}

			// Links are pre-colored, ignore the style since FiMFiction has it's own.
			const formatted = this.walkRecursive(link, baseSize);
			return "[url=" + Util.parseGoogleRefLink(link.getAttribute("href")) + "]" + formatted + "[/url]";
		}

		if (element.children.length == 1 && element.children[0].nodeName == "IMG") {
			const img = element.children[0] as HTMLImageElement;
			// Images are served by Google and there seems to be no way to get to the original.
			return "[img]" + img.src + "[/img]";
		}

		let text = Util.toArray(element.childNodes).map((node: HTMLElement) => this.walkRecursive(node, baseSize)).join("");
		if (skipParentStyle) {
			// Headings have some recursive styling on them, but BBCode tags cannot be written recursively.
			// Todo: This needs a better flattening algorithm later.
			return text;
		}

		for (const format of this.formatDefinitions) {
			const test = format.test(element, {
				baseSize: baseSize
			});
			if (test) {
				if (format.tag) {
					text = "[" + format.tag + "]" + text + "[/" + format.tag + "]";
				} else {
					text = format.prefix(test, element) + text + format.postfix(test, element);
				}
			}
		}

		return text;
	}

	/**
	 * Checks the document for the dominant font size, measured in pt, and returns it.
	 */
	private findBaseScale(): number {
		const map = {};
		let max = [0, 12];

		for (const element of this.doc) {
			if (element.nodeName !== "P") {
				continue;
			}

			for (const node of Util.toArray(element.childNodes)) {
				if (node.nodeType == 3) {
					continue;
				}

				const size = (node as HTMLElement).style.fontSize || "12pt";
				map[size] = (map[size] || 0) + 1;
				if (map[size] > max[0]) {
					max = [map[size], parseInt(size.slice(0, -2))];
				}
			}
		}

		return max[1];
	}

	/**
	 * Uses format definitions to turn CSS styling into BBCode tags.
	 * @return {HTMLParagraphElement[]}
	 */
	private styleParagraphs() {
		let baseScale = null;
		if (this.sizeAutoScale) {
			baseScale = this.findBaseScale();
			if (baseScale === 11 || baseScale === 12) {
				baseScale = null;
			}
		}

		let i = this.doc.length;
		while (i--) {
			const element = this.doc[i];
			if (element.nodeName === "P") {
				element.textContent = this.walkRecursive(element, baseScale);
			} else if (element.nodeName === "HR") {
				this.doc[i] = this.context.createElement("p");
				this.doc[i].textContent = "[hr]";
			} else if (/^H\d$/.test(element.nodeName)) {
				this.doc[i] = this.context.createElement("p");
				this.doc[i].textContent = this.walkRecursive(element, baseScale, true);
			} else {
				this.doc.splice(i, 1);
			}
		}
	}

	/**
	 * Indents paragraphs depending on the indentation setting. Indented paragraphs will be prepended
	 * with a tab character.
	 */
	private indentParagraphs() {
		for (const element of this.doc) {
			if (this.indentation === FormatMode.BOOK || this.indentation === FormatMode.WEB) {
				element.textContent = element.textContent.trim();
				if (element.textContent.length > 0 && (this.indentation === FormatMode.BOOK || /^(?:\[.*?])*["„“”«»]/.test(element.textContent))) {
					element.textContent = "\t" + element.textContent;
				}
			} else {
				if (element.style.textIndent && parseFloat(element.style.textIndent.slice(0, -2)) > 0 && element.textContent.length > 0) {
					// This adds a tab character as an indentation for paragraphs that were indented using the ruler
					element.textContent = "\t" + element.textContent;
				}
			}
		}
	}

	/**
	 * Spaces out the paragraphs depending on the spacing setting. Appends line breaks to the paragraphs if necessary.
	 */
	private spaceParagraphs() {
		let fulltextParagraph = !this.customCaptions;
		for (let i = 0; i < this.doc.length; i++) {
			const element = this.doc[i];

			let count = 1;
			const ni = i + 1;
			while (ni < this.doc.length && this.doc[ni].textContent.trim().length === 0) {
				this.doc.splice(ni, 1);
				count += 1;
			}

			if (!fulltextParagraph && /[.!?…"„“”«»-](?:\[.*?])*\s*$/.test(element.textContent)) {
				fulltextParagraph = true;
			}

			if (fulltextParagraph && this.spacing === FormatMode.BOOK) {
				if (count == 2) count = 1;
			} else if (fulltextParagraph && this.spacing === FormatMode.WEB) {
				if (count < 2) count = 2;
			}

			while (count-- > 0) {
				element.textContent += "\n";
			}
		}
	}
}
