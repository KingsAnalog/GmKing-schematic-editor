import { fixtureDocument } from "../support/fixtureDocument";
import { describe, expect, it } from "vitest";
import { SchematicCopyController } from "../../../src/schematic/copyController";
import {
  applyCopyPlacementToDocument,
  copySourceCenterAnchor,
  instantiateCopyAt,
  type CopySource,
  type CopyState
} from "../../../src/schematic/copyModel";
import type { ComponentType, SchematicDocument } from "../../../src/schematic/types";

function emptySource(): CopySource {
  return fixtureDocument({
    netLabels: [],
    junctionAppearances: [], components: [], wires: [], notes: [], });
}

function componentSource(): CopySource {
  return fixtureDocument({
    netLabels: [],
    junctionAppearances: [],
    components: [
      {
        id: "r1",
        type: "resistor",
        ref: "R1",
        x: 20,
        y: 40,
        rotation: 0,
        mirrored: false,
        values: { main: "R1" }
      }
    ],
    wires: [],
    notes: [],

  });
}

function sourceDocument(): SchematicDocument {
  return fixtureDocument({
    junctionAppearances: [],
    netLabels: [],
    components: componentSource().components,
    wires: [],
    junctions: [],

    notes: [
      {
        id: "note-1",
        anchor: "upperLeft",
        text: "copy note",
        x: 80,
        y: 100,
        width: 120,
        height: 40
      }
    ]
  });
}

function factories() {
  let nextId = 0;
  let nextRef = 0;
  return {
    calls: () => ({ nextId, nextRef }),
    options: {
      nextComponentRef: (type: ComponentType) => `${type}-${++nextRef}`,
      createId: () => `copy-${++nextId}`
    }
  };
}

