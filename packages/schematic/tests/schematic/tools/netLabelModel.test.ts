import { fixtureDocument } from "../support/fixtureDocument";
import { describe, expect, it } from "vitest";
import { instantiateCopyAt, type CopySource } from "../../../src/schematic/copyModel";
import { createSchematicDocumentHistoryAdapter } from "../support/documentHistory";
import { restoreSchematicDocument } from "../../../src/schematic/document/documentModel";
import {
  bindStandaloneNetLabelsAtPoint,
  netLabelPosition,
  remapNetLabelsAfterWireNormalization,
  remapNetLabelsAfterWirePathChange,
  snapshotNetLabelWires,
  wireAttachmentAtPoint
} from "../../../src/schematic/netLabelModel";
import { resolveSchematicNets } from "../../../src/schematic/netResolution";
import { makeNetLabelCell } from "../../../src/schematic/renderer";
import { buildSchematicSelectionSvg } from "../../../src/schematic/selection/selectionExport";
import { deleteSchematicSelection, toggleTemporaryDeletedByIds } from "../../../src/schematic/selection/selectionDeleteModel";
import { setMixedSelection } from "../../../src/schematic/selection/selectionModel";
import { projectSchematicSelection } from "../../../src/schematic/selection/selectionProjection";
import { transformSelectionDocumentGeometry } from "../../../src/schematic/selection/selectionTransformModel";
import type { NetLabel, Point, SchematicDocument, Wire } from "../../../src/schematic/types";

function wire(id: string, points: Point[], temporarilyDeleted = false): Wire {
  return { id, points, routeMode: "orthogonal", temporarilyDeleted };
}

function label(id: string, name: string, wireId: string, point: Point): NetLabel {
  return { id, name, attachment: { wireId, point } };
}

function document(wires: Wire[], netLabels: NetLabel[] = []): SchematicDocument {
  return fixtureDocument({

    junctionAppearances: [],
    notes: [], components: [], wires, junctions: [], netLabels });
}

