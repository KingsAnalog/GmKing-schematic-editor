import { fixtureDocument } from "../support/fixtureDocument";
import { describe, expect, it } from "vitest";
import {
  SchematicPreviewLifecycle,
  SchematicPreviewRenderer,
  type RemovablePreviewHandle
} from "../../../src/schematic/previewRenderer";
import { PREVIEW_WIRE_ID, type WireCellRenderOptions } from "../../../src/schematic/renderer";
import type { ComponentInstance, NetLabel, Point, SchematicNote, Wire, WireAppearance } from "../../../src/schematic/types";

class FakeCell implements RemovablePreviewHandle {
  readonly attrs: unknown[] = [];
  readonly props: Array<{ path: string; value: unknown }> = [];
  readonly values = new Map<string, unknown>();
  removeCount = 0;

  constructor(readonly source: ComponentInstance | Wire | NetLabel, readonly options: WireCellRenderOptions = {}) {}

  set(key: string, value: unknown) {
    this.values.set(key, value);
  }

  attr(attrs: unknown) {
    this.attrs.push(attrs);
  }

  prop(path: string, value: unknown) {
    this.props.push({ path, value });
  }

  remove() {
    this.removeCount += 1;
  }
}

class FakeGraph {
  readonly cells: FakeCell[] = [];

  addCell(cell: FakeCell) {
    this.cells.push(cell);
  }

  addCells(cells: readonly FakeCell[]) {
    this.cells.push(...cells);
  }
}

class FakeDocument {
  createElement() {
    return new FakeElement(this);
  }
}

const fakeDocument = new FakeDocument();

class FakeElement {
  readonly dataset: Record<string, string> = {};
  readonly style: Record<string, string> = {};
  readonly attributes = new Map<string, string>();
  children: FakeElement[] = [];
  className = "";
  textContent: string | null = null;
  isConnected = true;

  constructor(readonly ownerDocument = fakeDocument) {}

  setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
  }

  replaceChildren(...children: HTMLElement[]) {
    this.children = children as unknown as FakeElement[];
  }

  remove() {
    this.isConnected = false;
  }
}

class FakeNoteLayerElement {
  readonly children: FakeElement[] = [];
  readonly ownerDocument = fakeDocument;

  appendChild(element: HTMLElement) {
    this.children.push(element as unknown as FakeElement);
    return element;
  }
}

function component(id = "preview-component"): ComponentInstance {
  return {
    id,
    type: "resistor",
    ref: "R",
    x: 100,
    y: 120,
    rotation: 0,
    mirrored: false,
    values: {}
  };
}

function wire(id = "preview-wire", appearance?: WireAppearance): Wire {
  return {
    id,
    points: [
      { x: 20, y: 40 },
      { x: 80, y: 40 }
    ],
    routeMode: "orthogonal",
    appearance
  };
}

function note(overrides: Partial<SchematicNote> = {}): SchematicNote {
  return {
    id: "note-1",
    x: 40,
    y: 60,
    width: 120,
    height: 48,
    format: "plain",
    text: "copied note",
    ...overrides
  };
}

function label(id = "preview-label"): NetLabel {
  return {
    id,
    name: "OUT",
    attachment: {
      wireId: "wire-1",
      point: { x: 40, y: 60 }
    }
  };
}

function fakeElement() {
  return new FakeElement() as unknown as HTMLElement;
}

function createRenderer() {
  const graph = new FakeGraph();
  const noteLayer = new FakeNoteLayerElement();
  const createdNotes: FakeElement[] = [];
  const renderer = new SchematicPreviewRenderer<FakeCell>({
    graphAdapter: graph,
    noteLayerElement: noteLayer as unknown as HTMLElement,
    makeComponentCell: (instance) => new FakeCell(instance),
    makeWireCell: (instance, options) => new FakeCell(instance, options),
    makeNetLabelCell: (instance, options) => new FakeCell(instance, options),
    presentationMode: () => false,
    worldToScreenPoint: (point: Point) => ({ x: point.x + 5, y: point.y + 10 }),
    zoom: () => 2,
    createNoteElement: () => {
      const element = new FakeElement();
      createdNotes.push(element);
      return element as unknown as HTMLElement;
    }
  });
  return { renderer, graph, noteLayer, createdNotes };
}

