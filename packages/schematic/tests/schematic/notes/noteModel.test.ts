import { describe, expect, it } from "vitest";
import { buildCopyPreviewNoteView, createSchematicNote } from "../../../src/schematic/notes/noteModel";
import { noteAnchorOffset, noteWorldBounds } from "../../../src/schematic/notes/noteGeometry";
import { NOTE_ANCHORS } from "../../../src/schematic/types";

describe("note placement and preview", () => {
  it("stores text, size, and the chosen point in a new Note", () => {
    expect(createSchematicNote("n", { x: 40, y: 20 }, { text: "Gain", fontSizePx: 16, anchor: "lowerLeft" }))
      .toEqual({ id: "n", x: 40, y: 20, text: "Gain", fontSizePx: 16, width: 10, height: 10, anchor: "lowerLeft" });
  });

  it.each(NOTE_ANCHORS.map((anchor, index) => [anchor, Math.floor(index / 3) * 30, (index % 3) * 20] as const))(
    "uses %s as the common origin of the preview and bounds", (anchor, x, y) => {
      const note = { id: "n", text: "Gain", x: 100, y: 100, width: 60, height: 40, anchor };
      expect(noteAnchorOffset(note)).toEqual({ x, y });
      expect(noteWorldBounds(note)).toEqual({ x: 100 - x, y: 100 - y, width: 60, height: 40 });
      const preview = buildCopyPreviewNoteView(note, { screenPoint: { x: 200, y: 200 }, zoom: 2 });
      expect(preview.style.transform).toBe("scale(2) rotate(0deg) translate(" + (-x) + "px, " + (-y) + "px)");
    }
  );
});
