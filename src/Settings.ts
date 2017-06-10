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

	get paragraphCustomCaptions(): boolean {
		return this.get("pcaption", "1") === "1";
	}

	set paragraphCustomCaptions(value: boolean) {
		this.set("pcaption", value ? "1" : "0");
	}

	get sizeAutoScale(): boolean {
		return this.get("sscale", "1") === "1";
	}

	set sizeAutoScale(value: boolean) {
		this.set("sscale", value ? "1" : "0");
	}
}
