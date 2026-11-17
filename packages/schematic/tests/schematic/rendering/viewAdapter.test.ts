import { describe, expect, it } from "vitest";
import {
  SchematicViewAdapter,
  applySchematicView,
  centerBetweenClientPoints,
  cloneSchematicView,
  computeFitView,
  computePanTranslate,
  computePinchZoom,
  computeWheelZoom,
  computeZoomAtScreenPoint,
  defaultSchematicView,
  distanceBetweenClientPoints,
  expandedRect,
  hasPanGestureMoved,
  localPointFromClient,
  screenToWorldPoint,
  worldToScreenPoint,
  type SchematicView,
  type SchematicViewHost,
  type SchematicViewPaper
} from "../../../src/schematic/viewAdapter";

type PaperCall = [number, number];

function makePaper(converter?: (...args: unknown[]) => unknown) {
  const scaleCalls: PaperCall[] = [];
  const translateCalls: PaperCall[] = [];
  const paper: SchematicViewPaper & { scaleCalls: PaperCall[]; translateCalls: PaperCall[] } = {
    scaleCalls,
    translateCalls,
    scale: (x, y) => {
      scaleCalls.push([x, y]);
    },
    translate: (x, y) => {
      translateCalls.push([x, y]);
    }
  };
  if (converter) paper.clientToLocalPoint = converter;
  return paper;
}

function makeHost(input: Partial<Pick<SchematicViewHost, "clientWidth" | "clientHeight" | "scrollLeft" | "scrollTop">> & { left?: number; top?: number } = {}) {
  const host: SchematicViewHost = {
    clientWidth: input.clientWidth ?? 800,
    clientHeight: input.clientHeight ?? 600,
    scrollLeft: input.scrollLeft ?? 12,
    scrollTop: input.scrollTop ?? 34,
    getBoundingClientRect: () => ({
      left: input.left ?? 10,
      top: input.top ?? 20,
      width: input.clientWidth ?? 800,
      height: input.clientHeight ?? 600
    })
  };
  return host;
}

