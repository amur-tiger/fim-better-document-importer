import Util from "./Util";
import Mode from "./Mode";
import Settings from "./Settings";
import Formatter from "./Formatter";
import defaultFormats from "./defaultFormats";

const config = Object.freeze({
	apiKey: 'AIzaSyDibtpof7uNJx2t5Utsk8eG48C72wFuwqc',
	clientId: '285016570913-kin436digkbvboomjvnij5n9fitech9l.apps.googleusercontent.com',
	scopes: 'https://www.googleapis.com/auth/drive.readonly'
});

declare const GM_getValue: (key: string, std?: string) => string;
declare const GM_setValue: (key: string, value: string) => void;

const settings = new Settings(GM_getValue, GM_setValue);

const mode = Util.getPageMode();
switch (mode) {
	case Mode.SETTINGS:
		injectSettings(settings);
		break;
	case Mode.BLOG:
		// We are editing a blog post. Roughly the same as editing a chapter, only that a new
		// button must be inserted and that the ids are a bit different.
		const toolbar = document.getElementsByClassName("format-toolbar")[0];
		const part = document.createElement("ul");
		part.innerHTML = '<li><button id="import_button" title="Import from Google Docs"><i class="fa fa-cloud-upload"></i> Import GDocs</button></li>';
		toolbar.insertBefore(part, toolbar.firstChild);

		// Get the ID of the blog post. The form is named edit_story_form for some reason.
		const blogForm = document.getElementById("edit_story_form") as HTMLFormElement;
		const blogId = blogForm.elements["post_id"].value;

		injectImporter(document.getElementById("import_button"), document.getElementById("blog_post_content"), "blog-" + blogId, settings);
		break;
	case Mode.CHAPTER:
		// Importing on chapters. This also matches story overviews and chapters we have no access to, so
		// another check is necessary.
		const oldButton = document.getElementById("import_button");
		if (oldButton) {
			const newButton = oldButton.cloneNode(true);
			oldButton.parentNode.replaceChild(newButton, oldButton);

			// Get the ID of the chapter. This works for both released and unreleased chapters.
			const chapterForm = document.getElementById("chapter_edit_form") as HTMLFormElement;
			const chapterId = chapterForm.elements["chapter"].value;

			injectImporter(newButton, document.getElementById("chapter_editor"), "chapter-" + chapterId, settings);
		}
		break;
	default:
		console.error("Invalid Mode: %o", mode);
}

function injectSettings(settings) {
	const pIndent = settings.paragraphIndentationMode;
	const pSpace = settings.paragraphSpacingMode;

	const table = document.createElement("tbody");
	table.innerHTML = `<tr><td colspan="2" class="section_header"><b>Better Importer Settings</b></td></tr>
            <tr><td class="label">Paragraph indentation</td><td>
            <label><input type="radio" name="bdi_pindent" value="as-is"` + (pIndent == "as-is" ? " checked" : "") + `/> Import as-is</label><br/>
            <label><input type="radio" name="bdi_pindent" value="book"` + (pIndent == "book" ? " checked" : '') + `/> Book-Style: Indent all paragraphs</label><br/>
            <label><input type="radio" name="bdi_pindent" value="web"` + (pIndent == "web" ? " checked" : '') + `/> Web-Style: Only indent paragraphs starting with speech</label>
            </td></tr><tr><td class="label">Paragraph spacing</td><td>
            <label><input type="radio" name="bdi_pspace" value="as-is"` + (pSpace == "as-is" ? " checked" : '') + `/> Import as-is</label><br/>
            <label><input type="radio" name="bdi_pspace" value="book"` + (pSpace == "book" ? " checked" : '') + `/> Book-Style: Eliminate less than two line breaks</label><br/>
            <label><input type="radio" name="bdi_pspace" value="web"` + (pSpace == "web" ? " checked" : '') + `/> Web-Style: Insert space between paragraphs</label>
            </td></tr>`;

	const settingsForm = document.getElementById("local_site_settings");
	settingsForm.firstElementChild.insertBefore(table, settingsForm.firstElementChild.lastElementChild);

	const button = settingsForm.lastElementChild.lastElementChild.getElementsByTagName("button")[0];
	button.addEventListener("click", () => {
		settings.paragraphIndentationMode = (Array.from(document.getElementsByName("bdi_pindent")).filter((e: HTMLInputElement) => e.checked)[0] as HTMLInputElement).value;
		settings.paragraphSpacingMode = (Array.from(document.getElementsByName("bdi_pspace")).filter((e: HTMLInputElement) => e.checked)[0] as HTMLInputElement).value;
	});
}

