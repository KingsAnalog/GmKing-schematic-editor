import { createSchematicSvgElement } from "./schematicSvgDom";
export { createSchematicSvgElement } from "./schematicSvgDom";
import { renderSchematicDocumentSvg, type SchematicDocumentSvgRender } from "./documentSvgRenderer";
import { hasNoteMath, typesetNotesForExport } from "./notes/noteTypeset";
import type { SchematicContent, SchematicDocument } from "./types";

export interface ReadonlySchematicViewer {
  update(document: SchematicContent | SchematicDocument): void;
  fit(): void;
  destroy(): void;
}

let nextViewerId = 1;

export function mountReadonlySchematicViewer(
  container: HTMLElement,
  document: SchematicContent | SchematicDocument,
  options: {
    showGrid?: boolean;
    padding?: number;
    resizeObserver?: typeof ResizeObserver | null;
  } = {}
): ReadonlySchematicViewer {
  const namespace = `schematic-viewer-${nextViewerId++}`;
  container.classList.add("schematic-readonly-viewer");
  container.textContent = "";
  let destroyed = false;
  let currentRender: SchematicDocumentSvgRender | null = null;
  let generation = 0;

  function render(nextDocument: SchematicContent | SchematicDocument) {
    if (destroyed) return;
    const revision = ++generation;
    const draw = (noteGraphics?: Awaited<ReturnType<typeof typesetNotesForExport>>) => {
      if (destroyed || revision !== generation) return;
      show(renderSchematicDocumentSvg(nextDocument, {
        namespace, showGrid: options.showGrid, padding: options.padding,
        presentationMode: true, backgroundColor: "#ffffff", noteGraphics
      }));
    };
    draw();
    if (nextDocument.notes.some(note => hasNoteMath(note.text))) {
      void typesetNotesForExport(nextDocument.notes, container.ownerDocument, nextDocument.display?.textFont).then(draw).catch(() => {});
    }
  }

  function show(rendered: SchematicDocumentSvgRender) {
    currentRender = rendered;
    const svg = createSchematicSvgElement(container.ownerDocument, currentRender.svg);
    container.replaceChildren(svg);
    svg.classList.add("schematic-readonly-svg");
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    svg.setAttribute("aria-hidden", "true");
  }

  function fit() {
    if (destroyed || !currentRender) return;
    const svg = container.querySelector<SVGSVGElement>("svg");
    if (!svg) return;
    const viewBox = currentRender.viewBox;
    svg.setAttribute("viewBox", `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`);
  }

  render(document);
  const ResizeObserverCtor = options.resizeObserver === undefined
    ? container.ownerDocument?.defaultView?.ResizeObserver ?? globalThis.ResizeObserver
    : options.resizeObserver;
  const observer = ResizeObserverCtor ? new ResizeObserverCtor(() => fit()) : null;
  observer?.observe(container);

  return {
    update: render,
    fit,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      observer?.disconnect();
      currentRender = null;
      container.textContent = "";
      container.classList.remove("schematic-readonly-viewer");
    }
  };
}
