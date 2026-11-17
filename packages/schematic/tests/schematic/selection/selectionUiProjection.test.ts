import { fixtureDocument } from "../support/fixtureDocument";
import { describe, expect, it } from "vitest";
import { junctionId } from "../../../src/schematic/renderer";
import { setMixedSelection } from "../../../src/schematic/selection/selectionModel";
import { projectSchematicSelection } from "../../../src/schematic/selection/selectionProjection";
import {
  buildSchematicSelectionUiProjection,
  type SchematicSelectionUiProjectionInput
} from "../../../src/schematic/selection/selectionUiProjection";
import type {
  SchematicSelectionContents,
  SchematicSelectionSummarySelectionItem
} from "../../../src/schematic/selection/selectionSummary";
import type {
  ComponentInstance,
  SchematicNote,
  Wire
} from "../../../src/schematic/types";
import {
  emptyDoc,
  fixtureComponent,
  fixtureNote,
  fixtureWire
} from "../support/fixtures";

const emptySelection: SchematicSelectionContents = { items: [], notes: [] };
const stretchSuffix = "M/stretch move pulls attached wires; Shift-click adds; Ctrl-click deselects.";
const moveOnlySuffix = "Shift+M/move-only leaves attached wires in place; Shift-click adds; Ctrl-click deselects.";
const uniform = <T>(value: T) => ({ state: "uniform" as const, value });
const mixed = { state: "mixed" as const };

type ProjectionOverrides = Partial<
  Omit<SchematicSelectionUiProjectionInput, "propertyPanel" | "wire" | "copy">
> & {
  propertyPanel?: Partial<SchematicSelectionUiProjectionInput["propertyPanel"]>;
  wire?: Partial<SchematicSelectionUiProjectionInput["wire"]>;
  copy?: Partial<SchematicSelectionUiProjectionInput["copy"]>;
};

function emptyPropertyTargets() {
  return fixtureDocument({
    components: [],
    wires: [],
    junctionPoints: [],
    netLabels: [],
    notes: []
  });
}

function projection(overrides: ProjectionOverrides = {}) {
  const { propertyPanel, wire, copy, ...rest } = overrides;
  return buildSchematicSelectionUiProjection({
    mode: "select",
    selection: emptySelection,
    activePlacementItem: null,
    moveBehavior: "stretch",
    ...rest,
    propertyPanel: {
      document: emptyDoc(),
      targets: emptyPropertyTargets(),
      hasSelection: false,
      ...propertyPanel
    },
    wire: {
      variant: "signal",
      routePointCount: 0,
      ...wire
    },
    copy: {
      hasSource: false,
      ...copy
    }
  });
}

function componentItem(
  component: ComponentInstance
): SchematicSelectionSummarySelectionItem {
  return { kind: "component", component };
}

function wireItem(wire: Wire): SchematicSelectionSummarySelectionItem {
  return { kind: "wire", wire };
}

function junctionItem(
  x: number,
  y: number
): SchematicSelectionSummarySelectionItem {
  return { kind: "junction", point: { x, y } };
}

function unknownItem(id: string): SchematicSelectionSummarySelectionItem {
  return { kind: "unknown", id };
}

