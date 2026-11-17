import { authorFixture, fixtureDocument } from "../support/fixtureDocument";
import { describe, expect, it } from "vitest";
import {
  captureTransformRenderSnapshot,
  changedTransformWireIds
} from "../../../src/schematic/transformRenderModel";
import type { SchematicDocument, Wire } from "../../../src/schematic/types";

function wire(id: string, points = [{ x: 0, y: 0 }, { x: 20, y: 0 }]): Wire {
  return { id, routeMode: "orthogonal", points };
}

function documentWithWires(wires: Wire[]): SchematicDocument {
  return fixtureDocument({

    junctionAppearances: [],
    netLabels: [],
    notes: [], components: [], wires, junctions: [] });
}

describe("schematic transform render model", () => {
  it("keeps selected object ids and ignores unchanged wires", () => {
    const document = documentWithWires([wire("w1")]);
    const snapshot = captureTransformRenderSnapshot(document, {
      componentIds: ["r1"],
      noteIds: ["n1"]
    });

    expect(snapshot.componentIds).toEqual(["r1"]);
    expect(snapshot.noteIds).toEqual(["n1"]);
    expect(changedTransformWireIds(snapshot, document)).toEqual(new Set());
  });

  it("detects changed, added, and removed wires", () => {
    const document = documentWithWires([wire("changed"), wire("removed")]);
    const snapshot = captureTransformRenderSnapshot(document, { componentIds: [], noteIds: [] });
    document.wires = [
      wire("changed", [{ x: 0, y: 0 }, { x: 40, y: 0 }]),
      wire("added")
    ];
    authorFixture(document);

    expect(changedTransformWireIds(snapshot, document)).toEqual(new Set(["changed", "added", "removed"]));
  });

  it("detects render-affecting wire state changes", () => {
    const document = documentWithWires([wire("w1"), wire("w2")]);
    const snapshot = captureTransformRenderSnapshot(document, { componentIds: [], noteIds: [] });
    document.wires[0].temporarilyDeleted = true;
    document.wires[1].appearance = { variant: "wide", color: "#123456" };

    expect(changedTransformWireIds(snapshot, document)).toEqual(new Set(["w1", "w2"]));
  });
});
