import Util from "./Util";
import UserAbortError from "./UserAbortError";

declare const gapi: any;
declare const google: any;

export interface Document {
	metadata: DocumentMetadata;
	contents: string;
}

export interface DocumentMetadata {
	id: string;
	name: string;
	mimeType: string;
}

export interface PickerDocumentMetadata extends DocumentMetadata {
	description: string;
	embedUrl: string;
	iconUrl: string;
	lastEditedUtc: number;
	parentId: string;
	serviceId: string;
	type: string;
	url: string;
}

export interface PickerResult {
	action: string;
	docs: PickerDocumentMetadata[];
	viewToken: any[];
}

export class GoogleApi {
	private apiLoadPromise: Promise<void> = null;
	private bearerTokenPromise: Promise<string> = null;

	constructor(private apiKey: string, private clientId: string, private scopes: string[]) {
	}

	/**
	 * Loads a Google API dynamically.
	 * @param api
	 * @returns {Promise<void>}
	 */
	loadApi(...api: string[]): Promise<void> {
		return new Promise<void>(resolve => {
			gapi.load(api.join(":"), resolve);
		});
	}

	/**
	 * Ensures that the relevant Google APIs were loaded and returns a Promise for their presence. This
	 * method can get called multiple times, the APIs will only load once.
	 * @returns {Promise<void>}
	 */
	ensureGoogleApiLoaded(): Promise<void> {
		if (!this.apiLoadPromise) {
			this.apiLoadPromise = Util.loadScript("https://apis.google.com/js/api.js")
				.then(() => this.loadApi("client", "auth2", "picker"))
				.then(() => gapi.client.init({
					apiKey: this.apiKey,
					clientId: this.clientId,
					scope: this.scopes.join(" "),
					fetchBasicProfile: false
				}));
		}

		return this.apiLoadPromise;
	}

	/**
	 * Ensures that the user is logged into his Google account. If the user cannot be logged in automatically,
	 * shows a login window for the user to log in.
	 * @returns {Promise<void>}
	 */
	ensureUserLoggedIn(): Promise<void> {
		return this.ensureGoogleApiLoaded()
			.then(() => {
				if (gapi.auth2.getAuthInstance().isSignedIn.get()) {
					// If the user is already logged in, this check prevents the login window from showing.
					return Promise.resolve();
				}

				return gapi.auth2.getAuthInstance().signIn({
					scope: this.scopes.join(" "),
					fetch_basic_profile: false
				});
			})
			.catch(err => {
				// Error should contain either "popup_closed_by_user" or "access_denied".
				throw new UserAbortError(err);
			});
	}

	/**
	 * Fetches a new Bearer token from Google that can be used to get documents from the user's Drive. Loads the
	 * relevant Google APIs if they weren't already loaded.
	 * @returns {Promise}
	 */
	private getBearerToken(): Promise<string> {
		if (!this.bearerTokenPromise) {
			this.bearerTokenPromise = this.ensureUserLoggedIn()
				.then(() => gapi.auth2.getAuthInstance().currentUser.get().getAuthResponse(true).access_token);
		}

		return this.bearerTokenPromise;
	}

	/**
	 * Shows a Google picker window to allow the user to select files from his Drive. This promise may be
	 * rejected with a `UserAbortError` when the user closes the picker window without selecting a file.
	 * @returns {Promise<PickerDocumentMetadata>}
	 */
	showPicker(): Promise<PickerDocumentMetadata> {
		return this.getBearerToken()
			.then(token => new Promise<PickerDocumentMetadata>((resolve, reject) => {
				new google.picker.PickerBuilder()
					.setOAuthToken(token)
					.setAppId(this.clientId)
					.addView(google.picker.ViewId.RECENTLY_PICKED)
					.addView(google.picker.ViewId.DOCUMENTS)
					.setCallback((data: PickerResult) => {
						if (data.action == "picked") {
							resolve(data.docs[0]);
						} else if (data.action == "cancel") {
							reject(new UserAbortError());
						}
					})
					.build()
					.setVisible(true);
			}));
	}

	/**
	 * Fetches some basic metadata from Google Drive for the given document id.
	 * @param {string} id
	 * @returns {Promise<DocumentMetadata>}
	 */
	getDocumentMetadata(id: string): Promise<DocumentMetadata> {
		return this.getBearerToken()
			.then(token => Util.getByAjax("https://www.googleapis.com/drive/v3/files/" + id + "", {
				headers: {
					Authorization: "Bearer " + token
				}
			}))
			.then(str => JSON.parse(str));
	}

	/**
	 * Fetches the document metadata and contents from Google Drive for the given document id or metadata. Only
	 * Google documents may be fetched, other file types cannot be exported.
	 * @param id
	 * @returns {Promise<Document>}
	 */
	getDocument(id: string | DocumentMetadata): Promise<Document> {
		return (typeof id === "string" ? this.getDocumentMetadata(id) : Promise.resolve(id))
			.then(meta => {
				return this.getBearerToken()
					.then(token => {
						return { meta: meta, token: token }
					});
			})
			.then(data => {
				if (data.meta.mimeType !== "application/vnd.google-apps.document") {
					// I tried importing a docx file, but Google said it doesn't support exporting that :(
					throw new Error("Unsupported media type.");
				}

				return data;
			})
			.then(data => {
				return Util.getByAjax("https://www.googleapis.com/drive/v3/files/" + data.meta.id + "/export?mimeType=text/html", {
					headers: {
						Authorization: "Bearer " + data.token
					}
				})
					.then(contents => {
						return {
							metadata: data.meta,
							contents: contents
						};
					});
			});
	}
}
