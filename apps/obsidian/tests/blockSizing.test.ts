import { describe, expect, it } from "vitest";
import { createEmptySchematicContent } from "@edahelper/schematic/core";
import { renderSchematicBlockSvg, SCHEMATIC_HEIGHT_LIMIT_PROPERTY, updateSchematicBlockHeight } from "../src/blockSizing";

describe("Obsidian schematic height limit", () => {
  it("includes distant rotated notes and ignores horizontal extent and document position", () => {
    const content = createEmptySchematicContent();
    content.components.push({ id: "r", type: "resistor", ref: "R1", x: 100, y: 100, rotation: 0, mirrored: false, values: {} });
    const root = document.createElement("div");
    const limit = () => Number.parseFloat(root.style.getPropertyValue(SCHEMATIC_HEIGHT_LIMIT_PROPERTY));
    updateSchematicBlockHeight(root, renderSchematicBlockSvg(content, "resistor"));
    const smallHeight = limit();
    expect(smallHeight).toBeGreaterThan(0);
    expect(smallHeight).toBeLessThan(250);

    content.components.push({ ...content.components[0], id: "far-right", ref: "R2", x: 2000 });
    updateSchematicBlockHeight(root, renderSchematicBlockSvg(content, "wide"));
    expect(limit()).toBe(smallHeight);

    content.components.forEach(component => { component.y += 1000; });
    updateSchematicBlockHeight(root, renderSchematicBlockSvg(content, "translated"));
    expect(limit()).toBe(smallHeight);

    content.notes.push({ id: "note", x: 100, y: 1400, width: 100, height: 20, rotation: 90, format: "plain", text: "Outside the circuit" });
    const rendering = renderSchematicBlockSvg(content, "note");
    updateSchematicBlockHeight(root, rendering);
    expect(limit()).toBeGreaterThan(800);
    expect(rendering.viewBox.y + rendering.viewBox.height).toBeGreaterThanOrEqual(1500);
  });

  it("removes the cap when the last object is deleted or the source becomes invalid", () => {
    const root = document.createElement("div");
    root.style.setProperty(SCHEMATIC_HEIGHT_LIMIT_PROPERTY, "150px");
    updateSchematicBlockHeight(root, renderSchematicBlockSvg(createEmptySchematicContent(), "empty"));
    expect(root.style.getPropertyValue(SCHEMATIC_HEIGHT_LIMIT_PROPERTY)).toBe("");
    root.style.setProperty(SCHEMATIC_HEIGHT_LIMIT_PROPERTY, "150px");
    updateSchematicBlockHeight(root, null);
    expect(root.style.getPropertyValue(SCHEMATIC_HEIGHT_LIMIT_PROPERTY)).toBe("");
  });
});