describe("schematic net label attachment lifecycle", () => {
  it("attaches only to active wire geometry and honors a preferred wire", () => {
    const doc = document([
      wire("horizontal", [{ x: 0, y: 0 }, { x: 80, y: 0 }]),
      wire("vertical", [{ x: 40, y: -40 }, { x: 40, y: 40 }]),
      wire("inactive", [{ x: 0, y: 80 }, { x: 80, y: 80 }], true)
    ]);

    expect(wireAttachmentAtPoint(doc, { x: 41, y: 1 }, "vertical")).toEqual({
      wireId: "vertical",
      point: { x: 40, y: 0 }
    });
    expect(wireAttachmentAtPoint(doc, { x: 20, y: 80 })).toBeNull();
    expect(wireAttachmentAtPoint(doc, { x: 100, y: 100 })).toBeNull();
  });

  it("rebinds labels to descendant wires after normalization splits a path", () => {
    const previous = [wire("main", [{ x: 0, y: 0 }, { x: 80, y: 0 }])];
    const normalized = [
      wire("main", [{ x: 0, y: 0 }, { x: 40, y: 0 }]),
      wire("main-segment-1", [{ x: 40, y: 0 }, { x: 80, y: 0 }])
    ];
    const doc = document(normalized, [label("out", "OUT", "main", { x: 60, y: 0 })]);

    remapNetLabelsAfterWireNormalization(doc, previous, normalized);

    expect(doc.netLabels?.[0].attachment).toEqual({ wireId: "main-segment-1", point: { x: 60, y: 0 } });
  });

  it("follows uniform wire movement and projects onto a stretched path", () => {
    const moved = document(
      [wire("w", [{ x: 20, y: 20 }, { x: 100, y: 20 }])],
      [label("moving", "N", "w", { x: 40, y: 0 })]
    );
    remapNetLabelsAfterWirePathChange(moved, [wire("w", [{ x: 0, y: 0 }, { x: 80, y: 0 }])]);
    expect(moved.netLabels?.[0].attachment.point).toEqual({ x: 60, y: 20 });

    moved.wires[0].points = [{ x: 20, y: 20 }, { x: 40, y: 20 }];
    remapNetLabelsAfterWirePathChange(moved, [wire("w", [{ x: 20, y: 20 }, { x: 100, y: 20 }])]);
    expect(moved.netLabels?.[0].attachment.point).toEqual({ x: 30, y: 20 });
  });

  it("keeps a remapped label on a valid grid point of a changed free-angle wire", () => {
    const previous: Wire = {
      id: "diagonal",
      routeMode: "freeAngle",
      points: [{ x: 0, y: 0 }, { x: 80, y: 40 }]
    };
    const next: Wire = {
      ...previous,
      points: [{ x: 0, y: 0 }, { x: 80, y: 80 }]
    };
    const doc = document(
      [next],
      [label("moving", "N", "diagonal", { x: 40, y: 20 })]
    );

    remapNetLabelsAfterWirePathChange(doc, [previous]);

    expect(doc.netLabels[0].attachment.point).toEqual({ x: 30, y: 30 });
    expect(wireAttachmentAtPoint(doc, doc.netLabels[0].attachment.point, "diagonal"))
      .toEqual({ wireId: "diagonal", point: { x: 30, y: 30 } });
  });

  it("snapshots only wires that currently support net labels", () => {
    const labeled = wire("labeled", [{ x: 0, y: 0 }, { x: 80, y: 0 }]);
    const unrelated = Array.from({ length: 100 }, (_value, index) =>
      wire(`unrelated-${index}`, [{ x: 0, y: index * 20 + 20 }, { x: 80, y: index * 20 + 20 }])
    );
    const doc = document([labeled, ...unrelated], [label("out", "OUT", labeled.id, { x: 40, y: 0 })]);

    const snapshot = snapshotNetLabelWires(doc);

    expect(snapshot).toEqual([labeled]);
    expect(snapshot[0]).not.toBe(labeled);
    expect(snapshot[0].points[0]).not.toBe(labeled.points[0]);
  });

  it("keeps a floating label detached while restoring and normalizing wires beneath it", () => {
    const doc = document(
      [wire("under-label", [{ x: 0, y: 0 }, { x: 80, y: 0 }])],
      [label("floating", "FLOAT", "", { x: 41, y: 1 })]
    );

    const restored = restoreSchematicDocument(doc);

    expect(restored.netLabels[0].attachment).toEqual({
      wireId: "",
      point: { x: 40, y: 0 }
    });
    expect(snapshotNetLabelWires(restored)).toEqual([]);
    expect(resolveSchematicNets(restored).labelStates.get("floating")?.status).toBe("inactive");
  });

  it("maps a label near an endpoint to the moved parallel segment instead of a new perpendicular lead", () => {
    const previous = wire("w", [{ x: 0, y: 0 }, { x: 100, y: 0 }]);
    const doc = document(
      [wire("w", [{ x: 0, y: 0 }, { x: 0, y: 40 }, { x: 100, y: 40 }, { x: 100, y: 0 }])],
      [label("moving", "N", "w", { x: 20, y: 0 })]
    );

    remapNetLabelsAfterWirePathChange(doc, [previous]);

    expect(doc.netLabels?.[0].attachment.point).toEqual({ x: 20, y: 40 });
  });
});

describe("schematic net label copy and transform", () => {
  it("maps copied labels to copied wires and leaves standalone labels ready for rebinding", () => {
    const source: CopySource = fixtureDocument({
      junctionAppearances: [],
      components: [],
      wires: [wire("source-wire", [{ x: 0, y: 0 }, { x: 80, y: 0 }])],
      netLabels: [
        label("attached", "A", "source-wire", { x: 40, y: 0 }),
        label("standalone", "B", "", { x: 0, y: 40 })
      ],
      notes: [],

    });
    let id = 0;
    const copied = instantiateCopyAt({ source, anchor: { x: 0, y: 0 } }, { x: 100, y: 100 }, {
      preview: false,
      nextComponentRef: () => "unused",
      createId: () => `copy-${++id}`
    });

    expect(copied.netLabels?.[0].attachment).toEqual({ wireId: "copy-1", point: { x: 140, y: 100 } });
    expect(copied.netLabels?.[1].attachment).toEqual({ wireId: "", point: { x: 100, y: 140 } });
  });

  it("binds every standalone copied label to the user's actual click point", () => {
    const doc = document([wire("target", [{ x: 0, y: 0 }, { x: 120, y: 0 }])]);
    const labels = [label("copy", "OUT", "", { x: 20, y: 40 })];

    expect(bindStandaloneNetLabelsAtPoint(doc, labels, { x: 81, y: 1 })).toBe(true);
    expect(labels[0].attachment).toEqual({ wireId: "target", point: { x: 80, y: 0 } });

    const invalid = [label("invalid", "OUT", "", { x: 0, y: 0 })];
    expect(bindStandaloneNetLabelsAtPoint(doc, invalid, { x: 200, y: 200 })).toBe(false);
    expect(invalid[0].attachment.wireId).toBe("");
  });

  it("uses attachment points for group transforms and keeps text upright", () => {
    const attached = label("net-label", "OUT", "w", { x: 40, y: 0 });
    const doc = document([wire("w", [{ x: 0, y: 0 }, { x: 80, y: 0 }])], [attached]);
    const standaloneSelection = projectSchematicSelection(doc, setMixedSelection([attached.id], []));

    transformSelectionDocumentGeometry({ document: doc, selection: standaloneSelection, kind: "rotate" });
    expect(attached.attachment.point).toEqual({ x: 40, y: 0 });

    const circuitSelection = projectSchematicSelection(doc, setMixedSelection(["w", attached.id], []));
    transformSelectionDocumentGeometry({ document: doc, selection: circuitSelection, kind: "rotate" });
    expect(doc.wires[0].points).toEqual([{ x: 40, y: -40 }, { x: 40, y: 40 }]);
    expect(attached.attachment.point).toEqual({ x: 40, y: 0 });
    expect(makeNetLabelCell(attached).angle()).toBe(0);
  });
});

