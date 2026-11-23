import { fixtureDocument } from "../support/fixtureDocument";
import { describe, expect, it } from "vitest";
import { PREVIEW_COMPONENT_ID } from "../../../src/schematic/previewIds";
import {
  applyPlacementCommitToDocument,
  buildPlacementCommit,
  buildPlacedComponent,
  buildPlacementPreviewFragment,
  buildTemplatePlacement
} from "../../../src/schematic/placementModel";
import type { ComponentType, SchematicDocument } from "../../../src/schematic/types";

describe("schematic placement model", () => {
  it("applies the configured device properties to preview and placement with an allocated reference", () => {
    const properties = {
      type: "resistor" as const,
      variantId: "variable" as const,
      scale: 2 as const,
      values: { main: "6.8k" },
      appearance: { color: "#ff0000" }
    };
    const pose = { rotation: 90, mirrored: false, properties };
    const point = { x: 120, y: 80 };
    const preview = buildPlacementPreviewFragment("resistor", point, pose);
    const { fragment } = buildPlacementCommit("resistor", point, {
      ...pose, createId: () => "placed", nextRef: () => "R7"
    });
    expect(preview.components[0]).toMatchObject({ ...properties, ...point, rotation: 90, id: PREVIEW_COMPONENT_ID });
    expect(fragment.components[0]).toMatchObject({ ...properties, ...point, rotation: 90, id: "placed", ref: "R7" });
    expect(fragment.components[0].values).not.toBe(properties.values);
  });

  it("builds a placed component from the supplied id, ref, pose, and catalog defaults", () => {
    const placed = buildPlacedComponent("resistor", { x: 120, y: 80 }, {
      id: "component-1",
      ref: "R7",
      rotation: 90,
      mirrored: true
    });

    expect(placed).toEqual({
      id: "component-1",
      type: "resistor",
      variantId: "fixed",
      ref: "R7",
      x: 120,
      y: 80,
      rotation: 90,
      mirrored: true,
      values: { main: "R7" }
    });
  });

  it("initializes the editable VDD voltage from its generated reference", () => {
    expect(buildPlacedComponent("vdd", { x: 20, y: 40 }, {
      id: "vdd-1",
      ref: "VDD2",
      rotation: 0,
      mirrored: false
    }).values).toEqual({ main: "VDD2" });
  });

  it("places logic gates with two inputs and DFFs with both outputs enabled by default", () => {
    const gate = buildPlacedComponent("xor", { x: 20, y: 40 }, {
      id: "xor-1",
      ref: "X1",
      rotation: 0,
      mirrored: false
    });
    const dff = buildPlacedComponent("dff", { x: 200, y: 200 }, {
      id: "dff-1",
      ref: "X2",
      rotation: 0,
      mirrored: false
    });

    expect(gate).toMatchObject({
      type: "xor",
      variantId: "2-input",
      values: {}
    });
    expect(dff).toMatchObject({
      type: "dff",
      values: {}
    });
    expect(dff.variantId).toBeUndefined();
    expect(dff.values).not.toHaveProperty("pinVisible:q");
    expect(dff.values).not.toHaveProperty("pinVisible:qbar");
  });

  it("leaves values empty for components without an editable scalar value", () => {
    const placed = buildPlacedComponent("gnd", { x: 20, y: 40 }, {
      id: "ground-1",
      ref: "GND2",
      rotation: 0,
      mirrored: false
    });

    expect(placed.values).toEqual({});
    expect(buildPlacedComponent("nmos", { x: 20, y: 40 }, {
      id: "nmos-1",
      ref: "M1",
      rotation: 0,
      mirrored: false
    }).values).toEqual({});
    expect(buildPlacedComponent("plus", { x: 20, y: 40 }, {
      id: "plus-1",
      ref: "SUM1",
      rotation: 0,
      mirrored: false
    }).values).not.toHaveProperty("main");
    expect(buildPlacedComponent("multiply", { x: 20, y: 40 }, {
      id: "multiply-1",
      ref: "MUL1",
      rotation: 0,
      mirrored: false
    }).values).toEqual({ "pinVisible:top": "false" });

  });

  it("uses non-main catalog defaults for parameterized components", () => {
    const placed = buildPlacedComponent("comparator", { x: 20, y: 40 }, {
      id: "comparator-1",
      ref: "CMP1",
      rotation: 0,
      mirrored: false
    });
    const preview = buildPlacementPreviewFragment("diffComparator", { x: 80, y: 100 }, {
      rotation: 0,
      mirrored: false
    });

    expect(placed.values).toEqual({ levels: "1" });
    expect(preview.components[0]).toMatchObject({
      id: PREVIEW_COMPONENT_ID,
      type: "diffComparator",
      ref: "diffcomparator",
      values: { levels: "1" }
    });
  });

  it("projects a component placement commit without applying editor state", () => {
    const calls: string[] = [];
    const commit = buildPlacementCommit("resistor", { x: 120, y: 80 }, {
      createId: (kind, index) => {
        calls.push(`create:${kind}:${index}`);
        return "component-1";
      },
      nextRef: (type) => {
        calls.push(`ref:${type}`);
        return "R7";
      },
      rotation: 90,
      mirrored: true
    });

    expect(calls).toEqual(["ref:resistor", "create:component:0"]);
    expect(commit.fragment).toEqual(fixtureDocument({
      junctionAppearances: [],
      netLabels: [],
      notes: [],
      components: [{
        id: "component-1",
        type: "resistor",
        variantId: "fixed",
        ref: "R7",
        x: 120,
        y: 80,
        rotation: 90,
        mirrored: true,
        values: { main: "R7" }
      }],
      wires: [],
      junctions: [],

    }));
    expect(commit.selectedIds).toEqual(["component-1"]);
    expect(commit.status).toBe("R7 placed. Continue moving and clicking to place more resistor instances.");
  });

  it("applies a component placement commit by appending only components and wires", () => {
    const existingJunctions = [{ x: 40, y: 60 }];
    const existingNotes = [{
      id: "note-1",
      x: 20,
      y: 40,
      width: 180,
      anchor: "upperLeft" as const,
      text: "keep me"
    }];
    const existingComponent = {
      id: "component-existing",
      type: "capacitor" as const,
      ref: "C0",
      x: 0,
      y: 0,
      rotation: 0,
      mirrored: false,
      values: { main: "C0" }
    };
    const existingWire = {
      id: "wire-existing",
      points: [{ x: 0, y: 0 }, { x: 20, y: 0 }],
      routeMode: "orthogonal" as const
    };
    const document: SchematicDocument = fixtureDocument({
      junctionAppearances: [],
      netLabels: [],
      components: [existingComponent],
      wires: [existingWire],
      junctions: existingJunctions,
      notes: existingNotes
    });
    const existingComponents = document.components;
    const existingWires = document.wires;
    const commit = buildPlacementCommit("resistor", { x: 120, y: 80 }, {
      createId: () => "component-1",
      nextRef: () => "R7",
      rotation: 90,
      mirrored: true
    });

    applyPlacementCommitToDocument(document, commit);

    expect(document.components).toBe(existingComponents);
    expect(document.wires).toBe(existingWires);
    expect(document.components).toEqual([existingComponent, commit.fragment.components[0]]);
    expect(document.wires).toEqual([existingWire]);
    expect(document.junctions).toBe(existingJunctions);

    expect(document.connections).toBeDefined();
    expect(document.notes).toBe(existingNotes);
  });

  it("builds a component placement preview with the stable preview id and hot label", () => {
    const preview = buildPlacementPreviewFragment("switch", { x: 40, y: 60 }, {
      rotation: 180,
      mirrored: true
    });

    expect(preview.components).toHaveLength(1);
    expect(preview.components[0]).toMatchObject({
      id: PREVIEW_COMPONENT_ID,
      type: "switch",
      variantId: "open",
      ref: "switch",
      x: 40,
      y: 60,
      rotation: 180,
      mirrored: true,
      values: {}
    });
    expect(preview.wires).toEqual([]);
  });

  it("expands a template placement with deterministic components before wires", () => {
    const seenTypes: ComponentType[] = [];
    const refs = ["Ad9", "C4", "C5", "S6", "S7"];
    const fragment = buildTemplatePlacement("flipped_amp_diff", { x: 200, y: 240 }, {
      createId: (kind, index) => `${kind}-${index}`,
      nextRef: (type) => {
        seenTypes.push(type);
        return refs[seenTypes.length - 1];
      }
    });

    expect(seenTypes).toEqual(["diffAmp", "capacitor", "capacitor", "switch", "switch"]);
    expect(fragment.components.map((component) => component.id)).toEqual([
      "component-0",
      "component-1",
      "component-2",
      "component-3",
      "component-4"
    ]);
    expect(fragment.components.map((component) => component.ref)).toEqual(refs);
    expect(fragment.wires.map((wire) => wire.id)).toEqual([
      "wire-0",
      "wire-1",
      "wire-2",
      "wire-3",
      "wire-4",
      "wire-5",
      "wire-6",
      "wire-7",
      "wire-8",
      "wire-9",
      "wire-10",
      "wire-11"
    ]);
  });

  it("projects a template placement commit with component and wire selection order", () => {
    const refs = ["Ad9", "C4", "C5", "S6", "S7"];
    const refFactory = () => {
      let index = 0;
      return (_type: ComponentType) => refs[index++];
    };
    const createId = (kind: "component" | "wire", index: number) => `${kind}-${index}`;
    const neutralCommit = buildPlacementCommit("flipped_amp_diff", { x: 200, y: 240 }, {
      createId,
      nextRef: refFactory(),
      rotation: 0,
      mirrored: false
    });
    const transformedCommit = buildPlacementCommit("flipped_amp_diff", { x: 200, y: 240 }, {
      createId,
      nextRef: refFactory(),
      rotation: 270,
      mirrored: true
    });

    expect(transformedCommit).toEqual(neutralCommit);
    expect(transformedCommit.fragment.components.map((component) => component.id)).toEqual([
      "component-0",
      "component-1",
      "component-2",
      "component-3",
      "component-4"
    ]);
    expect(transformedCommit.fragment.components.map((component) => component.ref)).toEqual(refs);
    expect(transformedCommit.fragment.wires.map((wire) => wire.id)).toEqual([
      "wire-0",
      "wire-1",
      "wire-2",
      "wire-3",
      "wire-4",
      "wire-5",
      "wire-6",
      "wire-7",
      "wire-8",
      "wire-9",
      "wire-10",
      "wire-11"
    ]);
    expect(transformedCommit.selectedIds).toEqual([
      "component-0",
      "component-1",
      "component-2",
      "component-3",
      "component-4",
      "wire-0",
      "wire-1",
      "wire-2",
      "wire-3",
      "wire-4",
      "wire-5",
      "wire-6",
      "wire-7",
      "wire-8",
      "wire-9",
      "wire-10",
      "wire-11"
    ]);
    expect(transformedCommit.status).toBe("flipped_amp_diff placed as 5 components and 12 wires.");
  });

  it("applies a template placement commit without applying synthetic non-placement fragment fields", () => {
    const refs = ["Ad9", "C4", "C5", "S6", "S7"];
    const existingJunctions = [{ x: 300, y: 320 }];
    const existingNotes = [{
      id: "note-existing",
      x: 80,
      y: 100,
      width: 220,
      anchor: "upperLeft" as const,
      text: "existing note"
    }];
    const existingComponent = {
      id: "component-existing",
      type: "resistor" as const,
      ref: "R0",
      x: 0,
      y: 0,
      rotation: 0,
      mirrored: false,
      values: { main: "R0" }
    };
    const existingWire = {
      id: "wire-existing",
      points: [{ x: 0, y: 0 }, { x: 20, y: 0 }],
      routeMode: "orthogonal" as const
    };
    const document: SchematicDocument = fixtureDocument({
      junctionAppearances: [],
      netLabels: [],
      components: [existingComponent],
      wires: [existingWire],
      junctions: existingJunctions,
      notes: existingNotes
    });
    const existingComponents = document.components;
    const existingWires = document.wires;
    const commit = buildPlacementCommit("flipped_amp_diff", { x: 200, y: 240 }, {
      createId: (kind, index) => `${kind}-${index}`,
      nextRef: () => refs.shift() ?? "X0",
      rotation: 0,
      mirrored: false
    });
    const syntheticCommit = {
      ...commit,
      fragment: {
        ...commit.fragment,
        junctions: [{ x: 400, y: 420 }],
        notes: [{
          id: "note-synthetic",
          x: 120,
          y: 140,
          width: 220,
          anchor: "upperLeft" as const,
          text: "do not apply"
        }]
      }
    };

    applyPlacementCommitToDocument(document, syntheticCommit);

    expect(document.components).toBe(existingComponents);
    expect(document.wires).toBe(existingWires);
    expect(document.components.map((component) => component.id)).toEqual([
      "component-existing",
      ...commit.fragment.components.map((component) => component.id)
    ]);
    expect(document.wires.map((wire) => wire.id)).toEqual([
      "wire-existing",
      ...commit.fragment.wires.map((wire) => wire.id)
    ]);
    expect(document.junctions).toBe(existingJunctions);

    expect(document.connections).toBeDefined();
    expect(document.notes).toBe(existingNotes);
  });

  it("uses deterministic template preview ids and hot-label refs", () => {
    const preview = buildPlacementPreviewFragment("flipped_amp_diff", { x: 200, y: 240 }, {
      rotation: 180,
      mirrored: true
    });

    expect(preview.components.map((component) => component.id)).toEqual([
      "preview-template-component-0",
      "preview-template-component-1",
      "preview-template-component-2",
      "preview-template-component-3",
      "preview-template-component-4"
    ]);
    expect(preview.components.map((component) => component.ref)).toEqual(["diffamp", "capacitor", "capacitor", "switch", "switch"]);
    expect(preview.wires.map((wire) => wire.id)).toEqual([
      "preview-template-wire-0",
      "preview-template-wire-1",
      "preview-template-wire-2",
      "preview-template-wire-3",
      "preview-template-wire-4",
      "preview-template-wire-5",
      "preview-template-wire-6",
      "preview-template-wire-7",
      "preview-template-wire-8",
      "preview-template-wire-9",
      "preview-template-wire-10",
      "preview-template-wire-11"
    ]);
  });

  it("dispatches placement previews for components and templates", () => {
    const componentPreview = buildPlacementPreviewFragment("resistor", { x: 20, y: 40 }, {
      rotation: 270,
      mirrored: false
    });
    const templatePreview = buildPlacementPreviewFragment("common_source_nmos", { x: 80, y: 100 }, {
      rotation: 270,
      mirrored: true
    });

    expect(componentPreview.components).toHaveLength(1);
    expect(componentPreview.components[0]).toMatchObject({
      id: PREVIEW_COMPONENT_ID,
      type: "resistor",
      ref: "resistor",
      rotation: 270,
      mirrored: false
    });
    expect(componentPreview.wires).toEqual([]);
    expect(templatePreview.components.map((component) => component.id)).toEqual([
      "preview-template-component-0",
      "preview-template-component-1",
      "preview-template-component-2"
    ]);
  });
});