declare const google: any;
declare const ShowErrorWindow: (message: string) => void;

function injectImporter(button, editor, importKey, settings) {
	const doImport = (formatter, elements, doc, heading?) => {
		editor.value = formatter.format(heading ? formatter.getElementsFromHeader(elements, heading) : elements);
		settings.setObj(importKey, {
			id: doc.id,
			name: doc.name,
			chapter: heading ? heading.textContent : null
		});
	};

	// On a button press, continue with the apiLoadPromise. This both allows the user to press the button
	// early and press it multiple times while guaranteeing that the API is loaded.
	button.addEventListener("click", () => {
		Util.getBearerToken(config)
			.then(token => new Promise((resolve, reject) => {
				// Creates a picker object. If a document is selected, the step completes, else it is rejected.

				new google.picker.PickerBuilder()
					.setOAuthToken(token)
					.setAppId(config.clientId)
					.addView(google.picker.ViewId.RECENTLY_PICKED)
					.addView(google.picker.ViewId.DOCUMENTS)
					.setCallback(data => {
						if (data.action == "picked") {
							data.token = token;
							resolve(data);
						} else if (data.action == "cancel") {
							reject("Cancelled by user");
						}
					})
					.build()
					.setVisible(true);
			}))
			.then(data => {
				// Loads the document from Drive, if it is of the correct type.

				const doc = data.docs[0];
				if (doc.mimeType != "application/vnd.google-apps.document") {
					// I tried importing a docx file, but Google said it doesn't support exporting that :(
					ShowErrorWindow("Sorry! Only Google documents can be imported as of now.");
					return Promise.reject("Unsupported document type");
				}

				console.info("Importing document '" + doc.name + "'.");
				return Util.getByAjax("https://www.googleapis.com/drive/v3/files/" + doc.id + "/export?mimeType=text/html", {
					headers: {
						Authorization: "Bearer " + data.token
					}
				}).then(contents => {
					doc.contents = contents;
					return doc;
				});
			})
			.then(doc => {
				// Loads the document using the browser's HTML engine and converts it to BBCode.

				const formatter = new Formatter(defaultFormats, settings.paragraphIndentationMode, settings.paragraphSpacingMode);
				const elements = formatter.createDOM(doc.contents);
				const headings = formatter.getHeaders(elements);
				Util.chooseChapter(headings)
					.then(heading => {
						if (heading) {
							doImport(formatter, elements, doc, heading);
						} else {
							doImport(formatter, elements, doc);
						}
					});
			});
	});

	// To quickly re-import something, add a new button if it was imported previously
	const check = settings.getObj(importKey);
	if (check.id) {
		const quickButtonItem = document.createElement("li");
		const quickButton = document.createElement("button");
		quickButton.title = "Quick Import '" + check.name + (check.chapter ? ": " + check.chapter : "") + "' from Google Docs";
		quickButton.innerHTML = '<i class="fa fa-cloud-download"></i> Quick Import';

		quickButtonItem.appendChild(quickButton);
		button.parentNode.parentNode.appendChild(quickButtonItem);

		quickButton.addEventListener("click", () => {
			const data = settings.getObj(importKey);
			Util.getBearerToken(config)
				.then(token => {
					console.info("Importing document '" + data.name + (data.chapter ? ": " + data.chapter : "") + "'.");
					return Util.getByAjax("https://www.googleapis.com/drive/v3/files/" + data.id + "/export?mimeType=text/html", {
						headers: {
							Authorization: "Bearer " + token
						}
					});
				})
				.then(doc => {
					const formatter = new Formatter(defaultFormats, settings.paragraphIndentationMode, settings.paragraphSpacingMode);
					const elements = formatter.createDOM(doc);

					if (data.chapter) {
						const headings = formatter.getHeaders(elements) as HTMLElement[];
						let heading = null;
						for (const h of headings) {
							if (h.textContent === data.chapter) {
								heading = h;
							}
						}

						if (heading) {
							doImport(formatter, elements, data, heading);
						} else {
							// This means the chapter was renamed or doesn't exist anymore. We have to ask the user what to do.
							Util.chooseChapter(headings)
								.then(h => {
									if (h) {
										doImport(formatter, elements, data, h);
									} else {
										doImport(formatter, elements, data);
									}
								});
						}
					} else {
						doImport(formatter, elements, data);
					}
				})
				.catch(err => {
					console.error("Couldn't import '" + data.name + (data.chapter ? ": " + data.chapter : "") + "': %o", err);
					ShowErrorWindow("Sorry, couldn't import '" + data.name + (data.chapter ? ": " + data.chapter : "") + ".");
				});
		});
	}
}
