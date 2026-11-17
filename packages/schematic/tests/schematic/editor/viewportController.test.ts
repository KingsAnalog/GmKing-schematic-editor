import { describe, expect, it } from "vitest";
import { SchematicViewportController, isViewportPanMouseEvent } from "../../../src/schematic/viewportController";
import type { Point } from "../../../src/schematic/types";
import type { SchematicView } from "../../../src/schematic/viewAdapter";

type FakePointerEvent = PointerEvent & {
  preventDefaultCalls: number;
  stopPropagationCalls: number;
};

type FakeWheelEvent = WheelEvent & {
  preventDefaultCalls: number;
};

function makeClassList() {
  const classes = new Set<string>();
  return {
    classes,
    classList: {
      add: (...tokens: string[]) => {
        for (const token of tokens) classes.add(token);
      },
      remove: (...tokens: string[]) => {
        for (const token of tokens) classes.delete(token);
      }
    } as Pick<DOMTokenList, "add" | "remove">
  };
}

function makeTarget(blockedSelector?: string) {
  return {
    closest: (selector: string) => (blockedSelector && selector.includes(blockedSelector) ? {} : null)
  } as unknown as EventTarget;
}

function makePointerEvent(input: Partial<PointerEvent> & { target?: EventTarget | null } = {}): FakePointerEvent {
  const event = {
    button: 0,
    buttons: 0,
    clientX: 0,
    clientY: 0,
    pointerId: 1,
    pointerType: "mouse",
    target: null,
    preventDefaultCalls: 0,
    stopPropagationCalls: 0,
    preventDefault() {
      this.preventDefaultCalls += 1;
    },
    stopPropagation() {
      this.stopPropagationCalls += 1;
    },
    ...input
  };
  return event as FakePointerEvent;
}

function makeWheelEvent(input: Partial<WheelEvent> & { target?: EventTarget | null } = {}): FakeWheelEvent {
  const event = {
    clientX: 0,
    clientY: 0,
    deltaY: 0,
    target: null,
    preventDefaultCalls: 0,
    preventDefault() {
      this.preventDefaultCalls += 1;
    },
    ...input
  };
  return event as FakeWheelEvent;
}

function makeHarness(input: { canStartTouchPan?: boolean; cancelConflictingGestures?: () => boolean } = {}) {
  const classHarness = makeClassList();
  let view: SchematicView = { zoom: 1, translate: { x: 10, y: 20 } };
  const setViews: SchematicView[] = [];
  const zoomCalls: Array<{ nextZoom: number; clientX: number; clientY: number; localAnchor?: Point }> = [];
  const captures: number[] = [];
  const releases: number[] = [];
  const listenerCalls = { add: 0, remove: 0 };
  let persistCalls = 0;
  let middleClickCalls = 0;
  const paperTarget = makeTarget();

  const controller = new SchematicViewportController({
    host: {
      classList: classHarness.classList,
      setPointerCapture: (pointerId) => {
        captures.push(pointerId);
      },
      releasePointerCapture: (pointerId) => {
        releases.push(pointerId);
      }
    },
    containsEventTarget: (target) => target === paperTarget,
    getView: () => ({ zoom: view.zoom, translate: { ...view.translate } }),
    setView: (nextView) => {
      view = { zoom: nextView.zoom, translate: { ...nextView.translate } };
      setViews.push({ zoom: view.zoom, translate: { ...view.translate } });
    },
    localPointFromClient: (clientX, clientY) => ({ x: clientX / 2, y: clientY / 2 }),
    zoomAtClientPoint: (nextZoom, clientX, clientY, localAnchor) => {
      view = { zoom: nextZoom, translate: { ...view.translate } };
      zoomCalls.push({ nextZoom, clientX, clientY, localAnchor });
    },
    persistWorkspaceState: () => {
      persistCalls += 1;
    },
    onMiddleClick: () => {
      middleClickCalls += 1;
    },
    canStartTouchPan: () => input.canStartTouchPan ?? true,
    cancelConflictingGestures: input.cancelConflictingGestures,
    listeners: {
      add: () => {
        listenerCalls.add += 1;
      },
      remove: () => {
        listenerCalls.remove += 1;
      }
    },
    minZoom: 0.0035,
    maxZoom: 280
  });

  return {
    captures,
    classes: classHarness.classes,
    controller,
    listenerCalls,
    paperTarget,
    get persistCalls() {
      return persistCalls;
    },
    get middleClickCalls() {
      return middleClickCalls;
    },
    releases,
    setView: (nextView: SchematicView) => {
      view = { zoom: nextView.zoom, translate: { ...nextView.translate } };
    },
    setViews,
    zoomCalls
  };
}

