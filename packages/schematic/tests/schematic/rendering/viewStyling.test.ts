import { fixtureDocument } from "../support/fixtureDocument";
import { describe, expect, it } from "vitest";
import {
  componentCellAttrs,
  junctionBodyAttrs,
  SCHEMATIC_GRID,
  wireLineAttrs,
  wireSelectionHaloAttrs
} from "../../../src/schematic/renderer";
import {
  applySchematicCellSelectionStyles,
  selectionBoxBodyAttrs,
  setSchematicPresentationClass,
  setSchematicPresentationState,
  syncSchematicPaperModeClasses,
  type SchematicStyleCell
} from "../../../src/schematic/viewStyling";
import { fixtureComponent, fixtureWire } from "../support/fixtures";
import type { ToolMode } from "../../../src/schematic/toolState";
import type { SchematicDocument } from "../../../src/schematic/types";

class FakeClassList {
  private readonly names = new Set<string>();

  contains(name: string) {
    return this.names.has(name);
  }

  toggle(name: string, force?: boolean) {
    const enabled = force ?? !this.names.has(name);
    if (enabled) this.names.add(name);
    else this.names.delete(name);
    return enabled;
  }
}

class FakePaperElement {
  readonly classList = new FakeClassList();
}

class FakePaper {
  clearGridCalls = 0;
  readonly drawGridCalls: unknown[] = [];

  clearGrid() {
    this.clearGridCalls += 1;
  }

  drawGrid(grid: unknown) {
    this.drawGridCalls.push(grid);
  }
}

class FakeCell implements SchematicStyleCell {
  readonly attrCalls: unknown[] = [];

  constructor(
    readonly id: string,
    private readonly attributes: Record<string, unknown>
  ) {}

  get(attribute: string) {
    return this.attributes[attribute];
  }

  attr(attributes: unknown) {
    this.attrCalls.push(attributes);
  }
}

const resistor = fixtureComponent("resistor", "R1", 100, 120);
const wire = fixtureWire("w1", [
  { x: 0, y: 0 },
  { x: 80, y: 0 }
]);

function apply(cells: FakeCell[], options: Partial<Parameters<typeof applySchematicCellSelectionStyles>[0]> = {}) {
  const document: SchematicDocument = options.document ?? fixtureDocument({

    junctionAppearances: [],
    netLabels: [],
    notes: [],
    components: [resistor],
    wires: [wire],
    junctions: []
  });
  applySchematicCellSelectionStyles({
    cells,
    document,
    selectedIds: options.selectedIds ?? new Set<string>(),
    hoverIds: options.hoverIds ?? new Set<string>(),
    presentationMode: options.presentationMode ?? false
  });
}

