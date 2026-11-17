import { fixtureDocument } from "../support/fixtureDocument";
import { junctionId } from "../../../src/schematic/junctionIdentity";
import { executeSchematicPropertyBatchCommand } from "../../../src/schematic/propertyBatchCommands";
import { describe, expect, it } from "vitest";
import { buildCopySource, instantiateCopyAt, type CopyState } from "../../../src/schematic/copyModel";
import { restoreSchematicDocument } from "../../../src/schematic/document/documentModel";
import { moveJunctionAppearancesWithPath } from "../../../src/schematic/document/documentGeometryModel";
import {
  DEFAULT_NETWORK_COLOR,
  junctionCustomColor,
  setJunctionColor,
  setWireColor,
  wireCustomColor
} from "../../../src/schematic/networkColorModel";
import {
  junctionBodyAttrs,
  makeComponentCell,
  makeJunctionCell,
  makeWireCell,
  wireSelectionHaloAttrs
} from "../../../src/schematic/renderer";
import { buildSchematicSelectionSvg } from "../../../src/schematic/selection/selectionExport";
import type { SchematicDocument, Wire } from "../../../src/schematic/types";
import { fixtureComponent } from "../support/fixtures";

describe("schematic component color", () => {
  it("applies custom color to symbol ink, labels, markers, and visible ports", () => {
    const resistor = { ...fixtureComponent("resistor", "Rcolor", 100, 120), appearance: { color: "#0072b2" } };
    const resistorCell = makeComponentCell(resistor, { selected: true });
    expect(resistorCell.attr("frame/stroke")).toBe("#005f9e");
    expect(resistorCell.attr("symbolBody/stroke")).toBe("#0072b2");
    expect(resistorCell.attr("refLabel/fill")).toBe("#0072b2");
    expect(resistorCell.prop("ports/groups/pin/attrs/portBody/stroke")).toBe("#0072b2");

    const currentSource = { ...fixtureComponent("currentSource", "Icolor", 220, 120), appearance: { color: "#d55e00" } };
    expect(makeComponentCell(currentSource).attr("symbolMarker/fill")).toBe("#d55e00");

    const plus = { ...fixtureComponent("plus", "SUMcolor", 340, 120), appearance: { color: "#009e73" } };
    expect(makeComponentCell(plus).attr("symbolPinMarks/stroke")).toBe("#009e73");

    const deleted = { ...resistor, temporarilyDeleted: true };
    expect(makeComponentCell(deleted).attr("symbolBody/stroke")).toBe("#8a8a8a");
    expect(makeComponentCell(resistor, { preview: true }).attr("symbolBody/stroke")).toBe("#005f9e");
  });

  it("deep-clones and preserves component colors while copying", () => {
    const selected = { ...fixtureComponent("resistor", "R1", 40, 60), appearance: { color: "#0072b2" } };
    const source = buildCopySource(fixtureDocument({
      netLabels: [],
      junctionAppearances: [],
      components: [selected],
      wires: [],
      notes: [],
      junctionPoints: [],
      junctionKeys: new Set(),

    }));
    selected.appearance.color = "#d55e00";
    expect(source.components[0].appearance).toEqual({ color: "#0072b2" });

    const copyState: CopyState = { source, anchor: { x: 40, y: 60 } };
    const copied = instantiateCopyAt(copyState, { x: 160, y: 180 }, {
      preview: false,
      nextComponentRef: () => "R2",
      createId: () => "Rcopy"
    });
    expect(copied.components[0]).toMatchObject({
      id: "Rcopy",
      ref: "R2",
      x: 160,
      y: 180,
      appearance: { color: "#0072b2" }
    });
  });

  it("exports each component with its own color and no selection highlight", () => {
    const blue = { ...fixtureComponent("resistor", "Rblue", 100, 120), appearance: { color: "#0072b2" } };
    const orange = { ...fixtureComponent("currentSource", "Iorange", 220, 120), appearance: { color: "#d55e00" } };
    const exported = buildSchematicSelectionSvg(fixtureDocument({
      netLabels: [],
      components: [blue, orange],
      wires: [],
      junctionPoints: [],
      notes: [],
      presentationMode: true
    }));

    expect(exported?.svg).toContain('stroke="#0072b2"');
    expect(exported?.svg).toContain('stroke="#d55e00"');
    expect(exported?.svg).toContain('fill="#d55e00"');
    expect(exported?.svg).not.toContain("#005f9e");
  });

  it("normalizes, resets, and rejects invalid wire and junction colors", () => {
    const wire: Wire = {
      id: "w-color",
      points: [{ x: 0, y: 0 }, { x: 80, y: 0 }],
      routeMode: "orthogonal",
      appearance: { variant: "signal" }
    };
    const document: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      notes: [],
      components: [],
      wires: [wire],
      junctions: [{ x: 40, y: 0 }]
    });

    expect(wireCustomColor(wire)).toBeNull();
    expect(setWireColor(wire, " #0072B2 ")).toEqual({ kind: "changed", color: "#0072b2" });
    expect(wire.appearance).toEqual({ variant: "signal", color: "#0072b2" });
    expect(setWireColor(wire, "bad")).toEqual({ kind: "noop", reason: "invalid" });
    expect(setWireColor(wire, DEFAULT_NETWORK_COLOR)).toEqual({ kind: "changed", color: null });
    expect(wire.appearance).toEqual({ variant: "signal" });

    expect(setJunctionColor(document, { x: 39, y: 1 }, " #D55E00 ")).toEqual({
      kind: "changed",
      color: "#d55e00"
    });
    expect(document.junctionAppearances).toEqual([{ point: { x: 40, y: 0 }, color: "#d55e00" }]);
    expect(junctionCustomColor(document, { x: 40, y: 0 })).toBe("#d55e00");
    expect(setJunctionColor(document, { x: 100, y: 0 }, "#0072b2")).toEqual({
      kind: "noop",
      reason: "missing"
    });
    expect(setJunctionColor(document, { x: 40, y: 0 }, "#111111")).toEqual({ kind: "changed", color: null });
    expect(document.junctionAppearances).toEqual([]);
  });

  it("cleans invalid restored colors while retaining normalized custom colors", () => {
    const restored = restoreSchematicDocument(fixtureDocument({

      netLabels: [],
      notes: [],
      components: [],
      wires: [
        {
          id: "valid",
          points: [{ x: 0, y: 0 }, { x: 40, y: 0 }],
          routeMode: "orthogonal",
          appearance: { variant: "signal", color: "#0072B2" }
        },
        {
          id: "invalid",
          points: [{ x: 0, y: 20 }, { x: 40, y: 20 }],
          routeMode: "orthogonal",
          appearance: { variant: "wide", color: "bad" }
        }
      ],
      junctions: [{ x: 40, y: 0 }],
      junctionAppearances: [
        { point: { x: 39, y: 1 }, color: "#D55E00" },
        { point: { x: 80, y: 0 }, color: "bad" },
        { point: { x: 100, y: 0 }, color: DEFAULT_NETWORK_COLOR }
      ]
    }));

    expect(restored.wires.find((wire) => wire.id === "valid")?.appearance).toEqual({
      variant: "signal",
      color: "#0072b2"
    });
    expect(restored.wires.find((wire) => wire.id === "invalid")?.appearance).toEqual({ variant: "wide" });
    expect(restored.junctionAppearances).toEqual([{ point: { x: 40, y: 0 }, color: "#d55e00" }]);
  });

  it("commits network colors through the production batch command", () => {
    const document: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      notes: [],
      components: [],
      wires: [{
        id: "w-op",
        points: [{ x: 0, y: 0 }, { x: 80, y: 0 }],
        routeMode: "orthogonal",
        appearance: { variant: "signal" }
      }],
      junctions: [{ x: 40, y: 0 }]
    });

    expect(executeSchematicPropertyBatchCommand(document, { selectedIds: ["w-op"], selectedNoteIds: [] }, { kind: "ink-color", color: "#0072B2" })).toMatchObject({
      changed: true,
      historyIntent: "push",
    });
    expect(executeSchematicPropertyBatchCommand(document, { selectedIds: ["w-op"], selectedNoteIds: [] }, { kind: "ink-color", color: "#0072b2" })).toMatchObject({
      changed: false,
      historyIntent: "none",
    });
    expect(executeSchematicPropertyBatchCommand(document, { selectedIds: [junctionId({ x: 40, y: 0 })], selectedNoteIds: [] }, { kind: "ink-color", color: "#d55e00" })).toMatchObject({
      changed: true,
      historyIntent: "push",
    });
    expect(document.wires[0].appearance?.color).toBe("#0072b2");
    expect(document.junctionAppearances).toEqual([{ point: { x: 40, y: 0 }, color: "#d55e00" }]);
  });

  it("renders, copies, and exports independent wire and junction colors", () => {
    const wire: Wire = {
      id: "w-render",
      points: [{ x: 0, y: 0 }, { x: 80, y: 0 }],
      routeMode: "orthogonal",
      appearance: { variant: "signal", color: "#0072b2" }
    };
    expect(makeWireCell(wire).attr("line/stroke")).toBe("#0072b2");
    const selectedWire = makeWireCell(wire, { selected: true });
    expect(selectedWire.attr("line/stroke")).toBe("#0072b2");
    expect(selectedWire.attr("line/strokeWidth")).toBe(2);
    expect(selectedWire.attr("selectionHalo/stroke")).toBe("#005f9e");
    expect(selectedWire.attr("selectionHalo/strokeWidth")).toBe(wireSelectionHaloAttrs(wire, { selected: true }).strokeWidth);
    expect(selectedWire.attr("selectionHalo/opacity")).toBe(1);
    expect(makeJunctionCell({ x: 40, y: 0 }, { color: "#d55e00" }).attr("body/fill")).toBe("#d55e00");
    const selectedJunctionAttrs = junctionBodyAttrs({ selected: true, color: "#d55e00" });
    expect(selectedJunctionAttrs.fill).toBe("#d55e00");
    expect(selectedJunctionAttrs.stroke).toBe("#005f9e");
    expect(selectedJunctionAttrs.strokeWidth).toBe(1.5);
    expect(selectedJunctionAttrs.strokeDasharray).toBe("3 3");

    const source = buildCopySource(fixtureDocument({
      netLabels: [],
      components: [],
      wires: [wire],
      notes: [],
      junctionPoints: [{ x: 40, y: 0 }],
      junctionKeys: new Set(["40,0"]),

      junctionAppearances: [{ point: { x: 40, y: 0 }, color: "#d55e00" }]
    }));
    const copied = instantiateCopyAt({ source, anchor: { x: 0, y: 0 } }, { x: 100, y: 100 }, {
      preview: false,
      nextComponentRef: () => "",
      createId: () => "copy-id"
    });
    expect(copied.wires[0].appearance).toEqual({ variant: "signal", color: "#0072b2" });
    expect(copied.junctionAppearances).toEqual([{ point: { x: 140, y: 100 }, color: "#d55e00" }]);

    const exported = buildSchematicSelectionSvg(fixtureDocument({
      netLabels: [],
      components: [],
      wires: [wire],
      junctionPoints: [{ x: 40, y: 0 }],
      junctionColors: { "40,0": "#d55e00" },
      notes: []
    }));
    expect(exported?.svg).toContain('data-wire-id="w-render"');
    expect(exported?.svg).toContain('stroke="#0072b2"');
    expect(exported?.svg).toContain('data-junction="40,0"');
    expect(exported?.svg).toContain('fill="#d55e00"');
    expect(exported?.svg).not.toContain("#005f9e");
  });

  it("moves junction colors with wire geometry and honors already-moved exclusions", () => {
    const document: SchematicDocument = fixtureDocument({

      netLabels: [],
      notes: [],
      components: [],
      wires: [],
      junctions: [{ x: 40, y: 0 }],
      junctionAppearances: [{ point: { x: 40, y: 0 }, color: "#d55e00" }]
    });

    moveJunctionAppearancesWithPath(
      document,
      [{ x: 0, y: 0 }, { x: 100, y: 0 }],
      [{ x: 20, y: 0 }, { x: 120, y: 0 }]
    );
    expect(document.junctionAppearances).toEqual([{ point: { x: 60, y: 0 }, color: "#d55e00" }]);

    moveJunctionAppearancesWithPath(
      document,
      [{ x: 0, y: 0 }, { x: 100, y: 0 }],
      [{ x: 20, y: 0 }, { x: 120, y: 0 }],
      { excludeAppearanceKeys: new Set(["60,0"]) }
    );
    expect(document.junctionAppearances).toEqual([{ point: { x: 60, y: 0 }, color: "#d55e00" }]);
  });
});
