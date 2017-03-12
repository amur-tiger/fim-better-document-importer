import { FormatMode } from "./Formatter";

export default class Settings {
	constructor(private getter: (key: string, std?: string) => string, private setter: (key: string, value: string) => void) {
	}

	get(key: string, std?: string): string {
		return this.getter(key, std);
	}

	getObj(key: string, std?: any): any {
		return JSON.parse(this.getter(key, typeof std === "undefined" ? "{}" : std));
	}

	set(key: string, value: string): void {
		this.setter(key, value);
	}

	setObj(key: string, value: any): void {
		this.setter(key, JSON.stringify(value));
	}

	get paragraphIndentationMode(): FormatMode {
		const mode = this.get("pindent", "web");
		switch (mode) {
			case "book": return FormatMode.BOOK;
			case "web": return FormatMode.WEB;
			default: return FormatMode.UNCHANGED;
		}
	}

	set paragraphIndentationMode(mode: FormatMode) {
		switch (mode) {
			case FormatMode.BOOK:
				this.set("pindent", "book");
				break;
			case FormatMode.WEB:
				this.set("pindent", "web");
				break;
			default:
				this.set("pindent", "as-is");
				break;
		}
	}

	get paragraphSpacingMode(): FormatMode {
		const mode = this.get("pspace", "web");
		switch (mode) {
			case "book": return FormatMode.BOOK;
			case "web": return FormatMode.WEB;
			default: return FormatMode.UNCHANGED;
		}
	}

	set paragraphSpacingMode(mode: FormatMode) {
		switch (mode) {
			case FormatMode.BOOK:
				this.set("pspace", "book");
				break;
			case FormatMode.WEB:
				this.set("pspace", "web");
				break;
			default:
				this.set("pspace", "as-is");
				break;
		}
	}
}
