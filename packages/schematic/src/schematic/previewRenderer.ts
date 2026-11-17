import { buildCopyPreviewNoteView } from "./notes/noteModel";
import { componentCellAttrs, PREVIEW_WIRE_ID, type WireCellRenderOptions } from "./renderer";
import type { ComponentInstance, NetLabel, Point, SchematicDocument, SchematicNote, Wire, WireAppearance, WireRouteMode } from "./types";
import type { SymbolTemplateId } from "./symbolTemplateModel";
import { wireEndpointConnections } from "./wire/wireEndpointConnection";

export interface RemovablePreviewHandle {
  remove(): void;
}

export class SchematicPreviewLifecycle<Cell extends RemovablePreviewHandle = RemovablePreviewHandle> {
  private placementPreviewCells: Cell[] = [];
  private copyPreviewCells: Cell[] = [];
  private copyPreviewNoteElements: HTMLElement[] = [];
  private wirePreviewCell: Cell | null = null;
  private labelPreviewCell: Cell | null = null;

  get placementCells(): readonly Cell[] {
    return this.placementPreviewCells;
  }

  get copyCells(): readonly Cell[] {
    return this.copyPreviewCells;
  }

  get copyNoteElements(): readonly HTMLElement[] {
    return this.copyPreviewNoteElements;
  }

  get wireCell(): Cell | null {
    return this.wirePreviewCell;
  }

  get labelCell(): Cell | null {
    return this.labelPreviewCell;
  }

  replacePlacement(cells: Cell[]) {
    this.clearPlacement();
    this.placementPreviewCells = [...cells];
  }

  clearPlacement() {
    this.placementPreviewCells.forEach((cell) => cell.remove());
    this.placementPreviewCells = [];
  }

  forgetPlacement() {
    this.placementPreviewCells = [];
  }

  replaceCopy(cells: Cell[], noteElements: HTMLElement[]) {
    this.clearCopyPreview();
    this.copyPreviewCells = [...cells];
    this.copyPreviewNoteElements = [...noteElements];
  }

  clearCopyPreview() {
    this.copyPreviewCells.forEach((cell) => cell.remove());
    this.copyPreviewCells = [];
    this.copyPreviewNoteElements.forEach((element) => element.remove());
    this.copyPreviewNoteElements = [];
  }

  replaceWire(cell: Cell | null) {
    this.clearWire();
    this.wirePreviewCell = cell;
  }

  clearWire() {
    this.wirePreviewCell?.remove();
    this.wirePreviewCell = null;
  }

  forgetWire() {
    this.wirePreviewCell = null;
  }

  replaceLabel(cell: Cell | null) {
    this.clearLabel();
    this.labelPreviewCell = cell;
  }

  clearLabel() {
    this.labelPreviewCell?.remove();
    this.labelPreviewCell = null;
  }

  forgetLabel() {
    this.labelPreviewCell = null;
  }

  clearAll() {
    this.clearPlacement();
    this.clearCopyPreview();
    this.clearWire();
    this.clearLabel();
  }
}

export interface SchematicPreviewCell extends RemovablePreviewHandle {
  set(key: string, value: unknown): void;
  attr(attrs: unknown): void;
  prop(path: string, value: unknown): void;
}

export interface SchematicPreviewGraphAdapter<Cell extends RemovablePreviewHandle> {
  addCell(cell: Cell): void;
  addCells(cells: readonly Cell[]): void;
}

export interface SchematicPreviewRendererOptions<Cell extends SchematicPreviewCell> {
  symbolTemplate?: () => SymbolTemplateId | undefined;
  graphAdapter: SchematicPreviewGraphAdapter<Cell>;
  noteLayerElement: HTMLElement;
  makeComponentCell(instance: ComponentInstance): Cell;
  makeWireCell(wire: Wire, options?: WireCellRenderOptions): Cell;
  makeNetLabelCell?(label: NetLabel, options?: { preview?: boolean }): Cell;
  presentationMode: () => boolean;
  worldToScreenPoint(point: Point): Point;
  zoom: () => number;
  lifecycle?: SchematicPreviewLifecycle<Cell>;
  createNoteElement?: () => HTMLElement;
  cloneRenderedNoteContent?: (note: SchematicNote) => HTMLElement | null;
}

type PreviewWireContext = Pick<SchematicDocument, "components" | "wires">
  & Partial<Pick<SchematicDocument, "connections">>;
type PreviewDocument = Pick<SchematicDocument, "components" | "wires" | "netLabels" | "notes">
  & Partial<Pick<SchematicDocument, "connections">>;

export class SchematicPreviewRenderer<Cell extends SchematicPreviewCell = SchematicPreviewCell> {
  private readonly lifecycle: SchematicPreviewLifecycle<Cell>;

