import Mode from "./Mode";

declare const gapi: any;
declare const ShowErrorWindow: (string) => void;
declare const PopUpMenu: any;

export default class Util {
	/**
	 * Loads a script dynamically by creating a script element and attaching it to the head element.
	 * @param {String} url
	 * @returns {Promise}
	 */
	static loadScript(url) {
		return new Promise((resolve, reject) => {
			const script = document.createElement("script");
			script.addEventListener("load", resolve);
			script.addEventListener("error", () => {
				console.error("Failed to load script: %s", url);
				reject.apply(this, arguments);
			});
			script.src = url;
			document.getElementsByTagName("head")[0].appendChild(script);
		});
	}

	/**
	 * Loads a Google API dynamically.
	 * @param api
	 * @returns {Promise}
	 */
	static loadGoogleApi(api) {
		return new Promise(resolve => {
			gapi.load(api, resolve);
		});
	}

	/**
	 * Makes an AJAX GET call, optionally with additional headers.
	 * @param {String} url
	 * @param {Object} [options]
	 * @returns {Promise}
	 */
	static getByAjax(url, options?) {
		return new Promise((resolve, reject) => {
			const xhr = new XMLHttpRequest();
			xhr.addEventListener("load", () => {
				if (xhr.status >= 200 && xhr.status <= 300) {
					resolve(xhr.response);
				} else {
					reject(xhr.response);
				}
			});
			xhr.addEventListener("error", () => {
				reject(xhr.response);
			});
			xhr.open("GET", url, true);
			if (options && options.headers) {
				Object.keys(options.headers).forEach(key => {
					xhr.setRequestHeader(key, options.headers[key]);
				});
			}
			xhr.send();
		});
	}

	/**
	 * Parses an RGB-color-string as returned from `element.style.color` to a CSS hex-notation.
	 * @param {String} rgb
	 * @returns {String|Boolean}
	 */
	static rgbToHex(rgb) {
		if (!rgb || rgb == "inherit" || typeof rgb != "string") return false;
		const match = rgb.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
		if (!match) return false;
		const hex = x => ("0" + parseInt(x).toString(16)).slice(-2);
		const c = "#" + hex(match[1]) + hex(match[2]) + hex(match[3]);
		return c == "#000000" ? false : c;
	}

	/**
	 * Converts a font size in PT to a font size in EM, assuming default values for DPI.
	 * @param {String} pt
	 * @returns {String|Boolean}
	 */
	static ptToEm(pt) {
		if (!pt || typeof pt != "string" || !pt.endsWith("pt")) return false;
		pt = pt.slice(0, -2);
		if (pt == "11" || pt == "12") return false;
		return +(pt / 12).toFixed(3) + "em";
	}

	/**
	 * Parses a Google referrer link and extracts the "q" query parameter from it.
	 * @param link
	 * @returns {String|Boolean}
	 */
	static parseGoogleRefLink(link) {
		const a = window.document.createElement("a");
		a.href = link;
		const queryParams = a.search.substring(1).split("&");
		for (let i = 0; i < queryParams.length; i++) {
			const pair = queryParams[i].split("=");
			if (pair[0] == "q") {
				return decodeURIComponent(pair[1]);
			}
		}

		return false;
	}

	/**
	 * Analyzes the current URL and determines which mode the importer script should run in. Returns one of
	 * the constants defined in `Modes`.
	 * @returns {String}
	 */
	static getPageMode() {
		return window.location.href.includes("manage_user/local_settings") ? Mode.SETTINGS :
			(window.location.href.includes("manage_user/edit_blog_post") ? Mode.BLOG : Mode.CHAPTER);
	}

	private static apiLoadPromise: Promise<void>;

	/**
	 * Ensures that the relevant Google APIs were loaded and returns a Promise for their presence. This
	 * method can get called multiple times, the APIs will only load once.
	 * @param config
	 * @returns {Promise}
	 */
	static ensureGoogleApiLoaded(config) {
		if (!this.apiLoadPromise) {
			this.apiLoadPromise = Util.loadScript("https://apis.google.com/js/api.js")
				.then(() => Util.loadGoogleApi("client:auth2:picker"))
				.then(() => gapi.client.init({
					apiKey: config.apiKey,
					clientId: config.clientId,
					scope: config.scopes,
					fetchBasicProfile: false
				}))
				.catch(err => {
					console.error("Something went wrong while initializing Google Auth2: %o", err);
					ShowErrorWindow("Sorry! Something went wrong while initializing Google APIs.");
				});
		}

		return this.apiLoadPromise;
	}

	/**
	 * Fetches a new Bearer token from Google that can be used to get documents from the user's Drive. Loads the
	 * relevant Google APIs if they weren't already loaded.
	 * @param config
	 * @returns {Promise}
	 */
	static getBearerToken(config) {
		return Util.ensureGoogleApiLoaded(config)
			.then(() => new Promise(resolve => {
				// This step is only completed when the user is logged in to Google.
				// The user is either already logged in or a popup requests he logs in.

				if (gapi.auth2.getAuthInstance().isSignedIn.get()) {
					resolve();
					return;
				}

				gapi.auth2.getAuthInstance().isSignedIn.listen(isLoggedIn => {
					// TODO: Leak here when called multiple times? (callback still attached)
					if (isLoggedIn) resolve();
				});

				gapi.auth2.getAuthInstance().signIn({
					scope: config.scopes,
					fetch_basic_profile: false
				});
			}))
			.then(() => gapi.auth2.getAuthInstance().currentUser.get().getAuthResponse(true).access_token);
	}

	/**
	 * Given a list of headings, shows a popup menu and lets the user decide which heading to choose. If the
	 * headings list contains no elements, no popup is shown and the promise is resolved immediately.
	 * @param {HTMLElement[]} headings
	 * @returns {Promise}
	 */
	static chooseChapter(headings) {
		if (headings.length <= 0) {
			return Promise.resolve(null);
		}

		return new Promise(resolve => {
			const content = document.createElement("div");
			content.className = "std";
			content.innerHTML = '<label><a class="styled_button" style="text-align:center;width:100%;">Import Everything</a></label>\n' +
				headings.map(h => '<label><a style="display:inline-block;text-align:center;width:100%;" data-id="' + h.id + '">' + h.textContent + '</a></label>').join("\n");
			content.addEventListener("click", (e: any) => {
				if (e.target.nodeName != "A") return;
				const hid = e.target.getAttribute("data-id");
				resolve(headings.find(h => h.id == hid) || null);
			});

			const popup = new PopUpMenu("", '<i class="fa fa-th-list"></i> Chapter Selection');
			popup.SetCloseOnHoverOut(false);
			popup.SetCloseOnLinkPressed(true);
			popup.SetSoftClose(true);
			popup.SetWidth("300px");
			popup.SetDimmerEnabled(false);
			popup.SetFixed(false);
			popup.SetContent(content);
			popup.SetFooter("The document you want to import seems to contain chapters. Please select a chapter to import.");

			// TODO: Leak here when popup canceled? (Promise still open)
			popup.Show();
		});
	}
}
