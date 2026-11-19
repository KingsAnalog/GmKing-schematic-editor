// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderSchematicDocumentSvg } from "../../../src/schematic/documentSvgRenderer";
import { createSchematicSvgElement } from "../../../src/schematic/schematicSvgDom";
import { fixtureDocument } from "../support/fixtureDocument";

describe("mounting a schematic SVG", () => {
  it("retains the rendered grid, note clipping and literal note text in a second window", () => {
    const frame = document.body.appendChild(document.createElement("iframe"));
    try {
      const owner = frame.contentDocument!;
      const noteText = "  V<ref> & I  ";
      const content = fixtureDocument({
        notes: [{ id: "note:one", x: 0, y: 0, width: 160, height: 40, format: "plain", text: noteText }]
      });
      const { svg } = renderSchematicDocumentSvg(content, { namespace: "fixture", showGrid: true });
      const root = createSchematicSvgElement(owner, svg);
      const clip = root.querySelector("clipPath")!;
      const grid = root.querySelector("pattern")!;
      expect(root.ownerDocument).toBe(owner);
      expect(root.getAttribute("viewBox")).toBeTruthy();
      expect(grid.getAttribute("patternUnits")).toBe("userSpaceOnUse");
      expect(root.querySelector(`[fill="url(#${grid.id})"]`)).toBeTruthy();
      expect(root.querySelector(`[clip-path="url(#${clip.id})"]`)).toBeTruthy();
      expect(clip.namespaceURI).toBe("http://www.w3.org/2000/svg");
      expect(root.querySelector('[data-note-id="note:one"] tspan')?.textContent).toBe(noteText);
      expect(root.querySelector('[data-note-id="note:one"] text')?.getAttribute("xml:space")).toBe("preserve");
    } finally {
      frame.remove();
    }
  });

  it("removes embedded HTML and external resources from the preview", () => {
    const root = createSchematicSvgElement(document, `<svg xmlns="http://www.w3.org/2000/svg">
      <foreignObject><div>external content</div></foreignObject>
      <image href="https://example.invalid/asset"/>
      <rect width="12" fill="url(https://example.invalid/paint)" style="opacity:.5" />
      <text>label</text></svg>`);
    expect(root.querySelector("foreignObject, image, [href], [style], [fill]")).toBeNull();
    expect(root.querySelector("rect")?.getAttribute("width")).toBe("12");
    expect(root.querySelector("text")?.textContent).toBe("label");
  });
});
