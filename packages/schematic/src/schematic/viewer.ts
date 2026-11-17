import { renderSchematicDocumentSvg, type SchematicDocumentSvgRender } from "./documentSvgRenderer";
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

  function render(nextDocument: SchematicContent | SchematicDocument) {
    if (destroyed) return;
    currentRender = renderSchematicDocumentSvg(nextDocument, {
      namespace,
      showGrid: options.showGrid,
      padding: options.padding,
      presentationMode: true,
      backgroundColor: "#ffffff"
    });
    container.innerHTML = currentRender.svg;
    const svg = container.querySelector<SVGSVGElement>("svg");
    if (!svg) return;
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