describe("SchematicPreviewRenderer", () => {
  it("renders placement preview cells and removes the old placement preview", () => {
    const { renderer, graph } = createRenderer();
    renderer.renderPlacement(fixtureDocument({ components: [component("preview-1")], wires: [wire("wire-1")] }));

    expect(graph.cells).toHaveLength(2);
    expect(graph.cells.map((cell) => cell.values.get("preview"))).toEqual([true, true]);
    expect(graph.cells[0].props[0]?.path).toBe("ports/groups/pin/attrs/portBody");

    const oldCells = [...graph.cells];
    renderer.renderPlacement(fixtureDocument({ components: [component("preview-2")], wires: [] }));

    expect(oldCells.map((cell) => cell.removeCount)).toEqual([1, 1]);
    expect(graph.cells).toHaveLength(3);
    expect(graph.cells[2].values.get("preview")).toBe(true);
  });

  it("renders copy preview cells and note elements, then clears them on replacement", () => {
    const { renderer, graph, noteLayer, createdNotes } = createRenderer();
    renderer.renderCopy(fixtureDocument({
      netLabels: [], components: [component("copy-component")], wires: [wire("copy-wire")], notes: [note()] }));

    expect(graph.cells).toHaveLength(2);
    expect(graph.cells[1].options).toEqual({
      preview: true,
      endpointConnections: { start: false, end: false }
    });
    expect(noteLayer.children).toHaveLength(1);
    expect(createdNotes[0]).toMatchObject({
      className: "schematic-note schematic-note-copy-preview"
    });
    expect(createdNotes[0].children[0]).toMatchObject({
      className: "schematic-note-content",
      textContent: "copied note"
    });
    expect(createdNotes[0].dataset.noteId).toBe("note-1");
    expect(createdNotes[0].style.left).toBe("45px");
    expect(createdNotes[0].style.top).toBe("70px");
    expect(createdNotes[0].style.transform).toBe("scale(2)");

    const oldCells = [...graph.cells];
    const oldNote = createdNotes[0];
    renderer.renderCopy(fixtureDocument({
      netLabels: [], components: [], wires: [], notes: [note({ id: "note-2", text: "next" })] }));

    expect(oldCells.map((cell) => cell.removeCount)).toEqual([1, 1]);
    expect(oldNote.isConnected).toBe(false);
    expect(createdNotes[1].dataset.noteId).toBe("note-2");
  });

  it("derives copy-preview endpoint connections from the copied topology", () => {
    const { renderer, graph } = createRenderer();
    const arrowWire: Wire = {
      ...wire("copy-arrow", { variant: "signal", endMarker: "arrow" }),
      points: [{ x: 20, y: 40 }, { x: 80, y: 40 }]
    };
    const continuation: Wire = {
      ...wire("copy-continuation"),
      routeMode: "freeAngle",
      points: [{ x: 80, y: 40 }, { x: 120, y: 60 }]
    };

    renderer.renderCopy(fixtureDocument({
      components: [],
      wires: [arrowWire, continuation],
      netLabels: [],
      notes: []
    }));

    expect(graph.cells[0].options).toEqual({
      preview: true,
      endpointConnections: { start: false, end: true }
    });
    expect(graph.cells[1].options).toEqual({
      preview: true,
      endpointConnections: { start: true, end: false }
    });
  });

  it("uses the live Markdown note class and content hierarchy for copy previews", () => {
    const createdNotes: FakeElement[] = [];
    const rendered = fakeElement();
    rendered.className = "milkdown";
    rendered.textContent = "(Q) Noise";
    const rendererWithMarkdown = new SchematicPreviewRenderer<FakeCell>({
      graphAdapter: new FakeGraph(),
      noteLayerElement: new FakeNoteLayerElement() as unknown as HTMLElement,
      makeComponentCell: (instance) => new FakeCell(instance),
      makeWireCell: (instance, options) => new FakeCell(instance, options),
      presentationMode: () => false,
      worldToScreenPoint: (point) => point,
      zoom: () => 1,
      createNoteElement: () => {
        const element = new FakeElement();
        createdNotes.push(element);
        return element as unknown as HTMLElement;
      },
      cloneRenderedNoteContent: () => rendered
    });

    rendererWithMarkdown.renderCopy(fixtureDocument({
      components: [],
      wires: [],
      netLabels: [],
      notes: [note({ format: "markdown", text: "**(Q) Noise**", width: 160, height: 40, fontSizePx: 28 })]
    }));

    const preview = createdNotes[0];
    expect(preview.className).toBe("schematic-note is-markdown schematic-note-copy-preview");
    expect(preview.children[0]?.className).toBe("schematic-note-content");
    expect(preview.children[0]?.children).toEqual([rendered]);
    expect(rendered.textContent).toBe("(Q) Noise");
  });

  it("renders wire previews through a preview wire cell", () => {
    const { renderer, graph } = createRenderer();
    const points = [
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 40 }
    ];

    renderer.renderWire(points, { variant: "wide" }, "freeAngle");

    expect(graph.cells).toHaveLength(1);
    expect(graph.cells[0].source).toMatchObject({
      id: PREVIEW_WIRE_ID,
      points,
      routeMode: "freeAngle",
      appearance: { variant: "wide" }
    });
    expect(graph.cells[0].options).toEqual({ preview: true });

    const oldCell = graph.cells[0];
    renderer.renderWire(null, { variant: "wide" });

    expect(oldCell.removeCount).toBe(1);
  });

  it("renders and replaces label previews through the shared lifecycle", () => {
    const { renderer, graph } = createRenderer();

    renderer.renderLabel(label("label-1"));
    const first = graph.cells[0];
    expect(first.source).toMatchObject({ id: "label-1", name: "OUT" });
    expect(first.options).toEqual({ preview: true });

    renderer.renderLabel(label("label-2"));
    expect(first.removeCount).toBe(1);
    expect(graph.cells[1].source).toMatchObject({ id: "label-2" });

    renderer.renderLabel(null);
    expect(graph.cells[1].removeCount).toBe(1);
  });

  it("forgets graph-owned previews before graph clear while removing copy notes", () => {
    const { renderer, graph, createdNotes } = createRenderer();
    renderer.renderPlacement(fixtureDocument({ components: [component("placement")], wires: [] }));
    renderer.renderWire([{ x: 0, y: 0 }, { x: 20, y: 0 }], { variant: "signal" });
    renderer.renderLabel(label());
    renderer.renderCopy(fixtureDocument({
      netLabels: [], components: [component("copy")], wires: [], notes: [note()] }));

    const placementCell = graph.cells[0];
    const wireCell = graph.cells[1];
    const labelCell = graph.cells[2];
    const copyCell = graph.cells[3];
    const copyNote = createdNotes[0];

    renderer.prepareForGraphClear();

    expect(placementCell.removeCount).toBe(0);
    expect(wireCell.removeCount).toBe(0);
    expect(labelCell.removeCount).toBe(0);
    expect(copyCell.removeCount).toBe(1);
    expect(copyNote.isConnected).toBe(false);

    renderer.clearPlacement();
    renderer.clearWire();
    renderer.clearLabel();

    expect(placementCell.removeCount).toBe(0);
    expect(wireCell.removeCount).toBe(0);
    expect(labelCell.removeCount).toBe(0);
  });
});