describe("schematic view adapter", () => {
  it("clones view state and applies scale plus translate to the paper", () => {
    const paper = makePaper();
    const view: SchematicView = { zoom: 2, translate: { x: 120, y: -40 } };
    const cloned = cloneSchematicView(view);
    view.translate.x = 999;

    expect(cloned).toEqual({ zoom: 2, translate: { x: 120, y: -40 } });

    applySchematicView(paper, cloned);
    expect(paper.scaleCalls).toEqual([[2, 2]]);
    expect(paper.translateCalls).toEqual([[120, -40]]);
  });

  it("computes centered fit views with padding and minimum zoom clamping", () => {
    const fit = computeFitView({ x: 100, y: 50, width: 200, height: 100 }, { width: 1000, height: 600 }, 50, {
      minZoom: 0.01,
      maxZoom: 10
    });

    expect(fit.empty).toBe(false);
    expect(fit.fitScale).toBe(4.5);
    expect(fit.clampedToMinZoom).toBe(false);
    expect(fit.view).toEqual({ zoom: 4.5, translate: { x: -400, y: -150 } });

    const clamped = computeFitView({ x: 0, y: 0, width: 100000, height: 100000 }, { width: 100, height: 100 }, 10, {
      minZoom: 0.05,
      maxZoom: 10
    });

    expect(clamped.fitScale).toBe(0.0008);
    expect(clamped.view.zoom).toBe(0.05);
    expect(clamped.clampedToMinZoom).toBe(true);
  });

  it("expands content bounds by a fixed margin", () => {
    expect(expandedRect(null, 24)).toBeNull();
    expect(expandedRect({ x: 100, y: 50, width: 200, height: 100 }, 24)).toEqual({
      x: 76,
      y: 26,
      width: 248,
      height: 148
    });
  });

  it("returns the default view for empty content bounds", () => {
    const fit = computeFitView(null, { width: 800, height: 600 }, 48, { minZoom: 0.01, maxZoom: 10 });

    expect(fit.empty).toBe(true);
    expect(fit.view).toEqual(defaultSchematicView());
  });

  it("converts between screen, world, and client coordinates", () => {
    const paper = makePaper();
    const host = makeHost();
    const view: SchematicView = { zoom: 2, translate: { x: 100, y: 50 } };

    expect(worldToScreenPoint({ x: 50, y: 50 }, view)).toEqual({ x: 200, y: 150 });
    expect(screenToWorldPoint({ x: 200, y: 150 }, view)).toEqual({ x: 50, y: 50 });
    expect(localPointFromClient(paper, host, view, 210, 170)).toEqual({ x: 50, y: 50 });
  });

  it("prefers JointJS clientToLocalPoint but falls back to view math", () => {
    const objectPaper = makePaper((point) => (typeof point === "object" ? { x: 7, y: 9 } : null));
    const host = makeHost();
    const view: SchematicView = { zoom: 2, translate: { x: 100, y: 50 } };

    expect(localPointFromClient(objectPaper, host, view, 210, 170)).toEqual({ x: 7, y: 9 });

    const numericPaper = makePaper((first, second) => (typeof first === "number" && typeof second === "number" ? { x: 3, y: 4 } : { x: Number.NaN, y: 1 }));
    expect(localPointFromClient(numericPaper, host, view, 210, 170)).toEqual({ x: 3, y: 4 });
  });

  it("keeps a zoom anchor stable through the adapter", () => {
    const paper = makePaper();
    const host = makeHost({ scrollLeft: 22, scrollTop: 44 });
    const adapter = new SchematicViewAdapter(paper, host);

    adapter.setView({ zoom: 2, translate: { x: 100, y: 50 } });
    const snapshot = adapter.getView();
    snapshot.translate.x = 999;
    expect(adapter.getView()).toEqual({ zoom: 2, translate: { x: 100, y: 50 } });

    adapter.zoomAtClientPoint(4, 210, 170);
    expect(adapter.getView()).toEqual({ zoom: 4, translate: { x: 0, y: -50 } });
    expect(adapter.localPointFromClient(210, 170)).toEqual({ x: 50, y: 50 });

    expect(computeZoomAtScreenPoint(4, { x: 200, y: 150 }, { x: 50, y: 50 })).toEqual(adapter.getView());

    adapter.resetScroll();
    expect(host.scrollLeft).toBe(0);
    expect(host.scrollTop).toBe(0);
    expect(adapter.viewportSize()).toEqual({ width: 800, height: 600 });
  });

  it("retargets view projection while preserving the adapter view state", () => {
    const firstPaper = makePaper();
    const secondPaper = makePaper();
    const adapter = new SchematicViewAdapter(firstPaper, makeHost());

    adapter.setView({ zoom: 2, translate: { x: 10, y: 20 } });
    adapter.setPaper(secondPaper);
    adapter.setView({ zoom: 3, translate: { x: 30, y: 40 } });

    expect(firstPaper.scaleCalls).toEqual([[2, 2]]);
    expect(firstPaper.translateCalls).toEqual([[10, 20]]);
    expect(secondPaper.scaleCalls).toEqual([[3, 3]]);
    expect(secondPaper.translateCalls).toEqual([[30, 40]]);
    expect(adapter.getView()).toEqual({ zoom: 3, translate: { x: 30, y: 40 } });
  });

  it("computes middle-button and touch pan translations from client deltas", () => {
    expect(computePanTranslate({ x: 120, y: -40 }, { x: 300, y: 200 }, { x: 345, y: 170 })).toEqual({ x: 165, y: -70 });
    expect(computePanTranslate({ x: -12, y: 8 }, { x: 10, y: 20 }, { x: -5, y: 55 })).toEqual({ x: -27, y: 43 });
  });

  it("uses a strict touch pan movement threshold", () => {
    expect(hasPanGestureMoved({ x: 0, y: 0 }, { x: 0.6, y: 0.8 })).toBe(false);
    expect(hasPanGestureMoved({ x: 0, y: 0 }, { x: 0.61, y: 0.8 })).toBe(true);
  });

  it("computes wheel zoom by factor and preserves already-below-min zoom while clamping", () => {
    const zoomRange = { minZoom: 0.0035, maxZoom: 280 };

    expect(computeWheelZoom(2, -100, zoomRange)).toBeCloseTo(2 * Math.exp(0.14));
    expect(computeWheelZoom(2, 100000, zoomRange)).toBe(0.0035);
    expect(computeWheelZoom(0.002, 100000, zoomRange)).toBe(0.002);
    expect(computeWheelZoom(300, -100, zoomRange)).toBe(280);
  });

  it("computes pinch center, distance, ratio, clamp, and moved state", () => {
    const first = { clientX: 10, clientY: 20 };
    const second = { clientX: 110, clientY: 20 };

    expect(centerBetweenClientPoints(first, second)).toEqual({ x: 60, y: 20 });
    expect(distanceBetweenClientPoints(first, second)).toBe(100);

    const expanded = computePinchZoom(2, 2, 100, 150, { minZoom: 0.0035, maxZoom: 280 });
    expect(expanded).toEqual({ distance: 150, ratio: 1.5, nextZoom: 3, moved: true });

    const clampedToMax = computePinchZoom(200, 200, 100, 200, { minZoom: 0.0035, maxZoom: 280 });
    expect(clampedToMax.nextZoom).toBe(280);

    const alreadyBelowMin = computePinchZoom(0.002, 0.002, 100, 10, { minZoom: 0.0035, maxZoom: 280 });
    expect(alreadyBelowMin.nextZoom).toBe(0.002);

    const barelyMoved = computePinchZoom(2, 2, 100, 100.001, { minZoom: 0.0035, maxZoom: 280 });
    expect(barelyMoved.moved).toBe(false);

    const distanceMoved = computePinchZoom(2, 2.012, 100, 100.6, { minZoom: 0.0035, maxZoom: 280 });
    expect(distanceMoved.nextZoom).toBeCloseTo(2.012);
    expect(distanceMoved.moved).toBe(true);
  });
});
