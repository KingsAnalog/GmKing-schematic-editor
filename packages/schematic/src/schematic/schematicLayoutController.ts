import type { RightDockView } from "./rightDock";

export type SchematicPanelSide = "left" | "right";
export type SchematicSidebarTab = "library" | "properties";

export interface RightDockLayoutState {
  activeView: RightDockView;
}

export interface SchematicLayoutState {
  leftWidth: number;
  rightWidth: number;
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  rightActiveView: RightDockView;
  sidebarTab: SchematicSidebarTab;
  logHeight: number;
}

export interface SchematicLayoutProjection {
  narrow: boolean;
  leftVisible: boolean;
  rightVisible: boolean;
  backdropVisible: boolean;
}

const DEFAULT_STATE: SchematicLayoutState = {
  leftWidth: 280,
  rightWidth: 330,
  leftCollapsed: false,
  rightCollapsed: true,
  rightActiveView: "analysis",
  sidebarTab: "library",
  logHeight: 230
};
const LEFT_WIDTH_RANGE = { min: 210, max: 520 };
const RIGHT_WIDTH_RANGE = { min: 320, max: 900 };
const LOG_HEIGHT_RANGE = { min: 180, max: 400 };
const NARROW_CONTAINER_WIDTH = 1080;
const STORAGE_KEY = "at-schematic-layout";
const LEGACY_STORAGE_KEY = "adc-helper/schematic-layout";
const KEYBOARD_RESIZE_STEP = 20;
const RIGHT_DOCK_VIEWS: readonly RightDockView[] = ["analysis", "netlist"];

export interface SchematicPanelResizeResult {
  width: number;
  collapsed: boolean;
}

/** Minimal surface the editor uses to open panels and persist view state. */
export interface SchematicPanelLayoutAccess {
  openPanel(side: SchematicPanelSide): void;
  closePanel(side: SchematicPanelSide): void;
  togglePanel(side: SchematicPanelSide): void;
  isPanelVisible(side: SchematicPanelSide): boolean;
  getRightDockState?(): RightDockLayoutState;
  setRightDockState?(state: RightDockLayoutState): void;
  getSidebarTab?(): SchematicSidebarTab;
  setSidebarTab?(tab: SchematicSidebarTab): void;
  getLogHeight?(): number;
  setLogHeight?(height: number): void;
}

export function resolveSchematicPanelResize(
  side: SchematicPanelSide,
  requestedWidth: number
): SchematicPanelResizeResult {
  const range = panelWidthRange(side);
  const width = Number.isFinite(requestedWidth) ? requestedWidth : range.min;
  return {
    width: clamp(width, range),
    collapsed: width < range.min
  };
}

export interface SchematicLayoutControllerOptions {
  storage?: Pick<Storage, "getItem" | "setItem"> | null;
  resizeObserver?: typeof ResizeObserver | null;
}

export function projectSchematicLayout(
  containerWidth: number,
  state: Readonly<SchematicLayoutState>,
  drawer: SchematicPanelSide | null
): SchematicLayoutProjection {
  const narrow = containerWidth < NARROW_CONTAINER_WIDTH;
  return {
    narrow,
    leftVisible: narrow ? drawer === "left" : !state.leftCollapsed,
    rightVisible: narrow ? drawer === "right" : !state.rightCollapsed,
    backdropVisible: narrow && drawer !== null
  };
}

export class SchematicLayoutController implements SchematicPanelLayoutAccess {
  private readonly lifecycle: AbortController;
  private readonly elementConstructor: typeof Element | null;
  private readonly storage: Pick<Storage, "getItem" | "setItem"> | null;
  private readonly observer: ResizeObserver | null;
  private state: SchematicLayoutState;
  private drawer: SchematicPanelSide | null = null;
  private containerWidth = Number.POSITIVE_INFINITY;
  private drag: {
    side: SchematicPanelSide;
    startX: number;
    startWidth: number;
    target: HTMLElement;
  } | null = null;
  private initialized = false;
  private destroyed = false;

