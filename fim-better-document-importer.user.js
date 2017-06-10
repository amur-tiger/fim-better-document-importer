// ==UserScript==
// @name         Better Document Importer
// @namespace    https://tiger.rocks/
// @version      0.8.0
// @description  Adds a better importer for Google Docs documents to the chapter editor of FiMFiction.net.
// @author       TigeR
// @copyright    2017, TigeR
// @license      MIT, https://github.com/NekiCat/fim-better-document-importer/blob/master/LICENSE
// @homepageURL  https://github.com/NekiCat/fim-better-document-importer
// @supportURL   https://github.com/NekiCat/fim-better-document-importer/issues
// @updateURL    https://raw.githubusercontent.com/NekiCat/fim-better-document-importer/master/fim-better-document-importer.user.js
// @downloadURL  https://raw.githubusercontent.com/NekiCat/fim-better-document-importer/master/fim-better-document-importer.user.js
// @require      https://raw.githubusercontent.com/taylorhakes/promise-polyfill/master/promise.min.js
// @match        *://www.fimfiction.net/chapter/*
// @match        *://www.fimfiction.net/story/*
// @match        *://www.fimfiction.net/manage/blog-posts/*
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==

(function () {
'use strict';

/// <reference path="FiMFiction.d.ts"/>
var Util = (function () {
    function Util() {
    }
    /**
     * Loads a script dynamically by creating a script element and attaching it to the head element.
     * @param {string} url
     * @returns {Promise}
     */
    Util.loadScript = function (url) {
        return new Promise(function (resolve, reject) {
            var script = document.createElement("script");
            script.addEventListener("load", resolve);
            script.addEventListener("error", function (err) {
                console.error("Failed to load script: %s", url);
                reject(err);
            });
            script.src = url;
            document.getElementsByTagName("head")[0].appendChild(script);
        });
    };
    /**
     * Makes an AJAX GET call, optionally with additional headers.
     * @param {string} url
     * @param {object} [options]
     * @returns {Promise}
     */
    Util.getByAjax = function (url, options) {
        return new Promise(function (resolve, reject) {
            var xhr = new XMLHttpRequest();
            xhr.addEventListener("load", function () {
                if (xhr.status >= 200 && xhr.status <= 300) {
                    resolve(xhr.response);
                }
                else {
                    reject(xhr.response);
                }
            });
            xhr.addEventListener("error", function () {
                reject(xhr.response);
            });
            xhr.open("GET", url, true);
            if (options && options.headers) {
                Object.keys(options.headers).forEach(function (key) {
                    xhr.setRequestHeader(key, options.headers[key]);
                });
            }
            xhr.send();
        });
    };
    /**
     * Parses an RGB-color-string as returned from `element.style.color` to a CSS hex-notation.
     * @param {string} rgb
     * @returns {string|boolean}
     */
    Util.rgbToHex = function (rgb) {
        if (!rgb || rgb == "inherit" || typeof rgb != "string")
            return false;
        var match = rgb.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
        if (!match)
            return false;
        var hex = function (x) { return ("0" + parseInt(x).toString(16)).slice(-2); };
        var c = "#" + hex(match[1]) + hex(match[2]) + hex(match[3]);
        return c == "#000000" ? false : c;
    };
    /**
     * Converts a font size in PT to a font size in EM, assuming default values for DPI.
     * @param {string} pt
     * @param {number} [base]
     * @returns {string|boolean}
     */
    Util.ptToEm = function (pt, base) {
        if (!pt || typeof pt !== "string" || pt.slice(-2) !== "pt")
            return false;
        var n = +pt.slice(0, -2);
        if (!base && (n === 11 || n === 12))
            return false;
        var em = +(n / (base || 12)).toFixed(3) + "em";
        if (em === "1em")
            return false;
        return em;
    };
    /**
     * Turns anything that has a length and an indexer to access values into a proper array.
     * @param value
     * @returns {Array}
     */
    Util.toArray = function (value) {
        var result = [];
        for (var i = 0; i < value.length; i++) {
            result.push(value[i]);
        }
        return result;
    };
    /**
     * Parses a Google referrer link and extracts the "q" query parameter from it.
     * @param {string} link
     * @returns {string|boolean}
     */
    Util.parseGoogleRefLink = function (link) {
        var a = window.document.createElement("a");
        a.href = link;
        var queryParams = a.search.substring(1).split("&");
        for (var i = 0; i < queryParams.length; i++) {
            var pair = queryParams[i].split("=");
            if (pair[0] == "q") {
                return decodeURIComponent(pair[1]);
            }
        }
        return false;
    };
    /**
     * Given a list of headings, shows a popup menu and lets the user decide which heading to choose. If the
     * headings list contains no elements, no popup is shown and the promise is resolved immediately.
     * @param {HTMLElement[]} headings
     * @returns {Promise}
     */
    Util.chooseChapter = function (headings) {
        if (headings.length <= 0) {
            return Promise.resolve(null);
        }
        return new Promise(function (resolve) {
            var content = '<div class="std"><label><a class="styled_button" style="text-align:center;width:100%;">Import Everything</a></label>\n' +
                headings.map(function (h) { return '<label><a style="display:inline-block;text-align:center;width:100%;" data-id="' + h.id + '">' + h.textContent + '</a></label>'; }).join("\n") + "</div>";
            var popup = new PopUpMenu("", '<i class="fa fa-th-list"></i> Chapter Selection');
            popup.SetCloseOnHoverOut(false);
            popup.SetCloseOnLinkPressed(true);
            popup.SetSoftClose(true);
            popup.SetWidth(350);
            popup.SetDimmerEnabled(false);
            popup.SetFixed(false);
            popup.SetContent(content);
            popup.SetFooter("The document you want to import seems to contain chapters. Please select a chapter to import.");
            var contentContainer = popup["content"].querySelector(".std");
            contentContainer.addEventListener("click", function (e) {
                if (e.target.nodeName != "A")
                    return;
                var hid = e.target.getAttribute("data-id");
                var h = headings.filter(function (h) { return h.id === hid; });
                resolve(h.length ? h[0] : null);
            });
            // TODO: Leak here when popup canceled? (Promise still open)
            popup.Show();
        });
    };
    return Util;
}());

var Settings = (function () {
    function Settings(getter, setter) {
        this.getter = getter;
        this.setter = setter;
    }
    Settings.prototype.get = function (key, std) {
        return this.getter(key, std);
    };
    Settings.prototype.getObj = function (key, std) {
        return JSON.parse(this.getter(key, typeof std === "undefined" ? "{}" : std));
    };
    Settings.prototype.set = function (key, value) {
        this.setter(key, value);
    };
    Settings.prototype.setObj = function (key, value) {
        this.setter(key, JSON.stringify(value));
    };
    Object.defineProperty(Settings.prototype, "paragraphCustomCaptions", {
        get: function () {
            return this.get("pcaption", "1") === "1";
        },
        set: function (value) {
            this.set("pcaption", value ? "1" : "0");
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Settings.prototype, "sizeAutoScale", {
        get: function () {
            return this.get("sscale", "1") === "1";
        },
        set: function (value) {
            this.set("sscale", value ? "1" : "0");
        },
        enumerable: true,
        configurable: true
    });
    return Settings;
}());

var Mode;
(function (Mode) {
    Mode[Mode["SETTINGS"] = 0] = "SETTINGS";
    Mode[Mode["BLOG"] = 1] = "BLOG";
    Mode[Mode["CHAPTER"] = 2] = "CHAPTER";
})(Mode || (Mode = {}));
var Mode$1 = Mode;

var EventSource = (function () {
    function EventSource(sender) {
        this.sender = sender;
        this.handlers = [];
    }
    EventSource.prototype.on = function (handler) {
        this.handlers.push(handler);
    };
    EventSource.prototype.off = function (handler) {
        this.handlers = this.handlers.filter(function (h) { return h !== handler; });
    };
    EventSource.prototype.trigger = function (data) {
        var _this = this;
        this.handlers.slice(0).forEach(function (h) { return h(_this.sender, data); });
    };
    EventSource.prototype.expose = function () {
        return this;
    };
    return EventSource;
}());

var HtmlInjector = (function () {
    function HtmlInjector(settings, context) {
        this.settings = settings;
        this.context = context;
        this.onImport = new EventSource(this);
        this.onQuickImport = new EventSource(this);
        this.editorElement = null;
        this.isInjected = false;
    }
    Object.defineProperty(HtmlInjector.prototype, "importEvent", {
        get: function () {
            return this.onImport.expose();
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(HtmlInjector.prototype, "quickImportEvent", {
        get: function () {
            return this.onQuickImport.expose();
        },
        enumerable: true,
        configurable: true
    });
    /**
     * Analyzes the current URL and determines which mode the importer script should run in. Returns one of
     * the constants defined in `Modes`.
     * @returns {String}
     */
    HtmlInjector.prototype.getPageMode = function (w) {
        w = w || window;
        return w.location.href.indexOf("manage/local-settings") >= 0 ? Mode$1.SETTINGS :
            (w.location.href.indexOf("manage/blog-posts") >= 0 ? Mode$1.BLOG : Mode$1.CHAPTER);
    };
    /**
     * Injects HTML fragments necessary for the userscript depending on the current page mode as returned by
     * `getPageMode()`.
     */
    HtmlInjector.prototype.inject = function () {
        if (this.isInjected) {
            return;
        }
        switch (this.getPageMode()) {
            case Mode$1.SETTINGS:
                this.injectSettings();
                break;
            case Mode$1.BLOG:
                this.editorElement = this.context.getElementById("blog_post_content");
                this.injectImportButton();
                break;
            case Mode$1.CHAPTER:
                this.editorElement = this.context.getElementById("chapter_editor");
                if (!this.editorElement) {
                    break;
                }
                this.injectImportButton();
                break;
        }
        this.isInjected = true;
    };
    /**
     * Sets the story or chapter text in the editor window.
     * @param text
     */
    HtmlInjector.prototype.setEditorText = function (text) {
        if (this.editorElement) {
            this.editorElement.value = text;
        }
    };
    /**
     * Determines the quick import id of the current chapter or blog post. Returns null if the current page is
     * neither a blog post nor a chapter.
     * @returns {string}
     */
    HtmlInjector.prototype.getQuickImportKey = function () {
        switch (this.getPageMode()) {
            case Mode$1.BLOG:
                // get the id from the URL
                var match = window.location.href.match(/\/(\d+)/);
                if (!match)
                    return null;
                return "blog-" + match[1];
            case Mode$1.CHAPTER:
                // Get the ID of the chapter. This works for both released and unreleased chapters.
                var chapterForm = this.context.getElementById("chapter_edit_form");
                return "chapter-" + chapterForm.elements["chapter"].value;
            default:
                return null;
        }
    };
    /**
     * Toggles whether the given button is disabled and shows a waiting animation if so.
     * @param {HTMLButtonElement} button
     */
    HtmlInjector.prototype.toggleButtonBusy = function (button) {
        if (button.disabled) {
            var icon = button.getElementsByTagName("i")[0];
            if (icon) {
                icon.className = icon.dataset["originalIconClass"];
                delete icon.dataset["originalIconClass"];
            }
            button.disabled = false;
        }
        else {
            var icon = button.getElementsByTagName("i")[0];
            if (icon) {
                icon.dataset["originalIconClass"] = icon.className;
                icon.className = "fa fa-spin fa-spinner";
            }
            button.disabled = true;
        }
    };
    /**
     * Injects the BDI settings into the settings page.
     */
    HtmlInjector.prototype.injectSettings = function () {
        var _this = this;
        var pCaption = this.settings.paragraphCustomCaptions;
        var sScale = this.settings.sizeAutoScale;
        var table = this.context.createElement("tbody");
        table.innerHTML = "<tr><td colspan=\"2\" class=\"section_header\"><b>Better Importer Settings</b></td></tr>\n            <tr><td class=\"label\">Handle Custom Captions</td><td>\n            <label class=\"toggleable-switch\"><input type=\"checkbox\" name=\"bdi_pcaption\" value=\"1\" " + (pCaption ? "checked" : "") + "/><a></a></label>\n\t\t\t</td></tr><tr><td class=\"label\">Auto-Scale Custom Sizes</td><td>\n\t\t\t<label class=\"toggleable-switch\"><input type=\"checkbox\" name=\"bdi_sscale\" value=\"1\" " + (sScale ? "checked" : "") + "/><a></a></label>\n\t\t\t</td></tr>";
        var settingsForm = this.context.getElementById("local_site_settings");
        settingsForm.firstElementChild.insertBefore(table, settingsForm.firstElementChild.lastElementChild);
        settingsForm.elements["bdi_pcaption"].addEventListener("change", function (e) { return _this.settings.paragraphCustomCaptions = e.target.checked; });
        settingsForm.elements["bdi_sscale"].addEventListener("change", function (e) { return _this.settings.sizeAutoScale = e.target.checked; });
    };
    /**
     * Injects the import button on chapter pages. Injects the quick import button if the quick import check succeeds.
     */
    HtmlInjector.prototype.injectImportButton = function () {
        var _this = this;
        var toolbar = this.context.querySelector(".toolbar_buttons");
        var buttonItem = this.context.createElement("li");
        var button = this.context.createElement("button");
        button.title = "Import from Google Docs";
        button.innerHTML = '<i class="fa fa-cloud-download"></i> Import';
        buttonItem.appendChild(button);
        toolbar.insertBefore(buttonItem, toolbar.firstChild);
        button.addEventListener("click", function () { return _this.onImport.trigger(button); });
        this.injectQuickImportButton(button);
    };
    /**
     * Injects the quick import button if the quick import check succeeds.
     * @param button
     */
    HtmlInjector.prototype.injectQuickImportButton = function (button) {
        var _this = this;
        var quickImportKey = this.getQuickImportKey();
        if (!quickImportKey) {
            return;
        }
        var quickImportCheck = this.settings.getObj(quickImportKey);
        if (!quickImportCheck.id) {
            return;
        }
        var quickButtonItem = this.context.createElement("li");
        var quickButton = this.context.createElement("button");
        quickButton.title = "Quick Import \"" + quickImportCheck.name + (quickImportCheck.chapter ? ": " + quickImportCheck.chapter : "") + "\" from Google Docs";
        quickButton.innerHTML = '<i class="fa fa-bolt"></i>';
        quickButtonItem.appendChild(quickButton);
        button.parentNode.parentNode.insertBefore(quickButtonItem, button.parentNode);
        quickButton.addEventListener("click", function () { return _this.onQuickImport.trigger(quickButton); });
    };
    return HtmlInjector;
}());

var defaultFormats = [
    {
        test: function (element) { return element.style.textAlign == "center"; },
        tag: "center"
    },
    {
        test: function (element) { return element.style.textAlign == "right"; },
        tag: "right"
    },
    {
        test: function (element) { return element.style.fontWeight == 700; },
        tag: "b"
    },
    {
        test: function (element) { return element.style.fontStyle == "italic"; },
        tag: "i"
    },
    {
        test: function (element) { return element.style.textDecoration == "underline"; },
        tag: "u"
    },
    {
        test: function (element) { return element.style.textDecoration == "line-through"; },
        tag: "s"
    },
    {
        test: function (element) { return element.style.verticalAlign == "super"; },
        tag: "sup"
    },
    {
        test: function (element) { return element.style.verticalAlign == "sub"; },
        tag: "sub"
    },
    {
        test: function (element) { return Util.rgbToHex(element.style.color); },
        prefix: function (test) { return "[color=" + test + "]"; },
        postfix: function () { return "[/color]"; }
    },
    {
        test: function (element, options) {
            if (element.nodeName === "P")
                return false;
            return Util.ptToEm(element.style.fontSize || "12pt", options.baseSize);
        },
        prefix: function (test) { return "[size=" + test + "]"; },
        postfix: function () { return "[/size]"; }
    }
];

var FormatMode;
(function (FormatMode) {
    FormatMode[FormatMode["UNCHANGED"] = 0] = "UNCHANGED";
    FormatMode[FormatMode["BOOK"] = 1] = "BOOK";
    FormatMode[FormatMode["WEB"] = 2] = "WEB";
})(FormatMode || (FormatMode = {}));
var Formatter = (function () {
    function Formatter(doc, context) {
        this.context = context;
        this.formatDefinitions = defaultFormats;
        this.customCaptions = true;
        this.sizeAutoScale = true;
        this.doc = [];
        this.heading = null;
        // The doc contains style links for fonts. Edge will complain about them and we don't need them
        // anyway, so to be sure, we remove the whole head.
        doc = doc.replace(/<head>.*?<\/head>/, "");
        var template = this.context.createElement("template");
        template.innerHTML = doc;
        var elements = template.content.querySelectorAll("*");
        for (var i = 0; i < elements.length; i++) {
            this.doc.push(elements[i]);
        }
    }
    /**
     * Extracts headings from the document to allow the user to choose a smaller part of
     * the document to import.
     * @return {HTMLElement[]}
     */
    Formatter.prototype.getHeadings = function () {
        return this.doc.filter(function (e) { return /^H\d$/.test(e.nodeName); });
    };
    /**
     * Returns the heading element that has the same text as the given text.
     * @param {string} name
     * @return {HTMLElement}
     */
    Formatter.prototype.getHeadingWithName = function (name) {
        var elements = this.getHeadings();
        for (var _i = 0, elements_1 = elements; _i < elements_1.length; _i++) {
            var element = elements_1[_i];
            if (element.textContent === name) {
                return element;
            }
        }
        return null;
    };
    /**
     * Returns the currently selected heading or null if there is no heading selected.
     * @returns {HTMLElement}
     */
    Formatter.prototype.getSelectedHeading = function () {
        return this.heading;
    };
    /**
     * Filters the document by discarding elements that are not part of the selected heading. This action can neither
     * be repeated nor undone.
     * @param heading
     */
    Formatter.prototype.setSelectedHeading = function (heading) {
        if (this.heading) {
            throw new Error("There is already a heading selected.");
        }
        if (!heading) {
            return;
        }
        if (this.doc.filter(function (e) { return e === heading; }).length === 0) {
            throw new Error("The heading to import must be part of the document.");
        }
        this.heading = heading;
        this.filterDocByHeading();
    };
    /**
     * Extracts all elements of a chapter after a heading until the next heading of the same or higher level
     * or the end of the document. The header itself is not included.
     */
    Formatter.prototype.filterDocByHeading = function () {
        if (!this.heading) {
            return;
        }
        var result = [];
        var level = this.heading.nodeName.slice(-1);
        var skipping = true;
        for (var _i = 0, _a = this.doc; _i < _a.length; _i++) {
            var element = _a[_i];
            if (skipping) {
                if (element === this.heading) {
                    skipping = false;
                }
            }
            else {
                if (/^H\d$/.test(element.nodeName)) {
                    var nextLevel = element.nodeName.slice(-1);
                    if (nextLevel <= level)
                        break;
                }
                result.push(element);
            }
        }
        this.doc = result;
    };
    /**
     * Converts a document to BBCode, including CSS styles, paragraph indenting and paragraph spacing. The
     * given document elements get altered in the process!
     * @return {string}
     */
    Formatter.prototype.format = function () {
        this.styleParagraphs();
        this.spaceParagraphs();
        return this.doc.map(function (e) { return e.textContent; }).join("").replace(/^[\r\n]+|\s+$/g, "");
    };
    /**
     * Walks an element recursively and returns a string where selected CSS styles are turned into BBCode tags.
     * @param {HTMLElement} element
     * @param {number} [baseSize]
     * @param {boolean} [skipParentStyle]
     * @returns {string}
     * @private
     */
    Formatter.prototype.walkRecursive = function (element, baseSize, skipParentStyle) {
        var _this = this;
        if (element.nodeType == 3) {
            return element.textContent;
        }
        if (element.children.length == 1 && element.children[0].nodeName == "A") {
            var link = element.children[0];
            if (link.id.indexOf("cmnt_") === 0) {
                // Ignore GDocs comments.
                return "";
            }
            // Links are pre-colored, ignore the style since FiMFiction has it's own.
            var formatted = this.walkRecursive(link, baseSize);
            return "[url=" + Util.parseGoogleRefLink(link.getAttribute("href")) + "]" + formatted + "[/url]";
        }
        if (element.children.length == 1 && element.children[0].nodeName == "IMG") {
            var img = element.children[0];
            // Images are served by Google and there seems to be no way to get to the original.
            return "[img]" + img.src + "[/img]";
        }
        var text = Util.toArray(element.childNodes).map(function (node) { return _this.walkRecursive(node, baseSize); }).join("");
        if (text.length === 0 || skipParentStyle) {
            // Headings have some recursive styling on them, but BBCode tags cannot be written recursively.
            // Todo: This needs a better flattening algorithm later.
            return text;
        }
        for (var _i = 0, _a = this.formatDefinitions; _i < _a.length; _i++) {
            var format = _a[_i];
            var test = format.test(element, {
                baseSize: baseSize
            });
            if (test) {
                if (format.tag) {
                    text = "[" + format.tag + "]" + text + "[/" + format.tag + "]";
                }
                else {
                    text = format.prefix(test, element) + text + format.postfix(test, element);
                }
            }
        }
        return text;
    };
    /**
     * Checks the document for the dominant font size, measured in pt, and returns it.
     */
    Formatter.prototype.findBaseScale = function () {
        var map = {};
        var max = [0, 12];
        for (var _i = 0, _a = this.doc; _i < _a.length; _i++) {
            var element = _a[_i];
            if (element.nodeName !== "P") {
                continue;
            }
            for (var _b = 0, _c = Util.toArray(element.childNodes); _b < _c.length; _b++) {
                var node = _c[_b];
                if (node.nodeType == 3) {
                    continue;
                }
                var size = node.style.fontSize || "12pt";
                map[size] = (map[size] || 0) + 1;
                if (map[size] > max[0]) {
                    max = [map[size], parseInt(size.slice(0, -2))];
                }
            }
        }
        return max[1];
    };
    /**
     * Uses format definitions to turn CSS styling into BBCode tags.
     * @return {HTMLParagraphElement[]}
     */
    Formatter.prototype.styleParagraphs = function () {
        var baseScale = null;
        if (this.sizeAutoScale) {
            baseScale = this.findBaseScale();
            if (baseScale === 11 || baseScale === 12) {
                baseScale = null;
            }
        }
        var i = this.doc.length;
        while (i--) {
            var element = this.doc[i];
            if (element.nodeName === "P") {
                element.textContent = this.walkRecursive(element, baseScale);
            }
            else if (element.nodeName === "HR") {
                this.doc[i] = this.context.createElement("p");
                this.doc[i].textContent = "[hr]";
            }
            else if (/^H\d$/.test(element.nodeName)) {
                this.doc[i] = this.context.createElement("p");
                this.doc[i].textContent = this.walkRecursive(element, baseScale, true);
            }
            else {
                this.doc.splice(i, 1);
            }
        }
    };
    /**
     * Spaces out the paragraphs depending on the spacing setting. Appends line breaks to the paragraphs if necessary.
     */
    Formatter.prototype.spaceParagraphs = function () {
        var fulltextParagraph = !this.customCaptions;
        for (var i = 0; i < this.doc.length; i++) {
            var element = this.doc[i];
            var count = 1;
            var ni = i + 1;
            while (ni < this.doc.length && this.doc[ni].textContent.trim().length === 0) {
                this.doc.splice(ni, 1);
                count += 1;
            }
            if (!fulltextParagraph && /[.!?…"„“”«»-](?:\[.*?])*\s*$/.test(element.textContent)) {
                fulltextParagraph = true;
            }
            if (fulltextParagraph) {
                if (count < 2)
                    count = 2;
            }
            while (count-- > 0) {
                element.textContent += "\n";
            }
        }
    };
    return Formatter;
}());

var config = Object.freeze({
    apiKey: "AIzaSyDibtpof7uNJx2t5Utsk8eG48C72wFuwqc",
    clientId: "285016570913-kin436digkbvboomjvnij5n9fitech9l.apps.googleusercontent.com",
    scopes: ["https://www.googleapis.com/auth/drive.readonly"]
});

function UserAbortError(message) {
    this.name = "UserAbortError";
    this.message = message;
    this.stack = (new Error()).stack;
}
UserAbortError.prototype = new Error;

var GoogleApi = (function () {
    function GoogleApi(apiKey, clientId, scopes) {
        this.apiKey = apiKey;
        this.clientId = clientId;
        this.scopes = scopes;
        this.apiLoadPromise = null;
        this.bearerTokenPromise = null;
    }
    /**
     * Loads a Google API dynamically.
     * @param api
     * @returns {Promise<void>}
     */
    GoogleApi.prototype.loadApi = function () {
        var api = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            api[_i] = arguments[_i];
        }
        return new Promise(function (resolve) {
            gapi.load(api.join(":"), resolve);
        });
    };
    /**
     * Ensures that the relevant Google APIs were loaded and returns a Promise for their presence. This
     * method can get called multiple times, the APIs will only load once.
     * @returns {Promise<void>}
     */
    GoogleApi.prototype.ensureGoogleApiLoaded = function () {
        var _this = this;
        if (!this.apiLoadPromise) {
            this.apiLoadPromise = Util.loadScript("https://apis.google.com/js/api.js")
                .then(function () { return _this.loadApi("client", "auth2", "picker"); })
                .then(function () { return gapi.client.init({
                apiKey: _this.apiKey,
                clientId: _this.clientId,
                scope: _this.scopes.join(" "),
                fetchBasicProfile: false
            }); });
        }
        return this.apiLoadPromise;
    };
    /**
     * Ensures that the user is logged into his Google account. If the user cannot be logged in automatically,
     * shows a login window for the user to log in.
     * @returns {Promise<void>}
     */
    GoogleApi.prototype.ensureUserLoggedIn = function () {
        var _this = this;
        return this.ensureGoogleApiLoaded()
            .then(function () {
            if (gapi.auth2.getAuthInstance().isSignedIn.get()) {
                // If the user is already logged in, this check prevents the login window from showing.
                return Promise.resolve();
            }
            return gapi.auth2.getAuthInstance().signIn({
                scope: _this.scopes.join(" "),
                fetch_basic_profile: false
            });
        })
            .catch(function (err) {
            // Error should contain either "popup_closed_by_user" or "access_denied".
            throw new UserAbortError(err);
        });
    };
    /**
     * Fetches a new Bearer token from Google that can be used to get documents from the user's Drive. Loads the
     * relevant Google APIs if they weren't already loaded.
     * @returns {Promise}
     */
    GoogleApi.prototype.getBearerToken = function () {
        if (!this.bearerTokenPromise) {
            this.bearerTokenPromise = this.ensureUserLoggedIn()
                .then(function () { return gapi.auth2.getAuthInstance().currentUser.get().getAuthResponse(true).access_token; });
        }
        return this.bearerTokenPromise;
    };
    /**
     * Shows a Google picker window to allow the user to select files from his Drive. This promise may be
     * rejected with a `UserAbortError` when the user closes the picker window without selecting a file.
     * @returns {Promise<PickerDocumentMetadata>}
     */
    GoogleApi.prototype.showPicker = function () {
        var _this = this;
        return this.getBearerToken()
            .then(function (token) { return new Promise(function (resolve, reject) {
            new google.picker.PickerBuilder()
                .setOAuthToken(token)
                .setAppId(_this.clientId)
                .addView(google.picker.ViewId.RECENTLY_PICKED)
                .addView(google.picker.ViewId.DOCUMENTS)
                .setCallback(function (data) {
                if (data.action == "picked") {
                    resolve(data.docs[0]);
                }
                else if (data.action == "cancel") {
                    reject(new UserAbortError());
                }
            })
                .build()
                .setVisible(true);
        }); });
    };
    /**
     * Fetches some basic metadata from Google Drive for the given document id.
     * @param {string} id
     * @returns {Promise<DocumentMetadata>}
     */
    GoogleApi.prototype.getDocumentMetadata = function (id) {
        return this.getBearerToken()
            .then(function (token) { return Util.getByAjax("https://www.googleapis.com/drive/v3/files/" + id + "", {
            headers: {
                Authorization: "Bearer " + token
            }
        }); })
            .then(function (str) { return JSON.parse(str); });
    };
    /**
     * Fetches the document metadata and contents from Google Drive for the given document id or metadata. Only
     * Google documents may be fetched, other file types cannot be exported.
     * @param id
     * @returns {Promise<Document>}
     */
    GoogleApi.prototype.getDocument = function (id) {
        var _this = this;
        return (typeof id === "string" ? this.getDocumentMetadata(id) : Promise.resolve(id))
            .then(function (meta) {
            return _this.getBearerToken()
                .then(function (token) {
                return { meta: meta, token: token };
            });
        })
            .then(function (data) {
            if (data.meta.mimeType !== "application/vnd.google-apps.document") {
                // I tried importing a docx file, but Google said it doesn't support exporting that :(
                throw new Error("Unsupported media type.");
            }
            return data;
        })
            .then(function (data) {
            return Util.getByAjax("https://www.googleapis.com/drive/v3/files/" + data.meta.id + "/export?mimeType=text/html", {
                headers: {
                    Authorization: "Bearer " + data.token
                }
            })
                .then(function (contents) {
                return {
                    metadata: data.meta,
                    contents: contents
                };
            });
        });
    };
    return GoogleApi;
}());

var settings = new Settings(GM_getValue, GM_setValue);
var injector = new HtmlInjector(settings, document);
injector.inject();
var doImport = function (formatter, meta) {
    injector.setEditorText(formatter.format());
    var quickImportKey = injector.getQuickImportKey();
    if (!quickImportKey) {
        // TODO: The key is not available when the blog post is new, find other way to get key?
        return;
    }
    settings.setObj(injector.getQuickImportKey(), {
        id: meta.id,
        name: meta.name,
        chapter: formatter.getSelectedHeading() ? formatter.getSelectedHeading().textContent : null
    });
};
var googleApi = new GoogleApi(config.apiKey, config.clientId, config.scopes);
googleApi.ensureGoogleApiLoaded(); // This loads the Google APIs so that they are ready when the user clicks the button.
// TODO: Show error window when error is not user caused
injector.importEvent.on(function (sender, button) {
    injector.toggleButtonBusy(button);
    googleApi.showPicker()
        .then(function (meta) { return googleApi.getDocument(meta); })
        .then(function (doc) {
        console.info("Importing document '%s'.", doc.metadata.name);
        // Loads the document using the browser's HTML engine and converts it to BBCode.
        var formatter = new Formatter(doc.contents, document);
        formatter.customCaptions = settings.paragraphCustomCaptions;
        formatter.sizeAutoScale = settings.sizeAutoScale;
        var headings = formatter.getHeadings();
        return Util.chooseChapter(headings)
            .then(function (heading) {
            formatter.setSelectedHeading(heading);
            doImport(formatter, doc.metadata);
        });
    })
        .then(function () { return injector.toggleButtonBusy(button); })
        .catch(function (err) {
        injector.toggleButtonBusy(button);
        throw err;
    });
});
injector.quickImportEvent.on(function (sender, button) {
    injector.toggleButtonBusy(button);
    var data = settings.getObj(injector.getQuickImportKey());
    googleApi.getDocument(data.id)
        .then(function (doc) {
        console.info("Importing document '" + data.name + (data.chapter ? ": " + data.chapter : "") + "'.");
        var formatter = new Formatter(doc.contents, document);
        formatter.customCaptions = settings.paragraphCustomCaptions;
        formatter.sizeAutoScale = settings.sizeAutoScale;
        if (!data.chapter) {
            doImport(formatter, data);
            return;
        }
        var heading = formatter.getHeadingWithName(data.chapter);
        if (heading) {
            formatter.setSelectedHeading(heading);
            doImport(formatter, data);
        }
        else {
            // This means the chapter was renamed or doesn't exist anymore. We have to ask the user what to do.
            Util.chooseChapter(formatter.getHeadings())
                .then(function (heading) {
                formatter.setSelectedHeading(heading);
                doImport(formatter, data);
            });
        }
    })
        .catch(function (err) {
        console.error("Couldn't import '" + data.name + (data.chapter ? ": " + data.chapter : "") + "': %o", err);
        ShowErrorWindow("Sorry, couldn't import '" + data.name + (data.chapter ? ": " + data.chapter : "") + "'.");
    })
        .then(function () { return injector.toggleButtonBusy(button); })
        .catch(function (err) {
        injector.toggleButtonBusy(button);
        throw err;
    });
});

}());
