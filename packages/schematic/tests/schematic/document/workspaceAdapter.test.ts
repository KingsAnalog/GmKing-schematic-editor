import { fixtureDocument } from "../support/fixtureDocument";
import { describe, expect, it } from "vitest";
import {
  type SchematicDocumentState,
  type WorkspaceStorage
} from "../../../src/shared/workspaceState";
import {
  createSchematicDocumentSnapshot,
  persistSchematicDocumentSnapshot,
  projectSchematicDocumentRestore,
  readSchematicDocumentSnapshot,
  removeSchematicDocumentSnapshot,
  SCHEMATIC_DOCUMENT_SNAPSHOT_FORMAT,
  SCHEMATIC_DOCUMENT_STORAGE_PREFIX
} from "../../../src/schematic/workspaceAdapter";
import type { AnalysisPortSelection, SchematicDocument } from "../../../src/schematic/types";

function memoryStorage(seed: Record<string, string> = {}): WorkspaceStorage & { values: Map<string, string> } {
  const values = new Map(Object.entries(seed));
  return {
    values,
    get length() {
      return values.size;
    },
    key: (index: number) => [...values.keys()][index] ?? null,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key)
  };
}

function resistorDocument(ref = "R1"): SchematicDocument {
  return fixtureDocument({

    junctionAppearances: [],
    netLabels: [],
    notes: [],
    components: [{
      id: ref,
      type: "resistor",
      ref,
      x: 40,
      y: 0,
      rotation: 0,
      mirrored: false,
      values: { main: ref }
    }],
    wires: [],
    junctions: []
  });
}

function analysisSelection(inputP = "n1"): AnalysisPortSelection {
  return { inputP, inputN: "0", outputP: "n2", outputN: "0" };
}

function persistedSnapshotState(state: SchematicDocumentState) {
  if (!state.document) return { ...state };
  const { junctions: _derivedJunctions, ...content } = state.document;
  return { ...state, document: content };
}

