// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { createSchematicDocument } from "../../../src/schematic/document/documentModel";
import { renderSchematicDocumentSvg } from "../../../src/schematic/documentSvgRenderer";
import { parseSchematicDocumentFile, serializeSchematicDocumentFile } from "../../../src/schematic/schematicDocumentFile";
import { wireHopPaths } from "../../../src/schematic/wire/wireCrossings";
import { mountReadonlySchematicViewer } from "../../../src/schematic/viewer";
import type { Wire } from "../../../src/schematic/types";

const horizontal: Wire = { id: "horizontal", points: [{ x: 0, y: 50 }, { x: 100, y: 50 }], routeMode: "orthogonal" };
const vertical: Wire = { id: "vertical", points: [{ x: 50, y: 0 }, { x: 50, y: 100 }], routeMode: "orthogonal" };

describe("schematic display", () => {
  it("adds a hop to the top wire and a gap beneath it without modifying either wire", () => {
    const wires = [vertical, horizontal];
    const before = structuredClone(wires);
    const paths = wireHopPaths(wires, []);
    expect(paths.get("horizontal")).toContain("C 45 47.239 47.239 45 50 45");
    expect(paths.get("vertical")).toBe("M 50 0 L 50 42 M 50 58 L 50 100");
    expect(wireHopPaths([...wires].reverse(), []).get("vertical")).toContain("C ");
    expect(wireHopPaths(wires, [{ x: 50, y: 50 }]).size).toBe(0);
    expect(wireHopPaths([vertical], []).size).toBe(0);
    expect(wires).toEqual(before);
  });

  it("handles oblique crossings and preserves the ends of short wires", () => {
    const diagonal: Wire = { ...vertical, points: [{ x: 10, y: 10 }, { x: 90, y: 90 }], routeMode: "freeAngle" };
    const paths = wireHopPaths([horizontal, diagonal], []);
    expect(paths.get("vertical")).toContain("C ");
    expect(paths.get("horizontal")).toMatch(/L 42 50 M 58 50/);
    expect(wireHopPaths([horizontal, { ...diagonal, points: [{ x: 50, y: 50 }, { x: 90, y: 90 }] }], []).size).toBe(0);
    expect(wireHopPaths([{ ...vertical, points: [{ x: 50, y: 48 }, { x: 50, y: 52 }] }, horizontal], []).size).toBe(0);
  });

  it("round-trips display settings and font overrides and leaves connectivity unchanged", () => {
    const document = createSchematicDocument({
      wires: [horizontal, vertical],
      display: { wireCrossings: "hop", textFont: "serif" },
      netLabels: [{ id: "label", name: "输出", attachment: { wireId: "horizontal", point: { x: 0, y: 50 } }, fontFamily: "mono" }],
      notes: [
        { id: "note", x: 10, y: 120, width: 100, height: 44, format: "plain", text: "注释" },
        { id: "overridden", x: 10, y: 180, width: 100, height: 44, format: "plain", text: "Text", fontFamily: "sans" }
      ]
    });
    const serialized = serializeSchematicDocumentFile(document);
    const restored = parseSchematicDocumentFile(serialized);
    expect(restored.display).toEqual(document.display);
    expect(restored.netLabels[0].fontFamily).toBe("mono");
    expect(restored.notes[1].fontFamily).toBe("sans");
    const options = { namespace: "test", presentationMode: false };
    const hop = renderSchematicDocumentSvg(restored, options);
    const plain = renderSchematicDocumentSvg({ ...restored, display: { wireCrossings: "plain", textFont: "serif" } }, options);
    expect(hop.topology.netResolution.wireNetNames).toEqual(plain.topology.netResolution.wireNetNames);
    expect(hop.topology.connectivity.groups).toEqual(plain.topology.connectivity.groups);
    expect(hop.topology.netResolution.wireNetNames.get("horizontal")).not.toBe(hop.topology.netResolution.wireNetNames.get("vertical"));
    expect(hop.topology.junctions).toHaveLength(0);
    expect(hop.svg).toMatch(/<g data-wire-id="vertical"><path d="[^"]*C /);
    expect(plain.svg).toContain('<g data-wire-id="vertical"><polyline');
    expect(hop.svg).toMatch(/data-net-label-id="label"[^>]+font-family="Consolas/);
    expect(hop.svg).toMatch(/font-family="Georgia[^>]+>[\s\S]*?注释/);
    const container = window.document.createElement("div");
    const viewer = mountReadonlySchematicViewer(container, restored, { resizeObserver: null });
    expect(container.querySelector('[data-wire-id="vertical"] path')?.getAttribute("d")).toContain("C ");
    expect(container.querySelector('[data-note-id="note"] text')?.getAttribute("font-family")).toMatch(/^Georgia/);
    expect(container.querySelector('[data-note-id="overridden"] text')?.getAttribute("font-family")).toMatch(/^"Inter"/);
    viewer.update({ ...restored, layerObjectStates: { horizontal: { visible: false } } });
    expect(container.querySelector('[data-wire-id="vertical"] path')).toBeNull();
    viewer.destroy();
    expect(serializeSchematicDocumentFile(restored)).toBe(serialized);
    expect(() => parseSchematicDocumentFile(serialized.replace('"hop"', '"invalid"'))).toThrow(/wireCrossings/);
    expect(() => parseSchematicDocumentFile(serialized.replace('"mono"', '"invalid"'))).toThrow(/fontFamily/);
  });
});
