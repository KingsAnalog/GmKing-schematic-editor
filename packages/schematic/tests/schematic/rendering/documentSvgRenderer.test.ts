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
