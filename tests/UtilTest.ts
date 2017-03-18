import { assert } from "chai";
import { jsdom } from "jsdom";
import Util from "../src/Util";

describe("Utility Functions", function() {
	const document = jsdom(`<!DOCTYPE html><html><head></head><body></body></html>`);
	global["window"] = document.defaultView;

	describe("Loading Scripts", function() {
		it("should return a promise", function() {
			const promise = Util.loadScript("some url");
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
			assert.equal(Util.rgbToHex("2345.23"), false);
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
			assert.equal(Util.ptToEm("32.23"), false);
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
			assert.equal(Util.parseGoogleRefLink("5656.2266"), false);
			assert.equal(Util.parseGoogleRefLink(undefined), false);
		});
	});
});
