import { fixtureDocument } from "../support/fixtureDocument";
import { describe, expect, it } from "vitest";
import { netLabelPosition } from "../../../src/schematic/netLabelModel";
import { SchematicNetLabelToolController } from "../../../src/schematic/netLabelToolController";
import type { NetLabel, Point, SchematicDocument, Wire } from "../../../src/schematic/types";

function wire(id: string, points: Point[]): Wire {
  return { id, points, routeMode: "orthogonal" };
}

function label(id: string, name: string, wireId: string, point: Point): NetLabel {
  return { id, name, attachment: { wireId, point } };
}

function document(wires: Wire[], netLabels: NetLabel[] = []): SchematicDocument {
  return fixtureDocument({
    components: [],
    wires,
    junctions: [],

    junctionAppearances: [],
    netLabels,
    notes: []
  });
}

describe("schematic net label tool controller", () => {
  it("preserves the draft while begin clears arming and validation errors", () => {
    const controller = new SchematicNetLabelToolController();

    expect(controller.arm("BAD NAME").kind).toBe("invalid");
    controller.updateDraft("CLK");
    expect(controller.arm("CLK").kind).toBe("armed");

    expect(controller.begin()).toMatchObject({
      draft: "CLK",
      armedName: null,
      error: ""
    });
  });

  it("cancels arming and drag state while preserving the draft", () => {
    const controller = new SchematicNetLabelToolController();
    const netLabel = label("label-1", "OUT", "signal", { x: 20, y: 0 });
    controller.updateDraft("CLK");
    controller.arm("CLK");
    controller.beginDrag(netLabel);

    expect(controller.cancel()).toEqual({
      draft: "CLK",
      armedName: null,
      error: "",
      drag: null
    });
  });

  it("validates and normalizes arming while draft edits control whether placement stays armed", () => {
    const controller = new SchematicNetLabelToolController();

    const invalid = controller.arm("CLK 1");
    expect(invalid).toMatchObject({
      kind: "invalid",
      message: expect.stringContaining("Whitespace"),
      snapshot: { draft: "CLK 1", armedName: null }
    });

    const armed = controller.arm("  OUT<1>  ");
    expect(armed).toMatchObject({
      kind: "armed",
      name: "OUT<1>",
      snapshot: { draft: "OUT<1>", armedName: "OUT<1>", error: "" }
    });
    expect(controller.updateDraft(" OUT<1> ")).toMatchObject({ armedName: "OUT<1>" });
    expect(controller.updateDraft("OUT<2>")).toMatchObject({ armedName: null });
  });

  it("prepares continuous placements without consuming the armed name or mutating the document", () => {
    const controller = new SchematicNetLabelToolController();
    const schematic = document([wire("signal", [{ x: 0, y: 0 }, { x: 100, y: 0 }])]);
    let id = 0;
    controller.arm("OUT");

    const first = controller.preparePlacement(schematic, { x: 20, y: 0 }, undefined, () => `label-${++id}`);
    const second = controller.preparePlacement(schematic, { x: 80, y: 0 }, undefined, () => `label-${++id}`);

    expect(first).toEqual({
      kind: "ready",
      label: {
        id: "label-1",
        name: "OUT",
        attachment: { wireId: "signal", point: { x: 20, y: 0 } }
      }
    });
    expect(second).toMatchObject({ kind: "ready", label: { id: "label-2", name: "OUT" } });
    expect(controller.snapshot().armedName).toBe("OUT");
    expect(schematic.netLabels).toEqual([]);
  });

  it("does not consume an id before placement is armed and attached", () => {
    const controller = new SchematicNetLabelToolController();
    const schematic = document([wire("signal", [{ x: 0, y: 0 }, { x: 100, y: 0 }])]);
    let idCalls = 0;
    const createId = () => {
      idCalls += 1;
      return "label-1";
    };

    expect(controller.preparePlacement(
      schematic,
      { x: 20, y: 0 },
      undefined,
      createId
    )).toEqual({ kind: "unarmed" });
    controller.arm("OUT");
    expect(controller.preparePlacement(
      schematic,
      { x: 200, y: 200 },
      undefined,
      createId
    )).toEqual({ kind: "invalid-target" });
    expect(idCalls).toBe(0);
  });

  it("projects previews and honors a preferred wire for placement at crossings", () => {
    const controller = new SchematicNetLabelToolController();
    const schematic = document([
      wire("horizontal", [{ x: 0, y: 0 }, { x: 80, y: 0 }]),
      wire("vertical", [{ x: 40, y: -40 }, { x: 40, y: 40 }])
    ]);

    expect(controller.buildPreview(schematic, { x: 40, y: 0 })).toBeNull();
    controller.arm("CLK");
    expect(controller.buildPreview(schematic, null)).toBeNull();
    expect(controller.buildPreview(schematic, { x: 40, y: 0 })).toEqual({
      name: "CLK",
      attachment: { wireId: "horizontal", point: { x: 40, y: 0 } }
    });
    expect(controller.preparePlacement(
      schematic,
      { x: 40, y: 0 },
      "vertical",
      () => "label-crossing"
    )).toMatchObject({
      kind: "ready",
      label: { attachment: { wireId: "vertical", point: { x: 40, y: 0 } } }
    });
    expect(controller.preparePlacement(
      schematic,
      { x: 200, y: 200 },
      undefined,
      () => "unused"
    )).toEqual({ kind: "invalid-target" });
  });

  it("returns canceled, unchanged, and changed drag results without mutating the document", () => {
    const controller = new SchematicNetLabelToolController();
    const netLabel = label("label-1", "OUT", "signal", { x: 20, y: 0 });
    const schematic = document(
      [wire("signal", [{ x: 0, y: 0 }, { x: 100, y: 0 }])],
      [netLabel]
    );

    controller.beginDrag(netLabel);
    expect(controller.finishDrag(
      schematic,
      netLabel.id,
      netLabelPosition(label("candidate", "OUT", "", { x: 20, y: 80 }))
    )).toEqual({
      kind: "canceled",
      labelId: netLabel.id,
      attachment: { wireId: "signal", point: { x: 20, y: 0 } }
    });

    controller.beginDrag(netLabel);
    expect(controller.finishDrag(schematic, netLabel.id, netLabelPosition(netLabel))).toEqual({
      kind: "unchanged",
      labelId: netLabel.id
    });

    controller.beginDrag(netLabel);
    expect(controller.finishDrag(
      schematic,
      netLabel.id,
      netLabelPosition(label("candidate", "OUT", "", { x: 80, y: 0 }))
    )).toEqual({
      kind: "changed",
      labelId: netLabel.id,
      attachment: { wireId: "signal", point: { x: 80, y: 0 } }
    });
    expect(netLabel.attachment).toEqual({ wireId: "signal", point: { x: 20, y: 0 } });
    expect(controller.snapshot().drag).toBeNull();
  });

  it("clears the captured drag when pointerup belongs to another label", () => {
    const controller = new SchematicNetLabelToolController();
    const first = label("label-1", "OUT", "signal", { x: 20, y: 0 });
    const second = label("label-2", "CLK", "signal", { x: 80, y: 0 });
    const schematic = document(
      [wire("signal", [{ x: 0, y: 0 }, { x: 100, y: 0 }])],
      [first, second]
    );

    controller.beginDrag(first);
    expect(controller.finishDrag(schematic, second.id, netLabelPosition(second))).toEqual({
      kind: "ignored"
    });
    expect(controller.snapshot().drag).toBeNull();
    expect(controller.finishDrag(schematic, first.id, netLabelPosition(first))).toEqual({
      kind: "ignored"
    });
  });

  it("returns invalid, unchanged, and changed rename results without applying them", () => {
    const controller = new SchematicNetLabelToolController();
    const netLabel = label("label-1", "OUT", "signal", { x: 20, y: 0 });

    expect(controller.rename(netLabel, "BAD NAME")).toMatchObject({
      kind: "invalid",
      message: expect.stringContaining("Whitespace")
    });
    expect(controller.rename(netLabel, "  OUT  ")).toEqual({ kind: "unchanged", name: "OUT" });
    expect(controller.rename(netLabel, "  CLK  ")).toEqual({ kind: "changed", name: "CLK" });
    expect(netLabel.name).toBe("OUT");
  });

  it("deep-clones drag state both when capturing it and when exposing snapshots", () => {
    const controller = new SchematicNetLabelToolController();
    const netLabel = label("label-1", "OUT", "signal", { x: 20, y: 0 });

    controller.beginDrag(netLabel);
    netLabel.attachment.wireId = "mutated-wire";
    netLabel.attachment.point.x = 999;
    const first = controller.snapshot();
    expect(first.drag?.original).toEqual({ wireId: "signal", point: { x: 20, y: 0 } });

    first.drag!.original.wireId = "snapshot-wire";
    first.drag!.original.point.x = 555;
    expect(controller.snapshot().drag?.original).toEqual({
      wireId: "signal",
      point: { x: 20, y: 0 }
    });
  });
});
