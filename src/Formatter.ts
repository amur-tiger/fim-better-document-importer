import Util from "./Util";
import defaultFormats from "./defaultFormats";

export enum FormatMode {
	UNCHANGED, BOOK, WEB
}

export interface FormatDefinition {
	test: (element: HTMLElement) => any;
	tag?: string;
	prefix?: (test: any, element: HTMLElement) => string;
	postfix?: (test: any, element: HTMLElement) => string;
}

export class Formatter {
	public formatDefinitions: FormatDefinition[] = defaultFormats;

	public indentation: FormatMode;
	public spacing: FormatMode;

	private _doc: HTMLElement[];
	private _heading: HTMLElement;

	public get doc(): HTMLElement[] {
		return this._doc;
	}

	public get heading(): HTMLElement {
		return this._heading;
	}

	public set heading(heading: HTMLElement) {
		if (this._doc.filter(e => e === heading).length === 0) {
			throw new Error("The heading to import must be part of the document.");
		}

		this._heading = heading;
	}

	constructor(doc: string) {
		// The doc contains style links for fonts. Edge will complain about them and we don't need them
		// anyway, so to be sure, we remove the whole head.
		doc = doc.replace(/<head>.*?<\/head>/, "");

		const template = document.createElement("template");
		template.innerHTML = doc;
		this._doc = [];

		for (let i = 0; i < template.content.children.length; i++) {
			this._doc.push(template.content.children.item(i) as HTMLElement);
		}
	}

	/**
	 * Extracts headings from the document to allow the user to choose a smaller part of
	 * the document to import.
	 * @return {HTMLElement[]}
	 */
	getHeadings(): HTMLElement[] {
		return this._doc.filter(e => /^H\d$/.test(e.nodeName));
	}

	/**
	 * Returns the heading element that has the same text as the given text.
	 * @param name
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
	 * Extracts all elements of a chapter after a heading until the next heading of the same or higher level
	 * or the end of the document. The header itself is not included.
	 * @return {HTMLElement[]}
	 */
	private getElementsFromHeader() {
		if (!this._heading) {
			return this._doc;
		}

		const result = [];
		const level = this._heading.nodeName.slice(-1);
		let skipping = true;
		for (const element of this._doc) {
			if (skipping) {
				if (element === this._heading) {
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

		return result;
	}

	/**
	 * Converts a document to BBCode, including CSS styles, paragraph indenting and paragraph spacing. The
	 * given document elements get altered in the process!
	 * @param {HTMLElement[]} doc
	 * @return {String}
	 */
	format(doc) {
		return this.join(
			this.getSpacedParagraphs(
				this.getIndentedParagraphs(
					this.getStyledParagraphs(doc)
				)
			)
		);
	}

	/**
	 * Walks an element recursively and returns a string where selected CSS styles are turned into BBCode tags.
	 * @param {HTMLElement} element
	 * @param {Boolean} [skipParentStyle]
	 * @returns {String}
	 * @private
	 */
	__walkRecursive(element: HTMLElement, skipParentStyle?: boolean): string {
		if (element.nodeType == Node.TEXT_NODE) {
			return element.textContent;
		}

		if (element.children.length == 1 && element.children[0].nodeName == "A") {
			const link = element.children[0] as HTMLLinkElement;
			if (link.id.indexOf("cmnt_") === 0) {
				// Ignore GDocs comments.
				return "";
			}

			// Links are pre-colored, ignore the style since FiMFiction has it's own.
			const formatted = this.__walkRecursive(link);
			return "[url=" + Util.parseGoogleRefLink(link.getAttribute("href")) + "]" + formatted + "[/url]";
		}

		if (element.children.length == 1 && element.children[0].nodeName == "IMG") {
			const img = element.children[0] as HTMLImageElement;
			// Images are served by Google and there seems to be no way to get to the original.
			return "[img]" + img.src + "[/img]";
		}

		let text = Util.toArray(element.childNodes).map((node: HTMLElement) => this.__walkRecursive(node)).join("");
		if (skipParentStyle) {
			// Headings have some recursive styling on them, but BBCode tags cannot be written recursively.
			// Todo: This needs a better flattening algorithm later.
			return text;
		}

		for (const format of this.formatDefinitions) {
			const test = format.test(element);
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
	 * Uses format definitions to turn CSS styling into BBCode tags. The given document elements get altered in
	 * the process!
	 * @param {HTMLElement[]} doc
	 * @return {HTMLParagraphElement[]}
	 */
	getStyledParagraphs(doc) {
		const result = [];
		for (const element of doc) {
			if (element.nodeName === "P") {
				element.textContent = this.__walkRecursive(element);
				result.push(element);
			} else if (element.nodeName === "HR") {
				const horizontalRule = window.document.createElement("p");
				horizontalRule.textContent = "[hr]";
				result.push(horizontalRule);
			} else if (/^H\d$/.test(element.nodeName)) {
				const heading = window.document.createElement("p");
				heading.textContent = this.__walkRecursive(element, true);
				result.push(heading);
			}
		}

		return result;
	}

	/**
	 * Indents paragraphs depending on the indentation setting given in the constructor. Indented paragraphs
	 * will be prepended with a tab character. The given document elements will be altered in the process!
	 * @param {HTMLParagraphElement[]} paragraphs
	 * @return {HTMLParagraphElement[]}
	 */
	getIndentedParagraphs(paragraphs) {
		const result = [];
		for (const element of paragraphs) {
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

			result.push(element);
		}

		return result;
	}

	/**
	 * Spaces out the paragraphs depending on the spacing setting given in the constructor. Appends line breaks
	 * to the paragraphs if necessary. The given document elements will be altered in the process!
	 * @param {HTMLParagraphElement[]} paragraphs
	 * @return {HTMLParagraphElement[]}
	 */
	getSpacedParagraphs(paragraphs) {
		const result = [];
		let fulltextParagraph = false;
		for (let i = 0; i < paragraphs.length; i++) {
			const element = paragraphs[i];
			let count = 1;
			while (i < paragraphs.length - 1 && paragraphs[i + 1].textContent.trim().length === 0) {
				count += 1;
				i += 1;
			}

			if (!fulltextParagraph && /[\.!?…"„“”«»-](?:\[.*?])*\s*$/.test(element.textContent)) {
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

			result.push(element);
		}

		return result;
	}

	/**
	 * Joins the given paragraphs together.
	 * @param {HTMLParagraphElement[]} paragraphs
	 * @return {String}
	 */
	join(paragraphs) {
		return paragraphs.map((e: HTMLParagraphElement) => e.textContent).join("").replace(/^[\r\n]+|\s+$/g, "");
	}
}
