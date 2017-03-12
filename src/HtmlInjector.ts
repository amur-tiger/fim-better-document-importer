import Mode from "./Mode";
import Settings from "./Settings";
import { FormatMode } from "./Formatter";
import EventSource from "./EventSource";

export default class HtmlInjector {
	private readonly onImport = new EventSource<HtmlInjector, void>(this);
	private readonly onQuickImport = new EventSource<HtmlInjector, void>(this);
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
		return w.location.href.indexOf("manage_user/local_settings") >= 0 ? Mode.SETTINGS :
			(w.location.href.indexOf("manage_user/edit_blog_post") >= 0 ? Mode.BLOG : Mode.CHAPTER);
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
				this.injectImportButtonOnBlog();
				break;
			case Mode.CHAPTER:
				this.injectImportButtonOnChapter();
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
				// Get the ID of the blog post. The form is named "edit_story_form" for some reason.
				const blogForm = this.context.getElementById("edit_story_form") as HTMLFormElement;
				return "blog-" + blogForm.elements["post_id"].value;
			case Mode.CHAPTER:
				// Get the ID of the chapter. This works for both released and unreleased chapters.
				const chapterForm = this.context.getElementById("chapter_edit_form") as HTMLFormElement;
				return "chapter-" + chapterForm.elements["chapter"].value;
			default:
				return null;
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

		const table = this.context.createElement("tbody");
		table.innerHTML = `<tr><td colspan="2" class="section_header"><b>Better Importer Settings</b></td></tr>
            <tr><td class="label">Paragraph indentation</td><td>
            <label><input type="radio" name="bdi_pindent" value="as-is" ${pIndent === FormatMode.UNCHANGED ? "checked" : ""}/> Import as-is</label><br/>
            <label><input type="radio" name="bdi_pindent" value="book" ${pIndent === FormatMode.BOOK ? "checked" : ""}/> Book-Style: Indent all paragraphs</label><br/>
            <label><input type="radio" name="bdi_pindent" value="web" ${pIndent === FormatMode.WEB ? "checked" : ""}/> Web-Style: Only indent paragraphs starting with speech</label>
            </td></tr><tr><td class="label">Paragraph spacing</td><td>
            <label><input type="radio" name="bdi_pspace" value="as-is" ${pSpace === FormatMode.UNCHANGED ? "checked" : ""}/> Import as-is</label><br/>
            <label><input type="radio" name="bdi_pspace" value="book" ${pSpace === FormatMode.BOOK ? "checked" : ""}/> Book-Style: Eliminate less than two line breaks</label><br/>
            <label><input type="radio" name="bdi_pspace" value="web" ${pSpace === FormatMode.WEB ? "checked" : ""}/> Web-Style: Insert space between paragraphs</label>
            </td></tr>`;

		const settingsForm = this.context.getElementById("local_site_settings");
		settingsForm.firstElementChild.insertBefore(table, settingsForm.firstElementChild.lastElementChild);

		const button = settingsForm.lastElementChild.lastElementChild.getElementsByTagName("button")[0];
		button.addEventListener("click", () => {
			this.settings.paragraphIndentationMode = this.parseFormatModeRadio(this.context.getElementsByName("bdi_pindent"));
			this.settings.paragraphSpacingMode = this.parseFormatModeRadio(this.context.getElementsByName("bdi_pspace"));
		});
	}

	/**
	 * Injects the import button on blog pages. Injects the quick import button if the quick import check succeeds.
	 */
	private injectImportButtonOnBlog() {
		// We are editing a blog post. Roughly the same as editing a chapter, only that a new
		// button must be inserted and that the ids are a bit different.
		const toolbar = this.context.getElementsByClassName("format-toolbar")[0];
		const part = this.context.createElement("ul");
		part.innerHTML = `<li><button id="import_button" title="Import from Google Docs"><i class="fa fa-cloud-upload"></i> Import GDocs</button></li>`;
		toolbar.insertBefore(part, toolbar.firstChild);
		const button = this.context.getElementById("import_button");

		this.editorElement = this.context.getElementById("blog_post_content") as HTMLInputElement;
		button.addEventListener("click", e => this.onImport.trigger());
		this.injectQuickImportButton(button);
	}

	/**
	 * Injects the import button on chapter pages. Injects the quick import button if the quick import check succeeds.
	 */
	private injectImportButtonOnChapter() {
		// Importing on chapters. This also matches story overviews and chapters we have no access to, so
		// another check is necessary.
		const oldButton = this.context.getElementById("import_button");
		if (!oldButton) {
			return;
		}

		// The old button gets replaced with a copy. This is the easiest way to get rid of the old event handler
		// that would trigger the old, standard importer dialog.
		const newButton = oldButton.cloneNode(true) as HTMLElement;
		oldButton.parentNode.replaceChild(newButton, oldButton);

		this.editorElement = this.context.getElementById("chapter_editor") as HTMLInputElement;
		newButton.addEventListener("click", e => this.onImport.trigger());
		this.injectQuickImportButton(newButton);
	}

	/**
	 * Injects the quick import button if the quick import check succeeds.
	 * @param button
	 */
	private injectQuickImportButton(button: HTMLElement) {
		const quickImportCheck = this.settings.getObj(this.getQuickImportKey());
		if (!quickImportCheck.id) {
			return;
		}

		const quickButtonItem = this.context.createElement("li");
		const quickButton = this.context.createElement("button");
		quickButton.title = "Quick Import '" + quickImportCheck.name + (quickImportCheck.chapter ? ": " + quickImportCheck.chapter : "") + "' from GoogleApi Docs";
		quickButton.innerHTML = '<i class="fa fa-cloud-download"></i> Quick Import';

		quickButtonItem.appendChild(quickButton);
		button.parentNode.parentNode.appendChild(quickButtonItem);

		quickButton.addEventListener("click", () => this.onQuickImport.trigger());
	}
}
