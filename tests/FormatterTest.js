const assert = require("chai").assert;

const Formatter = require("../src/Formatter");
const defaultFormats = require("../src/defaultFormats");

describe("Formatter", function() {
	it("should parse HTML code", function() {
		const doc = new Formatter(defaultFormats, "web", "web").createDOM('<p style="text-align: center;">Some paragraph text.</p>');

		assert.equal(doc.length, 1);
		assert.isTrue(doc[0] instanceof HTMLParagraphElement);
		assert.equal(doc[0].style.textAlign, "center");
	});

	it("should extract headings", function() {
		const formatter = new Formatter(defaultFormats, "web", "web");
		const doc = formatter.createDOM('<p>Text</p><h1>Heading 1</h1><p>Text</p><p>Text</p><h2>Heading 2</h2><p>Text</p>');
		const headings = formatter.getHeaders(doc);

		assert.equal(headings.length, 2);
		assert.equal(headings[0].textContent, "Heading 1");
		assert.equal(headings[1].textContent, "Heading 2");
	});

	it("should extract text after a heading", function() {
		const formatter = new Formatter(defaultFormats, "web", "web");
		const doc = formatter.createDOM('<p>Text 1</p><h1>Heading 1</h1><p>Text 2</p><p>Text 3</p><h1>Heading 2</h1><p>Text 4</p>');
		const headings = formatter.getHeaders(doc);
		const text = Array.from(formatter.getElementsFromHeader(doc, headings[0]));

		assert.equal(text.length, 2);
		assert.equal(text[0].textContent, "Text 2");
		assert.equal(text[1].textContent, "Text 3");
	});

	it("should include smaller headings when extracting headings", function() {
		const formatter = new Formatter(defaultFormats, "web", "web");
		const doc = formatter.createDOM('<p>Text 1</p><h1>Heading 1</h1><p>Text 2</p><p>Text 3</p><h2>Heading 2</h2><p>Text 4</p>');
		const headings = formatter.getHeaders(doc);
		const text = Array.from(formatter.getElementsFromHeader(doc, headings[0]));

		assert.equal(text.length, 4);
		assert.equal(text[0].textContent, "Text 2");
		assert.equal(text[1].textContent, "Text 3");
		assert.equal(text[2].textContent, "Heading 2");
		assert.equal(text[3].textContent, "Text 4");
	});

	it("should properly join paragraphs", function() {
		const formatter = new Formatter(defaultFormats, "web", "web");
		const doc = formatter.createDOM('<p>Text [b]1[/b].\n\n</p><p>Text 2.\n\n</p>');
		const text = formatter.join(doc);

		assert.equal(text, "Text [b]1[/b].\n\nText 2.");
	});

	it("should completely format a document", function() {
		const formatter = new Formatter(defaultFormats, "web", "web");
		const doc = formatter.createDOM('<p><span>Text 1. </span><span style="font-weight: 700;">Text 2.</span></p><p><span>Text 3.</span></p>');
		const text = formatter.format(doc);

		assert.equal(text, "Text 1. [b]Text 2.[/b]\n\nText 3.");
	});

	describe("Indentation", function() {
		it("should indent as-is style properly", function() {
			const formatter = new Formatter(defaultFormats, "as-is", "as-is");
			const doc = formatter.createDOM('<p>\tText 1</p><p style="text-indent: 22px">Text 2</p><p>Text 3</p><p>"Text 4"</p>');
			const text = Array.from(formatter.getIndentedParagraphs(doc));

			assert.equal(text.length, 4);
			assert.equal(text[0].textContent, "\tText 1");
			assert.equal(text[1].textContent, "\tText 2");
			assert.equal(text[2].textContent, "Text 3");
			assert.equal(text[3].textContent, '"Text 4"');
		});

		it("should indent web style properly", function() {
			const formatter = new Formatter(defaultFormats, "web", "web");
			const doc = formatter.createDOM('<p>\tText 1</p><p style="text-indent: 22px">Text 2</p><p>Text 3</p><p>"Text 4"</p>');
			const text = Array.from(formatter.getIndentedParagraphs(doc));

			assert.equal(text.length, 4);
			assert.equal(text[0].textContent, "Text 1");
			assert.equal(text[1].textContent, "Text 2");
			assert.equal(text[2].textContent, "Text 3");
			assert.equal(text[3].textContent, '\t"Text 4"');
		});

		it("should indent book style properly", function() {
			const formatter = new Formatter(defaultFormats, "book", "book");
			const doc = formatter.createDOM('<p>\tText 1</p><p style="text-indent: 22px">Text 2</p><p>Text 3</p><p>"Text 4"</p>');
			const text = Array.from(formatter.getIndentedParagraphs(doc));

			assert.equal(text.length, 4);
			assert.equal(text[0].textContent, "\tText 1");
			assert.equal(text[1].textContent, "\tText 2");
			assert.equal(text[2].textContent, "\tText 3");
			assert.equal(text[3].textContent, '\t"Text 4"');
		});
	});

	describe("Spacing", function() {
		it("should space as-is style properly", function() {
			const formatter = new Formatter(defaultFormats, "as-is", "as-is");
			const doc = formatter.createDOM('<p></p><p>Text 1.</p><p>Text 2.</p><p></p><p>Text 3.</p><p></p><p></p><p>Text 4.</p>');
			const text = Array.from(formatter.getSpacedParagraphs(doc));

			assert.equal(text.length, 5);
			assert.equal(text[0].textContent, "\n");
			assert.equal(text[1].textContent, "Text 1.\n");
			assert.equal(text[2].textContent, "Text 2.\n\n");
			assert.equal(text[3].textContent, "Text 3.\n\n\n");
			assert.equal(text[4].textContent, "Text 4.\n");
		});

		it("should space web style properly", function() {
			const formatter = new Formatter(defaultFormats, "web", "web");
			const doc = formatter.createDOM('<p>Text 1.</p><p>Text 2.</p><p></p><p>Text 3.</p><p></p><p></p><p>Text 4.</p>');
			const text = Array.from(formatter.getSpacedParagraphs(doc));

			assert.equal(text.length, 4);
			assert.equal(text[0].textContent, "Text 1.\n\n");
			assert.equal(text[1].textContent, "Text 2.\n\n");
			assert.equal(text[2].textContent, "Text 3.\n\n\n");
			assert.equal(text[3].textContent, "Text 4.\n\n");
		});

		it("should space book style properly", function() {
			const formatter = new Formatter(defaultFormats, "book", "book");
			const doc = formatter.createDOM('<p>Text 1.</p><p>Text 2.</p><p></p><p>Text 3.</p><p></p><p></p><p>Text 4.</p>');
			const text = Array.from(formatter.getSpacedParagraphs(doc));

			assert.equal(text.length, 4);
			assert.equal(text[0].textContent, "Text 1.\n");
			assert.equal(text[1].textContent, "Text 2.\n");
			assert.equal(text[2].textContent, "Text 3.\n\n\n");
			assert.equal(text[3].textContent, "Text 4.\n");
		});

		it("should space custom headings properly with web style", function() {
			const formatter = new Formatter(defaultFormats, "web", "web");
			const doc = formatter.createDOM('<p>Caption</p><p>Subcaption</p><p></p><p>Text 3.</p><p>Text 4.</p>');
			const text = Array.from(formatter.getSpacedParagraphs(doc));

			assert.equal(text.length, 4);
			assert.equal(text[0].textContent, "Caption\n");
			assert.equal(text[1].textContent, "Subcaption\n\n");
			assert.equal(text[2].textContent, "Text 3.\n\n");
			assert.equal(text[3].textContent, "Text 4.\n\n");
		});

		it("should space custom headings properly with book style", function() {
			const formatter = new Formatter(defaultFormats, "book", "book");
			const doc = formatter.createDOM('<p>Caption</p><p>Subcaption</p><p></p><p>Text 3.</p><p>Text 4.</p>');
			const text = Array.from(formatter.getSpacedParagraphs(doc));

			assert.equal(text.length, 4);
			assert.equal(text[0].textContent, "Caption\n");
			assert.equal(text[1].textContent, "Subcaption\n\n");
			assert.equal(text[2].textContent, "Text 3.\n");
			assert.equal(text[3].textContent, "Text 4.\n");
		});
	});

	describe("BBCode conversion", function() {
		it("should insert center tags", function() {
			const formatter = new Formatter(defaultFormats, "web", "web");
			const doc = formatter.createDOM('<p style="text-align: center;">Text 1</p>');
			const text = Array.from(formatter.getStyledParagraphs(doc))[0].textContent;

			assert.equal(text, "[center]Text 1[/center]");
		});

		it("should insert bold tags", function() {
			const formatter = new Formatter(defaultFormats, "web", "web");
			const doc = formatter.createDOM('<p><span>Text 1 </span><span style="font-weight: 700;">Text 2 </span><span>Text 3.</span></p>');
			const text = Array.from(formatter.getStyledParagraphs(doc))[0].textContent;

			assert.equal(text, "Text 1 [b]Text 2 [/b]Text 3.");
		});

		it("should insert bold tags", function() {
			const formatter = new Formatter(defaultFormats, "web", "web");
			const doc = formatter.createDOM('<p><span>Text 1 </span><span style="font-style: italic;">Text 2 </span><span>Text 3.</span></p>');
			const text = Array.from(formatter.getStyledParagraphs(doc))[0].textContent;

			assert.equal(text, "Text 1 [i]Text 2 [/i]Text 3.");
		});

		it("should insert underline tags", function() {
			const formatter = new Formatter(defaultFormats, "web", "web");
			const doc = formatter.createDOM('<p><span>Text 1 </span><span style="text-decoration: underline;">Text 2 </span><span>Text 3.</span></p>');
			const text = Array.from(formatter.getStyledParagraphs(doc))[0].textContent;

			assert.equal(text, "Text 1 [u]Text 2 [/u]Text 3.");
		});

		it("should insert strike-through tags", function() {
			const formatter = new Formatter(defaultFormats, "web", "web");
			const doc = formatter.createDOM('<p><span>Text 1 </span><span style="text-decoration: line-through;">Text 2 </span><span>Text 3.</span></p>');
			const text = Array.from(formatter.getStyledParagraphs(doc))[0].textContent;

			assert.equal(text, "Text 1 [s]Text 2 [/s]Text 3.");
		});

		it("should insert color tags", function() {
			const formatter = new Formatter(defaultFormats, "web", "web");
			const doc = formatter.createDOM('<p><span>Text 1 </span><span style="color: #333;">Text 2 </span><span>Text 3.</span></p>');
			const text = Array.from(formatter.getStyledParagraphs(doc))[0].textContent;

			assert.equal(text, "Text 1 [color=#333333]Text 2 [/color]Text 3.");
		});

		it("should insert size tags", function() {
			const formatter = new Formatter(defaultFormats, "web", "web");
			const doc = formatter.createDOM('<p><span>Text 1 </span><span style="font-size: 24pt;">Text 2 </span><span>Text 3.</span></p>');
			const text = Array.from(formatter.getStyledParagraphs(doc))[0].textContent;

			assert.equal(text, "Text 1 [size=2em]Text 2 [/size]Text 3.");
		});

		it("should insert horizontal rule tags", function() {
			const formatter = new Formatter(defaultFormats, "web", "web");
			const doc = formatter.createDOM('<p><span>Text 1.</span></p><hr/><p>Text 2.</p>');
			const text = Array.from(formatter.getStyledParagraphs(doc));

			assert.equal(text.length, 3);
			assert.equal(text[0].textContent, "Text 1.");
			assert.equal(text[1].textContent, "[hr]");
			assert.equal(text[2].textContent, "Text 2.");
		});

		it("should ignore comments", function() {
			const formatter = new Formatter(defaultFormats, "web", "web");
			const doc = formatter.createDOM('<p><span>Text 1.</span><span><a href="#" id="cmnt_23">Text 2</a></span></p>');
			const text = Array.from(formatter.getStyledParagraphs(doc))[0].textContent;

			assert.equal(text, "Text 1.");
		});

		it("should insert url tags", function() {
			const formatter = new Formatter(defaultFormats, "web", "web");
			const doc = formatter.createDOM('<p><span>Text 1. </span><span><a href="https://google.com/ref?q=my%20link">Text 2.</a></span></p>');
			const text = Array.from(formatter.getStyledParagraphs(doc))[0].textContent;

			assert.equal(text, "Text 1. [url=my link]Text 2.[/url]");
		});

		it("should insert image tags", function() {
			const formatter = new Formatter(defaultFormats, "web", "web");
			const doc = formatter.createDOM('<p><span>Text 1. </span><span><img src="http://my.image/"/></span></p>');
			const text = Array.from(formatter.getStyledParagraphs(doc))[0].textContent;

			assert.equal(text, "Text 1. [img]http://my.image/[/img]");
		});
	});
});