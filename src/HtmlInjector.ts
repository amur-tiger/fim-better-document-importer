import Mode from "./Mode";
import Settings from "./Settings";
import { FormatMode } from "./Formatter";
import EventSource from "./EventSource";

export default class HtmlInjector {
	private readonly onImport = new EventSource<HtmlInjector, HTMLButtonElement>(this);
	private readonly onQuickImport = new EventSource<HtmlInjector, HTMLButtonElement>(this);
	private editorElement: HTMLInputElement = null;
	private isInjected = false;

	get importEvent() {
		return this.onImport.expose();
	}

	get quickImportEvent() {
		return this.onQuickImport.expose();
	}

	constructor(private settings: Settings, private context: HTMLDocument) {
	}

	/**
	 * Analyzes the current URL and determines which mode the importer script should run in. Returns one of
	 * the constants defined in `Modes`.
	 * @returns {String}
	 */
	getPageMode(w?: Window): Mode {
		w = w || window;
		return w.location.href.indexOf("manage/blog-posts") >= 0 ? Mode.BLOG : Mode.CHAPTER;
	}

	/**
	 * Injects HTML fragments necessary for the userscript depending on the current page mode as returned by
	 * `getPageMode()`.
	 */
	inject() {
		if (this.isInjected) {
			return;
		}

		switch (this.getPageMode()) {
			case Mode.SETTINGS:
				this.injectSettings();
				break;
			case Mode.BLOG:
				this.editorElement = this.context.getElementById("blog_post_content") as HTMLInputElement;
				this.injectImportButton();
				break;
			case Mode.CHAPTER:
				this.editorElement = this.context.getElementById("chapter_editor") as HTMLInputElement;
				if (!this.editorElement) {
					break;
				}

				this.injectImportButton();
				break;
		}

		this.isInjected = true;
	}

	/**
	 * Sets the story or chapter text in the editor window.
	 * @param text
	 */
	setEditorText(text: string) {
		if (this.editorElement) {
			this.editorElement.value = text;
		}
	}

	/**
	 * Determines the quick import id of the current chapter or blog post. Returns null if the current page is
	 * neither a blog post nor a chapter.
	 * @returns {string}
	 */
	getQuickImportKey(): string {
		switch (this.getPageMode()) {
			case Mode.BLOG:
				// get the id from the URL
				const match = window.location.href.match(/\/(\d+)/);
				if (!match) return null;
				return "blog-" + match[1];
			case Mode.CHAPTER:
				// Get the ID of the chapter. This works for both released and unreleased chapters.
				const chapterForm = this.context.getElementById("chapter_edit_form") as HTMLFormElement;
				return "chapter-" + chapterForm.elements["chapter"].value;
			default:
				return null;
		}
	}

	/**
	 * Toggles whether the given button is disabled and shows a waiting animation if so.
	 * @param {HTMLButtonElement} button
	 */
	toggleButtonBusy(button: HTMLButtonElement) {
		if (button.disabled) {
			const icon = button.getElementsByTagName("i")[0];
			if (icon) {
				icon.className = icon.dataset["originalIconClass"];
				delete icon.dataset["originalIconClass"];
			}

			button.disabled = false;
		} else {
			const icon = button.getElementsByTagName("i")[0];
			if (icon) {
				icon.dataset["originalIconClass"] = icon.className;
				icon.className = "fa fa-spin fa-spinner";
			}

			button.disabled = true;
		}
	}

	/**
	 * Takes a list of radio button elements and determines which one is selected.
	 * @param elements
	 * @returns {FormatMode}
	 */
	private parseFormatModeRadio(elements: NodeListOf<HTMLElement>): FormatMode {
		const inputs = Array.prototype.filter.call(elements, e => e instanceof HTMLInputElement) as HTMLInputElement[];
		const value = inputs.filter(e => e.checked)[0].value;
		switch (value) {
			case "book":
				return FormatMode.BOOK;
			case "web":
				return FormatMode.WEB;
			default:
				return FormatMode.UNCHANGED;
		}
	}

