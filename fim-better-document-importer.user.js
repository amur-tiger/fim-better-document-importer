// ==UserScript==
// @name         Better Document Importer
// @namespace    https://tiger.rocks/
// @version      0.5
// @description  Adds a better importer for Google Docs documents to the chapter editor of FiMFiction.net.
// @author       TigeR
// @copyright    2017, TigeR
// @license      MIT, https://github.com/NekiCat/fim-better-document-importer/blob/master/LICENSE
// @homepageURL  https://github.com/NekiCat/fim-better-document-importer
// @supportURL   https://github.com/NekiCat/fim-better-document-importer/issues
// @updateURL    https://raw.githubusercontent.com/NekiCat/fim-better-document-importer/master/fim-better-document-importer.user.js
// @downloadURL  https://raw.githubusercontent.com/NekiCat/fim-better-document-importer/master/fim-better-document-importer.user.js
// @match        *://www.fimfiction.net/chapter/*
// @match        *://www.fimfiction.net/story/*
// @match        *://www.fimfiction.net/manage_user/edit_blog_post*
// @match        *://www.fimfiction.net/manage_user/local_settings
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==

(function () {
    'use strict';

    const config = Object.freeze({
        apiKey: 'AIzaSyDibtpof7uNJx2t5Utsk8eG48C72wFuwqc',
        clientId: '285016570913-kin436digkbvboomjvnij5n9fitech9l.apps.googleusercontent.com',
        scopes: 'https://www.googleapis.com/auth/drive.readonly'
    });

    const formats = [
        {
            test: element => element.style.textAlign == "center",
            tag: "center"
        },
        {
            test: element => element.style.fontWeight == 700,
            tag: "b"
        },
        {
            test: element => element.style.fontStyle == "italic",
            tag: "i"
        },
        {
            test: element => element.style.textDecoration == "underline",
            tag: "u"
        },
        {
            test: element => element.style.textDecoration == "line-through",
            tag: "s"
        },
        {
            test: element => Util.rgbToHex(element.style.color),
            prefix: test => "[color=" + test + "]",
            postfix: () => "[/color]"
        },
        {
            test: element => Util.ptToEm(element.style.fontSize),
            prefix: test => "[size=" + test + "]",
            postfix: () => "[/size]"
        }
    ];

    class Util {
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
         * @param {Object} options
         * @returns {Promise}
         */
        static getByAjax(url, options) {
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
            if (!rgb || rgb == "inherit") return false;
            const match = rgb.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
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
            if (!pt || !pt.endsWith("pt")) return false;
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
            const a = document.createElement("a");
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
    }

    class Formatter {
        constructor(formatDefinitions, indentation, spacing) {
            this.formatDefinitions = formatDefinitions;
            this.indentation = indentation;
            this.spacing = spacing;
        }

        /**
         * Extracts headings from the document to allow the user to choose a smaller part of
         * the document to import.
         * @param {HTMLElement[]} doc
         * @return {HTMLElement[]}
         */
        getHeaders(doc) {
            return Array.from(doc).filter(e => /^H\d$/.test(e.nodeName));
        }

        /**
         * Extracts all elements of a chapter after a heading until the next heading of the same or higher level
         * or the end of the document. The header itself is not included.
         * @param {HTMLElement[]} doc
         * @param {HTMLElement} header
         * @return {HTMLElement[]}
         */
        *getElementsFromHeader(doc, header) {
            const level = header.nodeName.slice(-1);
            let skipping = true;
            for (const element of doc) {
                if (skipping) {
                    if (element === header) {
                        skipping = false;
                    }
                } else {
                    if (/^H\d$/.test(element.nodeName)) {
                        const nextLevel = element.nodeName.slice(-1);
                        if (nextLevel <= level) break;
                    }

                    yield element;
                }
            }
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
         * @param {Boolean} skipParentStyle
         * @returns {String}
         * @private
         */
        __walkRecursive(element, skipParentStyle) {
            if (element.nodeType == Node.TEXT_NODE) {
                return element.textContent;
            }

            if (element.children.length == 1 && element.children[0].nodeName == "A") {
                const link = element.children[0];
                if (link.id.startsWith("cmnt_")) {
                    // Ignore GDocs comments.
                    return "";
                }

                // Links are pre-colored, ignore the style since FiMFiction has it's own.
                const formatted = this.__walkRecursive(link);
                return "[url=" + Util.parseGoogleRefLink(link.getAttribute("href")) + "]" + formatted.text + "[/url]";
            }

            if (element.children.length == 1 && element.children[0].nodeName == "IMG") {
                const img = element.children[0];
                // Images are served by Google and there seems to be no way to get to the original.
                return "[img]" + img.src + "[/img]\n";
            }

            let text = Array.from(element.childNodes).map(node => this.__walkRecursive(node)).join("");
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
        *getStyledParagraphs(doc) {
            for (const element of doc) {
                if (element.nodeName === "P") {
                    element.textContent = this.__walkRecursive(element);
                    yield element;
                } else if (element.nodeName === "HR") {
                    const horizontalRule = document.createElement("p");
                    horizontalRule.textContent = "[hr]";
                    yield horizontalRule;
                } else if (/^H\d$/.test(element.nodeName)) {
                    const heading = document.createElement("p");
                    heading.textContent = this.__walkRecursive(element, true);
                    yield heading;
                }
            }
        }

        /**
         * Indents paragraphs depending on the indentation setting given in the constructor. Indented paragraphs
         * will be prepended with a tab character. The given document elements will be altered in the process!
         * @param {HTMLParagraphElement[]} paragraphs
         * @return {HTMLParagraphElement[]}
         */
        *getIndentedParagraphs(paragraphs) {
            for (const element of paragraphs) {
                if (this.indentation == "book" || this.indentation == "web") {
                    element.textContent = element.textContent.trim();
                    if (element.textContent.length > 0 && (this.indentation == "book" || /^(?:\[.*?])*["„“”«»]/.test(element.textContent))) {
                        element.textContent = "\t" + element.textContent;
                    }
                } else {
                    if (element.style.textIndent && parseFloat(element.style.textIndent.slice(0, -2)) > 0 && element.textContent.length > 0) {
                        // This adds a tab character as an indentation for paragraphs that were indented using the ruler
                        element.textContent = "\t" + element.textContent;
                    }
                }

                yield element;
            }
        }

        /**
         * Spaces out the paragraphs depending on the spacing setting given in the constructor. Appends line breaks
         * to the paragraphs if necessary. The given document elements will be altered in the process!
         * @param {HTMLParagraphElement[]} paragraphs
         * @return {HTMLParagraphElement[]}
         */
        *getSpacedParagraphs(paragraphs) {
            let emptyLines = 0;
            let fulltextParagraph = 0;
            for (const element of paragraphs) {
                if (!fulltextParagraph && /[\.!?…"„“”«»-]\s*$/.test(element.textContent)) {
                    fulltextParagraph = 1;
                }

                if ((this.spacing != "book" && this.spacing != "web") || fulltextParagraph < 1) {
                    element.textContent += "\n";
                    yield element;
                    continue;
                }

                if (fulltextParagraph < 2) {
                    fulltextParagraph = 2;
                    element.textContent = "\n" + element.textContent;
                }

                if (element.textContent.trim().length === 0) {
                    emptyLines += 1;
                } else {
                    if (emptyLines > 1) {
                        // This filters out any single empty paragraph and uses the
                        // spacing as set in the options instead. Multiple empty
                        // paragraphs are still imported, for when the author wants more space
                        element.textContent = "\n".repeat(emptyLines) + element.textContent;
                    }

                    if (this.spacing == "web") {
                        element.textContent += "\n\n";
                    } else if (element.textContent.trim().length > 0) {
                        element.textContent += "\n";
                    }

                    emptyLines = 0;
                }

                yield element;
            }
        }

        /**
         * Joins the given paragraphs together.
         * @param {HTMLParagraphElement[]} paragraphs
         * @return {String}
         */
        join(paragraphs) {
            return Array.from(paragraphs).map(element => element.textContent).join("").replace(/^[\r\n]+|\s+$/g, "");
        }
    }

    const Modes = Object.freeze({
        settings: "settings",
        blog: "blog",
        chapter: "chapter"
    });

    const mode = window.location.href.includes("manage_user/local_settings") ? Modes.settings :
        (window.location.href.includes("manage_user/edit_blog_post") ? Modes.blog : Modes.chapter);

    switch (mode) {
        case Modes.settings:
            injectSettings();
            break;
        case Modes.blog:
            // We are editing a blog post. Roughly the same as editing a chapter, only that a new
            // button must be inserted and that the ids are a bit different.
            const toolbar = document.getElementsByClassName("format-toolbar")[0];
            const part = document.createElement("ul");
            part.innerHTML = '<li><button id="import_button" title="Import from Google Docs"><i class="fa fa-cloud-upload"></i> Import GDocs</button></li>';
            toolbar.insertBefore(part, toolbar.firstChild);
            injectImporter(document.getElementById("import_button"), document.getElementById("blog_post_content"));
            break;
        case Modes.chapter:
            // Importing on chapters. This also matches story overviews and chapters we have no access to, so
            // another check is necessary.
            const oldButton = document.getElementById("import_button");
            if (!oldButton) {
                return;
            }

            const newButton = oldButton.cloneNode(true);
            oldButton.parentNode.replaceChild(newButton, oldButton);
            injectImporter(newButton, document.getElementById("chapter_editor"));
            break;
        default:
            console.error("Invalid Mode: %o", mode);
    }

    function injectSettings() {
        const pindent = GM_getValue('pindent', 'web');
        const pspace = GM_getValue('pspace', 'web');

        const table = document.createElement('tbody');
        table.innerHTML = '<tr><td colspan="2" class="section_header"><b>Better Importer Settings</b></td></tr>' +
            '<tr><td class="label">Paragraph indentation</td><td>' +
            '<label><input type="radio" name="bdi_pindent" value="as-is"' + (pindent == 'as-is' ? ' checked' : '') + '/> Import as-is</label><br/>' +
            '<label><input type="radio" name="bdi_pindent" value="book"' + (pindent == 'book' ? ' checked' : '') + '/> Book-Style: Indent all paragraphs</label><br/>' +
            '<label><input type="radio" name="bdi_pindent" value="web"' + (pindent == 'web' ? ' checked' : '') + '/> Web-Style: Only indent paragraphs starting with speech</label>' +
            '</td></tr><tr><td class="label">Paragraph spacing</td><td>' +
            '<label><input type="radio" name="bdi_pspace" value="as-is"' + (pspace == 'as-is' ? ' checked' : '') + '/> Import as-is</label><br/>' +
            '<label><input type="radio" name="bdi_pspace" value="book"' + (pspace == 'book' ? ' checked' : '') + '/> Book-Style: Eliminate less than two line breaks</label><br/>' +
            '<label><input type="radio" name="bdi_pspace" value="web"' + (pspace == 'web' ? ' checked' : '') + '/> Web-Style: Insert space between paragraphs</label>' +
            '</td></tr>';

        const settingsForm = document.getElementById('local_site_settings');
        settingsForm.firstElementChild.insertBefore(table, settingsForm.firstElementChild.lastElementChild);

        const button = settingsForm.lastElementChild.lastElementChild.getElementsByTagName('button')[0];
        button.addEventListener('click', e => {
            GM_setValue('pindent', Array.from(document.getElementsByName('bdi_pindent')).filter(e => e.checked)[0].value);
            GM_setValue('pspace', Array.from(document.getElementsByName('bdi_pspace')).filter(e => e.checked)[0].value);
        });
    }

    function injectImporter(button, editor) {
        // Promise to load the Google API scripts and initialize them.
        const apiLoadPromise = Util.loadScript("https://apis.google.com/js/api.js")
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

        // On a button press, continue with the apiLoadPromise. This both allows the user to press the button
        // early and press it multiple times while guaranteeing that the API is loaded.
        button.addEventListener("click", () => {
            apiLoadPromise
                .then(() => new Promise(resolve => {
                    // This step is only completed when the user is logged in to Google.
                    // The user is either already logged in or a popup requests he logs in.

                    if (gapi.auth2.getAuthInstance().isSignedIn.get()) {
                        resolve();
                        return;
                    }

                    gapi.auth2.getAuthInstance().isSignedIn.listen(isLoggedIn => {
                        if (isLoggedIn) resolve();
                    });

                    gapi.auth2.getAuthInstance().signIn({
                        scope: config.scopes,
                        fetch_basic_profile: false
                    });
                }))
                .then(() => gapi.auth2.getAuthInstance().currentUser.get().getAuthResponse(true).access_token)
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
                    });
                })
                .then(doc => {
                    // Loads the document using the browser's HTML engine and converts it to BBCode.

                    const formatter = new Formatter(formats, GM_getValue("pindent", "web"), GM_getValue("pspace", "web"));
                    const template = document.createElement("template");
                    template.innerHTML = doc;

                    const headings = Array.from(formatter.getHeaders(template.content.children));
                    if (headings.length > 0) {
                        const content = document.createElement("div");
                        content.className = "std";
                        content.innerHTML = '<label><a class="styled_button" style="text-align:center;width:100%;">Import Everything</a></label>\n' +
                            headings.map(h => '<label><a style="display:inline-block;text-align:center;width:100%;" data-id="' + h.id + '">' + h.textContent + '</a></label>').join("\n");
                        content.addEventListener("click", e => {
                            if (e.target.nodeName != "A") return;
                            const hid = e.target.getAttribute("data-id");
                            if (hid) {
                                const header = headings.find(h => h.id == hid);
                                const elements = formatter.getElementsFromHeader(template.content.children, header);
                                editor.value = formatter.format(elements);
                            } else {
                                editor.value = formatter.format(template.content.children);
                            }
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

                        popup.Show();
                    } else {
                        editor.value = formatter.format(template.content.children);
                    }
                });
        });
    }
})();
