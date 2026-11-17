import type { Point } from "./types";
import type { Rect } from "./view-geometry";
import { clamp } from "./uiUtils";

export type SchematicView = {
  zoom: number;
  translate: Point;
};

export type SchematicViewport = {
  width: number;
  height: number;
};

export type FitViewOptions = {
  minZoom: number;
  maxZoom: number;
};

export type FitViewResult = {
  view: SchematicView;
  fitScale: number;
  empty: boolean;
  clampedToMinZoom: boolean;
};

export type ZoomRange = {
  minZoom: number;
  maxZoom: number;
};

export type WheelZoomOptions = ZoomRange & {
  sensitivity?: number;
};

export type PinchZoomResult = {
  distance: number;
  ratio: number;
  nextZoom: number;
  moved: boolean;
};

export type ClientPointLike = {
  clientX: number;
  clientY: number;
};

export type SchematicViewPaper = {
  scale(x: number, y: number): void;
  translate(x: number, y: number): void;
  clientToLocalPoint?: (...args: unknown[]) => unknown;
};

export type SchematicViewHost = {
  clientWidth: number;
  clientHeight: number;
  scrollLeft: number;
  scrollTop: number;
  getBoundingClientRect(): { left: number; top: number; width: number; height: number };
};

export function defaultSchematicView(): SchematicView {
  return {
    zoom: 1,
    translate: { x: 0, y: 0 }
  };
}

export function cloneSchematicView(view: SchematicView): SchematicView {
  return {
    zoom: view.zoom,
    translate: { ...view.translate }
  };
}

export function applySchematicView(paper: SchematicViewPaper, view: SchematicView) {
  paper.scale(view.zoom, view.zoom);
  paper.translate(view.translate.x, view.translate.y);
}

export function computeFitView(bounds: Rect | null, viewport: SchematicViewport, padding: number, options: FitViewOptions): FitViewResult {
  if (!bounds) {
    return {
      view: defaultSchematicView(),
      fitScale: 1,
      empty: true,
      clampedToMinZoom: false
    };
  }

  const viewportWidth = Math.max(1, viewport.width);
  const viewportHeight = Math.max(1, viewport.height);
  const availableWidth = Math.max(1, viewportWidth - padding * 2);
  const availableHeight = Math.max(1, viewportHeight - padding * 2);
  const fitScale = Math.min(availableWidth / Math.max(1, bounds.width), availableHeight / Math.max(1, bounds.height));
  const nextZoom = clamp(fitScale, options.minZoom, options.maxZoom);
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;

  return {
    view: {
      zoom: nextZoom,
      translate: {
        x: viewportWidth / 2 - centerX * nextZoom,
        y: viewportHeight / 2 - centerY * nextZoom
      }
    },
    fitScale,
    empty: false,
    clampedToMinZoom: nextZoom > fitScale + 1e-9
  };
}

export function computeZoomAtScreenPoint(nextZoom: number, screenPoint: Point, localAnchor: Point): SchematicView {
  return {
    zoom: nextZoom,
    translate: {
      x: screenPoint.x - localAnchor.x * nextZoom,
      y: screenPoint.y - localAnchor.y * nextZoom
    }
  };
}

export function computePanTranslate(startTranslate: Point, startClient: Point, currentClient: Point): Point {
  return {
    x: startTranslate.x + currentClient.x - startClient.x,
    y: startTranslate.y + currentClient.y - startClient.y
  };
}

export function hasPanGestureMoved(startClient: Point, currentClient: Point, threshold = 1) {
  return Math.hypot(currentClient.x - startClient.x, currentClient.y - startClient.y) > threshold;
}

export function clampNavigationZoom(nextZoom: number, referenceZoom: number, options: ZoomRange) {
  return clamp(nextZoom, Math.min(options.minZoom, referenceZoom), options.maxZoom);
}

export function computeWheelZoom(currentZoom: number, deltaY: number, options: WheelZoomOptions) {
  const sensitivity = options.sensitivity ?? 0.0014;
  return clampNavigationZoom(currentZoom * Math.exp(-deltaY * sensitivity), currentZoom, options);
}