	/**
	 * Injects the BDI settings into the settings page.
	 */
	private injectSettings() {
		const pIndent = this.settings.paragraphIndentationMode;
		const pSpace = this.settings.paragraphSpacingMode;
		const pCaption = this.settings.paragraphCustomCaptions;
		const sScale = this.settings.sizeAutoScale;

		const table = this.context.createElement("tbody");
		table.innerHTML = `<tr><td colspan="2" class="section_header"><b>Better Importer Settings</b></td></tr>
            <tr><td class="label">Paragraph Indentation</td><td>
            <label><input type="radio" name="bdi_pindent" value="as-is" ${pIndent === FormatMode.UNCHANGED ? "checked" : ""}/> Import as-is</label><br/>
            <label><input type="radio" name="bdi_pindent" value="book" ${pIndent === FormatMode.BOOK ? "checked" : ""}/> Book-Style: Indent all paragraphs</label><br/>
            <label><input type="radio" name="bdi_pindent" value="web" ${pIndent === FormatMode.WEB ? "checked" : ""}/> Web-Style: Only indent paragraphs starting with speech</label>
            </td></tr><tr><td class="label">Paragraph Spacing</td><td>
            <label><input type="radio" name="bdi_pspace" value="as-is" ${pSpace === FormatMode.UNCHANGED ? "checked" : ""}/> Import as-is</label><br/>
            <label><input type="radio" name="bdi_pspace" value="book" ${pSpace === FormatMode.BOOK ? "checked" : ""}/> Book-Style: Eliminate less than two line breaks</label><br/>
            <label><input type="radio" name="bdi_pspace" value="web" ${pSpace === FormatMode.WEB ? "checked" : ""}/> Web-Style: Insert space between paragraphs</label>
            </td></tr><tr><td class="label">Handle Custom Captions</td><td>
            <label class="toggleable-switch"><input type="checkbox" name="bdi_pcaption" value="1" ${pCaption ? "checked" : ""}/><a></a></label>
			</td></tr><tr><td class="label">Auto-Scale Custom Sizes</td><td>
			<label class="toggleable-switch"><input type="checkbox" name="bdi_sscale" value="1" ${sScale ? "checked" : ""}/><a></a></label>
			</td></tr>`;

		const settingsForm = this.context.getElementById("local_site_settings");
		settingsForm.firstElementChild.insertBefore(table, settingsForm.firstElementChild.lastElementChild);

		const button = settingsForm.lastElementChild.lastElementChild.getElementsByTagName("button")[0];
		button.addEventListener("click", () => {
			this.settings.paragraphIndentationMode = this.parseFormatModeRadio(this.context.getElementsByName("bdi_pindent"));
			this.settings.paragraphSpacingMode = this.parseFormatModeRadio(this.context.getElementsByName("bdi_pspace"));
			this.settings.paragraphCustomCaptions = (this.context.getElementsByName("bdi_pcaption")[0] as HTMLInputElement).checked;
			this.settings.sizeAutoScale = (this.context.getElementsByName("bdi_sscale")[0] as HTMLInputElement).checked;
		});
	}

	/**
	 * Injects the import button on chapter pages. Injects the quick import button if the quick import check succeeds.
	 */
	private injectImportButton() {
		const toolbar = this.context.querySelector(".toolbar_buttons");
		const buttonItem = this.context.createElement("li");
		const button = this.context.createElement("button");
		button.title = "Import from Google Docs";
		button.innerHTML = '<i class="fa fa-cloud-download"></i> Import';

		buttonItem.appendChild(button);
		toolbar.insertBefore(buttonItem, toolbar.firstChild);

		button.addEventListener("click", () => this.onImport.trigger(button));
		this.injectQuickImportButton(button);
	}

	/**
	 * Injects the quick import button if the quick import check succeeds.
	 * @param button
	 */
	private injectQuickImportButton(button: HTMLElement) {
		const quickImportKey = this.getQuickImportKey();
		if (!quickImportKey) {
			return;
		}

		const quickImportCheck = this.settings.getObj(quickImportKey);
		if (!quickImportCheck.id) {
			return;
		}

		const quickButtonItem = this.context.createElement("li");
		const quickButton = this.context.createElement("button");
		quickButton.title = "Quick Import \"" + quickImportCheck.name + (quickImportCheck.chapter ? ": " + quickImportCheck.chapter : "") + "\" from Google Docs";
		quickButton.innerHTML = '<i class="fa fa-bolt"></i>';

		quickButtonItem.appendChild(quickButton);
		button.parentNode.parentNode.insertBefore(quickButtonItem, button.parentNode);

		quickButton.addEventListener("click", () => this.onQuickImport.trigger(quickButton));
	}
}
