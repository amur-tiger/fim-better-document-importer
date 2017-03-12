// ==UserScript==
// @name         Better Document Importer
// @namespace    https://tiger.rocks/
// @version      0.6.0
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
// @match        *://www.fimfiction.net/manage_user/edit_blog_post*
// @match        *://www.fimfiction.net/manage_user/local_settings
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==

(function () {
'use strict';

var Util = (function () {
    function Util() {
    }
    /**
     * Loads a script dynamically by creating a script element and attaching it to the head element.
     * @param {String} url
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
     * @param {String} url
     * @param {Object} [options]
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
     * @param {String} rgb
     * @returns {String|Boolean}
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
     * @param {String} pt
     * @returns {String|Boolean}
     */
    Util.ptToEm = function (pt) {
        if (!pt || typeof pt !== "string" || pt.slice(-2) !== "pt")
            return false;
        var n = +pt.slice(0, -2);
        if (n === 11 || n === 12)
            return false;
        return +(n / 12).toFixed(3) + "em";
    };
    Util.toArray = function (value) {
        var result = [];
        for (var i = 0; i < value.length; i++) {
            result.push(value[i]);
        }
        return result;
    };
    /**
     * Parses a Google referrer link and extracts the "q" query parameter from it.
     * @param link
     * @returns {String|Boolean}
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
            var content = document.createElement("div");
            content.className = "std";
            content.innerHTML = '<label><a class="styled_button" style="text-align:center;width:100%;">Import Everything</a></label>\n' +
                headings.map(function (h) { return '<label><a style="display:inline-block;text-align:center;width:100%;" data-id="' + h.id + '">' + h.textContent + '</a></label>'; }).join("\n");
            content.addEventListener("click", function (e) {
                if (e.target.nodeName != "A")
                    return;
                var hid = e.target.getAttribute("data-id");
                var h = headings.filter(function (h) { return h.id === hid; });
                resolve(h.length ? h[0] : null);
            });
            var popup = new PopUpMenu("", '<i class="fa fa-th-list"></i> Chapter Selection');
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
    };
    return Util;
}());

var defaultFormats = [
    {
        test: function (element) { return element.style.textAlign == "center"; },
        tag: "center"
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
        test: function (element) { return Util.rgbToHex(element.style.color); },
        prefix: function (test) { return "[color=" + test + "]"; },
        postfix: function () { return "[/color]"; }
    },
    {
        test: function (element) { return Util.ptToEm(element.style.fontSize); },
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
    function Formatter(doc) {
        this.formatDefinitions = defaultFormats;
        // The doc contains style links for fonts. Edge will complain about them and we don't need them
        // anyway, so to be sure, we remove the whole head.
        doc = doc.replace(/<head>.*?<\/head>/, "");
        var template = document.createElement("template");
        template.innerHTML = doc;
        this._doc = [];
        for (var i = 0; i < template.content.children.length; i++) {
            this._doc.push(template.content.children.item(i));
        }
    }
    Object.defineProperty(Formatter.prototype, "doc", {
        get: function () {
            return this._doc;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Formatter.prototype, "heading", {
        get: function () {
            return this._heading;
        },
        set: function (heading) {
            if (this._doc.filter(function (e) { return e === heading; }).length === 0) {
                throw new Error("The heading to import must be part of the document.");
            }
            this._heading = heading;
        },
        enumerable: true,
        configurable: true
    });
    /**
     * Extracts headings from the document to allow the user to choose a smaller part of
     * the document to import.
     * @return {HTMLElement[]}
     */
    Formatter.prototype.getHeadings = function () {
        return this._doc.filter(function (e) { return /^H\d$/.test(e.nodeName); });
    };
    /**
     * Returns the heading element that has the same text as the given text.
     * @param name
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
     * Extracts all elements of a chapter after a heading until the next heading of the same or higher level
     * or the end of the document. The header itself is not included.
     * @return {HTMLElement[]}
     */
    Formatter.prototype.getElementsFromHeader = function () {
        if (!this._heading) {
            return this._doc;
        }
        var result = [];
        var level = this._heading.nodeName.slice(-1);
        var skipping = true;
        for (var _i = 0, _a = this._doc; _i < _a.length; _i++) {
            var element = _a[_i];
            if (skipping) {
                if (element === this._heading) {
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
        return result;
    };
    /**
     * Converts a document to BBCode, including CSS styles, paragraph indenting and paragraph spacing. The
     * given document elements get altered in the process!
     * @param {HTMLElement[]} doc
     * @return {String}
     */
    Formatter.prototype.format = function (doc) {
        return this.join(this.getSpacedParagraphs(this.getIndentedParagraphs(this.getStyledParagraphs(doc))));
    };
    /**
     * Walks an element recursively and returns a string where selected CSS styles are turned into BBCode tags.
     * @param {HTMLElement} element
     * @param {Boolean} [skipParentStyle]
     * @returns {String}
     * @private
     */
    Formatter.prototype.__walkRecursive = function (element, skipParentStyle) {
        var _this = this;
        if (element.nodeType == Node.TEXT_NODE) {
            return element.textContent;
        }
        if (element.children.length == 1 && element.children[0].nodeName == "A") {
            var link = element.children[0];
            if (link.id.indexOf("cmnt_") === 0) {
                // Ignore GDocs comments.
                return "";
            }
            // Links are pre-colored, ignore the style since FiMFiction has it's own.
            var formatted = this.__walkRecursive(link);
            return "[url=" + Util.parseGoogleRefLink(link.getAttribute("href")) + "]" + formatted + "[/url]";
        }
        if (element.children.length == 1 && element.children[0].nodeName == "IMG") {
            var img = element.children[0];
            // Images are served by Google and there seems to be no way to get to the original.
            return "[img]" + img.src + "[/img]";
        }
        var text = Util.toArray(element.childNodes).map(function (node) { return _this.__walkRecursive(node); }).join("");
        if (skipParentStyle) {
            // Headings have some recursive styling on them, but BBCode tags cannot be written recursively.
            // Todo: This needs a better flattening algorithm later.
            return text;
        }
        for (var _i = 0, _a = this.formatDefinitions; _i < _a.length; _i++) {
            var format = _a[_i];
            var test = format.test(element);
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
     * Uses format definitions to turn CSS styling into BBCode tags. The given document elements get altered in
     * the process!
     * @param {HTMLElement[]} doc
     * @return {HTMLParagraphElement[]}
     */
    Formatter.prototype.getStyledParagraphs = function (doc) {
        var result = [];
        for (var _i = 0, doc_1 = doc; _i < doc_1.length; _i++) {
            var element = doc_1[_i];
            if (element.nodeName === "P") {
                element.textContent = this.__walkRecursive(element);
                result.push(element);
            }
            else if (element.nodeName === "HR") {
                var horizontalRule = window.document.createElement("p");
                horizontalRule.textContent = "[hr]";
                result.push(horizontalRule);
            }
            else if (/^H\d$/.test(element.nodeName)) {
                var heading = window.document.createElement("p");
                heading.textContent = this.__walkRecursive(element, true);
                result.push(heading);
            }
        }
        return result;
    };
    /**
     * Indents paragraphs depending on the indentation setting given in the constructor. Indented paragraphs
     * will be prepended with a tab character. The given document elements will be altered in the process!
     * @param {HTMLParagraphElement[]} paragraphs
     * @return {HTMLParagraphElement[]}
     */
    Formatter.prototype.getIndentedParagraphs = function (paragraphs) {
        var result = [];
        for (var _i = 0, paragraphs_1 = paragraphs; _i < paragraphs_1.length; _i++) {
            var element = paragraphs_1[_i];
            if (this.indentation === FormatMode.BOOK || this.indentation === FormatMode.WEB) {
                element.textContent = element.textContent.trim();
                if (element.textContent.length > 0 && (this.indentation === FormatMode.BOOK || /^(?:\[.*?])*["„“”«»]/.test(element.textContent))) {
                    element.textContent = "\t" + element.textContent;
                }
            }
            else {
                if (element.style.textIndent && parseFloat(element.style.textIndent.slice(0, -2)) > 0 && element.textContent.length > 0) {
                    // This adds a tab character as an indentation for paragraphs that were indented using the ruler
                    element.textContent = "\t" + element.textContent;
                }
            }
            result.push(element);
        }
        return result;
    };
    /**
     * Spaces out the paragraphs depending on the spacing setting given in the constructor. Appends line breaks
     * to the paragraphs if necessary. The given document elements will be altered in the process!
     * @param {HTMLParagraphElement[]} paragraphs
     * @return {HTMLParagraphElement[]}
     */
    Formatter.prototype.getSpacedParagraphs = function (paragraphs) {
        var result = [];
        var fulltextParagraph = false;
        for (var i = 0; i < paragraphs.length; i++) {
            var element = paragraphs[i];
            var count = 1;
            while (i < paragraphs.length - 1 && paragraphs[i + 1].textContent.trim().length === 0) {
                count += 1;
                i += 1;
            }
            if (!fulltextParagraph && /[\.!?…"„“”«»-](?:\[.*?])*\s*$/.test(element.textContent)) {
                fulltextParagraph = true;
            }
            if (fulltextParagraph && this.spacing === FormatMode.BOOK) {
                if (count == 2)
                    count = 1;
            }
            else if (fulltextParagraph && this.spacing === FormatMode.WEB) {
                if (count < 2)
                    count = 2;
            }
            while (count-- > 0) {
                element.textContent += "\n";
            }
            result.push(element);
        }
        return result;
    };
    /**
     * Joins the given paragraphs together.
     * @param {HTMLParagraphElement[]} paragraphs
     * @return {String}
     */
    Formatter.prototype.join = function (paragraphs) {
        return paragraphs.map(function (e) { return e.textContent; }).join("").replace(/^[\r\n]+|\s+$/g, "");
    };
    return Formatter;
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
    Object.defineProperty(Settings.prototype, "paragraphIndentationMode", {
        get: function () {
            var mode = this.get("pindent", "web");
            switch (mode) {
                case "book": return FormatMode.BOOK;
                case "web": return FormatMode.WEB;
                default: return FormatMode.UNCHANGED;
            }
        },
        set: function (mode) {
            switch (mode) {
                case FormatMode.BOOK:
                    this.set("pindent", "book");
                    break;
                case FormatMode.WEB:
                    this.set("pindent", "web");
                    break;
                default:
                    this.set("pindent", "as-is");
                    break;
            }
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Settings.prototype, "paragraphSpacingMode", {
        get: function () {
            var mode = this.get("pspace", "web");
            switch (mode) {
                case "book": return FormatMode.BOOK;
                case "web": return FormatMode.WEB;
                default: return FormatMode.UNCHANGED;
            }
        },
        set: function (mode) {
            switch (mode) {
                case FormatMode.BOOK:
                    this.set("pspace", "book");
                    break;
                case FormatMode.WEB:
                    this.set("pspace", "web");
                    break;
                default:
                    this.set("pspace", "as-is");
                    break;
            }
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
        return w.location.href.indexOf("manage_user/local_settings") >= 0 ? Mode$1.SETTINGS :
            (w.location.href.indexOf("manage_user/edit_blog_post") >= 0 ? Mode$1.BLOG : Mode$1.CHAPTER);
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
                this.injectImportButtonOnBlog();
                break;
            case Mode$1.CHAPTER:
                this.injectImportButtonOnChapter();
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
                // Get the ID of the blog post. The form is named "edit_story_form" for some reason.
                var blogForm = this.context.getElementById("edit_story_form");
                return "blog-" + blogForm.elements["post_id"].value;
            case Mode$1.CHAPTER:
                // Get the ID of the chapter. This works for both released and unreleased chapters.
                var chapterForm = this.context.getElementById("chapter_edit_form");
                return "chapter-" + chapterForm.elements["chapter"].value;
            default:
                return null;
        }
    };
    /**
     * Takes a list of radio button elements and determines which one is selected.
     * @param elements
     * @returns {FormatMode}
     */
    HtmlInjector.prototype.parseFormatModeRadio = function (elements) {
        var inputs = Array.prototype.filter.call(elements, function (e) { return e instanceof HTMLInputElement; });
        var value = inputs.filter(function (e) { return e.checked; })[0].value;
        switch (value) {
            case "book":
                return FormatMode.BOOK;
            case "web":
                return FormatMode.WEB;
            default:
                return FormatMode.UNCHANGED;
        }
    };
    /**
     * Injects the BDI settings into the settings page.
     */
    HtmlInjector.prototype.injectSettings = function () {
        var _this = this;
        var pIndent = this.settings.paragraphIndentationMode;
        var pSpace = this.settings.paragraphSpacingMode;
        var table = this.context.createElement("tbody");
        table.innerHTML = "<tr><td colspan=\"2\" class=\"section_header\"><b>Better Importer Settings</b></td></tr>\n            <tr><td class=\"label\">Paragraph indentation</td><td>\n            <label><input type=\"radio\" name=\"bdi_pindent\" value=\"as-is\" " + (pIndent === FormatMode.UNCHANGED ? "checked" : "") + "/> Import as-is</label><br/>\n            <label><input type=\"radio\" name=\"bdi_pindent\" value=\"book\" " + (pIndent === FormatMode.BOOK ? "checked" : "") + "/> Book-Style: Indent all paragraphs</label><br/>\n            <label><input type=\"radio\" name=\"bdi_pindent\" value=\"web\" " + (pIndent === FormatMode.WEB ? "checked" : "") + "/> Web-Style: Only indent paragraphs starting with speech</label>\n            </td></tr><tr><td class=\"label\">Paragraph spacing</td><td>\n            <label><input type=\"radio\" name=\"bdi_pspace\" value=\"as-is\" " + (pSpace === FormatMode.UNCHANGED ? "checked" : "") + "/> Import as-is</label><br/>\n            <label><input type=\"radio\" name=\"bdi_pspace\" value=\"book\" " + (pSpace === FormatMode.BOOK ? "checked" : "") + "/> Book-Style: Eliminate less than two line breaks</label><br/>\n            <label><input type=\"radio\" name=\"bdi_pspace\" value=\"web\" " + (pSpace === FormatMode.WEB ? "checked" : "") + "/> Web-Style: Insert space between paragraphs</label>\n            </td></tr>";
        var settingsForm = this.context.getElementById("local_site_settings");
        settingsForm.firstElementChild.insertBefore(table, settingsForm.firstElementChild.lastElementChild);
        var button = settingsForm.lastElementChild.lastElementChild.getElementsByTagName("button")[0];
        button.addEventListener("click", function () {
            _this.settings.paragraphIndentationMode = _this.parseFormatModeRadio(_this.context.getElementsByName("bdi_pindent"));
            _this.settings.paragraphSpacingMode = _this.parseFormatModeRadio(_this.context.getElementsByName("bdi_pspace"));
        });
    };
    /**
     * Injects the import button on blog pages. Injects the quick import button if the quick import check succeeds.
     */
    HtmlInjector.prototype.injectImportButtonOnBlog = function () {
        var _this = this;
        // We are editing a blog post. Roughly the same as editing a chapter, only that a new
        // button must be inserted and that the ids are a bit different.
        var toolbar = this.context.getElementsByClassName("format-toolbar")[0];
        var part = this.context.createElement("ul");
        part.innerHTML = "<li><button id=\"import_button\" title=\"Import from Google Docs\"><i class=\"fa fa-cloud-upload\"></i> Import GDocs</button></li>";
        toolbar.insertBefore(part, toolbar.firstChild);
        var button = this.context.getElementById("import_button");
        this.editorElement = this.context.getElementById("blog_post_content");
        button.addEventListener("click", function (e) { return _this.onImport.trigger(); });
        this.injectQuickImportButton(button);
    };
    /**
     * Injects the import button on chapter pages. Injects the quick import button if the quick import check succeeds.
     */
    HtmlInjector.prototype.injectImportButtonOnChapter = function () {
        var _this = this;
        // Importing on chapters. This also matches story overviews and chapters we have no access to, so
        // another check is necessary.
        var oldButton = this.context.getElementById("import_button");
        if (!oldButton) {
            return;
        }
        // The old button gets replaced with a copy. This is the easiest way to get rid of the old event handler
        // that would trigger the old, standard importer dialog.
        var newButton = oldButton.cloneNode(true);
        oldButton.parentNode.replaceChild(newButton, oldButton);
        this.editorElement = this.context.getElementById("chapter_editor");
        newButton.addEventListener("click", function (e) { return _this.onImport.trigger(); });
        this.injectQuickImportButton(newButton);
    };
    /**
     * Injects the quick import button if the quick import check succeeds.
     * @param button
     */
    HtmlInjector.prototype.injectQuickImportButton = function (button) {
        var _this = this;
        var quickImportCheck = this.settings.getObj(this.getQuickImportKey());
        if (!quickImportCheck.id) {
            return;
        }
        var quickButtonItem = this.context.createElement("li");
        var quickButton = this.context.createElement("button");
        quickButton.title = "Quick Import '" + quickImportCheck.name + (quickImportCheck.chapter ? ": " + quickImportCheck.chapter : "") + "' from GoogleApi Docs";
        quickButton.innerHTML = '<i class="fa fa-cloud-download"></i> Quick Import';
        quickButtonItem.appendChild(quickButton);
        button.parentNode.parentNode.appendChild(quickButtonItem);
        quickButton.addEventListener("click", function () { return _this.onQuickImport.trigger(); });
    };
    return HtmlInjector;
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
var doImport = function (formatter, doc) {
    injector.setEditorText(formatter.format());
    settings.setObj(injector.getQuickImportKey(), {
        id: doc.id,
        name: doc.name,
        chapter: formatter.heading ? formatter.heading.textContent : null
    });
};
var googleApi = new GoogleApi(config.apiKey, config.clientId, config.scopes);
googleApi.ensureGoogleApiLoaded(); // This loads the Google APIs so that they are ready when the user clicks the button.
injector.importEvent.on(function () {
    googleApi.showPicker()
        .then(function (meta) { return googleApi.getDocument(meta); })
        .then(function (doc) {
        console.info("Importing document '%s'.", doc.metadata.name);
        return doc;
    })
        .then(function (doc) {
        // Loads the document using the browser's HTML engine and converts it to BBCode.
        var formatter = new Formatter(doc.contents);
        formatter.indentation = settings.paragraphIndentationMode;
        formatter.spacing = settings.paragraphSpacingMode;
        var headings = formatter.getHeadings();
        Util.chooseChapter(headings)
            .then(function (heading) {
            formatter.heading = heading;
            doImport(formatter, doc);
        });
    });
});
injector.quickImportEvent.on(function () {
    var data = settings.getObj(injector.getQuickImportKey());
    googleApi.getDocument(data.id)
        .then(function (doc) {
        console.info("Importing document '" + data.name + (data.chapter ? ": " + data.chapter : "") + "'.");
        return doc;
    })
        .then(function (doc) {
        var formatter = new Formatter(doc.contents);
        formatter.indentation = settings.paragraphIndentationMode;
        formatter.spacing = settings.paragraphSpacingMode;
        if (!data.chapter) {
            doImport(formatter, data);
            return;
        }
        formatter.heading = formatter.getHeadingWithName(data.chapter);
        if (formatter.heading) {
            doImport(formatter, data);
        }
        else {
            // This means the chapter was renamed or doesn't exist anymore. We have to ask the user what to do.
            Util.chooseChapter(formatter.getHeadings())
                .then(function (heading) {
                formatter.heading = heading;
                doImport(formatter, data);
            });
        }
    })
        .catch(function (err) {
        console.error("Couldn't import '" + data.name + (data.chapter ? ": " + data.chapter : "") + "': %o", err);
        ShowErrorWindow("Sorry, couldn't import '" + data.name + (data.chapter ? ": " + data.chapter : "") + "'.");
    });
});

}());
