import { fixtureDocument } from "../support/fixtureDocument";
import { describe, expect, it } from "vitest";
import { SchematicWireToolController } from "../../../src/schematic/wire/wireToolController";
import { applyWireCommitToDocument } from "../../../src/schematic/wire/wireCreationModel";
import type { SchematicDocument } from "../../../src/schematic/types";

function createDocument(): SchematicDocument {
  return fixtureDocument({
    junctionAppearances: [],
    netLabels: [], components: [], wires: [], junctions: [],  notes: [] });
}

describe("schematic wire tool controller", () => {
  it("starts with the signal variant and no route points", () => {
    const controller = new SchematicWireToolController();

    expect(controller.variant).toBe("signal");
    expect(controller.routeMode).toBe("orthogonal");
    expect(controller.routePointCount()).toBe(0);
    expect(controller.previewPath({ x: 40, y: 40 })).toBeNull();
  });

  it("begins and resets a wide wire route while preserving the variant", () => {
    const controller = new SchematicWireToolController();

    controller.begin("wide");
    controller.applyBlankClick({ x: 0, y: 0 });
    expect(controller.variant).toBe("wide");
    expect(controller.routePointCount()).toBe(1);

    controller.reset();
    expect(controller.variant).toBe("wide");
    expect(controller.routePointCount()).toBe(0);
    expect(controller.previewPath({ x: 40, y: 40 })).toBeNull();
  });

  it("applies blank route start and bend intents to internal state", () => {
    const controller = new SchematicWireToolController();

    const start = controller.applyBlankClick({ x: 13, y: 8 });
    expect(start).toEqual({
      kind: "pending",
      previewPoint: { x: 10, y: 10 },
      status: "Wire start 10, 10. Click to add bends. Double-click or press Enter to finish."
    });
    expect(controller.routePointCount()).toBe(1);
    expect(controller.previewPath({ x: 61, y: 41 })).toEqual([
      { x: 10, y: 10 },
      { x: 60, y: 10 },
      { x: 60, y: 40 }
    ]);

    const bend = controller.applyBlankClick({ x: 61, y: 41 });
    expect(bend).toEqual({
      kind: "pending",
      previewPoint: { x: 60, y: 40 },
      status: "Bend added at 60, 40. Double-click or press Enter to finish."
    });
    expect(controller.routePointCount()).toBe(3);
    expect(controller.previewPath({ x: 80, y: 40 })).toEqual([
      { x: 10, y: 10 },
      { x: 60, y: 10 },
      { x: 60, y: 40 },
      { x: 80, y: 40 }
    ]);
  });

  it("keeps a second pin click pending and returns commit points on finish", () => {
    const document = createDocument();
    const controller = new SchematicWireToolController();

    const start = controller.applyPinClick({ x: 40, y: 0 });
    expect(start).toEqual({
      kind: "pending",
      previewPoint: { x: 40, y: 0 },
      status: "Wire started from pin. Click to add bends. Double-click or press Enter to finish."
    });
    expect(controller.routePointCount()).toBe(1);

    expect(controller.applyPinClick({ x: 80, y: 40 }).kind).toBe("pending");
    const finish = controller.finish({ x: 80, y: 40 });
    expect(finish).toEqual({
      kind: "commit",
      points: [
        { x: 40, y: 0 },
        { x: 80, y: 0 },
        { x: 80, y: 40 }
      ],
      routeMode: "orthogonal"
    });
    expect(controller.routePointCount()).toBe(3);
    expect(document).toEqual(createDocument());

    controller.reset();
    expect(controller.routePointCount()).toBe(0);
  });

  it("keeps state on invalid finish and waits for caller reset after a commit", () => {
    const controller = new SchematicWireToolController("wide");

    expect(controller.finish(null)).toEqual({
      kind: "invalid",
      status: "Click a start point before finishing a wire."
    });
    expect(controller.variant).toBe("wide");
    expect(controller.routePointCount()).toBe(0);

    controller.applyBlankClick({ x: 0, y: 0 });
    expect(controller.finish({ x: 0, y: 0 })).toEqual({
      kind: "invalid",
      status: "Wire needs at least two distinct points."
    });
    expect(controller.variant).toBe("wide");
    expect(controller.routePointCount()).toBe(1);

    expect(controller.finish({ x: 40, y: 40 })).toEqual({
      kind: "commit",
      points: [
        { x: 0, y: 0 },
        { x: 40, y: 0 },
        { x: 40, y: 40 }
      ],
      routeMode: "orthogonal"
    });
    expect(controller.variant).toBe("wide");
    expect(controller.routePointCount()).toBe(1);

    controller.reset();
    expect(controller.variant).toBe("wide");
    expect(controller.routePointCount()).toBe(0);
  });

  it("keeps route state when a commit-shaped route does not produce document wires", () => {
    const document = createDocument();
    const controller = new SchematicWireToolController();

    controller.applyBlankClick({ x: 0, y: 0 });
    controller.applyBlankClick({ x: 40, y: 0 });
    const result = controller.finish({ x: 0, y: 0 });

    expect(result).toEqual({
      kind: "commit",
      points: [
        { x: 0, y: 0 },
        { x: 40, y: 0 },
        { x: 0, y: 0 }
      ],
      routeMode: "orthogonal"
    });
    expect(applyWireCommitToDocument(
      document,
      result.kind === "commit" ? result.points : [],
      controller.appearance(),
      () => "wire-id"
    )).toEqual({ kind: "none" });
    expect(document).toEqual(createDocument());
    expect(controller.routePointCount()).toBe(2);
  });

  it("projects preview paths only after routing starts", () => {
    const controller = new SchematicWireToolController();

    expect(controller.previewPath({ x: 40, y: 40 })).toBeNull();

    controller.applyBlankClick({ x: 0, y: 0 });
    expect(controller.previewPath({ x: 40, y: 40 })).toEqual([
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 40 }
    ]);
  });

  it("sets and toggles free-angle routing without changing placed points and keeps it across reset and begin", () => {
    const controller = new SchematicWireToolController();
    controller.applyBlankClick({ x: 0, y: 0 });

    expect(controller.setRouteMode("freeAngle")).toBe("freeAngle");
    expect(controller.previewPath({ x: 60, y: 40 })).toEqual([
      { x: 0, y: 0 },
      { x: 60, y: 40 }
    ]);
    controller.applyBlankClick({ x: 60, y: 40 });

    expect(controller.setRouteMode("orthogonal")).toBe("orthogonal");
    expect(controller.previewPath({ x: 100, y: 80 })).toEqual([
      { x: 0, y: 0 },
      { x: 60, y: 40 },
      { x: 100, y: 40 },
      { x: 100, y: 80 }
    ]);
    expect(controller.finish({ x: 100, y: 80 })).toMatchObject({
      kind: "commit",
      routeMode: "freeAngle"
    });

    controller.reset();
    expect(controller.routeMode).toBe("orthogonal");
    controller.toggleRouteMode();
    controller.begin("wide");
    expect(controller.routeMode).toBe("freeAngle");
    expect(controller.variant).toBe("wide");
  });

  it("projects appearance from the current variant", () => {
    const controller = new SchematicWireToolController();
    expect(controller.appearance()).toEqual({ variant: "signal" });

    controller.begin("wide");
    expect(controller.appearance()).toEqual({ variant: "wide" });

    controller.applyBlankClick({ x: 0, y: 0 });
    expect(controller.appearance()).toEqual({ variant: "wide" });
  });

  it("routes the 45-degree draft and its committed path through the same grid points", () => {
    const controller = new SchematicWireToolController();
    controller.setRouteMode("diagonal45");
    controller.begin("signal");
    controller.applyBlankClick({ x: 70, y: 40 });
    expect(controller.previewPath({ x: 20, y: 113 })).toEqual([
      { x: 70, y: 40 }, { x: 70, y: 60 }, { x: 20, y: 110 }
    ]);
    expect(controller.finish({ x: 20, y: 113 })).toEqual({
      kind: "commit", routeMode: "freeAngle", points: [{ x: 70, y: 40 }, { x: 70, y: 60 }, { x: 20, y: 110 }]
    });
    expect(controller.previewPath({ x: 20, y: 90 })).toEqual([{ x: 70, y: 40 }, { x: 20, y: 90 }]);
  });
});