describe("schematic workspace adapter", () => {
  it("creates workspace snapshots without aliasing document or view state", () => {
    const document = resistorDocument();
    const selection = analysisSelection();
    const viewTranslate = { x: 120, y: 80 };
    const snapshot = createSchematicDocumentSnapshot(document, {
      analysisSelection: selection,
      zoom: 1.5,
      viewTranslate,
      presentationMode: true
    });

    document.components[0].ref = "Rmutated";
    selection.inputP = "changed";
    viewTranslate.x = 999;
    snapshot.document!.components[0].values.main = "snapshot-mutated";

    expect(document.components[0].values.main).toBe("R1");
    expect(snapshot.document?.components[0].ref).toBe("R1");
    expect(snapshot.analysisSelection?.inputP).toBe("n1");
    expect(snapshot.viewTranslate).toEqual({ x: 120, y: 80 });
    expect(snapshot.zoom).toBe(1.5);
    expect(snapshot.presentationMode).toBe(true);
  });

  it("writes and reads document snapshots only through the current envelope", () => {
    const storage = memoryStorage();
    const snapshot = createSchematicDocumentSnapshot(resistorDocument("R2"), {
      analysisSelection: analysisSelection("vin"),
      zoom: 1.25,
      viewTranslate: { x: 30, y: 50 },
      presentationMode: true
    });

    persistSchematicDocumentSnapshot("versioned-sheet", snapshot, storage);

    expect(JSON.parse(storage.getItem(`${SCHEMATIC_DOCUMENT_STORAGE_PREFIX}versioned-sheet`)!)).toEqual({
      format: SCHEMATIC_DOCUMENT_SNAPSHOT_FORMAT,
      state: persistedSnapshotState(snapshot)
    });
    const restored = readSchematicDocumentSnapshot("versioned-sheet", storage);
    expect(restored).toMatchObject(snapshot);
    expect(restored?.document?.components[0].variantId).toBe("fixed");
  });

  it("omits derived junctions from storage and rebuilds them on restore", () => {
    const storage = memoryStorage();
    const document: SchematicDocument = fixtureDocument({
      components: [],
      wires: [{
        id: "horizontal",
        routeMode: "orthogonal",
        points: [{ x: 0, y: 0 }, { x: 80, y: 0 }]
      }, {
        id: "branch",
        routeMode: "orthogonal",
        points: [{ x: 40, y: -40 }, { x: 40, y: 0 }]
      }],
      junctions: [{ x: 999, y: 999 }],

      junctionAppearances: [],
      netLabels: [],
      notes: []
    });
    const snapshot = createSchematicDocumentSnapshot(document, {
      analysisSelection: analysisSelection(),
      zoom: 1,
      viewTranslate: { x: 0, y: 0 },
      presentationMode: false
    });

    persistSchematicDocumentSnapshot("derived-topology", snapshot, storage);

    const raw = JSON.parse(storage.getItem(`${SCHEMATIC_DOCUMENT_STORAGE_PREFIX}derived-topology`)!);
    expect(raw.state.document).not.toHaveProperty("junctions");
    expect(readSchematicDocumentSnapshot("derived-topology", storage)?.document?.junctions)
      .toEqual([{ x: 40, y: 0 }]);
  });

  it("rejects obsolete stored fields before any document normalization", () => {
    const storage = memoryStorage();
    persistSchematicDocumentSnapshot("strict-schema", { document: resistorDocument("R1") }, storage);
    const key = `${SCHEMATIC_DOCUMENT_STORAGE_PREFIX}strict-schema`;
    const stored = JSON.parse(storage.getItem(key)!);
    stored.state.document.junctionIntents = [];
    storage.setItem(key, JSON.stringify(stored));
    expect(readSchematicDocumentSnapshot("strict-schema", storage)).toBeUndefined();
  });

  it("does not share cached document snapshots between storage instances", () => {
    const firstStorage = memoryStorage();
    const secondStorage = memoryStorage();
    persistSchematicDocumentSnapshot("shared-id", createSchematicDocumentSnapshot(resistorDocument("Rfirst"), {
      analysisSelection: analysisSelection(),
      zoom: 1,
      viewTranslate: { x: 0, y: 0 },
      presentationMode: false
    }), firstStorage);

    expect(readSchematicDocumentSnapshot("shared-id", firstStorage)?.document?.components[0].ref).toBe("Rfirst");
    expect(readSchematicDocumentSnapshot("shared-id", secondStorage)).toBeUndefined();
  });

  it("removes the latest document snapshot key", () => {
    const id = "removed-sheet";
    const storage = memoryStorage();
    persistSchematicDocumentSnapshot(id, { zoom: 2 }, storage);

    removeSchematicDocumentSnapshot(id, storage);

    expect(storage.getItem(`${SCHEMATIC_DOCUMENT_STORAGE_PREFIX}${id}`)).toBeNull();
    expect(readSchematicDocumentSnapshot(id, storage)).toBeUndefined();
  });

  it("projects workspace restore defaults and clamps zoom", () => {
    expect(projectSchematicDocumentRestore(undefined, {
      minZoom: 0.25,
      maxZoom: 4,
      defaultView: { zoom: 2, translate: { x: 9, y: -3 } }
    })).toEqual({
      presentationMode: false,
      view: { zoom: 2, translate: { x: 9, y: -3 } }
    });

    expect(projectSchematicDocumentRestore(
      { zoom: 100, viewTranslate: { x: 12, y: -8 }, presentationMode: true },
      { minZoom: 0.25, maxZoom: 4 }
    )).toEqual({
      presentationMode: true,
      view: { zoom: 4, translate: { x: 12, y: -8 } }
    });
    expect(projectSchematicDocumentRestore({ zoom: 0.1 }, { minZoom: 0.25, maxZoom: 4 }).view.zoom).toBe(0.25);
  });

  it("preserves optional document and analysis fields without aliasing restore projection", () => {
    const document = resistorDocument("R7");
    const selection = analysisSelection("vin");
    const state = {
      document,
      analysisSelection: selection,
      zoom: 1.5,
      viewTranslate: { x: 14, y: 28 },
      presentationMode: true
    };

    const projection = projectSchematicDocumentRestore(state, { minZoom: 0.25, maxZoom: 4 });
    projection.document!.components[0].ref = "Rchanged";
    projection.analysisSelection!.inputP = "changed";
    projection.view.translate.x = 999;

    expect(document.components[0].ref).toBe("R7");
    expect(selection.inputP).toBe("vin");
    expect(state.viewTranslate.x).toBe(14);
  });
});
