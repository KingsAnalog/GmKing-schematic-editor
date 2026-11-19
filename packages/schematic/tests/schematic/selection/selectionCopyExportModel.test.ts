import { authorFixture, fixtureDocument } from "../support/fixtureDocument";
import { describe, expect, it } from "vitest";
import { presentationJunctions } from "../../../src/schematic/connectivity";
import { junctionId, makeComponentCell } from "../../../src/schematic/renderer";
import { collectSelectionBoxHits } from "../../../src/schematic/selection/selectionBoxModel";
import { paletteSymbolPreview } from "../../../src/schematic/instanceSelector";
import { buildSchematicSelectionSvg } from "../../../src/schematic/selection/selectionExport";
import {
  buildSelectionCopySource,
  buildSelectionExportInput,
  buildTargetCopySource,
  copyAnchorFromBounds,
  selectedExportJunctionPoints
} from "../../../src/schematic/selection/selectionCopyExportModel";
import { projectSchematicSelection } from "../../../src/schematic/selection/selectionProjection";
import { setMixedSelection } from "../../../src/schematic/selection/selectionModel";
import { fixtureComponent, fixtureNote, fixtureWire, mixedSelectionDoc } from "../support/fixtures";

describe("schematic selection copy/export model", () => {
  it("builds export input from a mixed component, wire, junction, and note selection", () => {
    const document = mixedSelectionDoc();
    const selection = setMixedSelection(["w-mixed", "R1", junctionId({ x: 280, y: 200 })], ["note-1"]);
    const projection = projectSchematicSelection(document, selection);

    const input = buildSelectionExportInput(projection, true);

    expect(input.components.map((component) => component.id)).toEqual(["R1"]);
    expect(input.wires.map((wire) => wire.id)).toEqual(["w-mixed"]);
    expect(input.junctionPoints).toEqual([{ x: 280, y: 200 }]);
    expect(input.notes.map((note) => note.id)).toEqual(["note-1"]);
    expect(input.presentationMode).toBe(true);
  });

  it("includes selected presentation-only junctions only in presentation exports", () => {
    const document = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      notes: [],
      components: [fixtureComponent("resistor", "R1", 0, 0, 90)],
      wires: [fixtureWire("through", [{ x: -40, y: 40 }, { x: 40, y: 40 }])],
      junctions: []
    });
    const selectionBox = collectSelectionBoxHits(
      document,
      { x: -80, y: -40 },
      { x: 80, y: 80 },
      presentationJunctions(document)
    );
    const selectedIds = new Set(selectionBox.ids);

    expect(selectedIds.has(junctionId({ x: 0, y: 40 }))).toBe(true);
    expect(selectedExportJunctionPoints(document, selectedIds, false)).toEqual([]);
    const exportJunctions = selectedExportJunctionPoints(document, selectedIds, true);
    expect(exportJunctions).toEqual([{ x: 0, y: 40 }]);

    const exported = buildSchematicSelectionSvg(fixtureDocument({
      netLabels: [],
      components: [],
      wires: [],
      junctionPoints: exportJunctions,
      notes: [],
      presentationMode: true
    }));
    expect(exported?.svg).toContain('data-junction="0,40"');
  });

  it("exports schematic prefixes and centered rectangle literal names", () => {
    const ordinary = buildSchematicSelectionSvg(fixtureDocument({
      netLabels: [],
      components: [fixtureComponent("capacitor", "64C2", 100, 100)],
      wires: [],
      junctionPoints: [],
      notes: []
    }));

    expect(ordinary?.svg).toMatch(
      /<text data-selector="refLabelPrefix"[^>]*font-style="normal"[^>]*>64<\/text><text data-selector="refLabelHead"[^>]*font-style="italic"[^>]*>C<\/text><text data-selector="refLabelTail"[^>]*>2<\/text>/
    );

    ["PFD", "64C2", "PFD/CP", "÷2"].forEach((ref, index) => {
      const literal = buildSchematicSelectionSvg(fixtureDocument({
        netLabels: [],
        components: [fixtureComponent("rectangle", ref, 100 + index * 120, 100)],
        wires: [],
        junctionPoints: [],
        notes: []
      }));

      expect(literal?.svg, ref).toMatch(
        new RegExp(`<text data-selector="refLabelPrefix"[^>]*font-weight="700"[^>]*font-style="normal"[^>]*font-size="16"[^>]*>${ref.replace("/", "\\/")}<\\/text>`)
      );
      expect(literal?.svg, ref).not.toContain('data-selector="refLabelHead"');
      expect(literal?.svg, ref).not.toContain('data-selector="refLabelTail"');
    });
  });

  it("renders default structured content in palette text and graphic previews", () => {
    const delay = paletteSymbolPreview("delay");
    const filter = paletteSymbolPreview("filter");

    expect(delay).toContain('data-symbol-content-run="0"');
    expect(delay).toContain("font-family=\"&quot;Inter&quot;");
    expect(delay).not.toContain("DLY");

    expect(filter).toContain('data-symbol-content-path="0"');
    expect(filter).toContain('stroke-width="2"');
    expect(filter).not.toContain("FLT");
  });

  it("keeps structured graphic content visible in canvas and placement previews", () => {
    const filter = fixtureComponent("filter", "FLT1", 100, 100);
    filter.appearance = { color: "#0072b2" };
    const canvasCell = makeComponentCell(filter);
    const previewCell = makeComponentCell(filter, { preview: true });

    expect(canvasCell.attr("symbolContentPath0/d")).toBeTruthy();
    expect(canvasCell.attr("symbolContentPath0/stroke")).toBe("#0072b2");
    expect(canvasCell.attr("symbolContentPath0/strokeWidth")).toBe(2);
    expect(canvasCell.attr("symbolContentPath0/opacity")).toBe(1);
    expect(previewCell.attr("symbolContentPath0/d")).toBe(canvasCell.attr("symbolContentPath0/d"));
    expect(previewCell.attr("symbolContentPath0/stroke")).toBe("#005f9e");
    expect(previewCell.attr("symbolContentPath0/strokeWidth")).toBe(2);
    expect(previewCell.attr("symbolContentPath0/opacity")).toBeGreaterThan(0);
  });

  it("exports structured graphics while keeping hidden labels and mirror-safe content", () => {
    const filter = fixtureComponent("filter", "FLT1", 100, 100);
    filter.mirrored = true;
    const exported = buildSchematicSelectionSvg(fixtureDocument({
      netLabels: [],
      components: [filter],
      wires: [],
      junctionPoints: [],
      notes: []
    }));

    expect(exported?.svg).toContain('data-selector="symbolContentPath0"');
    expect(exported?.svg).toMatch(/data-selector="symbolContentPath0"[^>]*stroke-width="2"/);
    expect(exported?.svg).not.toContain(">FLT1<");

    const contentTransforms = Array.from(
      exported?.svg.matchAll(/data-selector="symbolContent(?:Path|Run)\d+"[^>]*transform="([^"]+)"/g) ?? []
    ).map((match) => match[1]);
    expect(contentTransforms.length).toBeGreaterThan(0);
    expect(contentTransforms.every((transform) => !transform.includes("matrix("))).toBe(true);
  });

  it("builds copy source with selected objects and related junction intents", () => {
    const document = mixedSelectionDoc();
    const selection = setMixedSelection(["w-mixed", "R1", junctionId({ x: 280, y: 200 })], ["note-1"]);
    const projection = projectSchematicSelection(document, selection);

    const source = buildSelectionCopySource(projection, document.junctionAppearances, [], document.connections);

    expect(source.components.map((component) => component.id)).toEqual(["R1"]);
    expect(source.wires.map((wire) => wire.id)).toEqual(["w-mixed"]);
    expect(source.notes.map((note) => note.id)).toEqual(["note-1"]);
    expect(source.connections.wires["w-mixed"]).toEqual(document.connections.wires["w-mixed"]);
  });

  it("normalizes a selected label to floating when its supporting wire is not selected", () => {
    const document = mixedSelectionDoc();
    document.netLabels = [{
      id: "label-only",
      name: "OUT",
      attachment: { wireId: "w-mixed", point: { x: 280, y: 200 } }
    }];
    const selection = setMixedSelection(["label-only"], []);
    const projection = projectSchematicSelection(document, selection);

    const source = buildSelectionCopySource(
      projection,
      document.junctionAppearances,
      [],
      document.connections
    );

    expect(source.wires).toEqual([]);
    expect(source.netLabels).toEqual([{
      id: "label-only",
      name: "OUT",
      attachment: { wireId: "", point: { x: 280, y: 200 } }
    }]);
    expect(document.netLabels[0].attachment.wireId).toBe("w-mixed");
  });

  it("preserves a selected label attachment when its supporting wire is also selected", () => {
    const document = mixedSelectionDoc();
    document.netLabels = [{
      id: "attached-label",
      name: "OUT",
      attachment: { wireId: "w-mixed", point: { x: 280, y: 200 } }
    }];
    const selection = setMixedSelection(["w-mixed", "attached-label"], []);
    const projection = projectSchematicSelection(document, selection);

    const source = buildSelectionCopySource(
      projection,
      document.junctionAppearances,
      [],
      document.connections
    );

    expect(source.wires.map((wire) => wire.id)).toEqual(["w-mixed"]);
    expect(source.netLabels[0].attachment).toEqual({
      wireId: "w-mixed",
      point: { x: 280, y: 200 }
    });
  });

  it("builds a target copy source from mixed targets while preserving dedupe and document order", () => {
    const document = mixedSelectionDoc();
    document.wires = [fixtureWire("w-before", [{ x: 100, y: 100 }, { x: 120, y: 100 }]), ...document.wires];
    authorFixture(document);
    document.notes = [fixtureNote("note-1", 220, 260), fixtureNote("note-2", 500, 260)];
    const visibleJunctionId = junctionId({ x: 280, y: 200 });

    const projection = buildTargetCopySource(
      document,
      ["C1", "w-mixed", visibleJunctionId, "R1", "w-before", "R1", "w-mixed"],
      ["note-2", "note-1", "note-2"]
    );

    expect(projection.ids).toEqual(["C1", "w-mixed", visibleJunctionId, "R1", "w-before"]);
    expect(projection.noteIds).toEqual(["note-2", "note-1"]);
    expect(projection.source.components.map((component) => component.id)).toEqual(["R1", "C1"]);
    expect(projection.source.wires.map((wire) => wire.id)).toEqual(["w-before", "w-mixed"]);
    expect(projection.source.notes.map((note) => note.id)).toEqual(["note-1", "note-2"]);
    expect(projection.source.connections).toEqual(document.connections);
  });

  it("keeps stale targets in deduped ids without creating copy source objects", () => {
    const document = mixedSelectionDoc();

    const projection = buildTargetCopySource(
      document,
      ["missing-component", "junction-300-200", "not-a-junction-id", "missing-component"],
      ["missing-note", "other-missing-note", "missing-note"]
    );

    expect(projection.ids).toEqual(["missing-component", "junction-300-200", "not-a-junction-id"]);
    expect(projection.noteIds).toEqual(["missing-note", "other-missing-note"]);
    expect(projection.source.components).toEqual([]);
    expect(projection.source.wires).toEqual([]);
    expect(projection.source.notes).toEqual([]);
    expect(projection.source.connections).toEqual({ wires: {}, pins: {} });
  });

  it("uses the last pointer as anchor only when it is inside bounds", () => {
    const bounds = { x: 10, y: 10, width: 60, height: 60 };

    expect(copyAnchorFromBounds(bounds, { x: 64, y: 66 })).toEqual({ x: 60, y: 70 });
    expect(copyAnchorFromBounds(bounds, { x: 90, y: 40 })).toEqual({ x: 40, y: 40 });
    expect(copyAnchorFromBounds(bounds, null)).toEqual({ x: 40, y: 40 });
  });
});