  constructor(
    private readonly root: HTMLElement,
    options: SchematicLayoutControllerOptions = {}
  ) {
    const realm = root.ownerDocument.defaultView;
    const AbortControllerCtor = realm?.AbortController ?? AbortController;
    this.lifecycle = new AbortControllerCtor();
    this.elementConstructor = realm?.Element ?? null;
    this.storage = options.storage === undefined ? localStorageFor(root) : options.storage;
    this.state = readState(this.storage);
    const ResizeObserverCtor = options.resizeObserver === undefined
      ? root.ownerDocument.defaultView?.ResizeObserver ?? globalThis.ResizeObserver
      : options.resizeObserver;
    this.observer = ResizeObserverCtor
      ? new ResizeObserverCtor(() => this.measure())
      : null;
  }

  init() {
    if (this.initialized || this.destroyed) return;
    this.initialized = true;
    const signal = this.lifecycle.signal;
    this.root.addEventListener("click", (event) => this.handleClick(event), { signal });
    this.root.addEventListener("pointerdown", (event) => this.handlePointerDown(event), { signal });
    this.root.addEventListener("pointermove", (event) => this.handlePointerMove(event), { signal });
    this.root.addEventListener("pointerup", (event) => this.finishPointerResize(event), { signal });
    this.root.addEventListener("pointercancel", (event) => this.finishPointerResize(event), { signal });
    this.root.addEventListener("keydown", (event) => this.handleKeyDown(event), { signal });
    this.root.ownerDocument.addEventListener("keydown", (event) => this.handleDocumentKeyDown(event), { signal });
    this.observer?.observe(this.root);
    if (!this.observer) {
      this.root.ownerDocument.defaultView?.addEventListener("resize", () => this.measure(), { signal });
    }
    this.measure();
  }

  getState(): SchematicLayoutState {
    return { ...this.state };
  }

  openPanel(side: SchematicPanelSide) {
    if (this.containerWidth < NARROW_CONTAINER_WIDTH) {
      this.drawer = side;
    } else if (side === "left") {
      this.state.leftCollapsed = false;
    } else {
      this.state.rightCollapsed = false;
    }
    this.persist();
    this.render();
  }

  closePanel(side: SchematicPanelSide) {
    if (this.containerWidth < NARROW_CONTAINER_WIDTH) {
      if (this.drawer === side) this.drawer = null;
    } else if (side === "left") {
      this.state.leftCollapsed = true;
    } else {
      this.state.rightCollapsed = true;
    }
    this.persist();
    this.render();
  }

  togglePanel(side: SchematicPanelSide) {
    if (this.isPanelVisible(side)) this.closePanel(side);
    else this.openPanel(side);
  }

  isPanelVisible(side: SchematicPanelSide) {
    const projection = projectSchematicLayout(this.containerWidth, this.state, this.drawer);
    return side === "left" ? projection.leftVisible : projection.rightVisible;
  }

  isNarrow() {
    return this.containerWidth < NARROW_CONTAINER_WIDTH;
  }

  getRightDockState(): RightDockLayoutState {
    return { activeView: this.state.rightActiveView };
  }

  setRightDockState(state: RightDockLayoutState) {
    this.state.rightActiveView = state.activeView;
    this.persist();
  }

  getSidebarTab(): SchematicSidebarTab {
    return this.state.sidebarTab;
  }

  setSidebarTab(tab: SchematicSidebarTab) {
    this.state.sidebarTab = tab;
    this.persist();
  }

  getLogHeight() {
    return this.state.logHeight;
  }

  setLogHeight(height: number) {
    this.state.logHeight = clamp(height, LOG_HEIGHT_RANGE, DEFAULT_STATE.logHeight);
    this.persist();
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.lifecycle.abort();
    this.observer?.disconnect();
    this.drag = null;
    this.root.classList.remove(
      "is-layout-ready",
      "is-layout-narrow",
      "is-left-panel-visible",
      "is-right-panel-visible",
      "is-panel-backdrop-visible"
    );
    this.root.style.removeProperty("--schematic-left-panel-width");
    this.root.style.removeProperty("--schematic-right-panel-width");
  }

