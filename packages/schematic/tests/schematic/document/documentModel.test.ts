import { fixtureDocument } from "../support/fixtureDocument";
import { describe, expect, it } from "vitest";
import { getComponentDef } from "../../../src/schematic/catalog";
import {
  assignRestoredSchematicDocument,
  cloneSchematicDocument,
  createEmptySchematicDocument,
  createSchematicDocument,
  isEmptySchematicDocument,
  rebuildComponentRefCounters,
  restoreSchematicDocument
} from "../../../src/schematic/document/documentModel";
import { createSchematicDocumentHistoryAdapter } from "../support/documentHistory";
import type { SchematicDocument } from "../../../src/schematic/types";
import { fixtureComponent } from "../support/fixtures";

describe("schematic document model", () => {
  it("snaps authored geometry before attaching wire endpoints to pins without mutating the input", () => {
    const input = {
      components: [fixtureComponent("resistor", "R1", 118, 19)],
      wires: [{ id: "wire", routeMode: "orthogonal" as const, points: [{ x: 0, y: 19 }, { x: 78, y: 19 }] }]
    };
    const before = structuredClone(input);
    const document = createSchematicDocument(input);
    expect(document.components[0]).toMatchObject({ x: 120, y: 20 });
    expect(document.wires[0].points).toEqual([{ x: 0, y: 20 }, { x: 80, y: 20 }]);
    expect(document.connections.wires.wire.at(-1)).toBe(document.connections.pins.R1.p);
    expect(input).toEqual(before);
  });

  it("creates the ordinary empty schematic document shape", () => {
    expect(createEmptySchematicDocument()).toEqual(fixtureDocument({
      junctionAppearances: [],
      components: [],
      wires: [],
      junctions: [],

      netLabels: [],
      notes: []
    }));
  });

  it("distinguishes a blank schematic from persisted document content", () => {
    const empty = createEmptySchematicDocument();
    expect(isEmptySchematicDocument(empty)).toBe(true);

    expect(isEmptySchematicDocument({
      ...empty,
      components: [fixtureComponent("resistor", "R1", 20, 20)]
    })).toBe(false);
    expect(isEmptySchematicDocument({
      ...empty,
      junctionAppearances: [{ point: { x: 20, y: 20 }, color: "#0072b2" }]
    })).toBe(false);
    expect(isEmptySchematicDocument({
      ...empty,
      notes: [{
        id: "note-1",
        x: 20,
        y: 20,
        width: 320,
        text: "Visible note",
        format: "plain"
      }]
    })).toBe(false);
  });

  it("deep clones schematic documents", () => {
    const original: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      notes: [],
      components: [
        {
          id: "R1",
          type: "resistor",
          ref: "R1",
          x: 40,
          y: 0,
          rotation: 0,
          mirrored: false,
          values: { main: "R1" }
        }
      ],
      wires: [],
      junctions: []
    });

    const cloned = cloneSchematicDocument(original);
    cloned.components[0].ref = "R2";

    expect(original.components[0].ref).toBe("R1");
    expect(cloned.components[0].ref).toBe("R2");
  });

  it("normalizes restored notes and component variants without mutating the source", () => {
    const source: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      components: [
        {
          id: "M1",
          type: "nmos",
          variantId: "invalid",
          ref: "M1",
          x: 0,
          y: 0,
          rotation: 0,
          mirrored: false,
          values: {}
        }
      ],
      wires: [],
      junctions: [],
      notes: [
        {
          id: "markdown-note",
          x: 20,
          y: 20,
          width: 80,
          format: "markdown",
          text: "**gain**"
        },
        {
          id: "no-fill-note",
          x: 40,
          y: 40,
          width: 120,
          format: "plain",
          text: "transparent",
          backgroundColor: null
        }
      ]
    });

    const restored = restoreSchematicDocument(source);

    expect(restored.components[0].variantId).toBe(getComponentDef("nmos").defaultVariantId);
    expect(restored.components[0].values).toEqual({});
    expect(source.components[0].variantId).toBe("invalid");
    expect(source.components[0].values).toEqual({});
    expect(restored.notes[0]).toMatchObject({ format: "markdown", text: "**gain**" });
    expect(restored.notes[1].backgroundColor).toBeNull();

    expect(restored.netLabels).toEqual([]);
  });

  it("normalizes restored wires without mutating the source", () => {
    const source: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      notes: [],
      components: [
        {
          id: "Rsplit",
          type: "resistor",
          ref: "Rsplit",
          x: 40,
          y: 0,
          rotation: 0,
          mirrored: false,
          values: { main: "Rsplit" }
        }
      ],
      wires: [
        {
          id: "w-legacy",
          points: [
            { x: 0, y: 0 },
            { x: 160, y: 0 }
          ],
          routeMode: "orthogonal"
        }
      ],
      junctions: []
    });
    const target = createEmptySchematicDocument();

    const restored = restoreSchematicDocument(source);
    assignRestoredSchematicDocument(target, source);

    expect(source.wires).toHaveLength(1);
    expect(restored.wires.map((wire) => wire.id)).toEqual(["w-legacy", "w-legacy-segment-1"]);
    expect(restored.wires[0].points).toEqual([
      { x: 0, y: 0 },
      { x: 80, y: 0 }
    ]);
    expect(restored.wires[1].points).toEqual([
      { x: 80, y: 0 },
      { x: 160, y: 0 }
    ]);
    expect(target.wires).toEqual(restored.wires);
  });

  it("restores wire decorations while canonicalizing invalid marker values", () => {
    const source = createEmptySchematicDocument();
    source.wires.push({
      id: "decorated",
      routeMode: "orthogonal",
      points: [{ x: 0, y: 0 }, { x: 80, y: 0 }],
      appearance: {
        variant: "wide",
        color: " #0072B2 ",
        lineWidth: "2a",
        startMarker: "arrow",
        endMarker: "invalid" as "circle",
        digitalSlash: true,
        digitalLabel: ""
      }
    });

    const restored = restoreSchematicDocument(source);

    expect(restored.wires[0].appearance).toEqual({
      variant: "wide",
      color: "#0072b2",
      lineWidth: "2a",
      startMarker: "arrow",
      digitalSlash: true,
      digitalLabel: ""
    });
    expect(source.wires[0].appearance?.color).toBe(" #0072B2 ");
    expect(source.wires[0].appearance?.endMarker).toBe("invalid");
  });

  it("normalizes component colors and drops invalid or redundant appearances", () => {
    const custom = { ...fixtureComponent("resistor", "R1", 0, 0), appearance: { color: "  #AaBbCc  " } };
    const invalid = { ...fixtureComponent("capacitor", "C1", 80, 0), appearance: { color: "red" } };
    const defaultBlack = { ...fixtureComponent("inductor", "L1", 160, 0), appearance: { color: "#111111" } };
    const source: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      notes: [], components: [custom, invalid, defaultBlack], wires: [], junctions: [] });

    const restored = restoreSchematicDocument(source);

    expect(restored.components[0].appearance).toEqual({ color: "#aabbcc" });
    expect(restored.components[1].appearance).toBeUndefined();
    expect(restored.components[2].appearance).toBeUndefined();
    expect(source.components[0].appearance).toEqual({ color: "  #AaBbCc  " });
    expect(source.components[1].appearance).toEqual({ color: "red" });
  });

  it("derives component ref counters from restored document refs", () => {
    const counters = rebuildComponentRefCounters(fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      notes: [],
      components: [
        {
          id: "R12",
          type: "resistor",
          ref: "R12",
          x: 0,
          y: 0,
          rotation: 0,
          mirrored: false,
          values: { main: "R12" }
        },
        {
          id: "C3",
          type: "capacitor",
          ref: "C3",
          x: 0,
          y: 40,
          rotation: 0,
          mirrored: false,
          values: { main: "C3" }
        },
        {
          id: "custom",
          type: "resistor",
          ref: "Rcustom",
          x: 0,
          y: 80,
          rotation: 0,
          mirrored: false,
          values: { main: "Rcustom" }
        }
      ],
      wires: [],
      junctions: []
    }));

    expect(counters.get("R")).toBe(12);
    expect(counters.get("C")).toBe(3);
  });

  it("keeps schematic document history snapshots isolated from caller mutation", () => {
    const initial = createEmptySchematicDocument();
    const history = createSchematicDocumentHistoryAdapter(initial);
    const next: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      notes: [],
      components: [
        {
          id: "R1",
          type: "resistor",
          ref: "R1",
          x: 40,
          y: 0,
          rotation: 0,
          mirrored: false,
          values: { main: "R1" }
        }
      ],
      wires: [],
      junctions: []
    });

    history.push(next);
    next.components[0].ref = "Rmutated";

    expect(history.undo()?.components).toEqual([]);
    const redone = history.redo();
    expect(redone?.components[0].ref).toBe("R1");
  });

  it("does not normalize ordinary pushed history snapshots", () => {
    const history = createSchematicDocumentHistoryAdapter(createEmptySchematicDocument());
    const snapshot: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      components: [
        {
          id: "M1",
          type: "nmos",
          variantId: "missing-variant",
          ref: "M1",
          x: 40,
          y: 40,
          rotation: 0,
          mirrored: false,
          values: { main: "M1" }
        }
      ],
      wires: [],
      junctions: [],
      notes: [{ id: "markdown-note", x: 0, y: 0, width: 80, format: "markdown", text: "history note" }]
    });

    expect(history.push(snapshot)).toBe(true);
    expect(history.undo()?.components).toEqual([]);
    const redone = history.redo();
    expect(redone?.components[0].variantId).toBe("missing-variant");
    expect(redone?.notes[0]).toMatchObject({ format: "markdown", text: "history note" });
  });

  it("keeps reset as an undoable and redoable empty document snapshot", () => {
    const beforeReset: SchematicDocument = fixtureDocument({
      junctionAppearances: [],
      netLabels: [],
      components: [
        {
          id: "R1",
          type: "resistor",
          ref: "R1",
          x: 40,
          y: 0,
          rotation: 0,
          mirrored: false,
          values: { main: "R1" }
        }
      ],
      wires: [
        {
          id: "w1",
          points: [
            { x: 40, y: 0 },
            { x: 80, y: 0 }
          ],
          routeMode: "orthogonal"
        }
      ],
      junctions: [{ x: 80, y: 0 }],

      notes: [{ id: "note-1", x: 20, y: 40, width: 160, format: "plain", text: "before reset" }]
    }, { joinAt: [{ x: 80, y: 0 }] });
    const history = createSchematicDocumentHistoryAdapter(beforeReset);
    const empty = createEmptySchematicDocument();

    expect(history.push(empty)).toBe(true);

    const restored = history.undo();
    expect(restored?.components).toEqual(beforeReset.components);
    expect(restored?.wires).toEqual(beforeReset.wires);
    expect(restored?.notes).toEqual(beforeReset.notes);
    expect(history.redo()).toEqual(empty);
  });

  it("keeps workspace restore as the undo baseline for a reset", () => {
    const workspaceDocument: SchematicDocument = fixtureDocument({
      junctionAppearances: [],
      netLabels: [],
      components: [
        {
          id: "R7",
          type: "resistor",
          ref: "R7",
          x: 40,
          y: 0,
          rotation: 0,
          mirrored: false,
          values: { main: "R7" }
        },
        {
          id: "M2",
          type: "nmos",
          variantId: "missing-variant",
          ref: "M2",
          x: 120,
          y: 40,
          rotation: 0,
          mirrored: false,
          values: { main: "M2" }
        }
      ],
      wires: [
        {
          id: "w1",
          points: [
            { x: 40, y: 0 },
            { x: 80, y: 0 },
            { x: 80, y: 40 }
          ],
          routeMode: "orthogonal"
        }
      ],
      junctions: [{ x: 80, y: 0 }],

      notes: [
        {
          id: "markdown-note",
          x: 20,
          y: 80,
          width: 160,
          format: "markdown",
          text: "restore note"
        }
      ]
    }, { joinAt: [{ x: 80, y: 0 }] });
    const liveDocument = createEmptySchematicDocument();
    const history = createSchematicDocumentHistoryAdapter(liveDocument);

    assignRestoredSchematicDocument(liveDocument, restoreSchematicDocument(workspaceDocument));
    history.resetBaseline(liveDocument);
    const restoredBaseline = cloneSchematicDocument(liveDocument);

    assignRestoredSchematicDocument(liveDocument, createEmptySchematicDocument());
    expect(history.push(liveDocument)).toBe(true);

    expect(history.undo()).toEqual(restoredBaseline);
    expect(history.redo()).toEqual(createEmptySchematicDocument());
    expect(restoredBaseline.notes[0]).toMatchObject({ format: "markdown", text: "restore note" });
    expect(restoredBaseline.components[1].variantId).toBe(getComponentDef("nmos").defaultVariantId);
  });
});
