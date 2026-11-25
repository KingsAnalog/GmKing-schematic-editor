import { describe, expect, it } from "vitest";
import { PREVIEW_COMPONENT_ID } from "../../../src/schematic/previewIds";
import { SchematicPlacementToolController } from "../../../src/schematic/placementToolController";

describe("schematic placement tool controller", () => {
  it("starts with the resistor selected and active by default", () => {
    const controller = new SchematicPlacementToolController();

    expect(controller.selectedItem).toBe("resistor");
    expect(controller.activeItem).toBe("resistor");
    expect(controller.pose).toEqual({ rotation: 0, mirrored: false });
  });

  it("can keep the selected item while no placement item is active", () => {
    const controller = new SchematicPlacementToolController("resistor", { activeItem: null });

    expect(controller.selectedItem).toBe("resistor");
    expect(controller.activeItem).toBeNull();
    expect(controller.buildPreview({ x: 20, y: 40 })).toBeNull();
    expect(controller.buildCommit({ x: 20, y: 40 }, {
      createId: () => "component-1",
      nextRef: () => "R1"
    })).toBeNull();
  });

  it("resets preview pose only when the selected item changes", () => {
    const controller = new SchematicPlacementToolController();

    controller.rotatePreview();
    controller.rotatePreview();
    expect(controller.pose).toEqual({ rotation: 180, mirrored: false });

    controller.setItem("resistor");
    expect(controller.pose).toEqual({ rotation: 180, mirrored: false });

    controller.setItem("capacitor");
    expect(controller.selectedItem).toBe("capacitor");
    expect(controller.activeItem).toBe("capacitor");
    expect(controller.pose).toEqual({ rotation: 0, mirrored: false });
  });

  it("clears and restores the active preview item without changing the selected item", () => {
    const controller = new SchematicPlacementToolController();

    controller.rotatePreview();
    controller.previewItem(null);
    expect(controller.selectedItem).toBe("resistor");
    expect(controller.activeItem).toBeNull();
    expect(controller.pose).toEqual({ rotation: 90, mirrored: false });

    controller.previewItem("resistor");
    expect(controller.selectedItem).toBe("resistor");
    expect(controller.activeItem).toBe("resistor");
    expect(controller.pose).toEqual({ rotation: 90, mirrored: false });
  });

  it("builds component previews and commits through the placement model using the current pose", () => {
    const controller = new SchematicPlacementToolController();
    const rotation = controller.rotatePreview();

    expect(rotation).toEqual({ kind: "updated", pose: { rotation: 90, mirrored: false } });

    const preview = controller.buildPreview({ x: 40, y: 60 });
    expect(preview).not.toBeNull();
    expect(preview!.components).toHaveLength(1);
    expect(preview!.components[0]).toMatchObject({
      id: PREVIEW_COMPONENT_ID,
      type: "resistor",
      ref: "resistor",
      x: 40,
      y: 60,
      rotation: 90,
      mirrored: false
    });
    expect(preview!.wires).toEqual([]);

    const commit = controller.buildCommit({ x: 80, y: 100 }, {
      createId: (kind, index) => `${kind}-${index}`,
      nextRef: () => "R7"
    });
    expect(commit).not.toBeNull();
    expect(commit!.fragment.components[0]).toMatchObject({
      id: "component-0",
      type: "resistor",
      ref: "R7",
      x: 80,
      y: 100,
      rotation: 90,
      mirrored: false
    });
    expect(commit!.selectedIds).toEqual(["component-0"]);
    expect(commit!.status).toBe("R7 placed. Continue moving and clicking to place more resistor instances.");
  });

  it.each([
    { axis: "x", rotation: 0 },
    { axis: "y", rotation: 180 }
  ] as const)("reflects $axis in component previews through the placement model", ({ axis, rotation }) => {
    const controller = new SchematicPlacementToolController();

    const mirror = controller.mirrorPreview(axis);

    expect(mirror).toEqual({ kind: "updated", pose: { rotation, mirrored: true } });
    const preview = controller.buildPreview({ x: 40, y: 60 });
    expect(preview).not.toBeNull();
    expect(preview!.components[0]).toMatchObject({
      id: PREVIEW_COMPONENT_ID,
      x: 40,
      y: 60,
      rotation,
      mirrored: true
    });
  });

  it("keeps template placement untransformed until ordinary placed objects are selected", () => {
    const controller = new SchematicPlacementToolController();
    controller.setItem("flipped_amp_diff");

    expect(controller.activeItemIsTemplate()).toBe(true);
    expect(controller.rotatePreview()).toEqual({ kind: "template", pose: { rotation: 0, mirrored: false } });
    expect(controller.mirrorPreview("x")).toEqual({ kind: "template", pose: { rotation: 0, mirrored: false } });

    const preview = controller.buildPreview({ x: 200, y: 240 });
    expect(preview).not.toBeNull();
    expect(preview!.components).toHaveLength(5);
    expect(preview!.wires).toHaveLength(12);
    expect(preview!.components.map((component) => component.id)).toEqual([
      "preview-template-component-0",
      "preview-template-component-1",
      "preview-template-component-2",
      "preview-template-component-3",
      "preview-template-component-4"
    ]);

    const commit = controller.buildCommit({ x: 200, y: 240 }, {
      createId: (kind, index) => `${kind}-${index}`,
      nextRef: (type) => type
    });
    expect(commit).not.toBeNull();
    expect(commit!.fragment.components).toHaveLength(5);
    expect(commit!.fragment.wires).toHaveLength(12);
    expect(commit!.selectedIds).toHaveLength(17);
    expect(commit!.status).toBe("flipped_amp_diff placed as 5 components and 12 wires.");
  });
});
