import type { Point } from "./types";
import {
  centerBetweenClientPoints,
  computePanTranslate,
  computePinchZoom,
  computeWheelZoom,
  distanceBetweenClientPoints,
  hasPanGestureMoved,
  type SchematicView
} from "./viewAdapter";

export type ViewportControllerHost = {
  classList: Pick<DOMTokenList, "add" | "remove">;
  setPointerCapture?: (pointerId: number) => void;
  releasePointerCapture?: (pointerId: number) => void;
};

export type ViewportControllerListeners = {
  add(): void;
  remove(): void;
};

export type ViewportControllerOptions = {
  host: ViewportControllerHost;
  containsEventTarget: (target: EventTarget | null) => boolean;
  getView: () => SchematicView;
  setView: (view: SchematicView) => void;
  localPointFromClient: (clientX: number, clientY: number) => Point;
  zoomAtClientPoint: (nextZoom: number, clientX: number, clientY: number, localAnchor?: Point) => void;
  persistWorkspaceState: () => void;
  onMiddleClick?: () => void;
  canStartTouchPan: () => boolean;
  cancelConflictingGestures?: () => boolean;
  listeners?: ViewportControllerListeners;
  minZoom: number;
  maxZoom: number;
};

type MousePanState = {
  clientX: number;
  clientY: number;
  startX: number;
  startY: number;
  moved: boolean;
};

const MIDDLE_CLICK_MOVE_THRESHOLD = 4;

type TouchPointState = {
  pointerId: number;
  clientX: number;
  clientY: number;
  startClientX: number;
  startClientY: number;
  startedInSchematic: boolean;
  startedOnNavigableCanvas: boolean;
};

type TouchGestureState =
  | {
      kind: "pan";
      pointerId: number;
      startClientX: number;
      startClientY: number;
      startTranslate: Point;
      moved: boolean;
    }
  | {
      kind: "pinch";
      pointerIds: [number, number];
      startDistance: number;
      startZoom: number;
      startLocalCenter: Point;
      moved: boolean;
    };

export class SchematicViewportController {
  private mousePan: MousePanState | null = null;
  private touchGesture: TouchGestureState | null = null;
  private readonly activeTouchPoints = new Map<number, TouchPointState>();
  private suppressNextBlankClick = false;

  constructor(private readonly options: ViewportControllerOptions) {}

  isMousePanActive() {
    return this.mousePan !== null;
  }

  consumeSuppressedBlankClick() {
    const suppressed = this.suppressNextBlankClick;
    this.suppressNextBlankClick = false;
    return suppressed;
  }

  setNextBlankClickSuppressed(suppressed: boolean) {
    this.suppressNextBlankClick = suppressed;
  }

  suppressBlankClickOnce() {
    this.suppressNextBlankClick = true;
  }

  startMousePan(event: MouseEvent | PointerEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (this.mousePan) return;
    const view = this.options.getView();
    this.mousePan = {
      clientX: event.clientX,
      clientY: event.clientY,
      startX: view.translate.x,
      startY: view.translate.y,
      moved: false
    };
    this.options.host.classList.add("is-panning");
    this.options.listeners?.add();
  }

  handleGlobalPointerMove(event: MouseEvent | PointerEvent) {
    if (!this.mousePan) return false;
    event.preventDefault();
    if (!this.mousePan.moved) {
      this.mousePan.moved = hasPanGestureMoved(
        { x: this.mousePan.clientX, y: this.mousePan.clientY },
        { x: event.clientX, y: event.clientY },
        MIDDLE_CLICK_MOVE_THRESHOLD
      );
    }
    if (!this.mousePan.moved) return true;
    const view = this.options.getView();
    this.options.setView({
      zoom: view.zoom,
      translate: computePanTranslate(
        { x: this.mousePan.startX, y: this.mousePan.startY },
        { x: this.mousePan.clientX, y: this.mousePan.clientY },
        { x: event.clientX, y: event.clientY }
      )
    });
    return true;
  }

  handleGlobalPointerUp(event: MouseEvent | PointerEvent) {
    if (!this.mousePan) return false;
    event.preventDefault();
    const middleClick = !this.mousePan.moved;
    this.endMousePan();
    if (middleClick) this.options.onMiddleClick?.();
    return true;
  }

