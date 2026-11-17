import { describe, expect, it } from "vitest";
import { pointKey } from "../../../src/schematic/geometry";
import { junctionId } from "../../../src/schematic/renderer";
import { createSchematicSelectionState } from "../../../src/schematic/selection/selectionModel";
import { remapSelectionAfterGeometryTransform } from "../../../src/schematic/selection/selectionTransformRemap";
import type { Point } from "../../../src/schematic/types";
import type { Rect } from "../../../src/schematic/view-geometry";

function projection(junctions: Point[], transformBounds: Rect | null) {
  return {
    junctionKeys: new Set(junctions.map(pointKey)),
    transformBounds
  };
}

describe("selection transform remap", () => {
  it("remaps selected junction ids and their primary while preserving other selections", () => {
    const previousJunctionId = junctionId({ x: 20, y: 20 });
    const transformedJunctionId = junctionId({ x: 60, y: 20 });
    const extraJunctionId = junctionId({ x: 80, y: 40 });
    const selection = createSchematicSelectionState({
      selectedIds: ["component-1", previousJunctionId],
      selectedNoteIds: ["note-1"],
      primarySelectedId: previousJunctionId
    });

    const remapped = remapSelectionAfterGeometryTransform({
      selection,
      transformedJunctionIds: [transformedJunctionId, transformedJunctionId, extraJunctionId],
      projection: projection([{ x: 20, y: 20 }], { x: 0, y: 0, width: 80, height: 80 }),
      kind: "rotate"
    });

    expect([...remapped.selectedIds]).toEqual(["component-1", transformedJunctionId, extraJunctionId]);
    expect([...remapped.selectedNoteIds]).toEqual(["note-1"]);
    expect(remapped.primarySelectedId).toBe(transformedJunctionId);
    expect([...selection.selectedIds]).toEqual(["component-1", previousJunctionId]);
  });

  it("preserves non-junction and stale primary ids exactly", () => {
    const selectedJunctionId = junctionId({ x: 20, y: 20 });
    const nextJunctionId = junctionId({ x: 60, y: 20 });
    const cases = [
      { primarySelectedId: "component-1", selectedIds: ["component-1", selectedJunctionId] },
      { primarySelectedId: "note-1", selectedIds: ["component-1", selectedJunctionId] },
      { primarySelectedId: "stale-primary", selectedIds: ["component-1", selectedJunctionId] },
      { primarySelectedId: junctionId({ x: 999, y: 999 }), selectedIds: ["component-1", selectedJunctionId] }
    ];

    cases.forEach(({ primarySelectedId, selectedIds }) => {
      const remapped = remapSelectionAfterGeometryTransform({
        selection: createSchematicSelectionState({
          selectedIds,
          selectedNoteIds: ["note-1"],
          primarySelectedId
        }),
        transformedJunctionIds: [nextJunctionId],
        projection: projection([{ x: 20, y: 20 }], { x: 0, y: 0, width: 80, height: 80 }),
        kind: "rotate"
      });

      expect(remapped.primarySelectedId).toBe(primarySelectedId);
    });
  });

  it("falls back to the first transformed junction when the primary target is absent", () => {
    const previousJunctionId = junctionId({ x: 20, y: 20 });
    const fallbackJunctionId = junctionId({ x: 100, y: 100 });
    const selection = createSchematicSelectionState({
      selectedIds: ["wire-1", previousJunctionId],
      primarySelectedId: previousJunctionId
    });

    const remapped = remapSelectionAfterGeometryTransform({
      selection,
      transformedJunctionIds: [fallbackJunctionId],
      projection: projection([{ x: 20, y: 20 }], { x: 0, y: 0, width: 80, height: 80 }),
      kind: "rotate"
    });
    const withoutFallback = remapSelectionAfterGeometryTransform({
      selection,
      transformedJunctionIds: [],
      projection: projection([{ x: 20, y: 20 }], { x: 0, y: 0, width: 80, height: 80 }),
      kind: "rotate"
    });

    expect(remapped.primarySelectedId).toBe(fallbackJunctionId);
    expect(withoutFallback.primarySelectedId).toBeNull();
  });

  it("leaves selection untouched when no junction belongs to the transform projection", () => {
    const selectedJunctionId = junctionId({ x: 20, y: 20 });
    const selection = createSchematicSelectionState({
      selectedIds: ["component-1", selectedJunctionId],
      selectedNoteIds: ["note-1"],
      primarySelectedId: selectedJunctionId
    });

    const remapped = remapSelectionAfterGeometryTransform({
      selection,
      transformedJunctionIds: [junctionId({ x: 60, y: 20 })],
      projection: projection([], { x: 0, y: 0, width: 80, height: 80 }),
      kind: "rotate"
    });

    expect(remapped).toBe(selection);
  });
});