export function distanceBetweenClientPoints(first: ClientPointLike, second: ClientPointLike) {
  return Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY);
}

export function centerBetweenClientPoints(first: ClientPointLike, second: ClientPointLike): Point {
  return {
    x: (first.clientX + second.clientX) / 2,
    y: (first.clientY + second.clientY) / 2
  };
}

export function computePinchZoom(startZoom: number, currentZoom: number, startDistance: number, currentDistance: number, options: ZoomRange): PinchZoomResult {
  const distance = Math.max(1, currentDistance);
  const safeStartDistance = Math.max(1, startDistance);
  const ratio = distance / safeStartDistance;
  const nextZoom = clampNavigationZoom(startZoom * ratio, startZoom, options);
  return {
    distance,
    ratio,
    nextZoom,
    moved: Math.abs(nextZoom - currentZoom) > 0.0001 || Math.abs(distance - safeStartDistance) > 0.5
  };
}

export function worldToScreenPoint(point: Point, view: SchematicView): Point {
  return {
    x: point.x * view.zoom + view.translate.x,
    y: point.y * view.zoom + view.translate.y
  };
}

export function screenToWorldPoint(point: Point, view: SchematicView): Point {
  return {
    x: (point.x - view.translate.x) / view.zoom,
    y: (point.y - view.translate.y) / view.zoom
  };
}

export function localPointFromClient(paper: SchematicViewPaper, host: SchematicViewHost, view: SchematicView, clientX: number, clientY: number): Point {
  const converter = paper.clientToLocalPoint?.bind(paper);
  if (converter) {
    try {
      const objectPoint = converter({ x: clientX, y: clientY });
      if (isFinitePoint(objectPoint)) return objectPoint;
    } catch {}
    try {
      const numberPoint = converter(clientX, clientY);
      if (isFinitePoint(numberPoint)) return numberPoint;
    } catch {}
  }

  const rect = host.getBoundingClientRect();
  return screenToWorldPoint(
    {
      x: clientX - rect.left,
      y: clientY - rect.top
    },
    view
  );
}

export function expandedRect(rect: Rect | null, margin: number): Rect | null {
  if (!rect) return null;
  return {
    x: rect.x - margin,
    y: rect.y - margin,
    width: rect.width + margin * 2,
    height: rect.height + margin * 2
  };
}

export class SchematicViewAdapter {
  private view = defaultSchematicView();

  constructor(
    private paper: SchematicViewPaper,
    private readonly host: SchematicViewHost
  ) {}

  setPaper(paper: SchematicViewPaper) {
    this.paper = paper;
  }

  getView(): SchematicView {
    return cloneSchematicView(this.view);
  }

  setView(view: SchematicView) {
    this.view = cloneSchematicView(view);
    applySchematicView(this.paper, this.view);
  }

  viewportSize(): SchematicViewport {
    return {
      width: Math.max(1, this.host.clientWidth),
      height: Math.max(1, this.host.clientHeight)
    };
  }

  resetScroll() {
    this.host.scrollLeft = 0;
    this.host.scrollTop = 0;
  }

  zoomAtClientPoint(nextZoom: number, clientX: number, clientY: number, localAnchor = this.localPointFromClient(clientX, clientY)) {
    const rect = this.host.getBoundingClientRect();
    this.setView(
      computeZoomAtScreenPoint(
        nextZoom,
        {
          x: clientX - rect.left,
          y: clientY - rect.top
        },
        localAnchor
      )
    );
  }

  viewportCenterWorldPoint(): Point {
    const rect = this.host.getBoundingClientRect();
    return this.localPointFromClient(rect.left + rect.width / 2, rect.top + rect.height / 2);
  }

  worldToScreenPoint(point: Point): Point {
    return worldToScreenPoint(point, this.view);
  }

  localPointFromClient(clientX: number, clientY: number): Point {
    return localPointFromClient(this.paper, this.host, this.view, clientX, clientY);
  }
}

function isFinitePoint(value: unknown): value is Point {
  if (!value || typeof value !== "object") return false;
  const point = value as { x?: unknown; y?: unknown };
  return typeof point.x === "number" && Number.isFinite(point.x) && typeof point.y === "number" && Number.isFinite(point.y);
}