  constructor(private readonly options: SchematicPreviewRendererOptions<Cell>) {
    this.lifecycle = options.lifecycle ?? new SchematicPreviewLifecycle<Cell>();
  }

  renderPlacement(preview: PreviewWireContext | null) {
    if (!preview) {
      this.clearPlacement();
      return;
    }
    const cells = this.previewCellsFromDocument(preview);
    this.lifecycle.replacePlacement(cells);
    this.options.graphAdapter.addCells(cells);
  }

  renderCopy(preview: PreviewDocument | null) {
    if (!preview) {
      this.clearCopy();
      return;
    }
    const cells = this.previewCellsFromDocument(preview);
    const noteElements = (preview.notes ?? []).map((note) => this.makeCopyPreviewNoteElement(note));
    this.lifecycle.replaceCopy(cells, noteElements);
    this.options.graphAdapter.addCells(cells);
  }

  renderWire(points: Point[] | null, appearance: WireAppearance, routeMode: WireRouteMode = "orthogonal") {
    if (!points) {
      this.clearWire();
      return;
    }
    const cell = this.options.makeWireCell(
      { id: PREVIEW_WIRE_ID, points, routeMode, appearance },
      { preview: true }
    );
    this.lifecycle.replaceWire(cell);
    this.options.graphAdapter.addCell(cell);
  }

  renderLabel(label: NetLabel | null) {
    if (!label || !this.options.makeNetLabelCell) {
      this.clearLabel();
      return;
    }
    const cell = this.options.makeNetLabelCell(label, { preview: true });
    this.lifecycle.replaceLabel(cell);
    this.options.graphAdapter.addCell(cell);
  }

  clearPlacement() {
    this.lifecycle.clearPlacement();
  }

  clearCopy() {
    this.lifecycle.clearCopyPreview();
  }

  clearWire() {
    this.lifecycle.clearWire();
  }

  clearLabel() {
    this.lifecycle.clearLabel();
  }

  clearAll() {
    this.lifecycle.clearAll();
  }

  prepareForGraphClear() {
    this.lifecycle.forgetPlacement();
    this.lifecycle.forgetWire();
    this.lifecycle.forgetLabel();
    this.lifecycle.clearCopyPreview();
  }

  private previewCellsFromDocument(preview: PreviewWireContext & Partial<Pick<SchematicDocument, "netLabels">>) {
    return [
      ...preview.components.map((component) => this.makePreviewComponentCell(component)),
      ...preview.wires.map((wire) => this.makePreviewWireCell(wire, preview)),
      ...(preview.netLabels ?? []).flatMap((label) => this.options.makeNetLabelCell ? [this.options.makeNetLabelCell(label, { preview: true })] : [])
    ];
  }

  private makePreviewComponentCell(instance: ComponentInstance) {
    const cell = this.options.makeComponentCell(instance);
    const attrs = componentCellAttrs(instance, {
      symbolTemplate: this.options.symbolTemplate?.(),
      preview: true, presentationMode: this.options.presentationMode()
    });
    cell.set("preview", true);
    cell.attr(attrs);
    cell.prop("ports/groups/pin/attrs/portBody", attrs.portBody);
    return cell;
  }

  private makePreviewWireCell(wire: Wire, context: PreviewWireContext) {
    const cell = this.options.makeWireCell(wire, {
      preview: true,
      endpointConnections: wireEndpointConnections(context, wire)
    });
    cell.set("preview", true);
    return cell;
  }

  private makeCopyPreviewNoteElement(note: SchematicNote) {
    const element = this.options.createNoteElement?.() ?? this.options.noteLayerElement.ownerDocument.createElement("div");
    const content = element.ownerDocument.createElement("div");
    const view = buildCopyPreviewNoteView(note, {
      screenPoint: this.options.worldToScreenPoint(note),
      zoom: this.options.zoom()
    });
    element.className = view.className;
    element.dataset.noteId = view.noteId;
    content.className = "schematic-note-content";
    content.dataset.noteContent = "";
    const renderedContent = note.format === "markdown" ? this.options.cloneRenderedNoteContent?.(note) : null;
    if (renderedContent) content.replaceChildren(renderedContent);
    else if (note.format !== "markdown") content.textContent = view.textContent;
    else element.setAttribute("aria-busy", "true");
    element.replaceChildren(content);
    element.style.width = view.style.width;
    element.style.height = view.style.height;
    element.style.backgroundColor = view.style.backgroundColor;
    element.style.fontSize = view.style.fontSize;
    element.style.left = view.style.left;
    element.style.top = view.style.top;
    element.style.transform = view.style.transform;
    this.options.noteLayerElement.appendChild(element);
    return element;
  }
}
