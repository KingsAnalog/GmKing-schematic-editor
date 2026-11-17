import { describe, expect, it } from "vitest";
import { pointKey } from "../../../src/schematic/geometry";
import { junctionId } from "../../../src/schematic/renderer";
import { projectSchematicSelection, remapSelectedJunctionIds } from "../../../src/schematic/selection/selectionProjection";
import { setMixedSelection } from "../../../src/schematic/selection/selectionModel";
import {
  transformSelectionDocumentGeometry,
  transformSingleComponentOrientation,
  transformSelectionPoint,
  type GroupTransformKind
} from "../../../src/schematic/selection/selectionTransformModel";
import { componentVisualBounds, noteVisualBounds, type Rect } from "../../../src/schematic/view-geometry";
import { normalizeWirePath } from "../../../src/schematic/wire/wireGeometry";
import type { Point, SchematicDocument } from "../../../src/schematic/types";
import { emptyDoc, fixtureComponent, mixedSelectionDoc } from "../support/fixtures";

describe("schematic selection transform model", () => {
  it("rotates mixed component, wire, note, and selected junction-intent geometry", () => {
    const document = mixedSelectionDoc();
    document.junctionAppearances = [
      { point: { x: 280, y: 200 }, color: "#ff0000" },
      { point: { x: 320, y: 200 }, color: "#ff0000" },
      { point: { x: 500, y: 500 }, color: "#ff0000" }
    ];
    const selectionState = setMixedSelection(["R1", "w-mixed", junctionId({ x: 280, y: 200 })], ["note-1"]);
    const selection = projectSchematicSelection(document, selectionState);
    const transform = transformFor(selection.transformBounds!, "rotate");
    const component = document.components.find((candidate) => candidate.id === "R1")!;
    const wire = document.wires.find((candidate) => candidate.id === "w-mixed")!;
    const note = document.notes![0];
    const previousComponentCenter = rectCenter(componentVisualBounds(component));
    const previousWirePoints = wire.points.map((point) => ({ ...point }));
    const previousNoteBox = noteVisualBounds(note);

    const result = transformSelectionDocumentGeometry({ document, selection, kind: "rotate" });

    expect(result.changed).toBe(true);
    expect(component).toMatchObject({ rotation: 90, mirrored: false });
    expect(rectCenter(componentVisualBounds(component))).toEqual(transform(previousComponentCenter));
    expect(wire.points).toEqual(normalizeWirePath(previousWirePoints.map(transform)));
    expect(rectCenter(noteVisualBounds(note))).toEqual(transform(rectCenter(previousNoteBox)));
    expect(note).toMatchObject({ width: previousNoteBox.width, height: previousNoteBox.height });

    const transformedSelectedJunction = transform({ x: 280, y: 200 });
    const transformedAffectedWireIntent = transform({ x: 320, y: 200 });
    expect(junctionColorKeys(document)).toEqual([
      pointKey(transformedAffectedWireIntent), "500,500", pointKey(transformedSelectedJunction)
    ].sort());
    expect(result.transformedJunctionIds).toEqual([
      junctionId(transformedSelectedJunction)
    ]);

    const remappedSelection = new Set(remapSelectedJunctionIds(selectionState.selectedIds, result.transformedJunctionIds));
    expect(Array.from(remappedSelection).sort()).toEqual(["R1", "w-mixed", junctionId(transformedSelectedJunction)].sort());
  });

  it("mirrors mixed component, wire, note, and selected junction-intent geometry", () => {
    const document = mixedSelectionDoc();
    document.junctionAppearances = [
      { point: { x: 280, y: 200 }, color: "#ff0000" },
      { point: { x: 320, y: 200 }, color: "#ff0000" }
    ];
    const selectionState = setMixedSelection(["C1", "w-mixed", junctionId({ x: 280, y: 200 })], ["note-1"]);
    const selection = projectSchematicSelection(document, selectionState);
    const transform = transformFor(selection.transformBounds!, "mirror-x");
    const component = document.components.find((candidate) => candidate.id === "C1")!;
    const wire = document.wires.find((candidate) => candidate.id === "w-mixed")!;
    const note = document.notes![0];
    const previousComponentCenter = rectCenter(componentVisualBounds(component));
    const previousWirePoints = wire.points.map((point) => ({ ...point }));
    const previousNoteBox = noteVisualBounds(note);

    const result = transformSelectionDocumentGeometry({ document, selection, kind: "mirror-x" });

    expect(result.changed).toBe(true);
    expect(component).toMatchObject({ rotation: 270, mirrored: true });
    expect(rectCenter(componentVisualBounds(component))).toEqual(transform(previousComponentCenter));
    expect(wire.points).toEqual(normalizeWirePath(previousWirePoints.map(transform)));
    expect(rectCenter(noteVisualBounds(note))).toEqual(transform(rectCenter(previousNoteBox)));
    expect(note).toMatchObject({ width: previousNoteBox.width, height: previousNoteBox.height });

    const transformedSelectedJunction = transform({ x: 280, y: 200 });
    const transformedAffectedWireIntent = transform({ x: 320, y: 200 });
    expect(junctionColorKeys(document)).toEqual([
      pointKey(transformedAffectedWireIntent), pointKey(transformedSelectedJunction)
    ].sort());
    expect(result.transformedJunctionIds).toEqual([junctionId(transformedSelectedJunction)]);
  });

  it("mirrors mixed component, wire, note, and selected junction-intent geometry across y", () => {
    const document = mixedSelectionDoc();
    document.junctionAppearances = [{ point: { x: 320, y: 200 }, color: "#ff0000" }];
    const selectionState = setMixedSelection(["R1", "w-mixed", junctionId({ x: 280, y: 200 })], ["note-1"]);
    const selection = projectSchematicSelection(document, selectionState);
    const transform = transformFor(selection.transformBounds!, "mirror-y");
    const component = document.components.find((candidate) => candidate.id === "R1")!;
    const wire = document.wires.find((candidate) => candidate.id === "w-mixed")!;
    const note = document.notes![0];
    const previousComponentCenter = rectCenter(componentVisualBounds(component));
    const previousWirePoints = wire.points.map((point) => ({ ...point }));
    const previousNoteBox = noteVisualBounds(note);

    const result = transformSelectionDocumentGeometry({ document, selection, kind: "mirror-y" });

    expect(result.changed).toBe(true);
    expect(component).toMatchObject({ rotation: 180, mirrored: true });
    expect(rectCenter(componentVisualBounds(component))).toEqual(transform(previousComponentCenter));
    expect(wire.points).toEqual(normalizeWirePath(previousWirePoints.map(transform)));
    expect(rectCenter(noteVisualBounds(note))).toEqual(transform(rectCenter(previousNoteBox)));
    expect(note).toMatchObject({ width: previousNoteBox.width, height: previousNoteBox.height });

    const transformedSelectedJunction = transform({ x: 280, y: 200 });
    const transformedAffectedWireIntent = transform({ x: 320, y: 200 });
    expect(junctionColorKeys(document)).toEqual([pointKey(transformedAffectedWireIntent)]);
    expect(result.transformedJunctionIds).toEqual([junctionId(transformedSelectedJunction)]);
  });

  it("does not change an empty selection", () => {
    const document = emptyDoc();
    const before = snapshotDocument(document);
    const selection = projectSchematicSelection(document, setMixedSelection([], []));

    const result = transformSelectionDocumentGeometry({ document, selection, kind: "rotate" });

    expect(result).toEqual({ changed: false, transformedJunctionIds: [] });
    expect(snapshotDocument(document)).toBe(before);
  });

  it("rotates a single component orientation without changing mirrored state", () => {
    const component = { ...fixtureComponent("resistor", "R1", 0, 0, 270), mirrored: true };

    transformSingleComponentOrientation(component, "rotate");

    expect(component).toMatchObject({ rotation: 0, mirrored: true });
  });

  it("mirrors a single component across x by toggling mirrored without changing rotation", () => {
    const component = fixtureComponent("resistor", "R1", 0, 0, 90);

    transformSingleComponentOrientation(component, "mirror-x");

    expect(component).toMatchObject({ rotation: 90, mirrored: true });
  });

  it("mirrors a single component across y by reflecting rotation and toggling mirrored", () => {
    const component = fixtureComponent("resistor", "R1", 0, 0, 90);

    transformSingleComponentOrientation(component, "mirror-y");

    expect(component).toMatchObject({ rotation: 270, mirrored: true });
  });

  it("keeps zero rotation at zero when mirroring a single component across y", () => {
    const component = fixtureComponent("resistor", "R1", 0, 0, 0);

    transformSingleComponentOrientation(component, "mirror-y");

    expect(component).toMatchObject({ rotation: 0, mirrored: true });
  });
});

function transformFor(bounds: Rect, kind: GroupTransformKind) {
  const center = {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2
  };
  return (point: Point) => transformSelectionPoint(point, center, kind);
}

function rectCenter(rect: Rect): Point {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

function junctionColorKeys(document: SchematicDocument) {
  return document.junctionAppearances.map(appearance => pointKey(appearance.point)).sort();
}

function snapshotDocument(document: SchematicDocument) {
  return JSON.stringify(document);
}
