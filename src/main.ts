import Util from "./Util";
import Mode from "./Mode";
import Settings from "./Settings";
import HtmlInjector from "./HtmlInjector";
import { Formatter } from "./Formatter";
import config from "./config";
import { PickerDocumentMetadata, GoogleApi, Document } from "./GoogleApi";

declare function GM_getValue(key: string, std?: string): string;
declare function GM_setValue(key: string, value: string): void;

const settings = new Settings(GM_getValue, GM_setValue);
const injector = new HtmlInjector(settings, document);
injector.inject();



const doImport = (formatter, doc) => {
	injector.setEditorText(formatter.format());
	settings.setObj(injector.getQuickImportKey(), {
		id: doc.id,
		name: doc.name,
		chapter: formatter.heading ? formatter.heading.textContent : null
	});
};

const googleApi = new GoogleApi(config.apiKey, config.clientId, config.scopes);
googleApi.ensureGoogleApiLoaded(); // This loads the Google APIs so that they are ready when the user clicks the button.

injector.importEvent.on(() => {
	googleApi.showPicker()
		.then((meta: PickerDocumentMetadata) => googleApi.getDocument(meta))
		.then((doc: Document) => {
			console.info("Importing document '%s'.", doc.metadata.name);
			return doc;
		})
		.then((doc: Document) => {
			// Loads the document using the browser's HTML engine and converts it to BBCode.
			const formatter = new Formatter(doc.contents);
			formatter.indentation = settings.paragraphIndentationMode;
			formatter.spacing = settings.paragraphSpacingMode;

			const headings = formatter.getHeadings();
			Util.chooseChapter(headings)
				.then(heading => {
					formatter.heading = heading;
					doImport(formatter, doc);
				});
		});
});

injector.quickImportEvent.on(() => {
	const data = settings.getObj(injector.getQuickImportKey());
	googleApi.getDocument(data.id)
		.then((doc: Document) => {
			console.info("Importing document '" + data.name + (data.chapter ? ": " + data.chapter : "") + "'.");
			return doc;
		})
		.then((doc: Document) => {
			const formatter = new Formatter(doc.contents);
			formatter.indentation = settings.paragraphIndentationMode;
			formatter.spacing = settings.paragraphSpacingMode;

			if (!data.chapter) {
				doImport(formatter, data);
				return;
			}

			formatter.heading = formatter.getHeadingWithName(data.chapter);
			if (formatter.heading) {
				doImport(formatter, data);
			} else {
				// This means the chapter was renamed or doesn't exist anymore. We have to ask the user what to do.
				Util.chooseChapter(formatter.getHeadings())
					.then(heading => {
						formatter.heading = heading;
						doImport(formatter, data);
					});
			}
		})
		.catch(err => {
			console.error("Couldn't import '" + data.name + (data.chapter ? ": " + data.chapter : "") + "': %o", err);
			ShowErrorWindow("Sorry, couldn't import '" + data.name + (data.chapter ? ": " + data.chapter : "") + "'.");
		});
});