describe("SchematicCopyController", () => {
  it("anchors an imported source at the snapped center of its complete visual bounds", () => {
    const source = emptySource();
    source.wires.push({
      id: "wire",
      points: [{ x: 0, y: 0 }, { x: 40, y: 0 }],
      routeMode: "orthogonal"
    });
    source.notes.push({
      id: "note",
      x: 100,
      y: 100,
      width: 120,
      height: 40,
      anchor: "upperLeft",
      text: "clipboard"
    });

    expect(copySourceCenterAnchor(source)).toEqual({ x: 110, y: 70 });
    expect(copySourceCenterAnchor(emptySource())).toBeNull();
  });

  it("builds a no-source entry intent without attaching source state", () => {
    const controller = new SchematicCopyController();

    expect(controller.prepareNoSourceEntry()).toMatchObject({
      nextMode: "copy",
      hasSource: false,
      status: "Copy mode: click an object or drag a box to copy. Esc cancels."
    });
    expect(controller.hasSource).toBe(false);
    expect(controller.anchor).toBeNull();
    expect(controller.sourceNotes).toEqual([]);
  });

  it("prepares snapped source entry state without mutating until attach", () => {
    const controller = new SchematicCopyController();
    const source = componentSource();

    const result = controller.prepareSourceEntry(source, { x: 23, y: 37 }, { x: 101, y: 99 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.intent).toMatchObject({
      nextMode: "copy",
      hasSource: true,
      sourceCount: 1,
      updateCopyPreview: true
    });
    expect(result.state).toEqual({ source, anchor: { x: 20, y: 40 } });
    expect(result.previewPoint).toEqual({ x: 101, y: 99 });
    expect(controller.hasSource).toBe(false);
    expect(controller.anchor).toBeNull();

    result.attachSource();

    expect(controller.hasSource).toBe(true);
    expect(controller.anchor).toEqual({ x: 20, y: 40 });
    expect(controller.sourceNotes).toEqual([]);
  });

  it("returns failure status for an empty source without attaching state", () => {
    const controller = new SchematicCopyController();

    const result = controller.prepareSourceEntry(emptySource(), { x: 0, y: 0 }, { x: 20, y: 20 });

    expect(result).toEqual({ ok: false, status: "Select objects before copying." });
    expect(controller.hasSource).toBe(false);
    expect(controller.anchor).toBeNull();
  });

  it("prepares a selected-source entry that attaches immediately at the component origin", () => {
    const controller = new SchematicCopyController();
    const selection = fixtureDocument({
      netLabels: [],
      components: componentSource().components,
      wires: [],
      junctionPoints: [],
      junctionKeys: new Set<string>(),
      notes: [],
      transformBounds: { x: 20, y: 40, width: 80, height: 40 }
    });

    const result = controller.prepareSelectionEntry({
      selection,
      connections: selection.connections,
      lastPointerPoint: { x: 41, y: 59 }
    });

    expect(result.kind).toBe("source");
    if (result.kind !== "source") return;
    expect(result.entry.intent).toMatchObject({
      hasSource: true,
      sourceCount: 1
    });
    expect(result.entry.state.anchor).toEqual({ x: 20, y: 40 });
    expect(result.entry.previewPoint).toEqual({ x: 41, y: 59 });
    result.entry.attachSource();
    expect(controller.hasSource).toBe(true);
    expect(controller.anchor).toEqual({ x: 20, y: 40 });
  });

  it("prepares no-source mode when the current selection has no transform bounds", () => {
    const controller = new SchematicCopyController();

    const result = controller.prepareSelectionEntry({
      selection: fixtureDocument({
        netLabels: [],
        components: [],
        wires: [],
        junctionPoints: [],
        junctionKeys: new Set<string>(),
        notes: [],
        transformBounds: null
      }),
      connections: { wires: {}, pins: {} },
      lastPointerPoint: null
    });

    expect(result).toMatchObject({
      kind: "no-source",
      intent: {
        nextMode: "copy",
        hasSource: false,
        status: "Copy mode: click an object or drag a box to copy. Esc cancels."
      }
    });
  });

  it("prepares a clicked-target source and exposes selected target ids", () => {
    const controller = new SchematicCopyController();

    const result = controller.prepareTargetEntry(sourceDocument(), ["r1", "missing"], ["note-1"], { x: 81, y: 99 }, { x: 123, y: 140 });

    expect(result.kind).toBe("source");
    if (result.kind !== "source") return;
    expect(result.ids).toEqual(["r1", "missing"]);
    expect(result.noteIds).toEqual(["note-1"]);
    expect(result.entry.state.source.components.map((component) => component.id)).toEqual(["r1"]);
    expect(result.entry.state.source.notes.map((note) => note.id)).toEqual(["note-1"]);
    expect(result.entry.state.anchor).toEqual({ x: 80, y: 100 });
    expect(result.entry.previewPoint).toEqual({ x: 123, y: 140 });
    result.entry.attachSource();
    expect(controller.sourceNotes.map((note) => note.id)).toEqual(["note-1"]);
  });

  it("returns copy-mode target guidance for stale clicked targets", () => {
    const controller = new SchematicCopyController();

    expect(controller.prepareTargetEntry(sourceDocument(), ["missing"], ["other-missing"], { x: 0, y: 0 })).toEqual({
      kind: "empty-target",
      status: "Copy mode: click a component, wire, junction, or note."
    });
  });

  it("prepares preview and placement without consuming refs for preview", () => {
    const controller = new SchematicCopyController();
    const state: CopyState = { source: componentSource(), anchor: { x: 20, y: 40 } };
    const factory = factories();

    controller.attachSource(state);
    const preview = controller.preparePreview({ x: 100, y: 120 }, factory.options);

    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(preview.preview.components).toMatchObject([
      {
        id: "copy-preview-component-0",
        type: "resistor",
        ref: "R1",
        x: 100,
        y: 120,
        values: { main: "R1" }
      }
    ]);
    expect(factory.calls()).toEqual({ nextId: 0, nextRef: 0 });

    const placement = controller.preparePlacement({ x: 140, y: 160 }, factory.options);

    expect(placement.ok).toBe(true);
    if (!placement.ok) return;
    expect(placement.copied.components).toMatchObject([
      {
        id: "copy-1",
        type: "resistor",
        ref: "resistor-1",
        x: 140,
        y: 160,
        values: { main: "resistor-1" }
      }
    ]);
    expect(placement.keepSourceArmed).toBe(true);
    expect(factory.calls()).toEqual({ nextId: 1, nextRef: 1 });
  });

  it("preserves a custom component name without consuming a generated ref", () => {
    const controller = new SchematicCopyController();
    const source = componentSource();
    source.components[0].ref = "Rfb";
    source.components[0].values.main = "Rfb";
    const factory = factories();

    controller.attachSource({ source, anchor: { x: 20, y: 40 } });
    const placement = controller.preparePlacement({ x: 140, y: 160 }, factory.options);

    expect(placement.ok).toBe(true);
    if (!placement.ok) return;
    expect(placement.copied.components[0]).toMatchObject({
      ref: "Rfb",
      values: { main: "Rfb" }
    });
    expect(factory.calls()).toEqual({ nextId: 1, nextRef: 0 });
  });

  it("preserves every custom name in a multi-component copy", () => {
    const source = componentSource();
    source.components[0].ref = "Rfb";
    source.components[0].values.main = "10k";
    source.components.push({
      ...source.components[0],
      id: "r-load",
      ref: "Rload",
      x: 60,
      values: { main: "2k" }
    });
    const factory = factories();

    const copied = instantiateCopyAt({ source, anchor: { x: 20, y: 40 } }, { x: 100, y: 100 }, {
      preview: false,
      ...factory.options
    });

    expect(copied.components.map((component) => [component.ref, component.values.main])).toEqual([
      ["Rfb", "10k"],
      ["Rload", "2k"]
    ]);
    expect(factory.calls()).toEqual({ nextId: 2, nextRef: 0 });
  });

  it("preserves visibility when copying components without scalar values", () => {
    const source: CopySource = fixtureDocument({
      netLabels: [],
      junctionAppearances: [],
      components: [{
        id: "m1",
        type: "nmos",
        ref: "M1",
        x: 20,
        y: 40,
        rotation: 0,
        mirrored: false,
        values: { labelVisible: "false" }
      }],
      wires: [],
      notes: [],

    });
    const state = { source, anchor: { x: 20, y: 40 } };

    const preview = instantiateCopyAt(state, { x: 100, y: 120 }, {
      preview: true,
      nextComponentRef: () => "unused",
      createId: () => "unused"
    });
    const placement = instantiateCopyAt(state, { x: 140, y: 160 }, {
      preview: false,
      nextComponentRef: () => "M2",
      createId: () => "copy-m2"
    });

    expect(preview.components[0].values).toEqual({ labelVisible: "false" });
    expect(placement.components[0]).toMatchObject({ ref: "M2", values: { labelVisible: "false" } });
  });

  it("rotates the attached copy source around the explicit anchor", () => {
    const controller = new SchematicCopyController();
    const factory = factories();
    const source = componentSource();
    source.components[0].x = 40;
    source.components[0].y = 40;
    source.wires.push({
      id: "w1",
      points: [
        { x: 60, y: 40 },
        { x: 80, y: 40 }
      ],
      routeMode: "orthogonal"
    });

    controller.attachSource({ source, anchor: { x: 20, y: 40 } });

    expect(controller.rotateSource()).toEqual({ ok: true, status: "Copy preview rotated 90 deg. Click to place; Esc cancels." });
    const preview = controller.preparePreview({ x: 100, y: 100 }, factory.options);

    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(preview.preview.components[0]).toMatchObject({
      id: "copy-preview-component-0",
      x: 100,
      y: 120,
      rotation: 90,
      ref: "R1"
    });
    expect(preview.preview.wires[0].points).toEqual([
      { x: 100, y: 140 },
      { x: 100, y: 160 }
    ]);
    expect(factory.calls()).toEqual({ nextId: 0, nextRef: 0 });
  });

  it("mirrors the attached copy source left-right around the explicit anchor", () => {
    const controller = new SchematicCopyController();
    const factory = factories();
    const source = componentSource();
    source.components[0].x = 40;
    source.components[0].y = 40;
    source.wires.push({
      id: "w1",
      points: [
        { x: 60, y: 40 },
        { x: 80, y: 40 }
      ],
      routeMode: "orthogonal"
    });

    controller.attachSource({ source, anchor: { x: 20, y: 40 } });

    expect(controller.mirrorSource("x")).toEqual({ ok: true, status: "Copy preview mirrored left-right. Click to place; Esc cancels." });
    const preview = controller.preparePreview({ x: 100, y: 100 }, factory.options);

    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(preview.preview.components[0]).toMatchObject({
      id: "copy-preview-component-0",
      x: 80,
      y: 100,
      rotation: 0,
      mirrored: true,
      ref: "R1"
    });
    expect(preview.preview.wires[0].points).toEqual([
      { x: 60, y: 100 },
      { x: 40, y: 100 }
    ]);
    expect(factory.calls()).toEqual({ nextId: 0, nextRef: 0 });
  });

  it("prepares document placement input while keeping source armed", () => {
    const controller = new SchematicCopyController();
    const document = sourceDocument();
    const factory = factories();

    controller.attachSource({ source: componentSource(), anchor: { x: 20, y: 40 } });
    const placement = controller.preparePlacement({ x: 100, y: 120 }, factory.options);
    expect(placement.ok).toBe(true);
    if (!placement.ok) return;

    const result = applyCopyPlacementToDocument(document, placement.copied);

    expect(result).toMatchObject({
      count: 1,
      ids: ["copy-1"],
      noteIds: [],
      placed: true,
      status: "Copied 1 object. Move to another point and click to copy again, or Esc cancels."
    });
    expect(controller.hasSource).toBe(true);
  });

  it("reports missing source for preview and placement after cancel", () => {
    const controller = new SchematicCopyController();
    const factory = factories();

    controller.attachSource({ source: componentSource(), anchor: { x: 20, y: 40 } });
    controller.cancel();

    expect(controller.hasSource).toBe(false);
    expect(controller.preparePreview({ x: 140, y: 160 }, factory.options)).toEqual({
      ok: false,
      status: "Copy mode: click an object or drag a box to copy. Esc cancels."
    });
    expect(controller.preparePlacement({ x: 140, y: 160 }, factory.options)).toEqual({
      ok: false,
      status: "Copy mode: click an object or drag a box to copy. Esc cancels.",
      keepSourceArmed: false
    });
  });

});
