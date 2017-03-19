import { assert } from "chai";
import { jsdom } from "jsdom";
import { Formatter, FormatMode } from "../src/Formatter";

describe("Formatter", function() {
	const document = jsdom(`<!DOCTYPE html><html><head></head><body></body></html>`);
	
	it("should parse HTML code", function() {
		const formatter = new Formatter(`<p style="text-align: center;">Some paragraph text.</p>`, document);

		assert.equal(formatter["doc"].length, 1);
		assert.isTrue(formatter["doc"][0] instanceof document.defaultView["HTMLParagraphElement"]);
		assert.equal(formatter["doc"][0].style.textAlign, "center");
	});

	it("should extract headings", function() {
		const formatter = new Formatter(`<p>Text</p><h1>Heading 1</h1><p>Text</p><p>Text</p><h2>Heading 2</h2><p>Text</p>`, document);
		const headings = formatter.getHeadings();

		assert.equal(headings.length, 2);
		assert.equal(headings[0].textContent, "Heading 1");
		assert.equal(headings[1].textContent, "Heading 2");
	});

	it("should extract text after a heading", function() {
		const formatter = new Formatter(`<p>Text 1</p><h1>Heading 1</h1><p>Text 2</p><p>Text 3</p><h1>Heading 2</h1><p>Text 4</p>`, document);
		const headings = formatter.getHeadings();
		formatter.setSelectedHeading(headings[0]);

		assert.equal(formatter["doc"].length, 2);
		assert.equal(formatter["doc"][0].textContent, "Text 2");
		assert.equal(formatter["doc"][1].textContent, "Text 3");
	});

	it("should include smaller headings when extracting headings", function() {
		const formatter = new Formatter(`<p>Text 1</p><h1>Heading 1</h1><p>Text 2</p><p>Text 3</p><h2>Heading 2</h2><p>Text 4</p>`, document);
		const headings = formatter.getHeadings();
		formatter.setSelectedHeading(headings[0]);

		assert.equal(formatter["doc"].length, 4);
		assert.equal(formatter["doc"][0].textContent, "Text 2");
		assert.equal(formatter["doc"][1].textContent, "Text 3");
		assert.equal(formatter["doc"][2].textContent, "Heading 2");
		assert.equal(formatter["doc"][3].textContent, "Text 4");
	});

	it("should properly join paragraphs", function() {
		const formatter = new Formatter(`<p>Text [b]1[/b].\n\n</p><p>Text 2.\n\n</p>`, document);
		const text = formatter.format();

		assert.equal(text, "Text [b]1[/b].\n\n\nText 2.");
	});

	it("should completely format a document", function() {
		const formatter = new Formatter(`<p><span>Text 1. </span><span style="font-weight: 700;">Text 2.</span></p><p><span>Text 3.</span></p>`, document);
		const text = formatter.format();

		assert.equal(text, "Text 1. [b]Text 2.[/b]\nText 3.");
	});

	describe("Indentation", function() {
		it("should indent as-is style properly", function() {
			const formatter = new Formatter(`<p>\tText 1</p><p style="text-indent: 22px">Text 2</p><p>Text 3</p><p>"Text 4"</p>`, document);
			formatter.indentation = FormatMode.UNCHANGED;
			formatter["indentParagraphs"]();

			assert.equal(formatter["doc"].length, 4);
			assert.equal(formatter["doc"][0].textContent, "\tText 1");
			assert.equal(formatter["doc"][1].textContent, "\tText 2");
			assert.equal(formatter["doc"][2].textContent, "Text 3");
			assert.equal(formatter["doc"][3].textContent, '"Text 4"');
		});

		it("should indent web style properly", function() {
			const formatter = new Formatter(`<p>\tText 1</p><p style="text-indent: 22px">Text 2</p><p>Text 3</p><p>"Text 4"</p>`, document);
			formatter.indentation = FormatMode.WEB;
			formatter["indentParagraphs"]();

			assert.equal(formatter["doc"].length, 4);
			assert.equal(formatter["doc"][0].textContent, "Text 1");
			assert.equal(formatter["doc"][1].textContent, "Text 2");
			assert.equal(formatter["doc"][2].textContent, "Text 3");
			assert.equal(formatter["doc"][3].textContent, '\t"Text 4"');
		});

		it("should indent book style properly", function() {
			const formatter = new Formatter(`<p>\tText 1</p><p style="text-indent: 22px">Text 2</p><p>Text 3</p><p>"Text 4"</p>`, document);
			formatter.indentation = FormatMode.BOOK;
			formatter["indentParagraphs"]();

			assert.equal(formatter["doc"].length, 4);
			assert.equal(formatter["doc"][0].textContent, "\tText 1");
			assert.equal(formatter["doc"][1].textContent, "\tText 2");
			assert.equal(formatter["doc"][2].textContent, "\tText 3");
			assert.equal(formatter["doc"][3].textContent, '\t"Text 4"');
		});
	});

	describe("Spacing", function() {
		it("should space as-is style properly", function() {
			const formatter = new Formatter(`<p></p><p>Text 1.</p><p>Text 2.</p><p></p><p>Text 3.</p><p></p><p></p><p>Text 4.</p>`, document);
			formatter.spacing = FormatMode.UNCHANGED;
			formatter["spaceParagraphs"]();

			assert.equal(formatter["doc"].length, 5);
			assert.equal(formatter["doc"][0].textContent, "\n");
			assert.equal(formatter["doc"][1].textContent, "Text 1.\n");
			assert.equal(formatter["doc"][2].textContent, "Text 2.\n\n");
			assert.equal(formatter["doc"][3].textContent, "Text 3.\n\n\n");
			assert.equal(formatter["doc"][4].textContent, "Text 4.\n");
		});

		it("should space web style properly", function() {
			const formatter = new Formatter(`<p>Text 1.</p><p>Text 2.</p><p></p><p>Text 3.</p><p></p><p></p><p>Text 4.</p>`, document);
			formatter.spacing = FormatMode.WEB;
			formatter["spaceParagraphs"]();

			assert.equal(formatter["doc"].length, 4);
			assert.equal(formatter["doc"][0].textContent, "Text 1.\n\n");
			assert.equal(formatter["doc"][1].textContent, "Text 2.\n\n");
			assert.equal(formatter["doc"][2].textContent, "Text 3.\n\n\n");
			assert.equal(formatter["doc"][3].textContent, "Text 4.\n\n");
		});

		it("should space book style properly", function() {
			const formatter = new Formatter(`<p>Text 1.</p><p>Text 2.</p><p></p><p>Text 3.</p><p></p><p></p><p>Text 4.</p>`, document);
			formatter.spacing = FormatMode.BOOK;
			formatter["spaceParagraphs"]();

			assert.equal(formatter["doc"].length, 4);
			assert.equal(formatter["doc"][0].textContent, "Text 1.\n");
			assert.equal(formatter["doc"][1].textContent, "Text 2.\n");
			assert.equal(formatter["doc"][2].textContent, "Text 3.\n\n\n");
			assert.equal(formatter["doc"][3].textContent, "Text 4.\n");
		});

		it("should space custom captions properly with web style", function() {
			const formatter = new Formatter(`<p>Caption</p><p>Subcaption</p><p></p><p>Text 3.</p><p>Text 4.</p>`, document);
			formatter.spacing = FormatMode.WEB;
			formatter.customCaptions = true;
			formatter["spaceParagraphs"]();

			assert.equal(formatter["doc"].length, 4);
			assert.equal(formatter["doc"][0].textContent, "Caption\n");
			assert.equal(formatter["doc"][1].textContent, "Subcaption\n\n");
			assert.equal(formatter["doc"][2].textContent, "Text 3.\n\n");
			assert.equal(formatter["doc"][3].textContent, "Text 4.\n\n");
		});

		it("should ignore custom captions when disabled with web style", function() {
			const formatter = new Formatter(`<p>Caption</p><p>Subcaption</p><p></p><p>Text 3.</p><p>Text 4.</p>`, document);
			formatter.spacing = FormatMode.WEB;
			formatter.customCaptions = false;
			formatter["spaceParagraphs"]();

			assert.equal(formatter["doc"].length, 4);
			assert.equal(formatter["doc"][0].textContent, "Caption\n\n");
			assert.equal(formatter["doc"][1].textContent, "Subcaption\n\n");
			assert.equal(formatter["doc"][2].textContent, "Text 3.\n\n");
			assert.equal(formatter["doc"][3].textContent, "Text 4.\n\n");
		});

		it("should space custom captions properly with book style", function() {
			const formatter = new Formatter(`<p>Caption</p><p>Subcaption</p><p></p><p>Text 3.</p><p>Text 4.</p>`, document);
			formatter.spacing = FormatMode.BOOK;
			formatter.customCaptions = true;
			formatter["spaceParagraphs"]();

			assert.equal(formatter["doc"].length, 4);
			assert.equal(formatter["doc"][0].textContent, "Caption\n");
			assert.equal(formatter["doc"][1].textContent, "Subcaption\n\n");
			assert.equal(formatter["doc"][2].textContent, "Text 3.\n");
			assert.equal(formatter["doc"][3].textContent, "Text 4.\n");
		});

		it("should ignore custom captions when disabled with book style", function() {
			const formatter = new Formatter(`<p>Caption</p><p>Subcaption</p><p></p><p>Text 3.</p><p>Text 4.</p>`, document);
			formatter.spacing = FormatMode.BOOK;
			formatter.customCaptions = false;
			formatter["spaceParagraphs"]();

			assert.equal(formatter["doc"].length, 4);
			assert.equal(formatter["doc"][0].textContent, "Caption\n");
			assert.equal(formatter["doc"][1].textContent, "Subcaption\n");
			assert.equal(formatter["doc"][2].textContent, "Text 3.\n");
			assert.equal(formatter["doc"][3].textContent, "Text 4.\n");
		});
	});

	describe("BBCode conversion", function() {
		it("should insert center tags", function() {
			const formatter = new Formatter(`<p style="text-align: center;">Text 1</p>`, document);
			formatter["styleParagraphs"]();

			assert.equal(formatter["doc"][0].textContent, "[center]Text 1[/center]");
		});

		it("should insert bold tags", function() {
			const formatter = new Formatter(`<p><span>Text 1 </span><span style="font-weight: 700;">Text 2 </span><span>Text 3.</span></p>`, document);
			formatter["styleParagraphs"]();

			assert.equal(formatter["doc"][0].textContent, "Text 1 [b]Text 2 [/b]Text 3.");
		});

		it("should insert bold tags", function() {
			const formatter = new Formatter(`<p><span>Text 1 </span><span style="font-style: italic;">Text 2 </span><span>Text 3.</span></p>`, document);
			formatter["styleParagraphs"]();

			assert.equal(formatter["doc"][0].textContent, "Text 1 [i]Text 2 [/i]Text 3.");
		});

		it("should insert underline tags", function() {
			const formatter = new Formatter(`<p><span>Text 1 </span><span style="text-decoration: underline;">Text 2 </span><span>Text 3.</span></p>`, document);
			formatter["styleParagraphs"]();

			assert.equal(formatter["doc"][0].textContent, "Text 1 [u]Text 2 [/u]Text 3.");
		});

		it("should insert strike-through tags", function() {
			const formatter = new Formatter(`<p><span>Text 1 </span><span style="text-decoration: line-through;">Text 2 </span><span>Text 3.</span></p>`, document);
			formatter["styleParagraphs"]();

			assert.equal(formatter["doc"][0].textContent, "Text 1 [s]Text 2 [/s]Text 3.");
		});

		it("should insert color tags", function() {
			const formatter = new Formatter(`<p><span>Text 1 </span><span style="color: #333;">Text 2 </span><span>Text 3.</span></p>`, document);
			formatter["styleParagraphs"]();

			assert.equal(formatter["doc"][0].textContent, "Text 1 [color=#333333]Text 2 [/color]Text 3.");
		});

		it("should insert size tags", function() {
			const formatter = new Formatter(`<p><span>Text 1 </span><span style="font-size: 24pt;">Text 2 </span><span>Text 3.</span></p>`, document);
			formatter["styleParagraphs"]();

			assert.equal(formatter["doc"][0].textContent, "Text 1 [size=2em]Text 2 [/size]Text 3.");
		});

		it("should insert horizontal rule tags", function() {
			const formatter = new Formatter(`<p><span>Text 1.</span></p><hr/><p>Text 2.</p>`, document);
			formatter["styleParagraphs"]();

			assert.equal(formatter["doc"].length, 3);
			assert.equal(formatter["doc"][0].textContent, "Text 1.");
			assert.equal(formatter["doc"][1].textContent, "[hr]");
			assert.equal(formatter["doc"][2].textContent, "Text 2.");
		});

		it("should ignore comments", function() {
			const formatter = new Formatter(`<p><span>Text 1.</span><span><a href="#" id="cmnt_23">Text 2</a></span></p>`, document);
			formatter["styleParagraphs"]();

			assert.equal(formatter["doc"][0].textContent, "Text 1.");
		});

		it("should insert url tags", function() {
			const formatter = new Formatter(`<p><span>Text 1. </span><span><a href="https://google.com/ref?q=my%20link">Text 2.</a></span></p>`, document);
			formatter["styleParagraphs"]();

			assert.equal(formatter["doc"][0].textContent, "Text 1. [url=my link]Text 2.[/url]");
		});

		it("should insert image tags", function() {
			const formatter = new Formatter(`<p><span>Text 1. </span><span><img src="http://my.image/"/></span></p>`, document);
			formatter["styleParagraphs"]();

			assert.equal(formatter["doc"][0].textContent, "Text 1. [img]http://my.image/[/img]");
		});
	});

	describe("Font size scaling", function() {
		it("should measure font sizes correctly", function() {
			const formatter = new Formatter(`<p><span>1</span><span style="font-size: 14pt;">2</span><span style="font-size: 14pt;">3</span><span style="font-size: 24pt;">4</span></p>`, document);
			const size = formatter["findBaseScale"]();

			assert.equal(size, 14);
		});

		it("should default to size 12", function() {
			const formatter = new Formatter(`<p><span>1</span><span>2</span><span>3</span><span>4</span></p>`, document);
			const size = formatter["findBaseScale"]();

			assert.equal(size, 12);
		});

		it("should measure implicit size 12", function() {
			const formatter = new Formatter(`<p><span>1</span><span>2</span><span>3</span><span style="font-size: 16pt;">4</span></p>`, document);
			const size = formatter["findBaseScale"]();

			assert.equal(size, 12);
		});

		it("should apply font size scaling properly", function() {
			const formatter = new Formatter(`<p><span>1</span><span style="font-size: 16pt;">2</span><span style="font-size: 16pt;">3</span><span style="font-size: 24pt;">4</span></p>`, document);
			formatter.sizeAutoScale = true;
			formatter["styleParagraphs"]();

			assert.equal(formatter["doc"][0].textContent, "[size=0.75em]1[/size]23[size=1.5em]4[/size]");
		});

		it("should not scale if disabled", function() {
			const formatter = new Formatter(`<p><span>1</span><span style="font-size: 18pt;">2</span><span style="font-size: 18pt;">3</span><span style="font-size: 24pt;">4</span></p>`, document);
			formatter.sizeAutoScale = false;
			formatter["styleParagraphs"]();

			assert.equal(formatter["doc"][0].textContent, "1[size=1.5em]2[/size][size=1.5em]3[/size][size=2em]4[/size]");
		});

		it("should ignore scale on p tags", function() {
			const formatter = new Formatter(`<p style="font-size: 11pt;"><span style="font-size: 24pt;">1</span></p>`, document);
			formatter.sizeAutoScale = true;
			formatter["styleParagraphs"]();

			assert.equal(formatter["doc"][0].textContent, "1");
		});
	});
});