describe("schematic selection UI projection", () => {
  it("projects empty selection panel, summary, and status", () => {
    expect(projection()).toEqual({
      selection: emptySelection,
      propertyPanel: { hasSelection: false },
      summary: { kind: "plain", text: "No object selected." },
      status: "Selection cleared."
    });
  });

  it("projects a selected component through the aggregate property panel", () => {
    const component = fixtureComponent("resistor", "R1", 40, 40);
    const document = { ...emptyDoc(), components: [component] };
    const selection: SchematicSelectionContents = {
      items: [componentItem(component)],
      notes: []
    };

    const result = projection({
      selection,
      propertyPanel: {
        document,
        targets: { ...emptyPropertyTargets(), components: [component] },
        hasSelection: true
      }
    });

    expect(result.selection).toBe(selection);
    expect(result.propertyPanel.component).toMatchObject({
      cellType: uniform("resistor"),
      ref: uniform("R1"),
      labelVisible: uniform(true),
      color: uniform(null),
      value: {
        label: "Resistance",
        value: uniform("R1"),
        placeholder: "1k"
      },
      variants: {
        options: [
          { id: "fixed", label: "Fixed" },
          { id: "variable", label: "Variable" }
        ],
        value: uniform("fixed")
      }
    });
    expect(result.summary).toEqual({
      kind: "labeled",
      title: "Selected:",
      separator: "comma",
      parts: [{ text: "R1" }]
    });
    expect(result.status).toBe(`Selected R1. ${stretchSuffix}`);
  });

  it("keeps multi-component summary and mixed properties in one projection", () => {
    const first = fixtureComponent("switch", "S1", 40, 40);
    const second = fixtureComponent("switch", "S2", 140, 40);
    second.variantId = "closed";
    second.values.labelVisible = "false";
    const document = { ...emptyDoc(), components: [first, second] };
    const selection: SchematicSelectionContents = {
      items: [componentItem(first), componentItem(second)],
      notes: []
    };

    const result = projection({
      selection,
      propertyPanel: {
        document,
        targets: {
          ...emptyPropertyTargets(),
          components: [first, second]
        },
        hasSelection: true
      }
    });

    expect(result.propertyPanel.component).toMatchObject({
      ref: mixed,
      labelVisible: mixed,
      variants: { value: mixed }
    });
    expect(result.summary).toEqual({
      kind: "labeled",
      title: "Selected:",
      separator: "comma",
      parts: [{ text: "S1" }, { text: "S2" }]
    });
    expect(result.status).toBe(`Selected S1, S2. ${stretchSuffix}`);
  });

  it("projects a selected Note while preserving its summary", () => {
    const note = {
      ...fixtureNote("note-1", 120, 160),
      format: "markdown" as const,
      width: 333
    };
    const document = { ...emptyDoc(), notes: [note] };
    const selection: SchematicSelectionContents = { items: [], notes: [note] };

    const result = projection({
      selection,
      propertyPanel: {
        document,
        targets: { ...emptyPropertyTargets(), notes: [note] },
        hasSelection: true
      }
    });

    expect(result.propertyPanel).toEqual({
      hasSelection: true,
      note: {
        backgroundColor: uniform("#fff6bf"),
        fontSizePx: uniform(14),
        format: uniform("markdown"),
        widthPx: uniform(340)
      }
    });
    expect(result.summary).toEqual({
      kind: "labeled",
      title: "Selected:",
      separator: "comma",
      parts: [{ text: "note (120, 160)" }]
    });
    expect(result.status).toBe(`Selected 1 note. ${stretchSuffix}`);
  });

  it("keeps unsupported mixed selections selected without inventing properties", () => {
    const component = fixtureComponent("resistor", "R1", 40, 40);
    const note: SchematicNote = fixtureNote("note-1", 160, 180);
    const wire = fixtureWire(
      "w1",
      [{ x: 0, y: 0 }, { x: 40, y: 0 }],
      { variant: "wide" }
    );
    const document = fixtureDocument({
      ...emptyDoc(),
      components: [component],
      wires: [wire],
      junctions: [{ x: 20, y: 0 }],
      notes: [note]
    });
    const selection: SchematicSelectionContents = {
      items: [
        wireItem(wire),
        junctionItem(20, 0),
        unknownItem("missing-id"),
        componentItem(component)
      ],
      notes: [note]
    };

    const result = projection({
      selection,
      propertyPanel: {
        document,
        targets: fixtureDocument({
          components: [component],
          wires: [wire],
          junctionPoints: [{ x: 20, y: 0 }],
          netLabels: [],
          notes: [note]
        }),
        hasSelection: true
      },
      moveBehavior: "moveOnly"
    });

    expect(result.propertyPanel).toEqual({ hasSelection: true });
    expect(result.summary).toEqual({
      kind: "labeled",
      title: "Selected:",
      separator: "comma",
      parts: [
        { text: "wide wire" },
        { text: "junction (20, 0)" },
        { text: "missing-id" },
        { text: "R1" },
        { text: "note (160, 180)" }
      ]
    });
    expect(result.status).toBe(
      `Selected R1, missing-id, 1 wire, 1 junction, 1 note. ${moveOnlySuffix}`
    );
  });

  it("preserves stale and unknown ids from selection summary contents", () => {
    const document = {
      ...emptyDoc(),
      components: [fixtureComponent("resistor", "R1", 40, 40)]
    };
    const selection = projectSchematicSelection(
      document,
      setMixedSelection(
        ["missing-id", junctionId({ x: 999, y: 888 })],
        []
      )
    ).summaryContents;

    const result = projection({
      selection,
      propertyPanel: { document, hasSelection: true }
    });

    expect(result.selection.items).toEqual([
      { kind: "unknown", id: "missing-id" },
      { kind: "junction", point: { x: 1000, y: 890 } }
    ]);
    expect(result.summary).toEqual({
      kind: "labeled",
      title: "Selected:",
      separator: "comma",
      parts: [
        { text: "missing-id" },
        { text: "junction (1000, 890)" }
      ]
    });
    expect(result.status).toBe(
      `Selected missing-id, 1 junction. ${stretchSuffix}`
    );
  });

  it("projects place, wire, copy, delete, and temporary-delete summaries", () => {
    expect(projection({ mode: "place" }).summary).toEqual({
      kind: "labeled",
      title: "Placing:",
      separator: "space",
      parts: [
        {
          text: "type a valid component or template name",
          muted: true
        }
      ]
    });
    expect(projection({
      mode: "place",
      activePlacementItem: "resistor"
    }).summary).toEqual({
      kind: "labeled",
      title: "Placing:",
      separator: "space",
      parts: [{ text: "resistor" }, { text: "R", muted: true }]
    });
    expect(projection({
      mode: "place",
      activePlacementItem: "common_source_nmos"
    }).summary).toEqual({
      kind: "labeled",
      title: "Placing:",
      separator: "space",
      parts: [
        { text: "common_source_nmos" },
        { text: "template", muted: true }
      ]
    });
    expect(projection({
      mode: "wire",
      wire: { variant: "signal", routePointCount: 0 }
    }).summary).toEqual({
      kind: "labeled",
      title: "Tool:",
      separator: "space",
      parts: [
        { text: "Wire" },
        { text: "waiting for start", muted: true }
      ]
    });
    expect(projection({
      mode: "wire",
      wire: { variant: "wide", routePointCount: 2 }
    }).summary).toEqual({
      kind: "labeled",
      title: "Tool:",
      separator: "space",
      parts: [
        { text: "Wide wire" },
        { text: "2 route points", muted: true }
      ]
    });
    expect(projection({
      mode: "copy",
      copy: { hasSource: false }
    }).summary).toEqual({
      kind: "labeled",
      title: "Tool:",
      separator: "space",
      parts: [
        { text: "Copy" },
        { text: "click an object", muted: true }
      ]
    });
    expect(projection({
      mode: "copy",
      copy: { hasSource: false, awaitingReference: true }
    }).summary).toEqual({
      kind: "labeled",
      title: "Tool:",
      separator: "space",
      parts: [
        { text: "Copy" },
        { text: "click reference", muted: true }
      ]
    });
    expect(projection({
      mode: "copy",
      copy: { hasSource: true }
    }).summary).toEqual({
      kind: "labeled",
      title: "Tool:",
      separator: "space",
      parts: [
        { text: "Copy" },
        { text: "click to place", muted: true }
      ]
    });
    expect(projection({ mode: "delete" }).summary).toEqual({
      kind: "labeled",
      title: "Tool:",
      separator: "space",
      parts: [
        { text: "Delete" },
        { text: "click or drag a box", muted: true }
      ]
    });
    expect(projection({ mode: "temp-delete" }).summary).toEqual({
      kind: "labeled",
      title: "Tool:",
      separator: "space",
      parts: [
        { text: "Temporary Delete" },
        { text: "click or drag a box", muted: true }
      ]
    });
  });
});
