import { expect } from "vitest";
import { createEmptySchematicContent } from "../../../src/schematic/document/documentModel";
import { renderSchematicDocumentSvg } from "../../../src/schematic/documentSvgRenderer";
import { slowIt } from "../../support/slowTest";

slowIt("renders the 300-component and 1000-wire portable baseline", () => {
  const content = createEmptySchematicContent();
  content.components = Array.from({ length: 300 }, (_, index) => ({
    id: `component-${index}`,
    type: "resistor" as const,
    ref: `R${index + 1}`,
    x: 200 + (index % 20) * 120,
    y: 20 + Math.floor(index / 20) * 120,
    rotation: 0 as const,
    mirrored: false,
    values: {}
  }));
  content.wires = Array.from({ length: 1000 }, (_, index) => ({
    id: `wire-${index}`,
    routeMode: "orthogonal" as const,
    points: [
      { x: 0, y: 2200 + index * 20 },
      { x: 80, y: 2200 + index * 20 }
    ]
  }));

  const started = performance.now();
  const rendered = renderSchematicDocumentSvg(content, {
    namespace: "performance-baseline",
    presentationMode: true,
    showGrid: false,
    backgroundColor: "#ffffff"
  });
  const elapsedMs = performance.now() - started;

  expect(rendered.bounds).not.toBeNull();
  expect(rendered.svg.length).toBeGreaterThan(100_000);
  expect(rendered.svg).toContain('data-wire-id="wire-999"');
  expect(rendered.svg).toContain('data-component-id="component-299"');
  expect(elapsedMs).toBeLessThan(15_000);
}, 30_000);
