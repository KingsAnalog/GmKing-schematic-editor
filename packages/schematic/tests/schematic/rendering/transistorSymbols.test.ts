import { describe, expect, it } from "vitest";
import { resolveComponentAnalysisModel } from "../../../src/schematic/analysis/componentAnalysisRegistry";
import { resolveComponentDef } from "../../../src/schematic/catalog";
import { componentPinPoint } from "../../../src/schematic/netlist";
import { rotatePoint } from "../../../src/schematic/geometry";
import { makeComponentCell } from "../../../src/schematic/renderer";
import {
  bjtBaseSymbol,
  bjtMarkerSymbol,
  parseBjtSymbol
} from "../../../src/schematic/symbols/bjtSymbols";
import {
  symbolMarkerPath,
  symbolPath
} from "../../../src/schematic/symbols/symbolRegistry";
import { SYMBOL_STROKE_WIDTH } from "../../../src/schematic/symbols/symbolPrimitives";
import { transistorCirclePath } from "../../../src/schematic/symbols/transistorSymbols";
import { componentFrameBox } from "../../../src/schematic/view-geometry";
import { component } from "../support/testHelpers";

describe("schematic BJT and transistor-circle symbols", () => {
  it("defines NPN and PNP with MOS-aligned pins and Q references", () => {
    const npn = resolveComponentDef("npn");
    const pnp = resolveComponentDef("pnp");

    expect(npn).toMatchObject({ valuePrefix: "Q", size: { width: 100, height: 100 } });
    expect(pnp).toMatchObject({ valuePrefix: "Q", size: { width: 100, height: 100 } });
    expect(npn.valueKey).toBeUndefined();
    expect(pnp.valueKey).toBeUndefined();
    expect(npn.pins.map(({ id, role, x, y }) => ({ id, role, x, y }))).toEqual([
      { id: "c", role: "collector", x: 0, y: -40 },
      { id: "b", role: "base", x: -40, y: 0 },
      { id: "e", role: "emitter", x: 0, y: 40 }
    ]);
    expect(pnp.pins.map(({ id, role, x, y }) => ({ id, role, x, y }))).toEqual([
      { id: "e", role: "emitter", x: 0, y: -40 },
      { id: "b", role: "base", x: -40, y: 0 },
      { id: "c", role: "collector", x: 0, y: 40 }
    ]);
    expect(resolveComponentAnalysisModel({ type: "npn" })).toBe("bjt");
    expect(resolveComponentAnalysisModel({ type: "pnp" })).toBe("bjt");
  });

  it("uses an 18a by 2a base and the shared 6a by 7a solid arrow", () => {
    const a = SYMBOL_STROKE_WIDTH;
    const npn = resolveComponentDef("npn");
    const pnp = resolveComponentDef("pnp");
    const basePath = bjtBaseSymbol(npn.size.width, npn.size.height, a);
    const npnView = parseBjtSymbol(npn.symbol)!;
    const pnpView = parseBjtSymbol(pnp.symbol)!;
    const npnMarker = bjtMarkerSymbol(npn.size.width, npn.size.height, npnView, a);
    const pnpMarker = bjtMarkerSymbol(pnp.size.width, pnp.size.height, pnpView, a);

    const [baseStartX, baseStartY, baseEndX, baseEndY] = basePath.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
    expect(baseStartX).toBe(baseEndX);
    expect(baseEndY - baseStartY).toBe(18 * a);
    expect(makeComponentCell(component("npn", "Q1", 100, 120)).attr("symbolAccent/strokeWidth")).toBe(2 * a);
    expect(symbolMarkerPath(npn.symbol, npn.size.width, npn.size.height)).toBe(npnMarker);
    expect(symbolMarkerPath(pnp.symbol, pnp.size.width, pnp.size.height)).toBe(pnpMarker);
    expect(triangleDimensions(npnMarker).base).toBeCloseTo(6 * a);
    expect(triangleDimensions(npnMarker).height).toBeCloseTo(7 * a);
    expect(triangleDimensions(pnpMarker).base).toBeCloseTo(6 * a);
    expect(triangleDimensions(pnpMarker).height).toBeCloseTo(7 * a);
    expect(triangleTip(npnMarker).x).toBeGreaterThan(triangleBaseCenter(npnMarker).x);
    expect(triangleTip(pnpMarker).x).toBeLessThan(triangleBaseCenter(pnpMarker).x);
  });

  it("adds a 20a outer and 18a inner circle without changing the 4 by 2 grid frame", () => {
    const a = SYMBOL_STROKE_WIDTH;
    const npn = component("npn", "Q1", 0, 0);
    const nmos = component("nmos", "M1", 0, 0);
    const npnDefaultPath = symbolPath(resolveComponentDef(npn).symbol, 100, 100);
    const nmosDefaultPath = symbolPath(resolveComponentDef(nmos).symbol, 100, 100);
    npn.values.transistorCircle = "true";
    nmos.values.transistorCircle = "true";
    const npnCircleDef = resolveComponentDef(npn);
    const nmosCircleDef = resolveComponentDef(nmos);
    const circle = transistorCirclePath(100, 100, a);

    expect(npnCircleDef.symbol).toBe("npn-circle");
    expect(nmosCircleDef.symbol).toBe("nmos-3pin-current-circle");
    expect(symbolPath(npnCircleDef.symbol, 100, 100)).toContain(circle);
    expect(symbolPath(nmosCircleDef.symbol, 100, 100)).toContain(circle);
    expect(symbolPath(resolveComponentDef("npn").symbol, 100, 100)).toBe(npnDefaultPath);
    expect(symbolPath(resolveComponentDef("nmos").symbol, 100, 100)).toBe(nmosDefaultPath);
    expect(2 * (9.5 * a + a / 2)).toBe(20 * a);
    expect(2 * (9.5 * a - a / 2)).toBe(18 * a);
    expect(componentFrameBox(npnCircleDef)).toEqual({ x: 10, y: 10, width: 40, height: 80 });
    expect(componentFrameBox(nmosCircleDef)).toEqual({ x: 10, y: 10, width: 40, height: 80 });
  });

  it("keeps every BJT pin on grid after rotation and mirroring", () => {
    for (const type of ["npn", "pnp"] as const) {
      for (const rotation of [0, 90, 180, 270]) {
        for (const mirrored of [false, true]) {
          const instance = { ...component(type, `${type}-${rotation}-${mirrored}`, 200, 200, rotation), mirrored };
          resolveComponentDef(instance).pins.forEach((pin) => {
            const point = componentPinPoint(instance, pin.id);
            expect(point.x % 20).toBe(0);
            expect(point.y % 20).toBe(0);
          });
        }
      }
    }
  });

  it("keeps transistor name centers between control and source pins through rotation and mirroring", () => {
    const baselineOffset = 11 * 0.35;
    for (const type of ["nmos", "pmos", "npn", "pnp"] as const) {
      const biasedPinIsAbove = type === "pmos" || type === "pnp";
      for (const rotation of [0, 90, 180, 270]) {
        for (const mirrored of [false, true]) {
          const instance = {
            ...component(type, "M1", 200, 200, rotation),
            mirrored
          };
          const cell = makeComponentCell(instance);
          const anchorX = Number(cell.attr("refLabel/x"));
          const anchorY = Number(cell.attr("refLabel/y")) - baselineOffset;
          expect(anchorX, `${type} ${rotation} mirrored=${mirrored}`).toBe(20);
          expect(anchorY, `${type} ${rotation} mirrored=${mirrored}`).toBe(biasedPinIsAbove ? 12 : 68);
          expect(cell.attr("refLabel/textAnchor")).toBe("middle");
          const position = cell.position();
          const size = cell.size();
          const offset = rotatePoint({ x: anchorX - size.width / 2, y: anchorY - size.height / 2 }, rotation);
          const center = { x: position.x + size.width / 2 + offset.x, y: position.y + size.height / 2 + offset.y };
          const def = resolveComponentDef(instance);
          const control = componentPinPoint(instance, def.pins.find(pin => pin.role === "gate" || pin.role === "base")!.id)!;
          const source = componentPinPoint(instance, def.pins.find(pin => pin.role === "source" || pin.role === "emitter")!.id)!;
          for (const axis of ["x", "y"] as const) {
            expect(center[axis]).toBeGreaterThan(Math.min(control[axis], source[axis]));
            expect(center[axis]).toBeLessThan(Math.max(control[axis], source[axis]));
          }
          instance.values.transistorCircle = "true";
          const circledCell = makeComponentCell(instance);
          expect(circledCell.attr("refLabel/x")).toBe(anchorX);
          expect(circledCell.attr("refLabel/y")).toBe(anchorY + baselineOffset);
        }
      }
    }
  });
});

function trianglePoints(path: string) {
  const values = path.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  return [
    { x: values[0], y: values[1] },
    { x: values[2], y: values[3] },
    { x: values[4], y: values[5] }
  ];
}

function triangleTip(path: string) {
  return trianglePoints(path)[0];
}

function triangleBaseCenter(path: string) {
  const [, first, second] = trianglePoints(path);
  return { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
}

function triangleDimensions(path: string) {
  const [tip, first, second] = trianglePoints(path);
  const center = triangleBaseCenter(path);
  return {
    base: Math.hypot(first.x - second.x, first.y - second.y),
    height: Math.hypot(tip.x - center.x, tip.y - center.y)
  };
}
