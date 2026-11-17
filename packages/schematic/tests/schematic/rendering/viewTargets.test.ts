import { describe, expect, it } from "vitest";
import {
  viewTargetFromJunctionId,
  viewTargetFromModel,
  viewTargetFromNoteId,
  viewTargetIdsFromModel,
  type ModelLike
} from "../../../src/schematic/viewTargets";

function model(id: unknown, attrs: Record<string, unknown> = {}): ModelLike {
  return {
    id,
    get: (attribute) => attrs[attribute]
  };
}

describe("schematic view targets", () => {
  it("maps note ids and ignores missing note targets", () => {
    expect(viewTargetFromNoteId("note-1")).toEqual({ kind: "note", id: "note-1" });
    expect(viewTargetFromNoteId("")).toBeNull();
    expect(viewTargetFromNoteId(null)).toBeNull();
    expect(viewTargetFromNoteId(undefined)).toBeNull();
  });

  it("maps junction ids and ignores missing junction targets", () => {
    expect(viewTargetFromJunctionId("junction-20-40")).toEqual({ kind: "junction", id: "junction-20-40" });
    expect(viewTargetFromJunctionId("")).toBeNull();
    expect(viewTargetFromJunctionId(null)).toBeNull();
    expect(viewTargetFromJunctionId(undefined)).toBeNull();
  });

  it("maps context-style model targets and ignores previews", () => {
    expect(viewTargetFromModel(null)).toBeNull();
    expect(viewTargetFromModel(model("preview-cell", { preview: true, componentId: "R1" }))).toBeNull();
    expect(viewTargetFromModel(model("junction:20,40", { junction: true }))).toEqual({ kind: "junction", id: "junction:20,40" });
    expect(viewTargetFromModel(model("cell-r1", { componentId: "R1" }))).toEqual({ kind: "component", id: "R1" });
    expect(viewTargetFromModel(model("cell-w1", { wireId: "w1" }))).toEqual({ kind: "wire", id: "w1" });
    expect(viewTargetFromModel(model("cell-both", { componentId: "R2", wireId: "w2" }))).toEqual({ kind: "component", id: "R2" });
  });

  it("uses editor-resolved junction ids when required", () => {
    const junction = model("joint-cell-id", { junction: true });

    expect(viewTargetFromModel(junction, { junctionId: "junction:100,120", requireJunctionId: true })).toEqual({
      kind: "junction",
      id: "junction:100,120"
    });
    expect(viewTargetFromModel(junction, { junctionId: null, requireJunctionId: true })).toBeNull();
    expect(viewTargetFromModel(junction, { junctionId: null })).toEqual({ kind: "junction", id: "joint-cell-id" });
  });

  it("keeps element and link hover mapping scoped by enabled target kinds", () => {
    expect(viewTargetFromModel(model("element-cell", { componentId: "R3", wireId: "w3" }), { enabledKinds: ["component"], fallbackKind: "component" })).toEqual({
      kind: "component",
      id: "R3"
    });
    expect(viewTargetFromModel(model("element-fallback"), { enabledKinds: ["component"], fallbackKind: "component" })).toEqual({
      kind: "component",
      id: "element-fallback"
    });
    expect(viewTargetFromModel(model("link-cell", { componentId: "R4", wireId: "w4" }), { enabledKinds: ["wire"], fallbackKind: "wire" })).toEqual({
      kind: "wire",
      id: "w4"
    });
    expect(viewTargetFromModel(model("link-fallback"), { enabledKinds: ["wire"], fallbackKind: "wire" })).toEqual({ kind: "wire", id: "link-fallback" });
  });

  it("returns target id arrays for hover callers", () => {
    expect(viewTargetIdsFromModel(model("cell-c1", { componentId: "C1" }))).toEqual(["C1"]);
    expect(viewTargetIdsFromModel(model("preview-cell", { preview: true, wireId: "w5" }))).toEqual([]);
  });
});