describe("schematic viewport controller", () => {
  it("tracks middle-mouse pan lifecycle through shared global listeners", () => {
    const harness = makeHarness();
    const start = makePointerEvent({ button: 1, buttons: 4, clientX: 100, clientY: 200 });

    expect(isViewportPanMouseEvent(start)).toBe(true);
    harness.controller.startMousePan(start);

    expect(start.preventDefaultCalls).toBe(1);
    expect(start.stopPropagationCalls).toBe(1);
    expect(harness.controller.isMousePanActive()).toBe(true);
    expect(harness.classes.has("is-panning")).toBe(true);
    expect(harness.listenerCalls).toEqual({ add: 1, remove: 0 });

    const move = makePointerEvent({ clientX: 125, clientY: 170 });
    expect(harness.controller.handleGlobalPointerMove(move)).toBe(true);
    expect(harness.setViews).toEqual([{ zoom: 1, translate: { x: 35, y: -10 } }]);
    expect(harness.persistCalls).toBe(0);

    const up = makePointerEvent();
    expect(harness.controller.handleGlobalPointerUp(up)).toBe(true);
    expect(harness.controller.isMousePanActive()).toBe(false);
    expect(harness.classes.has("is-panning")).toBe(false);
    expect(harness.listenerCalls).toEqual({ add: 1, remove: 1 });
    expect(harness.persistCalls).toBe(1);
    expect(harness.middleClickCalls).toBe(0);
  });

  it("treats a middle press within four pixels as a click without moving or persisting the view", () => {
    const harness = makeHarness();
    harness.controller.startMousePan(makePointerEvent({
      button: 1,
      buttons: 4,
      clientX: 100,
      clientY: 100
    }));

    expect(harness.controller.handleGlobalPointerMove(makePointerEvent({
      buttons: 4,
      clientX: 102,
      clientY: 103
    }))).toBe(true);
    expect(harness.setViews).toEqual([]);
    expect(harness.controller.handleGlobalPointerUp(makePointerEvent({
      button: 1,
      clientX: 102,
      clientY: 103
    }))).toBe(true);

    expect(harness.middleClickCalls).toBe(1);
    expect(harness.persistCalls).toBe(0);
    expect(harness.setViews).toEqual([]);
  });

  it("cancels active pan state without persisting it into another document session", () => {
    const harness = makeHarness();
    harness.controller.startMousePan(makePointerEvent({ button: 1, buttons: 4 }));
    harness.controller.handleTouchPointerDown(
      makePointerEvent({ pointerType: "touch", pointerId: 9, target: makeTarget() })
    );

    harness.controller.cancelActiveGestures();

    expect(harness.controller.isMousePanActive()).toBe(false);
    expect(harness.classes.has("is-panning")).toBe(false);
    expect(harness.releases).toContain(9);
    expect(harness.listenerCalls.remove).toBe(1);
    expect(harness.persistCalls).toBe(0);
  });

  it("keeps wheel zoom anchored through the editor callback and persists only real view changes", () => {
    const harness = makeHarness();
    harness.setView({ zoom: 2, translate: { x: 0, y: 0 } });

    const outside = makeWheelEvent({ target: makeTarget(), deltaY: -100 });
    expect(harness.controller.handleWheel(outside)).toBe(false);
    expect(outside.preventDefaultCalls).toBe(0);

    const wheel = makeWheelEvent({ target: harness.paperTarget, deltaY: -100, clientX: 220, clientY: 140 });
    expect(harness.controller.handleWheel(wheel)).toBe(true);

    expect(wheel.preventDefaultCalls).toBe(1);
    expect(harness.zoomCalls).toHaveLength(1);
    expect(harness.zoomCalls[0].nextZoom).toBeCloseTo(2 * Math.exp(0.14));
    expect(harness.zoomCalls[0].clientX).toBe(220);
    expect(harness.zoomCalls[0].clientY).toBe(140);
    expect(harness.persistCalls).toBe(1);

    const tiny = makeWheelEvent({ target: harness.paperTarget, deltaY: 0.1, clientX: 1, clientY: 2 });
    expect(harness.controller.handleWheel(tiny)).toBe(true);
    expect(harness.zoomCalls).toHaveLength(1);
    expect(harness.persistCalls).toBe(1);
  });

  it("starts touch pan only from navigable canvas, cancels conflicting gestures, and suppresses the following blank click", () => {
    let cancelCalls = 0;
    const harness = makeHarness({
      cancelConflictingGestures: () => {
        cancelCalls += 1;
        return true;
      }
    });
    const target = makeTarget();

    harness.controller.handleTouchPointerDown(makePointerEvent({ pointerType: "touch", pointerId: 7, clientX: 100, clientY: 100, target }));
    expect(harness.captures).toEqual([7]);
    expect(harness.controller.handleTouchPointerMove(makePointerEvent({ pointerType: "touch", pointerId: 7, clientX: 104, clientY: 105 }))).toBe(false);

    const move = makePointerEvent({ pointerType: "touch", pointerId: 7, clientX: 112, clientY: 100 });
    expect(harness.controller.handleTouchPointerMove(move)).toBe(true);
    expect(move.preventDefaultCalls).toBe(1);
    expect(cancelCalls).toBe(1);
    expect(harness.classes.has("is-panning")).toBe(true);
    expect(harness.setViews).toEqual([{ zoom: 1, translate: { x: 22, y: 20 } }]);

    const end = makePointerEvent({ pointerType: "touch", pointerId: 7 });
    expect(harness.controller.handleTouchPointerEnd(end)).toBe(true);
    expect(harness.releases).toEqual([7]);
    expect(harness.persistCalls).toBe(1);
    expect(harness.classes.has("is-panning")).toBe(false);
    expect(harness.controller.consumeSuppressedBlankClick()).toBe(true);
    expect(harness.controller.consumeSuppressedBlankClick()).toBe(false);
  });

  it("ignores touch pan from note/cell targets or when the editor cannot pan", () => {
    const blockedByTarget = makeHarness();
    blockedByTarget.controller.handleTouchPointerDown(
      makePointerEvent({ pointerType: "touch", pointerId: 1, clientX: 0, clientY: 0, target: makeTarget("[data-note-id]") })
    );
    expect(blockedByTarget.controller.handleTouchPointerMove(makePointerEvent({ pointerType: "touch", pointerId: 1, clientX: 100, clientY: 0 }))).toBe(false);
    expect(blockedByTarget.setViews).toEqual([]);

    const blockedByMode = makeHarness({ canStartTouchPan: false });
    blockedByMode.controller.handleTouchPointerDown(makePointerEvent({ pointerType: "touch", pointerId: 2, clientX: 0, clientY: 0, target: makeTarget() }));
    expect(blockedByMode.controller.handleTouchPointerMove(makePointerEvent({ pointerType: "touch", pointerId: 2, clientX: 100, clientY: 0 }))).toBe(false);
    expect(blockedByMode.setViews).toEqual([]);
  });

  it("uses the initial pinch center as the zoom anchor and persists on moved pinch end", () => {
    const harness = makeHarness();
    const firstTarget = makeTarget();
    const secondTarget = makeTarget();

    harness.controller.handleTouchPointerDown(makePointerEvent({ pointerType: "touch", pointerId: 1, clientX: 100, clientY: 100, target: firstTarget }));
    const secondDown = makePointerEvent({ pointerType: "touch", pointerId: 2, clientX: 200, clientY: 100, target: secondTarget });
    expect(harness.controller.handleTouchPointerDown(secondDown)).toBe(true);
    expect(secondDown.preventDefaultCalls).toBe(1);
    expect(harness.classes.has("is-panning")).toBe(true);

    const pinchMove = makePointerEvent({ pointerType: "touch", pointerId: 2, clientX: 260, clientY: 100 });
    expect(harness.controller.handleTouchPointerMove(pinchMove)).toBe(true);

    expect(harness.zoomCalls).toEqual([
      {
        nextZoom: 1.6,
        clientX: 180,
        clientY: 100,
        localAnchor: { x: 75, y: 50 }
      }
    ]);

    expect(harness.controller.handleTouchPointerEnd(makePointerEvent({ pointerType: "touch", pointerId: 2 }))).toBe(true);
    expect(harness.persistCalls).toBe(1);
    expect(harness.controller.consumeSuppressedBlankClick()).toBe(true);
  });

  it("settles a moved touch pan before switching to pinch", () => {
    const harness = makeHarness();
    const target = makeTarget();

    harness.controller.handleTouchPointerDown(makePointerEvent({ pointerType: "touch", pointerId: 1, clientX: 100, clientY: 100, target }));
    expect(harness.controller.handleTouchPointerMove(makePointerEvent({ pointerType: "touch", pointerId: 1, clientX: 112, clientY: 100 }))).toBe(true);

    expect(harness.setViews).toEqual([{ zoom: 1, translate: { x: 22, y: 20 } }]);
    expect(harness.persistCalls).toBe(0);

    const secondDown = makePointerEvent({ pointerType: "touch", pointerId: 2, clientX: 200, clientY: 100, target });
    expect(harness.controller.handleTouchPointerDown(secondDown)).toBe(true);

    expect(harness.persistCalls).toBe(1);
    expect(harness.controller.handleTouchPointerEnd(makePointerEvent({ pointerType: "touch", pointerId: 2 }))).toBe(true);
    expect(harness.persistCalls).toBe(1);
    expect(harness.controller.consumeSuppressedBlankClick()).toBe(true);
  });

  it("resets remaining touch starts after pinch so follow-up pan does not jump", () => {
    const harness = makeHarness();
    const target = makeTarget();

    harness.controller.handleTouchPointerDown(makePointerEvent({ pointerType: "touch", pointerId: 1, clientX: 100, clientY: 100, target }));
    harness.controller.handleTouchPointerDown(makePointerEvent({ pointerType: "touch", pointerId: 2, clientX: 200, clientY: 100, target }));
    expect(harness.controller.handleTouchPointerMove(makePointerEvent({ pointerType: "touch", pointerId: 1, clientX: 80, clientY: 100 }))).toBe(true);
    expect(harness.zoomCalls[0]).toMatchObject({ nextZoom: 1.2, clientX: 140, clientY: 100 });

    expect(harness.controller.handleTouchPointerEnd(makePointerEvent({ pointerType: "touch", pointerId: 2 }))).toBe(true);
    harness.setView({ zoom: 1.2, translate: { x: 10, y: 20 } });

    expect(harness.controller.handleTouchPointerMove(makePointerEvent({ pointerType: "touch", pointerId: 1, clientX: 88, clientY: 100 }))).toBe(true);

    expect(harness.setViews).toEqual([{ zoom: 1.2, translate: { x: 18, y: 20 } }]);
  });
});
