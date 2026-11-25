import { noteBackgroundCss, noteTextColor } from "./noteAppearance";
import { noteAnchorOffset, noteCssTransform } from "./noteGeometry";
import { hasNoteMath, plainNoteGraphic, typesetNote } from "./noteTypeset";
import type { NoteGraphic } from "./noteSizing";
import { schematicTextFontStack, type SchematicTextFont } from "../schematicFont";
import type { Point, SchematicNote } from "../types";

interface NoteLayerViewState {
  selectedIds: ReadonlySet<string>;
  zoom: number;
  worldToScreenPoint(point: Point): Point;
}

interface NoteView {
  note: SchematicNote;
  element: HTMLElement;
  svg: SVGSVGElement;
  anchor: HTMLElement;
  signature?: string;
  graphic?: NoteGraphic;
  pending?: AbortController;
}

export class SchematicNoteLayer {
  readonly element: HTMLElement;
  private readonly views = new Map<string, NoteView>();
  private state?: NoteLayerViewState;
  private documentId?: string;
  private readonly retryUnrenderedMath = () => {
    for (const view of this.views.values()) {
      if (view.signature === undefined && hasNoteMath(view.note.text)) this.refresh(view.note);
    }
  };

  constructor(paper: HTMLElement, private readonly options: { defaultTextFont?: () => SchematicTextFont | undefined } = {}) {
    this.element = paper.ownerDocument.createElement("div");
    this.element.className = "schematic-note-layer";
    paper.append(this.element);
    paper.ownerDocument.defaultView?.addEventListener("mathjax-ready", this.retryUnrenderedMath);
  }

  activateDocument(id: string) {
    if (this.documentId === id) return;
    this.reset();
    this.documentId = id;
  }

  noteElementFromEvent(event: Event) {
    const element = (event.target as Element | null)?.closest<HTMLElement>("[data-note-id]");
    return element && this.element.contains(element) ? element : null;
  }

  render(notes: SchematicNote[], state: NoteLayerViewState) {
    this.state = state;
    const visible = new Set(notes.map(note => note.id));
    for (const [id, view] of this.views) {
      if (visible.has(id)) continue;
      view.pending?.abort();
      view.element.remove();
      this.views.delete(id);
    }
    for (const note of notes) {
      const view = this.views.get(note.id) ?? this.createView(note);
      view.note = note;
      this.refresh(note);
      view.element.classList.toggle("is-selected", state.selectedIds.has(note.id));
      this.element.append(view.element);
    }
  }

  reset() {
    for (const view of this.views.values()) {
      view.pending?.abort();
      view.element.remove();
    }
    this.views.clear();
  }

  async destroy() {
    this.element.ownerDocument.defaultView?.removeEventListener("mathjax-ready", this.retryUnrenderedMath);
    this.reset();
    this.element.remove();
  }

  updateTransform(notes: SchematicNote[], state: NoteLayerViewState) {
    this.state = state;
    notes.forEach(note => this.positionNoteElement(note, state));
  }

  positionNoteElement(note: SchematicNote, state: NoteLayerViewState) {
    const view = this.views.get(note.id);
    if (!view) return;
    const point = state.worldToScreenPoint(note);
    view.element.style.left = `${point.x}px`;
    view.element.style.top = `${point.y}px`;
    view.element.style.transform = noteCssTransform(note, state.zoom);
    const offset = noteAnchorOffset(note);
    view.anchor.style.left = `${offset.x}px`;
    view.anchor.style.top = `${offset.y}px`;
  }

  syncSelectionStyles(selectedIds: ReadonlySet<string>, hoverIds: ReadonlySet<string>) {
    for (const [id, view] of this.views) {
      view.element.classList.toggle("is-selected", selectedIds.has(id));
      view.element.classList.toggle("is-delete-hover", hoverIds.has(id));
    }
  }

  resizeNoteToContent(note: SchematicNote) {
    const font = this.options.defaultTextFont?.();
    const { width, height } = plainNoteGraphic(note, this.element.ownerDocument, font);
    Object.assign(note, { width, height });
  }

  refresh(note: SchematicNote) {
    const view = this.views.get(note.id);
    if (!view) return;
    view.element.style.color = noteTextColor(note);
    view.element.style.backgroundColor = noteBackgroundCss(note);
    const font = this.options.defaultTextFont?.();
    view.element.style.fontFamily = schematicTextFontStack(note.fontFamily, font);
    const signature = JSON.stringify([note.text, note.fontFamily, note.fontSizePx, font]);
    if (view.signature !== signature) {
      view.signature = signature;
      view.pending?.abort();
      const { ownerDocument } = this.element;
      this.applyGraphic(view, plainNoteGraphic(note, ownerDocument, font));
      if (hasNoteMath(note.text)) {
        const abort = new ownerDocument.defaultView!.AbortController();
        view.pending = abort;
        void typesetNote(note, ownerDocument, font, abort.signal).then(graphic => {
          if (abort.signal.aborted || view.signature !== signature) return;
          this.applyGraphic(view, graphic);
          // Keep TeX visible if loading failed and retry after the runtime recovers.
          if (!ownerDocument.defaultView?.MathJax?.typesetPromise) view.signature = undefined;
        }).catch(() => {});
      }
    } else if (view.graphic) {
      Object.assign(note, { width: view.graphic.width, height: view.graphic.height });
    }
    if (this.state) this.positionNoteElement(note, this.state);
  }

  private createView(note: SchematicNote): NoteView {
    const doc = this.element.ownerDocument;
    const element = doc.createElement("div");
    element.className = "schematic-note";
    element.dataset.noteId = note.id;
    const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.classList.add("schematic-note-content");
    const anchor = doc.createElement("span");
    anchor.className = "schematic-note-anchor";
    anchor.setAttribute("aria-hidden", "true");
    element.append(svg, anchor);
    const view = { note, element, svg, anchor };
    this.views.set(note.id, view);
    return view;
  }

  private applyGraphic(view: NoteView, graphic: NoteGraphic) {
    const { width, height, markup } = graphic;
    view.graphic = graphic;
    Object.assign(view.note, { width, height });
    view.svg.setAttribute("width", String(width));
    view.svg.setAttribute("height", String(height));
    view.svg.setAttribute("aria-label", view.note.text);
    view.svg.innerHTML = markup;
    view.element.style.width = `${width}px`;
    view.element.style.height = `${height}px`;
    if (this.state) this.positionNoteElement(view.note, this.state);
  }
}
