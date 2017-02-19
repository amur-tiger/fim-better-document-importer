require("jsdom-global")();
const assert = require("chai").assert;

describe("Test", function() {
    "use strict";

    describe("Utility Functions", function() {
        const Util = require("../fim-better-document-importer.user").Util;

        describe("Loading Scripts", function() {
            it("should return a promise", function() {
                const promise = Util.loadScript("some url");
                assert.isTrue(promise instanceof Promise);
            });
            
            it("should add a script tag to the head element", function() {
                const head = document.getElementsByTagName("head")[0];
                const scriptTagCount = head.childNodes.length;
                Util.loadScript("some url");
                assert.equal(head.childNodes.length, scriptTagCount + 1);

                const scriptTag = head.lastElementChild;
                assert.equal(scriptTag.src, "some url");
            });

            it.skip("should fail with an invalid URL", function() {
                const promise = Util.loadScript("https://this-server-should-not-exist.com/");
                promise.then(assert.fail).catch(assert.ok);
            });

            it.skip("should succeed with a valid URL", function() {
                // This is dependent on an external, and on a third-party server,
                // so not a very brilliant idea...
                return Util.loadScript("https://www.google.com/");
            });
        });

        describe("Loading Google APIs", function() {
            it("should return a promise", function() {
                const promise = Util.loadGoogleApi("some api");
                assert.isTrue(promise instanceof Promise);
            });
        });

        describe("Making XHR GET calls", function() {
            it("should return a promise", function() {
                const promise = Util.getByAjax("some url");
                assert.isTrue(promise instanceof Promise);
            });
        });

        describe("Parsing RGB values", function() {
            it("should parse valid RGB values", function() {
                assert.equal(Util.rgbToHex("rgb(82,160,186)"), "#52a0ba");
                assert.equal(Util.rgbToHex("rgb(151, 186, 82)"), "#97ba52");
                assert.equal(Util.rgbToHex("rgb(242,12,146)"), "#f20c92");
            });

            it("should return false on black or inherit", function() {
                assert.equal(Util.rgbToHex("rgb(0,0,0)"), false);
                assert.equal(Util.rgbToHex("inherit"), false);
            });

            it("should return false on an invalid value", function() {
                assert.equal(Util.rgbToHex(""), false);
                assert.equal(Util.rgbToHex("true"), false);
                assert.equal(Util.rgbToHex("#f2df0c"), false);
                assert.equal(Util.rgbToHex(2345.23), false);
                assert.equal(Util.rgbToHex(undefined), false);
            });
        });

        describe("Converting PT to EM", function() {
            it("should convert valid pt values", function() {
                assert.equal(Util.ptToEm("14pt"), "1.167em");
                assert.equal(Util.ptToEm("6pt"), "0.5em");
                assert.equal(Util.ptToEm("24pt"), "2em");
            });
            
            it("should return false for 11pt and 12pt", function() {
                assert.equal(Util.ptToEm("11pt"), false);
                assert.equal(Util.ptToEm("12pt"), false);
            });
            
            it("should return false on an invalid value", function() {
                assert.equal(Util.ptToEm("24"), false);
                assert.equal(Util.ptToEm("size"), false);
                assert.equal(Util.ptToEm("16px"), false);
                assert.equal(Util.ptToEm(32.23), false);
                assert.equal(Util.ptToEm(undefined), false);
            });
        });

        describe("Parsing Google Referral Links", function() {
            it("should parse links", function() {
                assert.equal(Util.parseGoogleRefLink("http://google.com/ref?q=" + encodeURIComponent("http://mysite.com/") + "&some=other"), "http://mysite.com/");
            });

            it("should return false on error", function() {
                assert.equal(Util.parseGoogleRefLink("http://google.com/"), false);
                assert.equal(Util.parseGoogleRefLink("not an url"), false);
                assert.equal(Util.parseGoogleRefLink(5656.2266), false);
                assert.equal(Util.parseGoogleRefLink(undefined), false);
            });
        });
    });

    describe("Formatter", function() {
        const Formatter = require("../fim-better-document-importer.user").Formatter;
        const defaultFormats = require("../fim-better-document-importer.user").defaultFormats;

        it("should parse HTML code", function() {
            const elements = new Formatter(defaultFormats, "web", "web").createDOM('<p style="text-align: center;">Some paragraph text.</p>');

            assert.equal(elements.length, 1);
            assert.isTrue(elements[0] instanceof HTMLParagraphElement);
            assert.equal(elements[0].style.textAlign, "center");
        });
    });
});