describe("schematic preview lifecycle", () => {
  it("replacing placement removes previous cells and stores new cells", () => {
    const lifecycle = new SchematicPreviewLifecycle<FakeCell>();
    const oldCell = new FakeCell(component("old"));
    const newCell = new FakeCell(component("new"));

    lifecycle.replacePlacement([oldCell]);
    lifecycle.replacePlacement([newCell]);

    expect(oldCell.removeCount).toBe(1);
    expect(newCell.removeCount).toBe(0);
    expect(lifecycle.placementCells).toEqual([newCell]);
  });

  it("clears placement idempotently", () => {
    const lifecycle = new SchematicPreviewLifecycle<FakeCell>();
    const cell = new FakeCell(component());

    lifecycle.replacePlacement([cell]);
    lifecycle.clearPlacement();
    lifecycle.clearPlacement();

    expect(cell.removeCount).toBe(1);
    expect(lifecycle.placementCells).toEqual([]);
  });

  it("replacing copy removes old cells and old note elements", () => {
    const lifecycle = new SchematicPreviewLifecycle<FakeCell>();
    const oldCell = new FakeCell(component("old"));
    const oldNote = fakeElement();
    const newCell = new FakeCell(component("new"));
    const newNote = fakeElement();

    lifecycle.replaceCopy([oldCell], [oldNote]);
    lifecycle.replaceCopy([newCell], [newNote]);

    expect(oldCell.removeCount).toBe(1);
    expect((oldNote as unknown as FakeElement).isConnected).toBe(false);
    expect(newCell.removeCount).toBe(0);
    expect((newNote as unknown as FakeElement).isConnected).toBe(true);
    expect(lifecycle.copyCells).toEqual([newCell]);
    expect(lifecycle.copyNoteElements).toEqual([newNote]);
  });

  it("clearing copy preview is visual only and idempotent", () => {
    const lifecycle = new SchematicPreviewLifecycle<FakeCell>();
    const cell = new FakeCell(component());
    const noteElement = fakeElement();

    lifecycle.replaceCopy([cell], [noteElement]);
    lifecycle.clearCopyPreview();
    lifecycle.clearCopyPreview();

    expect(cell.removeCount).toBe(1);
    expect((noteElement as unknown as FakeElement).isConnected).toBe(false);
    expect(lifecycle.copyCells).toEqual([]);
    expect(lifecycle.copyNoteElements).toEqual([]);
  });

  it("replacing and clearing wire removes previous wire cells", () => {
    const lifecycle = new SchematicPreviewLifecycle<FakeCell>();
    const oldCell = new FakeCell(wire("old"));
    const newCell = new FakeCell(wire("new"));

    lifecycle.replaceWire(oldCell);
    lifecycle.replaceWire(newCell);
    lifecycle.clearWire();
    lifecycle.clearWire();

    expect(oldCell.removeCount).toBe(1);
    expect(newCell.removeCount).toBe(1);
    expect(lifecycle.wireCell).toBeNull();
  });

  it("replacing and clearing labels removes previous label cells", () => {
    const lifecycle = new SchematicPreviewLifecycle<FakeCell>();
    const oldCell = new FakeCell(label("old"));
    const newCell = new FakeCell(label("new"));

    lifecycle.replaceLabel(oldCell);
    lifecycle.replaceLabel(newCell);
    lifecycle.clearLabel();
    lifecycle.clearLabel();

    expect(oldCell.removeCount).toBe(1);
    expect(newCell.removeCount).toBe(1);
    expect(lifecycle.labelCell).toBeNull();
  });

  it("one preview family cleanup does not touch another family", () => {
    const lifecycle = new SchematicPreviewLifecycle<FakeCell>();
    const placement = new FakeCell(component("placement"));
    const copy = new FakeCell(component("copy"));
    const noteElement = fakeElement();
    const wireCell = new FakeCell(wire());

    lifecycle.replacePlacement([placement]);
    lifecycle.replaceCopy([copy], [noteElement]);
    lifecycle.replaceWire(wireCell);
    lifecycle.clearPlacement();

    expect(placement.removeCount).toBe(1);
    expect(copy.removeCount).toBe(0);
    expect((noteElement as unknown as FakeElement).isConnected).toBe(true);
    expect(wireCell.removeCount).toBe(0);
    expect(lifecycle.copyCells).toEqual([copy]);
    expect(lifecycle.wireCell).toBe(wireCell);
  });
});
