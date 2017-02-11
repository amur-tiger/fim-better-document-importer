// ==UserScript==
// @name         Better Document Importer
// @namespace    https://tiger.rocks/
// @version      0.4
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
            test: element => element.style.textAlign == 'center',
            tag: 'center'
        },
        {
            test: element => element.style.fontWeight == 700,
            tag: 'b'
        },
        {
            test: element => element.style.fontStyle == 'italic',
            tag: 'i'
        },
        {
            test: element => element.style.textDecoration == 'underline',
            tag: 'u'
        },
        {
            test: element => element.style.textDecoration == 'line-through',
            tag: 's'
        },
        {
            test: element => Util.rgbToHex(element.style.color),
            prefix: test => '[color=' + test + ']',
            postfix: () => '[/color]'
        },
        {
            test: element => Util.ptToEm(element.style.fontSize),
            prefix: test => '[size=' + test + ']',
            postfix: () => '[/size]'
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
                const script = document.createElement('script');
                script.addEventListener('load', resolve);
                script.addEventListener('error', () => {
                    console.error('Failed to load script: %s', url);
                    reject.apply(this, arguments);
                });
                script.src = url;
                document.getElementsByTagName('head')[0].appendChild(script);
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
                xhr.addEventListener('load', () => {
                    if (xhr.status >= 200 && xhr.status <= 300) {
                        resolve(xhr.response);
                    } else {
                        reject(xhr.response);
                    }
                });
                xhr.addEventListener('error', () => {
                    reject(xhr.response);
                });
                xhr.open('GET', url, true);
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
            if (!rgb || rgb == 'inherit') return false;
            const match = rgb.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
            const hex = x => {
                return ('0' + parseInt(x).toString(16)).slice(-2);
            };
            const c = '#' + hex(match[1]) + hex(match[2]) + hex(match[3]);
            return c == '#000000' ? false : c;
        }

        /**
         * Converts a font size in PT to a font size in EM, assuming default values for DPI...
         * @param {String} pt
         * @returns {String|Boolean}
         */
        static ptToEm(pt) {
            if (!pt) return false;
            pt = pt.slice(0, -2);
            if (pt == '11' || pt == '12') return false;
            return +(pt / 12).toFixed(3) + 'em';
        }

        /**
         * Parses a Google referrer link and extracts the "q" query parameter from it
         * @param link
         * @returns {String|Boolean}
         */
        static parseGoogleRefLink(link) {
            const a = document.createElement('a');
            a.href = link;
            const queryParams = a.search.substring(1).split('&');
            for (let i = 0; i < queryParams.length; i++) {
                const pair = queryParams[i].split('=');
                if (pair[0] == 'q') {
                    return decodeURIComponent(pair[1]);
                }
            }

            return false;
        }
    }

    const Modes = Object.freeze({
        settings: 'settings',
        blog: 'blog',
        chapter: 'chapter'
    });

    const mode = window.location.href.includes('manage_user/local_settings') ? Modes.settings :
        (window.location.href.includes('manage_user/edit_blog_post') ? Modes.blog : Modes.chapter);

    switch (mode) {
        case Modes.settings:
            injectSettings();
            break;
        case Modes.blog:
            // We are editing a blog post. Roughly the same as editing a chapter, only that a new
            // button must be inserted and that the ids are a bit different.
            const toolbar = document.getElementsByClassName('format-toolbar')[0];
            const part = document.createElement('ul');
            part.innerHTML = '<li><button id="import_button" title="Import from Google Docs"><i class="fa fa-cloud-upload"></i> Import GDocs</button></li>';
            toolbar.insertBefore(part, toolbar.firstChild);
            injectImporter(document.getElementById('import_button'), document.getElementById('blog_post_content'));
            break;
        case Modes.chapter:
            // Importing on chapters. This also matches story overviews and chapters we have no access to, so
            // another check is necessary.
            const oldButton = document.getElementById('import_button');
            if (!oldButton) {
                return;
            }

            const newButton = oldButton.cloneNode(true);
            oldButton.parentNode.replaceChild(newButton, oldButton);
            injectImporter(newButton, document.getElementById('chapter_editor'));
            break;
        default:
            console.error('Invalid Mode: %o', mode);
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
        // Pretty parsing function for the document
        const fnParseDocument = doc => {
            // Walk a paragraph for all styles recursively
            // Google doesn't report styles recursively, so this might be overkill
            // Since the styles aren't recursive, they might produce weird BBCode...
            const fnWalk = item => {
                if (item.nodeType == 3) return item.textContent;
                if (item.children.length == 1 && item.children[0].nodeName == 'A') {
                    if (item.children[0].id.startsWith('cmnt_')) {
                        // Comments from the Google document may come from prereaders or
                        // are simply notes from the author, and not something for the
                        // reader. Strip these out.
                        return '';
                    }

                    // Links are colored and underlined by Google. We want our own formatting for links, so
                    // these formattings can be ignored.
                    return '[url=' + Util.parseGoogleRefLink(item.children[0].getAttribute('href')) + ']' +
                        fnWalk(item.children[0]) + '[/url]';
                }
                if (item.children.length == 1 && item.children[0].nodeName == 'IMG') {
                    // Image handling is a bit more difficult. For now, only centered
                    // images are supported. Also, all images are served by Google and
                    // there seems to be no way to get to the original.
                    return '[center][img]' + item.children[0].src + '[/img][/center]\n';
                }

                let text = Array.from(item.childNodes).map(fnWalk).join('');
                formats.forEach(format => {
                    const test = format.test(item);
                    if (test) {
                        if (format.tag) {
                            text = '[' + format.tag + ']' + text + '[/' + format.tag + ']';
                        } else {
                            text = format.prefix(test, item) + text + format.postfix(test, item);
                        }
                    }
                });

                return text;
            };

            const template = document.createElement('template');
            template.innerHTML = doc;

            // Walk all elements in the document
            let emptyLines = 0;
            editor.value = Array.from(template.content.children).map(item => {
                const pindent = GM_getValue('pindent', 'web');
                const pspace = GM_getValue('pspace', 'web');
                if (item.nodeName === 'P') {
                    let text = fnWalk(item);

                    if (pindent != 'as-is') {
                        text = text.trim();
                        if (text.length > 0 && (pindent == 'book' || /^(?:\[.*?\])*["„“”«»]/.test(text))) {
                            text = "\t" + text;
                        }
                    }

                    if (pspace == 'as-is') {
                        return text + '\n';
                    }

                    if (text.trim().length === 0) {
                        emptyLines++;
                    } else {
                        if (emptyLines > 1) {
                            // This filters out any single empty paragraph and uses the
                            // spacing as set in the options instead. Multiple empty
                            // paragraphs are still imported, for when the author wants more space
                            text = '\n'.repeat(emptyLines) + text;
                        }

                        if (pspace == 'web') {
                            text += '\n\n';
                        } else if (text.trim().length > 0) {
                            text += '\n';
                        }

                        emptyLines = 0;
                    }

                    return text;
                } else if (item.nodeName === 'HR') {
                    if (pspace == 'book') return '\n[hr]\n\n';
                    return '[hr]\n';
                } else {
                    return '';
                }
            }).join('');
        };

        // Promise to load the Google API scripts and initialize them
        const apiLoadPromise = Util.loadScript('https://apis.google.com/js/api.js')
            .then(() => Util.loadGoogleApi('client:auth2:picker'))
            .then(() => gapi.client.init({
                apiKey: config.apiKey,
                clientId: config.clientId,
                scope: config.scopes,
                fetchBasicProfile: false
            }))
            .catch(err => {
                console.error('Something went wrong while initializing Google Auth2: %o', err);
                ShowErrorWindow('Sorry! Something went wrong while initializing Google APIs.');
            });

        // On a button press, continue with the apiLoadPromise
        // This both allows the user to press the button early and press it multiple times while guaranteeing that the API is loaded
        button.addEventListener('click', () => {
            apiLoadPromise
                .then(() => new Promise(resolve => {
                    // This step is only completed when the user is logged in to Google
                    // The user is either already logged in or a popup requests he logs in

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
                    // Creates a picker object
                    // If a document is selected, the step completes, else it is rejected

                    new google.picker.PickerBuilder()
                        .setOAuthToken(token)
                        .setAppId(config.clientId)
                        .addView(google.picker.ViewId.RECENTLY_PICKED)
                        .addView(google.picker.ViewId.DOCUMENTS)
                        .setCallback(data => {
                            if (data.action == 'picked') {
                                data.token = token;
                                resolve(data);
                            } else if (data.action == 'cancel') {
                                reject('Cancelled by user');
                            }
                        })
                        .build()
                        .setVisible(true);
                }))
                .then(data => {
                    // Loads the document from Drive, if it is of the correct type

                    const doc = data.docs[0];
                    if (doc.mimeType != 'application/vnd.google-apps.document') {
                        ShowErrorWindow('Sorry! Only Google documents can be imported as of now.');
                        return false;
                    }

                    console.info('Importing document "' + doc.name + '".');
                    return Util.getByAjax('https://www.googleapis.com/drive/v3/files/' + doc.id + '/export?mimeType=text/html', {
                        headers: {
                            Authorization: 'Bearer ' + data.token
                        }
                    });
                })
                .then(fnParseDocument);
        });
    }
})();