describe("schematic view styling", () => {
  it("sets presentation class without touching grid state", () => {
    const paperEl = new FakePaperElement();

    setSchematicPresentationClass(paperEl, true);
    expect(paperEl.classList.contains("is-presentation")).toBe(true);

    setSchematicPresentationClass(paperEl, false);
    expect(paperEl.classList.contains("is-presentation")).toBe(false);
  });

  it("syncs presentation class and grid state", () => {
    const paperEl = new FakePaperElement();
    const paper = new FakePaper();

    setSchematicPresentationState({
      paperEl,
      paper,
      presentationMode: true,
      grid: SCHEMATIC_GRID
    });

    expect(paperEl.classList.contains("is-presentation")).toBe(true);
    expect(paper.clearGridCalls).toBe(1);
    expect(paper.drawGridCalls).toEqual([]);

    setSchematicPresentationState({
      paperEl,
      paper,
      presentationMode: false,
      grid: SCHEMATIC_GRID
    });

    expect(paperEl.classList.contains("is-presentation")).toBe(false);
    expect(paper.clearGridCalls).toBe(1);
    expect(paper.drawGridCalls).toEqual([SCHEMATIC_GRID]);
  });

  it.each([
    ["select", false, false],
    ["place", false, false],
    ["copy", false, false],
    ["wire", false, false],
    ["delete", true, false],
    ["temp-delete", false, true]
  ] satisfies Array<[ToolMode, boolean, boolean]>)("syncs paper mode classes for %s mode", (mode, deleteMode, tempDeleteMode) => {
    const paperEl = new FakePaperElement();

    syncSchematicPaperModeClasses(paperEl, mode);

    expect(paperEl.classList.contains("is-delete-mode")).toBe(deleteMode);
    expect(paperEl.classList.contains("is-temp-delete-mode")).toBe(tempDeleteMode);
  });

  it("clears delete paper mode classes when switching modes", () => {
    const paperEl = new FakePaperElement();

    syncSchematicPaperModeClasses(paperEl, "delete");
    expect(paperEl.classList.contains("is-delete-mode")).toBe(true);

    syncSchematicPaperModeClasses(paperEl, "temp-delete");
    expect(paperEl.classList.contains("is-delete-mode")).toBe(false);
    expect(paperEl.classList.contains("is-temp-delete-mode")).toBe(true);

    syncSchematicPaperModeClasses(paperEl, "wire");
    expect(paperEl.classList.contains("is-delete-mode")).toBe(false);
    expect(paperEl.classList.contains("is-temp-delete-mode")).toBe(false);
  });

  it("returns normal drag selection box attrs", () => {
    expect(selectionBoxBodyAttrs(false)).toEqual({
      fill: "rgba(0, 95, 158, 0.08)",
      stroke: "#005f9e",
      strokeDasharray: "4 4",
      pointerEvents: "none"
    });
  });

  it("returns contain-only drag selection box attrs", () => {
    expect(selectionBoxBodyAttrs(true)).toEqual({
      fill: "rgba(154, 86, 0, 0.06)",
      stroke: "#9a5600",
      strokeDasharray: "none",
      pointerEvents: "none"
    });
  });

  it("skips preview cells", () => {
    const preview = new FakeCell("preview-cell", { preview: true, componentId: resistor.id });

    apply([preview], { selectedIds: new Set([resistor.id]) });

    expect(preview.attrCalls).toEqual([]);
  });

  it("applies selected and hover styling to junction body attrs", () => {
    const selected = new FakeCell("junction-20-40", { junction: true });
    const hovered = new FakeCell("junction-60-80", { junction: true });

    apply([selected, hovered], {
      selectedIds: new Set(["junction-20-40"]),
      hoverIds: new Set(["junction-60-80"])
    });

    expect(selected.attrCalls).toEqual([{ body: junctionBodyAttrs({ selected: true }) }]);
    expect(hovered.attrCalls).toEqual([{ body: junctionBodyAttrs({ selected: true }) }]);
  });

  it("restores a junction custom color when selection styling is cleared", () => {
    const junction = new FakeCell("junction-40-0", { junction: true });
    const document: SchematicDocument = fixtureDocument({

      netLabels: [],
      notes: [],
      components: [],
      wires: [],
      junctions: [{ x: 40, y: 0 }],
      junctionAppearances: [{ point: { x: 40, y: 0 }, color: "#d55e00" }]
    });

    apply([junction], { document });

    expect(junction.attrCalls).toEqual([{
      body: junctionBodyAttrs({ selected: false, color: "#d55e00" })
    }]);
  });

  it("applies selected and hover styling to component attrs with presentation mode", () => {
    const selected = new FakeCell("cell-r1-selected", { componentId: resistor.id });
    const hovered = new FakeCell("cell-r1-hovered", { componentId: resistor.id });

    apply([selected, hovered], {
      selectedIds: new Set([resistor.id]),
      hoverIds: new Set([resistor.id]),
      presentationMode: true
    });

    expect(selected.attrCalls).toEqual([componentCellAttrs(resistor, { selected: true, presentationMode: true })]);
    expect(hovered.attrCalls).toEqual([componentCellAttrs(resistor, { selected: true, presentationMode: true })]);
  });

  it("does not resolve schematic nets when styling component cells only", () => {
    const component = new FakeCell("cell-r1", { componentId: resistor.id });
    const document = {
      connections: { wires: {}, pins: {} },

      junctionAppearances: [],
      netLabels: [],
      notes: [],
      components: [resistor],
      get wires(): never {
        throw new Error("component-only selection styling must not read wires");
      },
      junctions: []
    } as unknown as SchematicDocument;

    apply([component], { document, selectedIds: new Set([resistor.id]) });

    expect(component.attrCalls).toEqual([componentCellAttrs(resistor, { selected: true, presentationMode: false })]);
  });

  it("applies selected and hover styling to wire ink and selection halo attrs", () => {
    const selected = new FakeCell("cell-w1-selected", { wireId: wire.id });
    const hovered = new FakeCell("cell-w1-hovered", { wireId: wire.id });

    apply([selected, hovered], {
      selectedIds: new Set([wire.id]),
      hoverIds: new Set([wire.id])
    });

    expect(selected.attrCalls).toEqual([{
      line: wireLineAttrs(wire),
      selectionHalo: wireSelectionHaloAttrs(wire, { selected: true })
    }]);
    expect(hovered.attrCalls).toEqual([{
      line: wireLineAttrs(wire),
      selectionHalo: wireSelectionHaloAttrs(wire, { selected: true })
    }]);
  });

  it("writes unselected styling for visible document objects", () => {
    const junction = new FakeCell("junction-id", { junction: true });
    const component = new FakeCell("cell-r1", { componentId: resistor.id });
    const visibleWire = new FakeCell("cell-w1", { wireId: wire.id });

    apply([junction, component, visibleWire]);

    expect(junction.attrCalls).toEqual([{ body: junctionBodyAttrs({ selected: false }) }]);
    expect(component.attrCalls).toEqual([componentCellAttrs(resistor, { selected: false, presentationMode: false })]);
    expect(visibleWire.attrCalls).toEqual([{
      line: wireLineAttrs(wire),
      selectionHalo: wireSelectionHaloAttrs(wire, { selected: false })
    }]);
  });

  it("skips missing document objects without attr calls", () => {
    const missingComponent = new FakeCell("missing-component-cell", { componentId: "missing-component" });
    const missingWire = new FakeCell("missing-wire-cell", { wireId: "missing-wire" });

    apply([missingComponent, missingWire]);

    expect(missingComponent.attrCalls).toEqual([]);
    expect(missingWire.attrCalls).toEqual([]);
  });
});
