import { connectGeometry, disconnectJunction } from "../../../src/schematic/connectionGraph";
import { pointOnSegment, samePoint, snapPoint } from "../../../src/schematic/geometry";
import { createEmptySchematicDocument } from "../../../src/schematic/document/documentModel";
import type { Point, SchematicDocument } from "../../../src/schematic/types";

/** Author test circuits using the same contact rules as new placements and wires. */
export function fixtureDocument<T extends Partial<SchematicDocument>>(
  input: T,
  edits: { joinAt?: Point[]; disconnectAt?: Point[] } = {}
): T & SchematicDocument {
  const document = { ...createEmptySchematicDocument(), ...input };
  authorFixture(document);
  edits.joinAt?.forEach(point => connectFixtureJunction(document, point));
  edits.disconnectAt?.forEach(point => disconnectJunction(document, point));
  return document;
}

export function authorFixture(document: SchematicDocument) {
  document.wires.forEach(wire => { wire.points = wire.points.map(point => snapPoint(point)); });
  connectGeometry(document, {
    wireIds: new Set(document.wires.map(wire => wire.id)),
    componentIds: new Set(document.components.map(component => component.id))
  });
}

/** Draw a vertex at the crossing, then apply the ordinary wire contact rule. */
export function connectFixtureJunction(document: SchematicDocument, point: Point) {
  const touching = document.wires.filter(wire => wire.points.some((end, i) => i > 0 && pointOnSegment(point, wire.points[i - 1], end)));
  if (touching.length < 2) return;
  document.wires.forEach(wire => {
    if (wire.points.some(vertex => samePoint(vertex, point))) return;
    const index = wire.points.findIndex((end, i) => i > 0 && pointOnSegment(point, wire.points[i - 1], end, true));
    if (index >= 0) wire.points.splice(index, 0, { ...point });
  });
  connectGeometry(document, { wireIds: new Set(document.wires.map(wire => wire.id)), componentIds: new Set() });
}
