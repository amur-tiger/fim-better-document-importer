export default class Settings {
	constructor(private getter, private setter) {
	}

	get(key, std) {
		return this.getter(key, std);
	}

	getObj(key, std) {
		return JSON.parse(this.getter(key, typeof std === "undefined" ? "{}" : std));
	}

	set(key, value) {
		this.setter(key, value);
	}

	setObj(key, value) {
		this.setter(key, JSON.stringify(value));
	}

	get paragraphIndentationMode() {
		return this.get("pindent", "web");
	}

	set paragraphIndentationMode(mode) {
		this.set("pindent", mode);
	}

	get paragraphSpacingMode() {
		return this.get("pspace", "web");
	}

	set paragraphSpacingMode(mode) {
		this.set("pspace", mode);
	}
}
