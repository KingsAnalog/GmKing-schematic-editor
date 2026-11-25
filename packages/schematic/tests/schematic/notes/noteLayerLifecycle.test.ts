// @vitest-environment jsdom
import { expect, it } from "vitest";
import { SchematicNoteLayer } from "../../../src/schematic/notes/noteLayer";

it("renders escaped text without an inline editor and replaces views on document switch", async () => {
  const paper = document.createElement("div");
  const layer = new SchematicNoteLayer(paper);
  const note = { id: "note", x: 20, y: 40, width: 20, height: 20, text: "中文 <b>English</b>" };
  layer.activateDocument("a");
  layer.render([note], { zoom: 1, selectedIds: new Set([note.id]), worldToScreenPoint: point => point });
  expect(layer.element.querySelector("text")?.textContent).toBe(note.text);
  expect(layer.element.querySelector("textarea, b, [contenteditable=true]")).toBeNull();
  expect(layer.element.querySelector<HTMLElement>("[data-note-id]")?.style.transform).toContain("translate(0px, -" + note.height + "px)");
  layer.activateDocument("b");
  expect(layer.element.children).toHaveLength(0);
  await layer.destroy();
  expect(paper.children).toHaveLength(0);
});