  private measure() {
    const width = this.root.getBoundingClientRect().width || this.root.clientWidth;
    const wasNarrow = this.containerWidth < NARROW_CONTAINER_WIDTH;
    this.containerWidth = width > 0 ? width : Number.POSITIVE_INFINITY;
    const narrow = this.containerWidth < NARROW_CONTAINER_WIDTH;
    if (wasNarrow !== narrow) this.drawer = null;
    this.render();
  }

  private handleClick(event: Event) {
    const target = this.eventTargetElement(event.target);
    if (target?.closest("[data-schematic-panel-backdrop]")) {
      this.drawer = null;
      this.render();
    }
  }

  private handlePointerDown(event: PointerEvent) {
    if (event.button !== 0) return;
    const target = this.eventTargetElement(event.target)
      ?.closest<HTMLElement>("[data-schematic-panel-resizer]") ?? null;
    const side = target?.dataset.schematicPanelResizer;
    if (!target || side !== "left" && side !== "right") return;
    event.preventDefault();
    target.setPointerCapture?.(event.pointerId);
    this.drag = {
      side,
      startX: event.clientX,
      startWidth: this.effectivePanelWidth(side),
      target
    };
    this.root.classList.add("is-panel-resizing");
  }

  private handlePointerMove(event: PointerEvent) {
    if (!this.drag) return;
    const delta = event.clientX - this.drag.startX;
    this.setPanelWidth(
      this.drag.side,
      this.drag.startWidth + (this.drag.side === "left" ? delta : -delta),
      false
    );
  }

  private finishPointerResize(event: PointerEvent) {
    if (!this.drag) return;
    this.drag.target.releasePointerCapture?.(event.pointerId);
    this.drag = null;
    this.root.classList.remove("is-panel-resizing");
    this.persist();
  }

  private handleKeyDown(event: KeyboardEvent) {
    const target = this.eventTargetElement(event.target)
      ?.closest<HTMLElement>("[data-schematic-panel-resizer]") ?? null;
    const side = target?.dataset.schematicPanelResizer;
    if (side !== "left" && side !== "right") return;
    if (event.key === "Home") {
      event.preventDefault();
      this.setPanelWidth(side, side === "left" ? DEFAULT_STATE.leftWidth : DEFAULT_STATE.rightWidth);
      return;
    }
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const panelDirection = direction * (side === "left" ? 1 : -1);
    const current = this.effectivePanelWidth(side);
    if (current === 0) {
      if (panelDirection > 0) this.setPanelWidth(side, panelWidthRange(side).min);
      return;
    }
    this.setPanelWidth(side, current + panelDirection * KEYBOARD_RESIZE_STEP);
  }

  private handleDocumentKeyDown(event: KeyboardEvent) {
    if (event.key !== "Escape" || this.drawer === null) return;
    event.preventDefault();
    this.drawer = null;
    this.render();
  }

  private setPanelWidth(side: SchematicPanelSide, width: number, persist = true) {
    const resolved = resolveSchematicPanelResize(side, width);
    if (side === "left") {
      this.state.leftWidth = resolved.width;
      this.state.leftCollapsed = resolved.collapsed;
    } else {
      this.state.rightWidth = resolved.width;
      this.state.rightCollapsed = resolved.collapsed;
    }
    if (this.containerWidth < NARROW_CONTAINER_WIDTH) {
      if (resolved.collapsed) {
        if (this.drawer === side) this.drawer = null;
      } else {
        this.drawer = side;
      }
    }
    if (persist) this.persist();
    this.render();
  }

  private effectivePanelWidth(side: SchematicPanelSide) {
    if (this.containerWidth < NARROW_CONTAINER_WIDTH) {
      if (this.drawer !== side) return 0;
    } else if (side === "left" ? this.state.leftCollapsed : this.state.rightCollapsed) {
      return 0;
    }
    return side === "left" ? this.state.leftWidth : this.state.rightWidth;
  }

