// ==UserScript==
// @name         Better Document Importer
// @namespace    https://tiger.rocks/
// @version      0.1
// @description  Adds a better importer for Google Docs documents to the chapter editor of FiMFiction.net.
// @author       TigeR
// @copyright    2017, TigeR
// @license      MIT, https://github.com/NekiCat/fim-better-document-importer/blob/master/LICENSE
// @homepageURL  https://github.com/NekiCat/fim-better-document-importer
// @match        *://www.fimfiction.net/chapter/*
// ==/UserScript==

(function () {
    'use strict';

    var DO_LOGGING = true;
    var CLIENT_ID = '285016570913-kin436digkbvboomjvnij5n9fitech9l.apps.googleusercontent.com';
    var SCOPES = ['https://www.googleapis.com/auth/drive.readonly'];
    var oauthToken = null;

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
            return new Promise(function (resolve, reject) {
                gapi.load(api, resolve);
            });
        },

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
                    Array.from(options.headers).forEach((v, k) => xhr.setRequestHeader(k, v));
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
        if (DO_LOGGING) console.log('Parsing document to BBCode.');

        // Walk a paragraph for all styles recursively
        // Google doesn't report styles recursively, so this might be overkill
        // Since the styles aren't recursive, they might produce weird BBCode...
        var fnWalk = function walk() {
            if (this.nodeType == 3) return this.textContent;
            if (this.children.length == 1 && this.children[0].nodeName == 'A') {
                // Links get special treatment since the color and underline by Google
                // can be ignored, the default styling is used instead
                // Also, strip the Google referrer link out
                var tmpA = document.createElement('a');
                tmpA.href = this.children[0].getAttribute('href');
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
                    return '[url=' + link + ']' + fnWalk.call(this.children[0]) + '[/url]';
                } else {
                    console.error('Failed to parse Google referral URL: %s', tmpA.href);
                }
            }
            if (this.children.length == 1 && this.children[0].nodeName == 'IMG') {
                // Image handling is a bit more difficult. For now, only centered
                // images are supported. Also, all images are served by Google and
                // there seems to be no way to get to the original.
                return '[center][img]' + this.children[0].src + '[/img][/center]\n';
            }

            var text = '';
            var bold, italic, underline, strike, color, size;

            if (this.nodeName != 'P') {
                bold = this.style.fontWeight == '700';
                italic = this.style.fontStyle == 'italic';
                underline = this.style.textDecoration == 'underline';
                strike = this.style.textDecoration == 'line-through';
                color = Util.rgbToHex(this.style.color);
                size = Util.ptToEm(this.style.fontSize);

                if (bold) text += '[b]';
                if (italic) text += '[i]';
                if (underline) text += '[u]';
                if (strike) text += '[s]';
                if (color) text += '[color=' + color + ']';
                if (size) text += '[size=' + size + ']';
            }

            Array.from(this.childNodes).forEach(function (e) {
                text += walk.call(e);
            });

            if (this.nodeName != 'P') {
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
        template.contents.forEach(function () {
            if (this.nodeName === 'P') {
                var ptext = fnWalk.call(this);

                if (this.style.textAlign == 'center') {
                    contents += '[center]' + ptext + '[/center]\n\n';
                } else {
                    contents += ptext + '\n\n';
                }
            } else if (this.nodeName === 'HR') {
                contents += '[hr]';
            }
        });

        editor.value = contents;
    };

    // Loading the Google API scripts
    Util.loadScript('https://apis.google.com/js/api.js')
        .then(() => Util.loadGoogleApi('picker:auth'))
        .then(function () {
            if (DO_LOGGING) console.log('Authorizing with Google.');
            gapi.auth.authorize({
                client_id: CLIENT_ID,
                scope: SCOPES,
                immediate: true
            }, function (result) {
                if (result) {
                    if (DO_LOGGING) console.log('Got authorization from Google.');
                    oauthToken = result.access_token;
                } else {
                    console.error('Error getting authorization: %o', result);
                    ShowErrorWindow('Sorry! There was an error authenticating you with Google. Only the standard import mechanism will be available.');
                    button.parentNode.replaceChild(oldButton, button);
                }
            });
        });

    // Create and show picker and retrieve document
    button.addEventListener('click', function (e) {
        var picker = new google.picker.PickerBuilder()
            .setOAuthToken(oauthToken)
            .setAppId(CLIENT_ID)
            .addView(google.picker.ViewId.RECENTLY_PICKED)
            .addView(google.picker.ViewId.DOCUMENTS)
            .setCallback(function (data) {
                if (data.action != 'picked') return;

                var doc = data.docs[0];
                if (doc.mimeType != 'application/vnd.google-apps.document') {
                    ShowErrorWindow('Sorry! Only Google documents can be imported as of now.');
                    return;
                }

                if (DO_LOGGING) console.log('Importing document ' + doc.name + '.');

                Util.getByAjax('https://www.googleapis.com/drive/v3/files/' + doc.id + '/export?mimeType=text/html', {
                    headers: {
                        Authorization: 'Bearer ' + oauthToken
                    }
                }).then(fnParseDocument, function (response) {
                    console.error('Error getting document: %o', response);
                    ShowErrorWindow('Sorry! There was an error retrieving the document from Google.');
                });
            })
            .build();
        picker.setVisible(true);
    });
})();
