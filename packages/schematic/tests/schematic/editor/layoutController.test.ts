import { describe, expect, it } from "vitest";
import {
  projectSchematicLayout,
  resolveSchematicPanelResize,
  SchematicLayoutController,
  type SchematicLayoutState
} from "../../../src/schematic/schematicLayoutController";

const expanded: SchematicLayoutState = {
  leftWidth: 280,
  rightWidth: 330,
  leftCollapsed: false,
  rightCollapsed: false
};

describe("schematic layout projection", () => {
  it("keeps independently collapsed desktop panels out of the workspace columns", () => {
    expect(projectSchematicLayout(1600, expanded, null)).toEqual({
      narrow: false,
      leftVisible: true,
      rightVisible: true,
      backdropVisible: false
    });
    expect(projectSchematicLayout(1600, { ...expanded, leftCollapsed: true }, null)).toEqual({
      narrow: false,
      leftVisible: false,
      rightVisible: true,
      backdropVisible: false
    });
  });

  it("uses one overlay drawer at a time in a narrow container", () => {
    expect(projectSchematicLayout(900, expanded, null)).toEqual({
      narrow: true,
      leftVisible: false,
      rightVisible: false,
      backdropVisible: false
    });
    expect(projectSchematicLayout(900, expanded, "right")).toEqual({
      narrow: true,
      leftVisible: false,
      rightVisible: true,
      backdropVisible: true
    });
  });
});

describe("schematic panel resize projection", () => {
  it("collapses below the side-specific minimum and reopens at the same threshold", () => {
    expect(resolveSchematicPanelResize("left", 209)).toEqual({ width: 210, collapsed: true });
    expect(resolveSchematicPanelResize("left", 210)).toEqual({ width: 210, collapsed: false });
    expect(resolveSchematicPanelResize("right", 259)).toEqual({ width: 260, collapsed: true });
    expect(resolveSchematicPanelResize("right", 260)).toEqual({ width: 260, collapsed: false });
  });

  it("keeps expanded widths inside their maximum bounds", () => {
    expect(resolveSchematicPanelResize("left", 900)).toEqual({ width: 520, collapsed: false });
    expect(resolveSchematicPanelResize("right", 900)).toEqual({ width: 680, collapsed: false });
  });
});

describe("SchematicLayoutController lifecycle", () => {
  it.each([
    [null, true],
    [JSON.stringify({ leftWidth: 300 }), true],
    [JSON.stringify({ rightCollapsed: false }), false]
  ])("defaults analysis to collapsed while preserving a saved choice (%s)", (saved, collapsed) => {
    const root = new FakeRoot(1600);
    const controller = new SchematicLayoutController(root as unknown as HTMLElement, {
      storage: { getItem: () => saved, setItem: () => {} },
      resizeObserver: null
    });

    controller.init();
    expect(root.classes.has("is-left-panel-visible")).toBe(true);
    expect(root.classes.has("is-right-panel-visible")).toBe(!collapsed);
    controller.destroy();
  });

  it("mounts idempotently and disconnects its observer on destroy", () => {
    let observeCount = 0;
    let disconnectCount = 0;
    class Observer {
      constructor(_callback: ResizeObserverCallback) {}
      observe() { observeCount += 1; }
      disconnect() { disconnectCount += 1; }
      unobserve() {}
    }
    const root = new FakeRoot(900);
    const controller = new SchematicLayoutController(root as unknown as HTMLElement, {
      storage: null,
      resizeObserver: Observer as unknown as typeof ResizeObserver
    });

    controller.init();
    controller.init();
    expect(observeCount).toBe(1);
    expect(root.classes.has("is-layout-ready")).toBe(true);
    expect(root.classes.has("is-layout-narrow")).toBe(true);

    controller.destroy();
    controller.destroy();
    expect(disconnectCount).toBe(1);
    expect(root.classes.has("is-layout-ready")).toBe(false);
    expect(root.styleValues.size).toBe(0);
  });
});

class FakeRoot extends EventTarget {
  readonly classes = new Set<string>();
  readonly styleValues = new Map<string, string>();
  readonly ownerDocument = new FakeDocument();
  readonly classList = {
    add: (...names: string[]) => names.forEach((name) => this.classes.add(name)),
    remove: (...names: string[]) => names.forEach((name) => this.classes.delete(name)),
    toggle: (name: string, force?: boolean) => {
      const next = force ?? !this.classes.has(name);
      if (next) this.classes.add(name);
      else this.classes.delete(name);
      return next;
    }
  };
  readonly style = {
    setProperty: (name: string, value: string) => this.styleValues.set(name, value),
    removeProperty: (name: string) => this.styleValues.delete(name)
  };

  constructor(readonly clientWidth: number) {
    super();
  }

  getBoundingClientRect() {
    return { width: this.clientWidth } as DOMRect;
  }

  querySelector() {
    return null;
  }

  querySelectorAll() {
    return [];
  }
}

class FakeDocument extends EventTarget {
  readonly defaultView = null;
}
