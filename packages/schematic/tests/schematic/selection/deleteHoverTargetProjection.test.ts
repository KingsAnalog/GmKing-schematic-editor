import { describe, expect, it } from "vitest";
import {
  projectDeleteHoverElementTarget,
  projectDeleteHoverLinkTarget,
  projectDeleteHoverModelTarget,
  projectDeleteHoverNoteTarget
} from "../../../src/schematic/deleteHoverTargetProjection";
import { junctionId } from "../../../src/schematic/renderer";
import type { Point } from "../../../src/schematic/types";
import type { ModelLike } from "../../../src/schematic/viewTargets";

function model(id: unknown, attrs: Record<string, unknown> = {}): ModelLike {
  return {
    id,
    get: (attribute) => attrs[attribute]
  };
}

describe("schematic delete hover target projection", () => {
  it("projects note ids and ignores empty note ids", () => {
    expect(projectDeleteHoverNoteTarget("note-1")).toEqual({ ids: [], noteIds: ["note-1"] });
    expect(projectDeleteHoverNoteTarget("")).toEqual({ ids: [], noteIds: [] });
    expect(projectDeleteHoverNoteTarget(null)).toEqual({ ids: [], noteIds: [] });
    expect(projectDeleteHoverNoteTarget(undefined)).toEqual({ ids: [], noteIds: [] });
  });

  it("projects explicit model targets without fallback ids", () => {
    expect(projectDeleteHoverModelTarget({ model: model("component-cell", { componentId: "R1" }) })).toEqual({
      ids: ["R1"],
      noteIds: []
    });
    expect(projectDeleteHoverModelTarget({ model: model("wire-cell", { wireId: "w1" }) })).toEqual({
      ids: ["w1"],
      noteIds: []
    });
    expect(projectDeleteHoverModelTarget({ model: model("fallback-cell") })).toEqual({ ids: [], noteIds: [] });
  });

  it("projects component elements with explicit ids and fallback ids", () => {
    expect(projectDeleteHoverElementTarget({ model: model("component-cell", { componentId: "C1" }) })).toEqual(["C1"]);
    expect(projectDeleteHoverElementTarget({ model: model("fallback-component-cell") })).toEqual(["fallback-component-cell"]);
  });

  it("projects resolved junction elements and ignores unresolved junction elements", () => {
    const point = { x: 40, y: 60 };
    const id = junctionId(point);

    expect(projectDeleteHoverElementTarget({ model: model("joint-cell-id", { junction: true }), junctionPoint: point })).toEqual([id]);
    expect(projectDeleteHoverElementTarget({ model: model("joint-cell-id", { junction: true }), junctionPoint: null })).toEqual([]);
  });

  it("ignores preview links", () => {
    const point = { x: 100, y: 120 };

    expect(
      projectDeleteHoverLinkTarget({
        model: model("preview-link", { preview: true, wireId: "w1" }),
        point,
        junctions: [point]
      })
    ).toEqual([]);
  });

  it("projects link hovers over junctions as junction ids", () => {
    const point = { x: 100, y: 120 };

    expect(
      projectDeleteHoverLinkTarget({
        model: model("wire-cell", { wireId: "w1" }),
        point,
        junctions: [point]
      })
    ).toEqual([junctionId(point)]);
  });

  it("projects ordinary wire links with explicit ids and fallback ids", () => {
    const point = { x: 100, y: 120 };
    const otherJunction: Point = { x: 0, y: 0 };

    expect(
      projectDeleteHoverLinkTarget({
        model: model("wire-cell", { wireId: "w1" }),
        point,
        junctions: [otherJunction]
      })
    ).toEqual(["w1"]);
    expect(
      projectDeleteHoverLinkTarget({
        model: model("fallback-wire-cell"),
        point,
        junctions: []
      })
    ).toEqual(["fallback-wire-cell"]);
  });

  it("returns empty targets for empty or unresolved models", () => {
    expect(projectDeleteHoverModelTarget({ model: null })).toEqual({ ids: [], noteIds: [] });
    expect(projectDeleteHoverModelTarget({ model: model(undefined) })).toEqual({ ids: [], noteIds: [] });
    expect(projectDeleteHoverModelTarget({ model: model("joint-cell-id", { junction: true }), junctionPoint: null })).toEqual({
      ids: [],
      noteIds: []
    });
    expect(projectDeleteHoverElementTarget({ model: model(undefined) })).toEqual([]);
  });
});
