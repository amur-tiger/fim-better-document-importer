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
// ==/UserScript==

(function () {
    'use strict';

    var API_KEY = 'AIzaSyDibtpof7uNJx2t5Utsk8eG48C72wFuwqc';
    var CLIENT_ID = '285016570913-kin436digkbvboomjvnij5n9fitech9l.apps.googleusercontent.com';
    var SCOPES = 'https://www.googleapis.com/auth/drive.readonly';

    // DOM objects and replacing the import button
    var editor = document.getElementById('chapter_editor');
    var oldButton = document.getElementById('import_button');
    var button = oldButton.cloneNode(true);

    oldButton.parentNode.replaceChild(button, oldButton);

    var Util = {
        /**
         * Loads a script dynamically by creating a script element and attaching it to the head element.
         * @param {String} url
         * @returns {Promise}
         */
        loadScript: function (url) {
            return new Promise(function (resolve, reject) {
                var script = document.createElement('script');
                script.onload = resolve;
                script.onerror = function () {
                    console.error('Failed to load script: %s', url);
                    reject.apply(this, arguments);
                };
                script.src = url;
                document.getElementsByTagName('head')[0].appendChild(script);
            });
        },

        /**
         * Loads a Google API dynamically.
         * @param api
         * @returns {Promise}
         */
        loadGoogleApi: function (api) {
            return new Promise(function (resolve) {
                gapi.load(api, resolve);
            });
        },

        /**
         * Makes an AJAX GET call, optionally with additional headers.
         * @param {String} url
         * @param {Object} options
         * @returns {Promise}
         */
        getByAjax: function (url, options) {
            return new Promise(function (resolve, reject) {
                var xhr = new XMLHttpRequest();
                xhr.onreadystatechange = function () {
                    if (xhr.readyState == XMLHttpRequest.DONE) {
                        if (xhr.status >= 200 && xhr.status <= 300) {
                            resolve(xhr.response);
                        } else {
                            reject(xhr.response);
                        }
                    }
                };
                xhr.open('GET', url, true);
                if (options && options.headers) {
                    for (var key in options.headers) {
                        if (!options.headers.hasOwnProperty(key)) continue;
                        xhr.setRequestHeader(key, options.headers[key]);
                    }
                }
                xhr.send();
            });
        },

        /**
         * Parses an RGB-color-string as returned from `element.style.color` to a CSS hex-notation.
         * @param {String} rgb
         * @returns {String|Boolean}
         */
        rgbToHex: function (rgb) {
            if (!rgb || rgb == 'inherit') return false;
            var match = rgb.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
            var hex = function (x) {
                return ('0' + parseInt(x).toString(16)).slice(-2);
            };
            var c = '#' + hex(match[1]) + hex(match[2]) + hex(match[3]);
            return c == '#000000' ? false : c;
        },

        /**
         * Converts a font size in PT to a font size in EM, assuming default values for DPI...
         * @param {String} pt
         * @returns {String|Boolean}
         */
        ptToEm: function (pt) {
            if (!pt) return false;
            pt = pt.slice(0, -2);
            if (pt == '11' || pt == '12') return false;
            return +(pt / 12).toFixed(3) + 'em';
        }
    };

    // Pretty parsing function for the document
    var fnParseDocument = function (doc) {
        // Walk a paragraph for all styles recursively
        // Google doesn't report styles recursively, so this might be overkill
        // Since the styles aren't recursive, they might produce weird BBCode...
        var fnWalk = function walk(item) {
            if (item.nodeType == 3) return item.textContent;
            if (item.children.length == 1 && item.children[0].nodeName == 'A') {
                // Links get special treatment since the color and underline by Google
                // can be ignored, the default styling is used instead
                // Also, strip the Google referrer link out
                var tmpA = document.createElement('a');
                tmpA.href = item.children[0].getAttribute('href');
                var queryParams = tmpA.search.substring(1).split('&');
                var link;
                for (var i = 0; i < queryParams.length; i++) {
                    var pair = queryParams[i].split('=');
                    if (pair[0] == 'q') {
                        link = decodeURIComponent(pair[1]);
                        break;
                    }
                }

                if (link) {
                    // Warning: Since Google isn't sending the document with a recursive
                    // structure, formatted links might get ripped into multiple pieces...
                    return '[url=' + link + ']' + fnWalk(item.children[0]) + '[/url]';
                } else {
                    console.error('Failed to parse Google referral URL: %s', tmpA.href);
                }
            }
            if (item.children.length == 1 && item.children[0].nodeName == 'IMG') {
                // Image handling is a bit more difficult. For now, only centered
                // images are supported. Also, all images are served by Google and
                // there seems to be no way to get to the original.
                return '[center][img]' + item.children[0].src + '[/img][/center]\n';
            }

            var text = '';
            var bold, italic, underline, strike, color, size;

            if (item.nodeName != 'P') {
                bold = item.style.fontWeight == '700';
                italic = item.style.fontStyle == 'italic';
                underline = item.style.textDecoration == 'underline';
                strike = item.style.textDecoration == 'line-through';
                color = Util.rgbToHex(item.style.color);
                size = Util.ptToEm(item.style.fontSize);

                if (bold) text += '[b]';
                if (italic) text += '[i]';
                if (underline) text += '[u]';
                if (strike) text += '[s]';
                if (color) text += '[color=' + color + ']';
                if (size) text += '[size=' + size + ']';
            }

            Array.from(item.childNodes).forEach(function (e) {
                text += walk(e);
            });

            if (item.nodeName != 'P') {
                if (size) text += '[/size]';
                if (color) text += '[/color]';
                if (strike) text += '[/s]';
                if (underline) text += '[/u]';
                if (italic) text += '[/i]';
                if (bold) text += '[/b]';
            }

            return text;
        };

        var contents = '';
        var template = document.createElement('template');
        template.innerHTML = doc;

        // Walk all elements in the document
        Array.from(template.content.children).forEach(function (item) {
            if (item.nodeName === 'P') {
                var ptext = fnWalk(item);

                if (item.style.textAlign == 'center') {
                    contents += '[center]' + ptext + '[/center]\n\n';
                } else {
                    contents += ptext + '\n\n';
                }
            } else if (item.nodeName === 'HR') {
                contents += '[hr]';
            }
        });

        editor.value = contents;
    };

    // Promise to load the Google API scripts and initialize them
    var apiLoadPromise = Util.loadScript('https://apis.google.com/js/api.js')
        .then(() => Util.loadGoogleApi('client:auth2:picker'))
        .then(() => gapi.client.init({
                apiKey: API_KEY,
                clientId: CLIENT_ID,
                scope: SCOPES,
                fetchBasicProfile: false
            }
        ), function (err) {
            console.error('Something went wrong while initializing Google Auth2: %o', err);
            ShowErrorWindow('Sorry! Something went wrong while initializing Google APIs.');
        });

    // On a button press, continue with the apiLoadPromise
    // This both allows the user to press the button early and press it multiple times while guaranteeing that the API is loaded
    button.addEventListener('click', function () {
        apiLoadPromise
            .then(() => new Promise(function (resolve) {
                // This step is only completed when the user is logged in to Google
                // The user is either already logged in or a popup requests he logs in

                if (gapi.auth2.getAuthInstance().isSignedIn.get()) {
                    resolve();
                    return;
                }

                gapi.auth2.getAuthInstance().isSignedIn.listen(function (isLoggedIn) {
                    if (isLoggedIn) resolve();
                });

                gapi.auth2.getAuthInstance().signIn({
                    scope: SCOPES,
                    fetch_basic_profile: false
                });
            }))
            .then(() => gapi.auth2.getAuthInstance().currentUser.get().getAuthResponse(true).access_token)
            .then(token => new Promise(function (resolve, reject) {
                // Creates a picker object
                // If a document is selected, the step completes, else it is rejected

                new google.picker.PickerBuilder()
                    .setOAuthToken(token)
                    .setAppId(CLIENT_ID)
                    .addView(google.picker.ViewId.RECENTLY_PICKED)
                    .addView(google.picker.ViewId.DOCUMENTS)
                    .setCallback(function (data) {
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
            .then(function (data) {
                // Loads the document from Drive, if it is of the correct type

                var doc = data.docs[0];
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
