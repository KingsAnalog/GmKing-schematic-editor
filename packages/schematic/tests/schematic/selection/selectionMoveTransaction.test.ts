import { fixtureDocument } from "../support/fixtureDocument";
import { describe, expect, it } from "vitest";
import {
  applySelectionMoveTransaction,
  beginSelectionMoveTransaction
} from "../../../src/schematic/selection/selectionMoveTransaction";
import { buildConnectivity } from "../../../src/schematic/connectivity";
import { applyNormalizedDocumentWires } from "../../../src/schematic/document/documentWires";
import type { SchematicDocument } from "../../../src/schematic/types";
import { fixtureComponent, fixtureNote, fixtureWire, mixedSelectionDoc, twoResistorsLWireDoc, twoResistorsStraightWireDoc } from "../support/fixtures";

describe("schematic selection move transactions", () => {
  it("starts a single-component transaction without promoting stale selected wires", () => {
    const document = twoResistorsStraightWireDoc();

    const transaction = beginSelectionMoveTransaction({
      document,
      activeComponentId: "R1",
      selectedIds: new Set(["w-r1-r2"]),
      selectedNoteIds: new Set()
    });

    expect(transaction).toMatchObject({
      activeComponentId: "R1",
      componentIds: ["R1"],
      wireIds: []
    });
  });

  it("moves selected components, wires, notes, and junction intents from the active component delta", () => {
    const document = mixedSelectionDoc();
    const transaction = beginSelectionMoveTransaction({
      document,
      activeComponentId: "R1",
      selectedIds: new Set(["R1", "C1", "w-mixed"]),
      selectedNoteIds: new Set(["note-1"])
    });
    expect(transaction).not.toBeNull();

    document.components.find((component) => component.id === "R1")!.x += 40;
    const result = applySelectionMoveTransaction({ document, transaction: transaction!, moveBehavior: "stretch" });

    expect(result.changed).toBe(true);
    expect(Array.from(result.movedComponentIds)).toEqual(["C1"]);
    expect(Array.from(result.updatedWireIds)).toEqual(["w-mixed"]);
    expect(Array.from(result.movedNoteIds)).toEqual(["note-1"]);
    expect(document.components.find((component) => component.id === "C1")).toMatchObject({ x: 400, y: 200 });
    expect(document.wires.find((wire) => wire.id === "w-mixed")?.points).toEqual([
      { x: 280, y: 200 },
      { x: 360, y: 200 }
    ]);

    expect(document.notes?.[0]).toMatchObject({ id: "note-1", x: 260, y: 260 });
  });

  it("moves a selected wire from the active note delta without requiring a selected component", () => {
    const document = mixedSelectionDoc();
    const transaction = beginSelectionMoveTransaction({
      document,
      activeNoteId: "note-1",
      selectedIds: new Set(["w-mixed"]),
      selectedNoteIds: new Set(["note-1"])
    });
    expect(transaction).not.toBeNull();

    document.notes![0].x += 40;
    document.notes![0].y += 20;
    const result = applySelectionMoveTransaction({ document, transaction: transaction!, moveBehavior: "stretch" });

    expect(result.changed).toBe(true);
    expect(Array.from(result.updatedWireIds)).toEqual(["w-mixed"]);
    expect(document.notes![0]).toMatchObject({ id: "note-1", x: 260, y: 280 });
    expect(document.wires[0].points).toEqual([
      { x: 280, y: 220 },
      { x: 360, y: 220 }
    ]);
    expect(document.components).toEqual([
      expect.objectContaining({ id: "R1", x: 200, y: 200 }),
      expect.objectContaining({ id: "C1", x: 360, y: 200 })
    ]);
  });

  it("moves the complete component, wire, and note selection from an active note", () => {
    const document = mixedSelectionDoc();
    document.notes!.push(fixtureNote("note-2", 420, 260));
    const transaction = beginSelectionMoveTransaction({
      document,
      activeNoteId: "note-1",
      selectedIds: new Set(["R1", "w-mixed"]),
      selectedNoteIds: new Set(["note-1", "note-2"])
    });
    expect(transaction).not.toBeNull();

    document.notes![0].x += 40;
    document.notes![0].y += 20;
    const result = applySelectionMoveTransaction({ document, transaction: transaction!, moveBehavior: "stretch" });

    expect(result.changed).toBe(true);
    expect(Array.from(result.movedComponentIds)).toEqual(["R1"]);
    expect(Array.from(result.updatedWireIds)).toEqual(["w-mixed"]);
    expect(Array.from(result.movedNoteIds)).toEqual(["note-2"]);
    expect(document.components.find((component) => component.id === "R1")).toMatchObject({ x: 240, y: 220 });
    expect(document.components.find((component) => component.id === "C1")).toMatchObject({ x: 360, y: 200 });
    expect(document.wires[0].points).toEqual([
      { x: 280, y: 220 },
      { x: 360, y: 220 }
    ]);
    expect(document.notes).toEqual([
      expect.objectContaining({ id: "note-1", x: 260, y: 280 }),
      expect.objectContaining({ id: "note-2", x: 460, y: 280 })
    ]);
  });

  it("preserves stretch and move-only wire semantics when a note supplies the drag delta", () => {
    const beginNoteMove = (document: SchematicDocument) => {
      document.notes = [fixtureNote()];
      return beginSelectionMoveTransaction({
        document,
        activeNoteId: "note-1",
        selectedIds: new Set(["R1", "R2"]),
        selectedNoteIds: new Set(["note-1"])
      });
    };

    const stretched = twoResistorsStraightWireDoc();
    const stretchTransaction = beginNoteMove(stretched);
    expect(stretchTransaction).not.toBeNull();
    stretched.notes![0].x += 40;
    applySelectionMoveTransaction({ document: stretched, transaction: stretchTransaction!, moveBehavior: "stretch" });
    expect(stretched.components.map(({ x, y }) => ({ x, y }))).toEqual([
      { x: 240, y: 200 },
      { x: 400, y: 200 }
    ]);
    expect(stretched.wires[0].points).toEqual([
      { x: 280, y: 200 },
      { x: 360, y: 200 }
    ]);

    const moveOnly = twoResistorsStraightWireDoc();
    const moveOnlyTransaction = beginNoteMove(moveOnly);
    expect(moveOnlyTransaction).not.toBeNull();
    moveOnly.notes![0].x += 40;
    applySelectionMoveTransaction({ document: moveOnly, transaction: moveOnlyTransaction!, moveBehavior: "moveOnly" });
    expect(moveOnly.components.map(({ x, y }) => ({ x, y }))).toEqual([
      { x: 240, y: 200 },
      { x: 400, y: 200 }
    ]);
    expect(moveOnly.wires[0].points).toEqual([
      { x: 240, y: 200 },
      { x: 320, y: 200 }
    ]);
  });

  it("uses indexed component and wire lookup during mixed live movement", () => {
    const document = mixedSelectionDoc();
    const transaction = beginSelectionMoveTransaction({
      document,
      activeComponentId: "R1",
      selectedIds: new Set(["R1", "C1", "w-mixed"]),
      selectedNoteIds: new Set(["note-1"])
    });
    expect(transaction).not.toBeNull();

    document.components[0].x += 40;
    Object.defineProperty(document.components, "find", {
      configurable: true,
      value: () => {
        throw new Error("component lookup must be indexed during live movement");
      }
    });
    Object.defineProperty(document.wires, "find", {
      configurable: true,
      value: () => {
        throw new Error("wire lookup must be indexed during live movement");
      }
    });

    expect(() => applySelectionMoveTransaction({
      document,
      transaction: transaction!,
      moveBehavior: "stretch"
    })).not.toThrow();
  });

  it("keeps an L-shaped selected wire stable across repeated live applies", () => {
    const document = twoResistorsLWireDoc();
    const transaction = beginSelectionMoveTransaction({
      document,
      activeComponentId: "R1",
      selectedIds: new Set(["R1", "R2", "w-r1-r2-l"]),
      selectedNoteIds: new Set()
    });
    expect(transaction).not.toBeNull();

    document.components.find((component) => component.id === "R1")!.x += 40;
    document.components.find((component) => component.id === "R1")!.y += 20;
    applySelectionMoveTransaction({ document, transaction: transaction!, moveBehavior: "stretch" });

    document.components.find((component) => component.id === "R1")!.x += 40;
    document.components.find((component) => component.id === "R1")!.y += 20;
    const second = applySelectionMoveTransaction({ document, transaction: transaction!, moveBehavior: "stretch" });

    expect(second.changed).toBe(true);
    expect(document.components.find((component) => component.id === "R2")).toMatchObject({ x: 440, y: 320 });
    expect(document.wires.find((wire) => wire.id === "w-r1-r2-l")?.points).toEqual([
      { x: 320, y: 240 },
      { x: 400, y: 240 },
      { x: 400, y: 320 }
    ]);
  });

  it("moves explicit intents once when selected junctions travel along their old wire paths", () => {
    const document: SchematicDocument = fixtureDocument({
      junctionAppearances: [],
      netLabels: [],
      notes: [],
      components: [
        fixtureComponent("resistor", "R1", 200, 200),
        fixtureComponent("resistor", "R2", 440, 280)
      ],
      wires: [
        fixtureWire("left", [{ x: 0, y: 0 }, { x: 40, y: 0 }]),
        fixtureWire("middle", [{ x: 40, y: 0 }, { x: 80, y: 0 }]),
        fixtureWire("upper-branch", [{ x: 40, y: 0 }, { x: 40, y: -40 }]),
        fixtureWire("lower-trunk", [{ x: 80, y: 0 }, { x: 80, y: 40 }]),
        fixtureWire("right", [{ x: 80, y: 40 }, { x: 120, y: 40 }]),
        fixtureWire("lower-branch", [{ x: 80, y: 40 }, { x: 80, y: 80 }])
      ],
      junctions: [{ x: 40, y: 0 }, { x: 80, y: 40 }],

    }, { joinAt: [{ x: 40, y: 0 }, { x: 80, y: 40 }] });
    const selectedIds = new Set([
      "R1",
      "R2",
      ...document.wires.map((wire) => wire.id),
      "junction-40-0",
      "junction-80-40"
    ]);
    const transaction = beginSelectionMoveTransaction({
      document,
      activeComponentId: "R1",
      selectedIds
    });
    expect(transaction).not.toBeNull();

    document.components[0].x += 20;
    applySelectionMoveTransaction({ document, transaction: transaction!, moveBehavior: "stretch" });
    applyNormalizedDocumentWires(document);

    expect(buildConnectivity(document).junctions).toEqual([{ x: 60, y: 0 }, { x: 100, y: 40 }]);
  });

  it("stretches unselected attached wires in stretch mode and leaves them in move-only mode", () => {
    const stretched = twoResistorsStraightWireDoc();
    const stretchTransaction = beginSelectionMoveTransaction({
      document: stretched,
      activeComponentId: "R1",
      selectedIds: new Set(["R1", "R2"]),
      selectedNoteIds: new Set()
    });
    stretched.components.find((component) => component.id === "R1")!.x += 40;
    applySelectionMoveTransaction({ document: stretched, transaction: stretchTransaction!, moveBehavior: "stretch" });
    expect(stretched.wires[0].points).toEqual([
      { x: 280, y: 200 },
      { x: 360, y: 200 }
    ]);

    const moveOnly = twoResistorsStraightWireDoc();
    const moveOnlyTransaction = beginSelectionMoveTransaction({
      document: moveOnly,
      activeComponentId: "R1",
      selectedIds: new Set(["R1", "R2"]),
      selectedNoteIds: new Set()
    });
    moveOnly.components.find((component) => component.id === "R1")!.x += 40;
    applySelectionMoveTransaction({ document: moveOnly, transaction: moveOnlyTransaction!, moveBehavior: "moveOnly" });
    expect(moveOnly.wires[0].points).toEqual([
      { x: 240, y: 200 },
      { x: 320, y: 200 }
    ]);
  });

  it("creates and extends a wire when directly connected pins are dragged apart", () => {
    const document: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      notes: [],
      components: [fixtureComponent("resistor", "R1", 200, 200), fixtureComponent("resistor", "R2", 280, 200)],
      wires: [],
      junctions: []
    });
    const transaction = beginSelectionMoveTransaction({
      document,
      activeComponentId: "R1",
      selectedIds: new Set(["R1"])
    });
    expect(transaction).not.toBeNull();

    document.components[0].x = 160;
    const first = applySelectionMoveTransaction({ document, transaction: transaction!, moveBehavior: "stretch" });
    expect(first.updatedWireIds.size).toBe(1);
    expect(document.wires).toHaveLength(1);
    expect(document.wires[0].points).toEqual([
      { x: 240, y: 200 },
      { x: 200, y: 200 }
    ]);

    document.components[0].x = 120;
    applySelectionMoveTransaction({ document, transaction: transaction!, moveBehavior: "stretch" });
    expect(document.wires).toHaveLength(1);
    expect(document.wires[0].points).toEqual([
      { x: 240, y: 200 },
      { x: 160, y: 200 }
    ]);

    document.components[0].x = 200;
    const returned = applySelectionMoveTransaction({ document, transaction: transaction!, moveBehavior: "stretch" });
    expect(returned.updatedWireIds.size).toBe(1);
    expect(document.wires).toEqual([]);
  });

  it("keeps the direct-pin anchor when an existing endpoint wire moves with the pin", () => {
    const document: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      notes: [],
      components: [fixtureComponent("resistor", "R1", 200, 200), fixtureComponent("resistor", "R2", 280, 200)],
      wires: [fixtureWire("external", [{ x: 240, y: 200 }, { x: 240, y: 280 }])],
      junctions: []
    });
    const transaction = beginSelectionMoveTransaction({
      document,
      activeComponentId: "R1",
      selectedIds: new Set(["R1"])
    });

    document.components[0].x = 160;
    applySelectionMoveTransaction({ document, transaction: transaction!, moveBehavior: "stretch" });

    expect(document.wires.find((wire) => wire.id === "external")?.points[0]).toEqual({ x: 200, y: 200 });
    expect(document.wires.some((wire) => wire.id !== "external" && wire.points.some((point) => point.x === 240 && point.y === 200))).toBe(true);
  });

  it("leaves a through wire fixed and adds a branch when moving a pin from its interior", () => {
    const document: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      notes: [],
      components: [fixtureComponent("resistor", "R1", 200, 200)],
      wires: [fixtureWire("through", [{ x: 120, y: 200 }, { x: 280, y: 200 }])],
      junctions: []
    });
    const transaction = beginSelectionMoveTransaction({
      document,
      activeComponentId: "R1",
      selectedIds: new Set(["R1"])
    });

    document.components[0].y = 240;
    applySelectionMoveTransaction({ document, transaction: transaction!, moveBehavior: "stretch" });

    expect(document.wires.find((wire) => wire.id === "through")?.points).toEqual([
      { x: 120, y: 200 },
      { x: 160, y: 200 },
      { x: 240, y: 200 },
      { x: 280, y: 200 }
    ]);
    expect(document.wires.some((wire) => wire.id !== "through")).toBe(true);
  });

  it("moves the terminal segment with a perpendicular component drag and shortens its follower", () => {
    const document: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      notes: [],
      components: [fixtureComponent("resistor", "R1", 200, 200), fixtureComponent("resistor", "R2", 520, 400)],
      wires: [
        fixtureWire("left", [{ x: 240, y: 200 }, { x: 360, y: 200 }]),
        fixtureWire("stem", [{ x: 360, y: 200 }, { x: 360, y: 400 }]),
        fixtureWire("terminal", [{ x: 360, y: 400 }, { x: 480, y: 400 }])
      ],
      junctions: []
    });
    const transaction = beginSelectionMoveTransaction({
      document,
      activeComponentId: "R2",
      selectedIds: new Set(["R2"])
    });

    document.components[1].y = 300;
    applySelectionMoveTransaction({ document, transaction: transaction!, moveBehavior: "stretch" });

    expect(document.wires.find((wire) => wire.id === "left")?.points).toEqual([
      { x: 240, y: 200 },
      { x: 360, y: 200 }
    ]);
    expect(document.wires.find((wire) => wire.id === "stem")?.points).toEqual([
      { x: 360, y: 200 },
      { x: 360, y: 300 }
    ]);
    expect(document.wires.find((wire) => wire.id === "terminal")?.points).toEqual([
      { x: 360, y: 300 },
      { x: 480, y: 300 }
    ]);
  });

  it("keeps a T-junction trunk fixed when moving its terminal component", () => {
    const document: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      notes: [],
      components: [fixtureComponent("resistor", "R1", 200, 200), fixtureComponent("resistor", "R2", 440, 200)],
      wires: [
        fixtureWire("left", [{ x: 240, y: 200 }, { x: 320, y: 200 }]),
        fixtureWire("right", [{ x: 320, y: 200 }, { x: 400, y: 200 }]),
        fixtureWire("trunk", [{ x: 320, y: 80 }, { x: 320, y: 200 }])
      ],
      junctions: [{ x: 320, y: 200 }]
    });
    const transaction = beginSelectionMoveTransaction({
      document,
      activeComponentId: "R1",
      selectedIds: new Set(["R1"])
    });

    document.components[0].y = 180;
    applySelectionMoveTransaction({ document, transaction: transaction!, moveBehavior: "stretch" });
    document.components[0].y = 160;
    applySelectionMoveTransaction({ document, transaction: transaction!, moveBehavior: "stretch" });

    expect(document.wires.find((wire) => wire.id === "left")?.points).toEqual([
      { x: 240, y: 160 },
      { x: 240, y: 200 },
      { x: 320, y: 200 }
    ]);
    expect(document.wires.find((wire) => wire.id === "right")?.points).toEqual([
      { x: 320, y: 200 },
      { x: 400, y: 200 }
    ]);
    expect(document.wires.find((wire) => wire.id === "trunk")?.points).toEqual([
      { x: 320, y: 80 },
      { x: 320, y: 200 }
    ]);
    expect(document.junctions).toEqual([{ x: 320, y: 200 }]);
    expect(document.wires.some((wire) => wire.id.startsWith("drag-left-junction-"))).toBe(false);
  });

  it("preserves both sides of a fixed T-junction when moving two terminal components", () => {
    const document: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      notes: [],
      components: [
        fixtureComponent("resistor", "R1", 200, 200),
        fixtureComponent("resistor", "R2", 440, 200),
        fixtureComponent("resistor", "R3", 320, 320, 90)
      ],
      wires: [
        fixtureWire("left", [{ x: 240, y: 200 }, { x: 320, y: 200 }]),
        fixtureWire("right", [{ x: 320, y: 200 }, { x: 400, y: 200 }]),
        fixtureWire("trunk", [{ x: 320, y: 200 }, { x: 320, y: 280 }])
      ],
      junctions: [{ x: 320, y: 200 }]
    });
    const transaction = beginSelectionMoveTransaction({
      document,
      activeComponentId: "R1",
      selectedIds: new Set(["R1", "R2"])
    });

    document.components[0].y = 180;
    applySelectionMoveTransaction({ document, transaction: transaction!, moveBehavior: "stretch" });
    document.components[0].y = 160;
    applySelectionMoveTransaction({ document, transaction: transaction!, moveBehavior: "stretch" });
    applyNormalizedDocumentWires(document);

    expect(document.wires.map((wire) => wire.points)).toEqual(expect.arrayContaining([
      [{ x: 240, y: 160 }, { x: 240, y: 200 }],
      [{ x: 240, y: 200 }, { x: 320, y: 200 }],
      [{ x: 320, y: 200 }, { x: 400, y: 200 }],
      [{ x: 400, y: 200 }, { x: 400, y: 160 }],
      [{ x: 320, y: 200 }, { x: 320, y: 280 }]
    ]));
    expect(document.junctions).toEqual([{ x: 320, y: 200 }]);
  });

  it("moves a selected junction and stretches its unselected incident wires", () => {
    const document: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      notes: [],
      components: [
        fixtureComponent("resistor", "R1", 200, 200),
        fixtureComponent("resistor", "R2", 440, 200),
        fixtureComponent("resistor", "R3", 320, 320, 90)
      ],
      wires: [
        fixtureWire("left", [{ x: 240, y: 200 }, { x: 320, y: 200 }]),
        fixtureWire("right", [{ x: 320, y: 200 }, { x: 400, y: 200 }]),
        fixtureWire("trunk", [{ x: 320, y: 200 }, { x: 320, y: 280 }])
      ],
      junctions: [{ x: 320, y: 200 }]
    });
    const transaction = beginSelectionMoveTransaction({
      document,
      activeComponentId: "R1",
      selectedIds: new Set(["R1", "left", "junction-320-200"])
    });

    document.components[0].y = 160;
    const result = applySelectionMoveTransaction({ document, transaction: transaction!, moveBehavior: "stretch" });
    applyNormalizedDocumentWires(document);

    expect(result.transformedJunctionIds).toEqual(["junction-320-160"]);
    expect(document.wires.map((wire) => wire.points)).toEqual(expect.arrayContaining([
      [{ x: 240, y: 160 }, { x: 320, y: 160 }],
      [{ x: 320, y: 160 }, { x: 400, y: 160 }],
      [{ x: 400, y: 160 }, { x: 400, y: 200 }],
      [{ x: 320, y: 160 }, { x: 320, y: 280 }]
    ]));
  });

  it("moves an unselected wire rigidly when its component pin and selected junction move together", () => {
    const document: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      notes: [],
      components: [
        fixtureComponent("resistor", "R1", 200, 200),
        fixtureComponent("resistor", "R2", 440, 200),
        fixtureComponent("resistor", "R3", 320, 320, 90)
      ],
      wires: [
        fixtureWire("left", [{ x: 240, y: 200 }, { x: 320, y: 200 }]),
        fixtureWire("right", [{ x: 320, y: 200 }, { x: 400, y: 200 }]),
        fixtureWire("trunk", [{ x: 320, y: 200 }, { x: 320, y: 280 }])
      ],
      junctions: [{ x: 320, y: 200 }]
    });
    const transaction = beginSelectionMoveTransaction({
      document,
      activeComponentId: "R1",
      selectedIds: new Set(["R1", "junction-320-200"])
    });

    document.components[0].y = 180;
    applySelectionMoveTransaction({ document, transaction: transaction!, moveBehavior: "stretch" });
    document.components[0].y = 160;
    applySelectionMoveTransaction({ document, transaction: transaction!, moveBehavior: "stretch" });
    applyNormalizedDocumentWires(document);

    expect(document.wires.map((wire) => wire.points)).toEqual(expect.arrayContaining([
      [{ x: 240, y: 160 }, { x: 320, y: 160 }],
      [{ x: 320, y: 160 }, { x: 400, y: 160 }],
      [{ x: 400, y: 160 }, { x: 400, y: 200 }],
      [{ x: 320, y: 160 }, { x: 320, y: 280 }]
    ]));
    expect(document.wires).toHaveLength(4);
  });

  it("collapses the pin-side dogleg when the terminal component returns to the T-junction height", () => {
    const document: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      notes: [],
      components: [fixtureComponent("resistor", "R1", 200, 200), fixtureComponent("resistor", "R2", 440, 200)],
      wires: [
        fixtureWire("left", [{ x: 240, y: 200 }, { x: 320, y: 200 }]),
        fixtureWire("right", [{ x: 320, y: 200 }, { x: 400, y: 200 }]),
        fixtureWire("trunk", [{ x: 320, y: 80 }, { x: 320, y: 200 }])
      ],
      junctions: [{ x: 320, y: 200 }]
    });
    const moveUp = beginSelectionMoveTransaction({
      document,
      activeComponentId: "R1",
      selectedIds: new Set(["R1"])
    });

    document.components[0].y = 160;
    applySelectionMoveTransaction({ document, transaction: moveUp!, moveBehavior: "stretch" });
    applyNormalizedDocumentWires(document);

    const moveDown = beginSelectionMoveTransaction({
      document,
      activeComponentId: "R1",
      selectedIds: new Set(["R1"])
    });
    document.components[0].y = 200;
    applySelectionMoveTransaction({ document, transaction: moveDown!, moveBehavior: "stretch" });
    applyNormalizedDocumentWires(document);

    expect(document.wires.map((wire) => wire.points)).toEqual(expect.arrayContaining([
      [{ x: 240, y: 200 }, { x: 320, y: 200 }],
      [{ x: 320, y: 200 }, { x: 400, y: 200 }],
      [{ x: 320, y: 80 }, { x: 320, y: 200 }]
    ]));
    expect(document.wires).toHaveLength(3);
    expect(document.junctions).toEqual([{ x: 320, y: 200 }]);
  });

  it("re-expands the pin-side dogleg when one drag crosses the T-junction height", () => {
    const document: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      notes: [],
      components: [fixtureComponent("resistor", "R1", 200, 160), fixtureComponent("resistor", "R2", 440, 200)],
      wires: [
        fixtureWire("left", [{ x: 240, y: 160 }, { x: 240, y: 200 }]),
        fixtureWire("left-segment-1", [{ x: 240, y: 200 }, { x: 320, y: 200 }]),
        fixtureWire("right", [{ x: 320, y: 200 }, { x: 400, y: 200 }]),
        fixtureWire("trunk", [{ x: 320, y: 80 }, { x: 320, y: 200 }])
      ],
      junctions: [{ x: 320, y: 200 }]
    });
    const moveDown = beginSelectionMoveTransaction({
      document,
      activeComponentId: "R1",
      selectedIds: new Set(["R1"])
    });

    document.components[0].y = 200;
    applySelectionMoveTransaction({ document, transaction: moveDown!, moveBehavior: "stretch" });
    expect(document.wires.find((wire) => wire.id === "left")?.points).toEqual([{ x: 240, y: 200 }]);

    document.components[0].y = 240;
    applySelectionMoveTransaction({ document, transaction: moveDown!, moveBehavior: "stretch" });
    const beforePointerUp = document.wires.map((wire) => ({ ...wire, points: wire.points.map((point) => ({ ...point })) }));
    applySelectionMoveTransaction({ document, transaction: moveDown!, moveBehavior: "stretch" });
    expect(document.wires).toEqual(beforePointerUp);
    applyNormalizedDocumentWires(document);

    expect(document.wires.map((wire) => wire.points)).toEqual(expect.arrayContaining([
      [{ x: 240, y: 240 }, { x: 240, y: 200 }],
      [{ x: 240, y: 200 }, { x: 320, y: 200 }],
      [{ x: 320, y: 200 }, { x: 400, y: 200 }],
      [{ x: 320, y: 80 }, { x: 320, y: 200 }]
    ]));
    expect(document.wires).toHaveLength(4);
    expect(document.junctions).toEqual([{ x: 320, y: 200 }]);
  });

  it("does not attach a moving pin to a wire encountered after drag start", () => {
    const blocker = fixtureWire("stationary", [
      { x: 280, y: 160 },
      { x: 280, y: 240 }
    ]);
    const document: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      notes: [],
      components: [fixtureComponent("resistor", "R1", 200, 200)],
      wires: [blocker],
      junctions: []
    });
    const transaction = beginSelectionMoveTransaction({
      document,
      activeComponentId: "R1",
      selectedIds: new Set(["R1"])
    });
    expect(transaction).not.toBeNull();

    document.components[0].x = 240;
    applySelectionMoveTransaction({ document, transaction: transaction!, moveBehavior: "stretch" });
    document.components[0].x = 280;
    const second = applySelectionMoveTransaction({ document, transaction: transaction!, moveBehavior: "stretch" });

    expect(second.updatedWireIds).toEqual(new Set());
    expect(document.wires).toEqual([blocker]);
  });
});
