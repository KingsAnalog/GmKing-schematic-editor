import { applyNormalizedDocumentWires } from "../../../src/schematic/document/documentWires";
import { resolveLayerObjects } from "../../../src/schematic/layerObjectStateModel";
import { fixtureWire } from "../support/fixtures";
import { fixtureDocument } from "../support/fixtureDocument";
import { describe, expect, it } from "vitest";
import { COMPONENT_CATALOG } from "../../../src/schematic/catalog";
import { renderComponentSvg } from "../../../src/schematic/componentSvgRenderer";
import { resolveComponentVisualModel } from "../../../src/schematic/componentVisualModel";
import { renderSchematicDocumentSvg } from "../../../src/schematic/documentSvgRenderer";
import { makeComponentCell } from "../../../src/schematic/renderer";
import type { ComponentInstance, SchematicContent } from "../../../src/schematic/types";
import { escapeAttribute } from "../../../src/schematic/uiUtils";

describe("pure schematic SVG rendering", () => {
  it("renders every catalog component type and variant from the shared visual model", () => {
    let x = 0;
    Object.values(COMPONENT_CATALOG).forEach((definition) => {
      const variants = [undefined, ...(definition.variants?.map((variant) => variant.id) ?? [])];
      variants.forEach((variantId) => {
        const key = `${definition.type}:${variantId ?? "default"}`;
        const component: ComponentInstance = {
          id: `component-${x}`,
          type: definition.type,
          variantId,
          ref: `${definition.valuePrefix ?? definition.label}1`,
          x: x++ * 240,
          y: 0,
          rotation: 0,
          mirrored: false,
          values: { ...(definition.defaultValues ?? {}) }
        };
        const model = resolveComponentVisualModel(component, { presentationMode: false });
        const cell = makeComponentCell(component, { presentationMode: false });
        const svg = renderComponentSvg(component, { presentationMode: false });

        expect(svg, key).toContain(`data-component-id="${component.id}"`);
        expect(svg, key).not.toMatch(/(?:NaN|undefined)/);
        expect(cell.size(), key).toEqual({
          width: model.frameBox.width,
          height: model.frameBox.height
        });
        if (model.path) {
          expect(svg, key).toContain(`d="${escapeAttribute(model.path)}"`);
          expect(cell.attr("symbolBody/d"), key).toBe(model.path);
        }
        model.visiblePinIds.forEach((pinId) => {
          expect(svg, `${key}:${pinId}`).toContain(`data-pin-id="${pinId}"`);
        });
      });
    });
  });

  it("renders whole-document notes, temporary deletion, junctions, and wire decorations", () => {
    const content = decoratedContent();
    const rendered = renderSchematicDocumentSvg(content, {
      namespace: "whole-document",
      showGrid: true,
      presentationMode: false
    });

    expect(rendered.svg).toContain('id="whole-document-grid"');
    expect(rendered.svg).toContain('width="10" height="10" patternUnits="userSpaceOnUse"');
    expect(rendered.svg).toContain('d="M 10 0 L 0 0 0 10"');
    const emptySvg = renderSchematicDocumentSvg(fixtureDocument({}), { namespace: "empty", showGrid: true }).svg;
    expect(emptySvg).toContain('width="10" height="10" patternUnits="userSpaceOnUse"');
    expect(emptySvg).toContain('d="M 10 0 L 0 0 0 10"');
    expect(rendered.svg).toContain('data-component-id="R1"');
    expect(rendered.svg).toContain('data-selector="deleteCross"');
    expect(rendered.svg).toContain('data-wire-id="signal"');
    expect(rendered.svg).toContain('data-wire-endpoint="start"');
    expect(rendered.svg).toContain('data-wire-endpoint="end"');
    expect(rendered.svg).toContain("data-wire-digital-slash");
    expect(rendered.svg).toContain("data-wire-digital-label");
    expect(rendered.svg).toContain('data-wire-id="deleted-wire"');
    expect(rendered.svg).toContain('opacity="0.48"');
    expect(rendered.svg).toContain('data-junction="40,0"');
    expect(rendered.svg).toContain('data-note-id="plain-note"');
    expect(rendered.svg).toContain('data-note-id="markdown-note"');
    expect(rendered.svg).toContain('data-markdown-note-fallback="markdown-note"');
    expect(rendered.svg).toContain("# Heading");
    expect(rendered.topology.junctions).toContainEqual({ x: 40, y: 0 });
  });

  it("isolates grid and Note clip IDs between renderer namespaces", () => {
    const first = renderSchematicDocumentSvg(decoratedContent(), {
      namespace: "viewer-a",
      showGrid: true
    }).svg;
    const second = renderSchematicDocumentSvg(decoratedContent(), {
      namespace: "viewer-b",
      showGrid: true
    }).svg;

    expect(first).toContain('id="viewer-a-grid"');
    expect(first).toContain('id="viewer-a-note-text-clip-markdown-note"');
    expect(second).toContain('id="viewer-b-grid"');
    expect(second).toContain('id="viewer-b-note-text-clip-markdown-note"');
    expect(second).not.toContain("viewer-a-");
  });

  it("keeps unsafe namespaces and colliding sanitized Note IDs unique", () => {
    const content = decoratedContent();
    content.notes = [
      { ...content.notes[0], id: "a:b" },
      { ...content.notes[1], id: "a?b" }
    ];
    const first = renderSchematicDocumentSvg(content, {
      namespace: "viewer:a",
      showGrid: true
    }).svg;
    const second = renderSchematicDocumentSvg(content, {
      namespace: "viewer?a",
      showGrid: true
    }).svg;
    const firstIds = [...first.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
    const firstClipIds = firstIds.filter((id) => id.includes("-note-text-clip-"));

    expect(new Set(firstIds).size).toBe(firstIds.length);
    expect(firstClipIds).toHaveLength(2);
    expect(new Set(firstClipIds).size).toBe(2);
    expect(first).not.toContain('id="viewer_a-grid"');
    expect(second).not.toContain('id="viewer_a-grid"');
    expect(firstIds.find((id) => id.endsWith("-grid"))).not.toBe(
      [...second.matchAll(/\sid="([^"]+)"/g)]
        .map((match) => match[1])
        .find((id) => id.endsWith("-grid"))
    );
  });

  it("omits independently hidden objects without changing connectivity", () => {
    const content = decoratedContent();
    content.layerObjectStates = Object.fromEntries([
      "R1", "signal", "signal-segment-1", "branch", "branch-segment-1",
      "deleted-wire", "junction-40-0", "net-label", "plain-note", "markdown-note"
    ].map(id => [id, { visible: false }]));

    const rendered = renderSchematicDocumentSvg(content, {
      namespace: "hidden-objects",
      presentationMode: false
    });

    expect(rendered.svg).not.toContain("data-component-id=");
    expect(rendered.svg).not.toContain("data-wire-id=");
    expect(rendered.svg).not.toContain("data-junction=");
    expect(rendered.svg).not.toContain("data-net-label-id=");
    expect(rendered.svg).not.toContain("data-note-id=");
    expect(rendered.topology.junctions).toContainEqual({ x: 40, y: 0 });
    expect(content.connections.wires.signal).toBeDefined();
  });

  it("keeps cross-layer wires connected and places a junction with its topmost visible wire", () => {
    const point = { x: 40, y: 0 };
    const layer2 = { id: "layer-2", name: "Overlay", visible: true, locked: false };
    const document = fixtureDocument({
      layers: [{ id: "layer-1", name: "Base", visible: true, locked: false }, layer2],
      wires: [
        fixtureWire("west", [{ x: 0, y: 0 }, point]),
        { ...fixtureWire("east", [point, { x: 80, y: 0 }]), layerId: "layer-2" },
        { ...fixtureWire("south", [point, { x: 40, y: 40 }]), layerId: "layer-2" }
      ],
      netLabels: [{ id: "tag", layerId: "layer-2", name: "OUT", attachment: { wireId: "east", point } }],
      notes: [{ id: "note", layerId: "layer-2", x: 80, y: 80, width: 120, format: "plain" as const, text: "Overlay note" }]
    });
    applyNormalizedDocumentWires(document);
    const render = () => renderSchematicDocumentSvg(document, { namespace: "layers", presentationMode: false });
    const before = render();
    const junctionId = "junction-40-0";
    expect(document.wires.map(wire => wire.id).sort()).toEqual(["east", "south", "west"]);
    expect(before.topology.connectivity.rootOfWire("east")).toBe(before.topology.connectivity.rootOfWire("west"));
    expect(resolveLayerObjects(document).layerOf(junctionId).id).toBe("layer-2");

    layer2.visible = false;
    const after = render();
    expect(resolveLayerObjects(document).layerOf(junctionId).id).toBe("layer-1");
    expect(after.svg).toContain('data-junction="40,0"');
    expect(after.svg).toContain('data-wire-id="west"');
    expect(after.svg).not.toContain('data-wire-id="east"');
    expect(after.svg).not.toContain('data-net-label-id="tag"');
    expect(after.svg).not.toContain('data-note-id="note"');
    expect(after.topology.netResolution.wireNetNames).toEqual(before.topology.netResolution.wireNetNames);
    document.layerObjectStates = { west: { visible: false } };
    expect(render().svg).not.toContain('data-junction="40,0"');
  });

  it("includes both kinds of hidden objects for one render and sizes the result to their bounds", () => {
    const document = decoratedContent();
    document.layers = [
      { id: "layer-1", name: "Circuit", visible: true, locked: true },
      { id: "layer-2", name: "Comments", visible: false, locked: false }
    ];
    const note = document.notes.find(note => note.id === "plain-note")!;
    note.layerId = "layer-2";
    note.x = 1200;
    document.layerObjectStates = {
      R1: { visible: false, z: 4 },
      "junction-40-0": { visible: false, z: 9 },
      "net-label": { z: 3 }
    };
    const original = structuredClone(document);
    const options = { namespace: "export", presentationMode: false };
    const visible = renderSchematicDocumentSvg(document, options);
    const all = renderSchematicDocumentSvg(document, { ...options, includeHidden: true });

    expect(visible.svg).toContain('data-net-label-id="net-label"');
    for (const marker of ['data-component-id="R1"', 'data-note-id="plain-note"', 'data-junction="40,0"']) {
      expect(visible.svg).not.toContain(marker);
      expect(all.svg).toContain(marker);
    }
    expect(all.svg.indexOf('data-net-label-id="net-label"')).toBeLessThan(all.svg.indexOf('data-component-id="R1"'));
    expect(all.svg.indexOf('data-component-id="R1"')).toBeLessThan(all.svg.indexOf('data-note-id="plain-note"'));
    expect(all.width).toBeGreaterThan(visible.width);
    expect(all.topology.netResolution.wireNetNames).toEqual(visible.topology.netResolution.wireNetNames);
    expect(document).toEqual(original);
  });

  it("keeps a visible arrow anchored to its physical node when the adjoining wire is hidden", () => {
    const document = fixtureDocument({
      wires: [
        { ...fixtureWire("horizontal", [{ x: 0, y: 0 }, { x: 40, y: 0 }]), appearance: { variant: "signal", endMarker: "arrow" } },
        fixtureWire("vertical", [{ x: 40, y: 0 }, { x: 40, y: 60 }])
      ],
      layerObjectStates: { vertical: { visible: false } }
    });
    const rendered = renderSchematicDocumentSvg(document, { namespace: "connected-end" });

    expect(rendered.svg).not.toContain('data-wire-id="vertical"');
    expect(rendered.svg).toContain('data-wire-endpoint="end" points="40,0 ');
  });

  it("uses the Layers panel object order for all SVG object types", () => {
    const content = decoratedContent();
    content.layerObjectStates = Object.fromEntries([
      "R1", "signal", "branch", "deleted-wire", "junction-40-0",
      "net-label", "plain-note", "markdown-note"
    ].map((id, index) => [id, { z: index + 1 }]));

    const svg = renderSchematicDocumentSvg(content, {
      namespace: "ordered-objects",
      presentationMode: false
    }).svg;
    const markers = [
      'data-component-id="R1"',
      'data-wire-id="signal"',
      'data-wire-id="branch"',
      'data-wire-id="deleted-wire"',
      'data-junction="40,0"',
      'data-net-label-id="net-label"',
      'data-note-id="plain-note"',
      'data-note-id="markdown-note"'
    ];
    const positions = markers.map(marker => svg.indexOf(marker));
    expect(positions.every(position => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((first, second) => first - second));
  });
});

function decoratedContent(): SchematicContent {
  return fixtureDocument({
    components: [{
      id: "R1",
      type: "resistor",
      ref: "R1",
      x: 140,
      y: 0,
      rotation: 0,
      mirrored: false,
      values: { main: "1k" },
      temporarilyDeleted: true
    }],
    wires: [{
      id: "signal",
      routeMode: "orthogonal",
      points: [{ x: 0, y: 0 }, { x: 80, y: 0 }],
      appearance: {
        variant: "signal",
        startMarker: "arrow",
        endMarker: "circle",
        digitalSlash: true,
        digitalLabel: "12"
      }
    }, {
      id: "branch",
      routeMode: "orthogonal",
      points: [{ x: 40, y: -40 }, { x: 40, y: 40 }]
    }, {
      id: "deleted-wire",
      routeMode: "orthogonal",
      points: [{ x: 0, y: 80 }, { x: 80, y: 80 }],
      temporarilyDeleted: true
    }],

    junctionAppearances: [{ point: { x: 40, y: 0 }, color: "#0072b2" }],
    netLabels: [{
      id: "net-label",
      name: "BUS",
      attachment: { wireId: "signal", point: { x: 20, y: 0 } }
    }],
    notes: [{
      id: "plain-note",
      x: 0,
      y: 120,
      width: 140,
      height: 40,
      format: "plain",
      text: "plain note"
    }, {
      id: "markdown-note",
      x: 180,
      y: 120,
      width: 180,
      height: 60,
      format: "markdown",
      text: "# Heading"
    }]
  }, { joinAt: [{ x: 40, y: 0 }] });
}
