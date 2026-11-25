import { describe, expect, it } from "vitest";
import {
  buildSchematicSelectionStatus,
  buildSchematicSelectionSummary,
  labelSchematicSelectionItem,
  labelSchematicSelectionNote,
  type SchematicSelectionContents,
  type SchematicSelectionSummarySelectionItem
} from "../../../src/schematic/selection/selectionSummary";

const emptySelection: SchematicSelectionContents = { items: [], notes: [] };

function component(ref: string, temporarilyDeleted = false): SchematicSelectionSummarySelectionItem {
  return { kind: "component", component: { ref, temporarilyDeleted } };
}

function wire(variant: "signal" | "wide" = "signal", temporarilyDeleted = false): SchematicSelectionSummarySelectionItem {
  return { kind: "wire", wire: { appearance: { variant }, temporarilyDeleted } };
}

function junction(x: number, y: number): SchematicSelectionSummarySelectionItem {
  return { kind: "junction", point: { x, y } };
}

describe("schematic selection summary", () => {
  it("returns empty selection summary and status text", () => {
    expect(buildSchematicSelectionSummary({ mode: "select", selection: emptySelection })).toEqual({
      kind: "plain",
      text: "No object selected."
    });
    expect(buildSchematicSelectionStatus({ selection: emptySelection, moveBehavior: "stretch" })).toBe("Selection cleared.");
  });

  it("labels components, wires, junctions, notes, and temporary deletion state", () => {
    expect(labelSchematicSelectionItem(component("R1"))).toBe("R1");
    expect(labelSchematicSelectionItem(component("C1", true))).toBe("C1 (temp deleted)");
    expect(labelSchematicSelectionItem(wire())).toBe("wire");
    expect(labelSchematicSelectionItem(wire("wide"))).toBe("wide wire");
    expect(labelSchematicSelectionItem(wire("wide", true))).toBe("wide wire (temp deleted)");
    expect(labelSchematicSelectionItem(junction(80, -20))).toBe("junction (80, -20)");
    expect(labelSchematicSelectionNote({ x: 120, y: 40 })).toBe("note (120, 40)");
  });

  it("builds selected object summaries as structured parts", () => {
    expect(
      buildSchematicSelectionSummary({
        mode: "select",
        selection: {
          items: [component("R1"), wire("wide", true), junction(40, 60)],
          notes: [{ x: 200, y: 100 }]
        }
      })
    ).toEqual({
      kind: "labeled",
      title: "Selected:",
      separator: "comma",
      parts: [{ text: "R1" }, { text: "wide wire (temp deleted)" }, { text: "junction (40, 60)" }, { text: "note (200, 100)" }]
    });
  });

  it("pluralizes selection status counts and switches move suffixes", () => {
    expect(
      buildSchematicSelectionStatus({
        selection: { items: [component("R1"), wire(), junction(0, 0)], notes: [{ x: 20, y: 20 }] },
        moveBehavior: "stretch"
      })
    ).toBe("Selected R1, 1 wire, 1 junction, 1 note. M/stretch move pulls attached wires; Shift-click adds; Ctrl-click deselects.");

    expect(
      buildSchematicSelectionStatus({
        selection: { items: [wire(), wire("wide"), junction(0, 0), junction(20, 20)], notes: [{ x: 20, y: 20 }, { x: 40, y: 40 }] },
        moveBehavior: "moveOnly"
      })
    ).toBe("Selected 2 wires, 2 junctions, 2 notes. Shift+M/move-only leaves attached wires in place; Shift-click adds; Ctrl-click deselects.");
  });

  it("builds placement tool summaries for invalid, component, and template targets", () => {
    expect(buildSchematicSelectionSummary({ mode: "place", selection: emptySelection, placement: { kind: "invalid" } })).toEqual({
      kind: "labeled",
      title: "Placing:",
      separator: "space",
      parts: [{ text: "type a valid component or template name", muted: true }]
    });
    expect(
      buildSchematicSelectionSummary({
        mode: "place",
        selection: emptySelection,
        placement: { kind: "component", hotLabel: "R", label: "Resistor" }
      })
    ).toEqual({
      kind: "labeled",
      title: "Placing:",
      separator: "space",
      parts: [{ text: "R" }, { text: "Resistor", muted: true }]
    });
    expect(
      buildSchematicSelectionSummary({
        mode: "place",
        selection: emptySelection,
        placement: { kind: "template", id: "diff-pair-template" }
      })
    ).toEqual({
      kind: "labeled",
      title: "Placing:",
      separator: "space",
      parts: [{ text: "diff-pair-template" }, { text: "template", muted: true }]
    });
  });

  it("builds wire, copy, delete, and temporary-delete tool summaries", () => {
    expect(buildSchematicSelectionSummary({ mode: "wire", selection: emptySelection, wire: { variant: "signal", routePointCount: 0 } })).toEqual({
      kind: "labeled",
      title: "Tool:",
      separator: "space",
      parts: [{ text: "Wire" }, { text: "waiting for start", muted: true }]
    });
    expect(buildSchematicSelectionSummary({ mode: "wire", selection: emptySelection, wire: { variant: "wide", routePointCount: 2 } })).toEqual({
      kind: "labeled",
      title: "Tool:",
      separator: "space",
      parts: [{ text: "Wide wire" }, { text: "2 route points", muted: true }]
    });
    expect(buildSchematicSelectionSummary({ mode: "copy", selection: emptySelection, copy: { hasSource: false } })).toEqual({
      kind: "labeled",
      title: "Tool:",
      separator: "space",
      parts: [{ text: "Copy" }, { text: "click an object or drag a box", muted: true }]
    });
    expect(buildSchematicSelectionSummary({ mode: "move", selection: emptySelection, move: { behavior: "moveOnly", hasSource: false } })).toEqual({
      kind: "labeled",
      title: "Tool:",
      separator: "space",
      parts: [{ text: "Move only" }, { text: "click an object or drag a box", muted: true }]
    });
    expect(buildSchematicSelectionSummary({ mode: "copy", selection: emptySelection, copy: { hasSource: true } })).toEqual({
      kind: "labeled",
      title: "Tool:",
      separator: "space",
      parts: [{ text: "Copy" }, { text: "click to place", muted: true }]
    });
    expect(buildSchematicSelectionSummary({ mode: "delete", selection: emptySelection })).toEqual({
      kind: "labeled",
      title: "Tool:",
      separator: "space",
      parts: [{ text: "Delete" }, { text: "click or drag a box", muted: true }]
    });
    expect(buildSchematicSelectionSummary({ mode: "temp-delete", selection: emptySelection })).toEqual({
      kind: "labeled",
      title: "Tool:",
      separator: "space",
      parts: [{ text: "Temporary Delete" }, { text: "click or drag a box", muted: true }]
    });
  });
});