  endMousePan() {
    if (!this.mousePan) return;
    const moved = this.mousePan.moved;
    this.mousePan = null;
    this.options.host.classList.remove("is-panning");
    this.options.listeners?.remove();
    if (moved) this.options.persistWorkspaceState();
  }

  cancelActiveGestures() {
    this.mousePan = null;
    this.touchGesture = null;
    for (const pointerId of this.activeTouchPoints.keys()) {
      try {
        this.options.host.releasePointerCapture?.(pointerId);
      } catch {
        // The browser may already have released this pointer during cancellation.
      }
    }
    this.activeTouchPoints.clear();
    this.suppressNextBlankClick = false;
    this.options.host.classList.remove("is-panning");
    this.options.listeners?.remove();
  }

  handleTouchPointerDown(event: PointerEvent) {
    if (event.pointerType !== "touch") return false;
    const startedInSchematic = isTouchStartedInSchematic(event.target);
    const startedOnNavigableCanvas = startedInSchematic && isTouchStartedOnNavigableCanvas(event.target);
    this.activeTouchPoints.set(event.pointerId, {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startedInSchematic,
      startedOnNavigableCanvas
    });
    try {
      this.options.host.setPointerCapture?.(event.pointerId);
    } catch {
      // Capture can fail if the pointer is no longer active; keep handling delivered events.
    }
    if (this.touchPointPair()) {
      event.preventDefault();
      this.beginTouchPinch();
      return true;
    }
    return false;
  }

  handleTouchPointerMove(event: PointerEvent) {
    if (event.pointerType !== "touch") return false;
    const point = this.activeTouchPoints.get(event.pointerId);
    if (!point) return false;
    point.clientX = event.clientX;
    point.clientY = event.clientY;

    if (this.touchGesture?.kind === "pinch") {
      event.preventDefault();
      this.updateTouchPinch();
      return true;
    }

    if (this.touchPointPair()) {
      event.preventDefault();
      this.beginTouchPinch();
      return true;
    }

    if (this.touchGesture?.kind === "pan") {
      event.preventDefault();
      this.updateTouchPan(point);
      return true;
    }

    if (!point.startedOnNavigableCanvas || !this.options.canStartTouchPan()) return false;
    const dx = event.clientX - point.startClientX;
    const dy = event.clientY - point.startClientY;
    if (Math.hypot(dx, dy) < 7) return false;
    event.preventDefault();
    this.cancelConflictingGestures();
    this.touchGesture = {
      kind: "pan",
      pointerId: event.pointerId,
      startClientX: point.startClientX,
      startClientY: point.startClientY,
      startTranslate: { ...this.options.getView().translate },
      moved: false
    };
    this.options.host.classList.add("is-panning");
    this.updateTouchPan(point);
    return true;
  }

  handleTouchPointerEnd(event: PointerEvent) {
    if (event.pointerType !== "touch") return false;
    const gesture = this.touchGesture;
    const wasGesturePointer =
      gesture?.kind === "pan"
        ? gesture.pointerId === event.pointerId
        : gesture?.kind === "pinch"
          ? gesture.pointerIds.includes(event.pointerId)
          : false;
    this.activeTouchPoints.delete(event.pointerId);
    try {
      this.options.host.releasePointerCapture?.(event.pointerId);
    } catch {
      // Pointer-up may arrive after the browser has already released capture.
    }
    if (!gesture || !wasGesturePointer) return false;
    event.preventDefault();
    if (gesture.moved) {
      this.suppressNextBlankClick = true;
      this.options.persistWorkspaceState();
    }
    this.options.host.classList.remove("is-panning");
    this.touchGesture = null;
    this.resetActiveTouchStarts();
    if (this.activeTouchPoints.size >= 2) this.beginTouchPinch();
    return true;
  }

