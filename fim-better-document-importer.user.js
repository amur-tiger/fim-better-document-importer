// ==UserScript==
// @name         Better Document Importer
// @namespace    https://tiger.rocks/
// @version      0.1
// @description  Adds a better importer for Google Docs documents to the chapter editor of FiMFiction.net.
// @author       TigeR
// @copyright    2016, TigeR
// @license      MIT, https://github.com/NekiCat/fim-better-document-importer/blob/master/LICENSE
// @homepageURL  https://github.com/NekiCat/fim-better-document-importer
// @match        *://www.fimfiction.net/chapter/*
// @require      http://code.jquery.com/jquery-latest.js
// ==/UserScript==

(function($) {
    'use strict';

    var logger = false;
    var clientId = '285016570913-kin436digkbvboomjvnij5n9fitech9l.apps.googleusercontent.com';
    var oauthToken = null;

    // DOM objects and replacing the import button
    var $editor = $('#chapter_editor');
    var $oldbutton = $('#import_button');

    var clone = $oldbutton[0].cloneNode(true);
    $oldbutton[0].parentNode.replaceChild(clone, $oldbutton[0]);
    var $button = $(clone);

    // Pretty parsing function for the document
    var fnParseDocument = function(doc) {
        if (logger) console.log('Parsing document to BBCode.');

        // Utility function to parse "rgb(x, x, x)" strings from CSS
        // Black is ignored, as that is the default
        var rgb2hex = function(rgb) {
            if (!rgb || rgb == 'inherit') return false;
            rgb = rgb.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
            var hex = function(x) {
                return ("0" + parseInt(x).toString(16)).slice(-2);
            };
            var c = '#' + hex(rgb[1]) + hex(rgb[2]) + hex(rgb[3]);
            return c == '#000000' ? false : c;
        };

        // Utility function to convert PT as returned from Google to EM as required by FiMFiction
        // 11pt and 12pt are ignored as these are the defaults
        var ptToEm = function(pt) {
            if (!pt) return false;
            pt = pt.slice(0, -2);
            if (pt == '11' || pt == '12') return false;
            return +(pt / 12).toFixed(3) + 'em';
        };

        // Walk a paragraph for all styles recursively
        // Google doesn't report styles recursively, so this might be overkill
        // Since the styles aren't recursive, they might produce weird BBCode...
        var fnWalk = function walk() {
            if (this.nodeType == 3) return this.textContent;
            if (this.children.length == 1 && this.children[0].nodeName == 'A') {
                // Links get special treatment since the color and underline by Google
                // can be ignored, the default styling is used instead
                // Also, strip the Google referrer link out
                var atemp = document.createElement('a');
                atemp.href = this.children[0].getAttribute('href');
                var queryParams = atemp.search.substring(1).split('&');
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
                    console.error('Failed to parse Google referral URL: %s', atemp.href);
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
                color = rgb2hex(this.style.color);
                size = ptToEm(this.style.fontSize);

                if (bold) text += '[b]';
                if (italic) text += '[i]';
                if (underline) text += '[u]';
                if (strike) text += '[s]';
                if (color) text += '[color=' + color + ']';
                if (size) text += '[size=' + size + ']';
            }

            Array.from(this.childNodes).forEach(function(e) {
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

        var $doc = $(doc);
        var contents = '';

        // Walk all elements in the document
        $doc.each(function() {
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

        $editor.val(contents);
    };

    // Loading the Google API scripts
    $.getScript('https://apis.google.com/js/api.js', function() {
        gapi.load('picker:auth', {
            callback: function() {
                if (logger) console.log('Authorizing with Google.');
                gapi.auth.authorize({
                    client_id: clientId,
                    scope: ['https://www.googleapis.com/auth/drive.readonly'],
                    immediate: true,
                }, function(result) {
                    if (result) {
                        if (logger) console.log('Got authorization from Google.');
                        oauthToken = result.access_token;
                    } else {
                        console.error('Error getting authorization: %o', result);
                        ShowErrorWindow('Sorry! There was an error authenticating you with Google. Only the standard import mechanism will be available.');
                        $button[0].parentNode.replaceChild($oldbutton[0], $button[0]);
                    }
                });
            },
        });
    });

    // Create and show picker and retrieve document
    $button.click(function(e) {
        var picker = new google.picker.PickerBuilder()
        .setOAuthToken(oauthToken)
        .setAppId(clientId)
        .addView(google.picker.ViewId.RECENTLY_PICKED)
        .addView(google.picker.ViewId.DOCUMENTS)
        .setCallback(function(data) {
            if (data.action != 'picked') return;

            var doc = data.docs[0];
            if (doc.mimeType != 'application/vnd.google-apps.document') {
                ShowErrorWindow('Sorry! Only Google documents can be imported as of now.');
                return;
            }

            if (logger) console.log('Importing document ' + doc.name + '.');

            $.ajax({
                type: 'GET',
                url: 'https://www.googleapis.com/drive/v3/files/' + doc.id + '/export?mimeType=text/html',
                headers: {
                    Authorization: 'Bearer ' + oauthToken,
                },
                success: fnParseDocument,
                error: function(data) {
                    console.error('Error getting document: %o', data);
                    ShowErrorWindow('Sorry! There was an error retrieving the document from Google.');
                },
            });
        })
        .build();
        picker.setVisible(true);
    });
})(jQuery);