  private render() {
    const projection = projectSchematicLayout(this.containerWidth, this.state, this.drawer);
    this.root.classList.add("is-layout-ready");
    this.root.style.setProperty("--schematic-left-panel-width", `${this.state.leftWidth}px`);
    this.root.style.setProperty("--schematic-right-panel-width", `${this.state.rightWidth}px`);
    this.root.classList.toggle("is-layout-narrow", projection.narrow);
    this.root.classList.toggle("is-left-panel-visible", projection.leftVisible);
    this.root.classList.toggle("is-right-panel-visible", projection.rightVisible);
    this.root.classList.toggle("is-panel-backdrop-visible", projection.backdropVisible);

    const palette = this.root.querySelector<HTMLElement>("[data-schematic-palette]");
    const analysis = this.root.querySelector<HTMLElement>("[data-schematic-analysis-panel]");
    palette?.setAttribute("aria-hidden", String(!projection.leftVisible));
    analysis?.setAttribute("aria-hidden", String(!projection.rightVisible));
    this.root.querySelectorAll<HTMLElement>("[data-schematic-panel-resizer]").forEach((resizer) => {
      const side = resizer.dataset.schematicPanelResizer;
      if (side !== "left" && side !== "right") return;
      resizer.setAttribute("aria-valuemax", String(panelWidthRange(side).max));
      resizer.setAttribute("aria-valuenow", String(this.effectivePanelWidth(side)));
    });
    const backdrop = this.root.querySelector<HTMLButtonElement>("[data-schematic-panel-backdrop]");
    if (backdrop) backdrop.hidden = !projection.backdropVisible;
  }

  private persist() {
    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch {
      // Layout persistence is best-effort and must never block editing.
    }
  }

  private eventTargetElement(target: EventTarget | null) {
    return this.elementConstructor && target instanceof this.elementConstructor
      ? target
      : null;
  }
}

function panelWidthRange(side: SchematicPanelSide) {
  return side === "left" ? LEFT_WIDTH_RANGE : RIGHT_WIDTH_RANGE;
}

function readState(storage: Pick<Storage, "getItem"> | null): SchematicLayoutState {
  try {
    const raw = storage?.getItem(STORAGE_KEY)
      ?? storage?.getItem(LEGACY_STORAGE_KEY)
      ?? "null";
    const parsed = JSON.parse(raw) as Partial<SchematicLayoutState> | null;
    if (!parsed || typeof parsed !== "object") return { ...DEFAULT_STATE };
    return {
      leftWidth: clamp(Number(parsed.leftWidth), LEFT_WIDTH_RANGE, DEFAULT_STATE.leftWidth),
      rightWidth: clamp(Number(parsed.rightWidth), RIGHT_WIDTH_RANGE, DEFAULT_STATE.rightWidth),
      leftCollapsed: parsed.leftCollapsed === true,
      rightCollapsed: typeof parsed.rightCollapsed === "boolean" ? parsed.rightCollapsed : DEFAULT_STATE.rightCollapsed,
      rightActiveView: String(parsed.rightActiveView) === "diagnostics"
        ? "netlist"
        : isRightDockView(parsed.rightActiveView) ? parsed.rightActiveView : "analysis",
      sidebarTab: parsed.sidebarTab === "properties" ? "properties" : "library",
      logHeight: clamp(Number(parsed.logHeight), LOG_HEIGHT_RANGE, DEFAULT_STATE.logHeight)
    };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

function isRightDockView(value: unknown): value is RightDockView {
  return typeof value === "string" && (RIGHT_DOCK_VIEWS as readonly string[]).includes(value);
}

function localStorageFor(root: HTMLElement) {
  try {
    return root.ownerDocument.defaultView?.localStorage ?? null;
  } catch {
    return null;
  }
}

function clamp(
  value: number,
  range: { min: number; max: number },
  fallback = range.min
) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(range.max, Math.max(range.min, Math.round(value)));
}