  handleWheel(event: WheelEvent) {
    if (!this.options.containsEventTarget(event.target)) return false;
    event.preventDefault();
    const oldZoom = this.options.getView().zoom;
    const nextZoom = computeWheelZoom(oldZoom, event.deltaY, { minZoom: this.options.minZoom, maxZoom: this.options.maxZoom });
    if (Math.abs(nextZoom - oldZoom) < 0.001) return true;

    this.options.zoomAtClientPoint(nextZoom, event.clientX, event.clientY);
    this.options.persistWorkspaceState();
    return true;
  }

  private beginTouchPinch() {
    const pair = this.touchPointPair();
    if (!pair) return;
    this.settleMovedTouchGesture();
    this.cancelConflictingGestures();
    const center = centerBetweenClientPoints(pair[0], pair[1]);
    const view = this.options.getView();
    this.touchGesture = {
      kind: "pinch",
      pointerIds: [pair[0].pointerId, pair[1].pointerId],
      startDistance: Math.max(1, distanceBetweenClientPoints(pair[0], pair[1])),
      startZoom: view.zoom,
      startLocalCenter: this.options.localPointFromClient(center.x, center.y),
      moved: false
    };
    this.options.host.classList.add("is-panning");
  }

  private updateTouchPan(point: TouchPointState) {
    if (this.touchGesture?.kind !== "pan") return;
    const startClient = { x: this.touchGesture.startClientX, y: this.touchGesture.startClientY };
    const currentClient = { x: point.clientX, y: point.clientY };
    if (hasPanGestureMoved(startClient, currentClient)) this.touchGesture.moved = true;
    this.options.setView({
      zoom: this.options.getView().zoom,
      translate: computePanTranslate(this.touchGesture.startTranslate, startClient, currentClient)
    });
  }

  private updateTouchPinch() {
    if (this.touchGesture?.kind !== "pinch") return;
    const first = this.activeTouchPoints.get(this.touchGesture.pointerIds[0]);
    const second = this.activeTouchPoints.get(this.touchGesture.pointerIds[1]);
    if (!first || !second) return;
    const center = centerBetweenClientPoints(first, second);
    const pinch = computePinchZoom(
      this.touchGesture.startZoom,
      this.options.getView().zoom,
      this.touchGesture.startDistance,
      distanceBetweenClientPoints(first, second),
      {
        minZoom: this.options.minZoom,
        maxZoom: this.options.maxZoom
      }
    );
    if (pinch.moved) {
      this.touchGesture.moved = true;
    }
    this.options.zoomAtClientPoint(pinch.nextZoom, center.x, center.y, this.touchGesture.startLocalCenter);
  }

  private touchPointPair() {
    const points = Array.from(this.activeTouchPoints.values()).filter((point) => point.startedInSchematic);
    return points.length >= 2 ? ([points[0], points[1]] as [TouchPointState, TouchPointState]) : null;
  }

  private settleMovedTouchGesture() {
    if (!this.touchGesture?.moved) return;
    this.suppressNextBlankClick = true;
    this.options.persistWorkspaceState();
  }

  private resetActiveTouchStarts() {
    for (const point of this.activeTouchPoints.values()) {
      point.startClientX = point.clientX;
      point.startClientY = point.clientY;
    }
  }

  private cancelConflictingGestures() {
    if (this.options.cancelConflictingGestures?.()) {
      this.suppressNextBlankClick = true;
    }
    this.endMousePan();
  }
}

export function isViewportPanMouseEvent(event: MouseEvent | PointerEvent) {
  return event.button === 1 || (event.buttons & 4) === 4;
}

function isTouchStartedInSchematic(target: EventTarget | null) {
  return hasClosest(target) && !closest(target, "button, input, select, textarea, [contenteditable]");
}

function isTouchStartedOnNavigableCanvas(target: EventTarget | null) {
  return !closest(target, "[data-note-id], .joint-cell, .joint-port, .joint-link");
}

function hasClosest(target: EventTarget | null): target is EventTarget & { closest: (selector: string) => Element | null } {
  return !!target && typeof (target as { closest?: unknown }).closest === "function";
}

function closest(target: EventTarget | null, selector: string) {
  const candidate = target as { closest?: (selector: string) => Element | null } | null;
  return candidate && typeof candidate.closest === "function" ? candidate.closest(selector) : null;
}