describe("schematic net label deletion and history", () => {
  it("cascades permanent supporting-wire deletion but keeps labels through temporary deletion", () => {
    const attached = label("label", "OUT", "w", { x: 40, y: 0 });
    const doc = document([wire("w", [{ x: 0, y: 0 }, { x: 80, y: 0 }])], [attached]);

    toggleTemporaryDeletedByIds(doc, ["w"]);
    expect(doc.netLabels).toHaveLength(1);
    expect(resolveSchematicNets(doc).labelStates.get(attached.id)?.status).toBe("inactive");
    toggleTemporaryDeletedByIds(doc, ["w"]);
    expect(resolveSchematicNets(doc).labelStates.get(attached.id)?.status).toBe("valid");

    const selection = projectSchematicSelection(doc, setMixedSelection(["w"], []));
    expect(deleteSchematicSelection(doc, selection).removedCount).toBe(2);
    expect(doc.wires).toEqual([]);
    expect(doc.netLabels).toEqual([]);
  });

  it("preserves label edits through undo and redo", () => {
    const doc = document(
      [wire("w", [{ x: 0, y: 0 }, { x: 80, y: 0 }])],
      [label("label", "A", "w", { x: 40, y: 0 })]
    );
    const history = createSchematicDocumentHistoryAdapter(doc);
    history.resetBaseline(doc);
    doc.netLabels![0].name = "B";
    history.push(doc);

    expect(history.undo()?.netLabels?.[0].name).toBe("A");
    expect(history.redo()?.netLabels?.[0].name).toBe("B");
  });

  it("preserves floating attachment state through normalized history snapshots", () => {
    const doc = document(
      [wire("under-label", [{ x: 0, y: 0 }, { x: 80, y: 0 }])],
      [label("floating", "A", "", { x: 41, y: 1 })]
    );
    const history = createSchematicDocumentHistoryAdapter(doc);
    history.resetBaseline(doc);
    doc.netLabels[0].name = "B";
    history.push(doc);

    const undone = history.undo();
    const redone = history.redo();

    expect(undone?.netLabels[0]).toMatchObject({
      name: "A",
      attachment: { wireId: "", point: { x: 40, y: 0 } }
    });
    expect(redone?.netLabels[0]).toMatchObject({
      name: "B",
      attachment: { wireId: "", point: { x: 41, y: 1 } }
    });
  });
});

describe("schematic net label rendering", () => {
  it("renders conflict state in JointJS and selection SVG export", () => {
    const winner = label("winner", "A", "w", { x: 20, y: 0 });
    const loser = label("loser", "B", "w", { x: 60, y: 0 });
    const doc = document([wire("w", [{ x: 0, y: 0 }, { x: 80, y: 0 }])], [winner, loser]);
    const status = resolveSchematicNets(doc).labelStates.get(loser.id)?.status;
    const cell = makeNetLabelCell(loser, { status });

    expect(netLabelPosition(loser)).toEqual({ x: 66, y: -18 });
    expect(cell.attr("label/fill")).toBe("#b00020");
    expect(cell.attr("label/textDecoration")).toBe("underline");

    const exported = buildSchematicSelectionSvg(fixtureDocument({
      components: [],
      wires: [],
      junctionPoints: [],
      netLabels: [loser],
      netLabelStatuses: { [loser.id]: "conflict" },
      notes: []
    }));
    expect(exported?.svg).toContain('fill="#b00020"');
    expect(exported?.svg).toContain('text-decoration="underline"');
  });
});
