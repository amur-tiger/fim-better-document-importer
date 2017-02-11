// ==UserScript==
// @name         Better Document Importer
// @namespace    https://tiger.rocks/
// @version      0.2
// @description  Adds a better importer for Google Docs documents to the chapter editor of FiMFiction.net.
// @author       TigeR
// @copyright    2017, TigeR
// @license      MIT, https://github.com/NekiCat/fim-better-document-importer/blob/master/LICENSE
// @homepageURL  https://github.com/NekiCat/fim-better-document-importer
// @match        *://www.fimfiction.net/chapter/*
// @match        *://www.fimfiction.net/story/*
// @match        *://www.fimfiction.net/manage_user/edit_blog_post*
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

    // DOM objects and replacing the import button
    let editor = document.getElementById('chapter_editor');
    let oldButton = document.getElementById('import_button');
    let button = oldButton ? oldButton.cloneNode(true) : null;

    if (!editor || !button) {
        if (window.location.href.includes('manage_user/edit_blog_post')) {
            // To enable blog posts, more work is needed. A new button has to be created
            // and inserted, and the editor has another id.
            editor = document.getElementById('blog_post_content');
            button = document.createElement('button');
            button.title = 'Import from Google Docs';

            const toolbar = document.getElementsByClassName('format-toolbar')[0];
            const toolbar_list = document.createElement('ul');
            toolbar_list.className = 'toolbar_buttons';
            const toolbar_item = document.createElement('li');
            const cloud = document.createElement('i');
            cloud.className = 'fa fa-cloud-upload';

            toolbar.insertBefore(toolbar_list, toolbar.firstChild);
            toolbar_list.appendChild(toolbar_item);
            toolbar_item.appendChild(button);
            button.appendChild(cloud);
            button.innerHTML += ' Import GDoc';
        } else {
            // If the script runs on a story or chapter that is from another author,
            // the editor is not available. In that case, the script can just exit.
            return;
        }
    } else {
        oldButton.parentNode.replaceChild(button, oldButton);
    }

    const Util = {
        /**
         * Loads a script dynamically by creating a script element and attaching it to the head element.
         * @param {String} url
         * @returns {Promise}
         */
        loadScript: url => {
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
        },

        /**
         * Loads a Google API dynamically.
         * @param api
         * @returns {Promise}
         */
        loadGoogleApi: api => {
            return new Promise(resolve => {
                gapi.load(api, resolve);
            });
        },

        /**
         * Makes an AJAX GET call, optionally with additional headers.
         * @param {String} url
         * @param {Object} options
         * @returns {Promise}
         */
        getByAjax: (url, options) => {
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
        },

        /**
         * Parses an RGB-color-string as returned from `element.style.color` to a CSS hex-notation.
         * @param {String} rgb
         * @returns {String|Boolean}
         */
        rgbToHex: rgb => {
            if (!rgb || rgb == 'inherit') return false;
            const match = rgb.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
            const hex = x => {
                return ('0' + parseInt(x).toString(16)).slice(-2);
            };
            const c = '#' + hex(match[1]) + hex(match[2]) + hex(match[3]);
            return c == '#000000' ? false : c;
        },

        /**
         * Converts a font size in PT to a font size in EM, assuming default values for DPI...
         * @param {String} pt
         * @returns {String|Boolean}
         */
        ptToEm: pt => {
            if (!pt) return false;
            pt = pt.slice(0, -2);
            if (pt == '11' || pt == '12') return false;
            return +(pt / 12).toFixed(3) + 'em';
        },

        /**
         * Parses a Google referrer link and extracts the "q" query parameter from it
         * @param link
         * @returns {String|Boolean}
         */
        parseGoogleRefLink: link => {
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
    };

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
        editor.value = Array.from(template.content.children).map(item => {
            if (item.nodeName === 'P') {
                return fnWalk(item) + '\n\n';
            } else if (item.nodeName === 'HR') {
                return '[hr]';
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
            }
        ))
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
})();
