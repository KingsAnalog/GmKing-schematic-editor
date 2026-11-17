import { authorFixture } from "../support/fixtureDocument";
import { describe, expect, it } from "vitest";
import { buildConnectivity } from "../../../src/schematic/connectivity";
import { contentFromDocument, createEmptySchematicDocument } from "../../../src/schematic/document/documentModel";
import { applyNormalizedDocumentWires } from "../../../src/schematic/document/documentWires";
import { parseSchematicContent, serializeSchematicContent } from "../../../src/schematic/schematicDocumentCodec";
import type { Point, Wire } from "../../../src/schematic/types";

function endpointMarks(wires: Wire[]) {
  return wires.flatMap(wire => [
    { point: wire.points[0], marker: wire.appearance?.startMarker },
    { point: wire.points.at(-1)!, marker: wire.appearance?.endMarker }
  ]).filter(mark => mark.marker && mark.marker !== "default")
    .map(mark => `${mark.point.x},${mark.point.y}:${mark.marker}`).sort();
}

describe("wire normalization stability", () => {
  it.each([[80, 0], [0, 80], [80, 40], [80, -40], [40, 80], [40, -80]])(
    "preserves junction wire order, IDs, labels and decorations along (%s, %s)", (dx, dy) => {
      for (const reverseLeft of [false, true]) for (const reverseRight of [false, true]) {
        for (const swapSources of [false, true]) for (const sharedBaseId of [false, true]) for (const withDiagonal of [false, true]) {
          const point = (scale: number): Point => ({ x: scale * dx || 0, y: scale * dy || 0 });
          const left: Wire = {
            id: "left", routeMode: dx && dy ? "freeAngle" : "orthogonal",
            points: reverseLeft ? [point(1), point(0)] : [point(0), point(1)],
            appearance: { variant: "signal", startMarker: "arrow", digitalSlash: true, digitalLabel: "8" }
          };
          const right: Wire = {
            id: sharedBaseId ? "left-segment-1" : "right", routeMode: left.routeMode,
            points: reverseRight ? [point(2), point(1)] : [point(1), point(2)],
            appearance: { variant: "signal", endMarker: "circle" }
          };
          const document = createEmptySchematicDocument();
          document.wires = [
            ...(swapSources ? [right, left] : [left, right]),
            { id: "branch", routeMode: left.routeMode, points: [point(1), { x: dx - dy / 2, y: dy + dx / 2 }] }
          ];
    authorFixture(document);
          if (withDiagonal) document.wires.splice(1, 0, {
            id: "diagonal", routeMode: "freeAngle", points: [{ x: 1000, y: 1000 }, { x: 1040, y: 1060 }]
          });
    authorFixture(document);
          document.netLabels = [
            { id: "left-label", name: "LEFT", attachment: { wireId: left.id, point: point(0.5) } },
            { id: "right-label", name: "RIGHT", attachment: { wireId: right.id, point: point(1.5) } }
          ];
          const marks = endpointMarks(document.wires);
          applyNormalizedDocumentWires(document);
          const expected = contentFromDocument(document);
          const canonical = serializeSchematicContent(expected);
          for (let pass = 0; pass < 4; pass += 1) {
            applyNormalizedDocumentWires(document);
            expect(contentFromDocument(document)).toEqual(expected);
            expect(endpointMarks(document.wires)).toEqual(marks);
            expect(document.wires.filter(wire => wire.appearance?.digitalSlash))
              .toEqual([expect.objectContaining({ points: left.points, appearance: left.appearance })]);
            const restored = parseSchematicContent(serializeSchematicContent(contentFromDocument(document)));
            expect(serializeSchematicContent(restored)).toBe(canonical);
          }
          expect(buildConnectivity(document).groups.size).toBe(withDiagonal ? 2 : 1);
        }
      }
    }
  );
});
