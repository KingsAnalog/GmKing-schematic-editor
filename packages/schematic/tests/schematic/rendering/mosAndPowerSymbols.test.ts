import { fixtureDocument } from "../support/fixtureDocument";
import { describe, expect, it } from "vitest";
import { resolveComponentAnalysisModel } from "../../../src/schematic/analysis/componentAnalysisRegistry";
import { extractNetlist } from "../../../src/schematic/netlist";
import { getComponentDef, getComponentVariants, resolveComponentDef } from "../../../src/schematic/catalog";
import {
  DEFAULT_MOS_VIEW_VARIANT_ID,
  MOS_VIEW_STYLES,
  mosViewVariantId,
  normalizeMosViewSettings,
  parseMosViewVariantId
} from "../../../src/schematic/mosViewModel";
import { renderComponentSvg } from "../../../src/schematic/componentSvgRenderer";
import { makeComponentCell } from "../../../src/schematic/renderer";
import { componentFrameBox, componentLocalFrameBox } from "../../../src/schematic/view-geometry";
import { circlePath, SYMBOL_STROKE_WIDTH } from "../../../src/schematic/symbols/symbolPrimitives";
import { groundHorizontalSymbol, groundSymbol, vddHorizontalSymbol, vddSymbol } from "../../../src/schematic/symbols/symbolBuilders";
import {
  symbolAccentPath,
  symbolAccentStrokeWidth,
  symbolMarkerPath,
  symbolPath,
  symbolStrokeWidth
} from "../../../src/schematic/symbols/symbolRegistry";
import type { SchematicDocument } from "../../../src/schematic/types";
import { component } from "../support/testHelpers";

describe("schematic MOS and power symbols", () => {
  it("renders all MOS styles with consistent pins, geometry, and markers", () => {
    const resolveMos = (type: "nmos" | "pmos", ref: string, variantId?: string) => {
      const instance = component(type, ref, 0, 0);
      if (variantId) instance.variantId = variantId;
      return { instance, def: resolveComponentDef(instance) };
    };
    const { def: nmos } = resolveMos("nmos", "MNdef");
    const { def: pmos } = resolveMos("pmos", "MPdef");
    const { instance: nmos4Instance, def: nmos4 } = resolveMos("nmos", "MN4def", "4pin-current");
    const { def: pmos4 } = resolveMos("pmos", "MP4def", "4pin-current");
    const a = SYMBOL_STROKE_WIDTH;
    const cx = nmos.size.width / 2;
    const cy = nmos.size.height / 2;
    const rightInnerX = cx;
    const channelX = rightInnerX - 11 * a;
    const gateInnerX = channelX - 4 * a;
    const upperRightY = cy - 11 * a / 2;
    const lowerRightY = cy + 11 * a / 2;
    const gateCircleRadius = 1.5 * a;
    const gateCircleCx = gateInnerX - gateCircleRadius - 0.5 * a;
    const gatePinX = cx - 40;
    const gateLeadEndX = gateCircleCx - gateCircleRadius;
    const arrowBase = 6 * a;
    const arrowHeight = 7 * a;
    const nmosCurrentMarker = `M ${rightInnerX} ${lowerRightY} L ${rightInnerX - arrowHeight} ${lowerRightY - arrowBase / 2} L ${rightInnerX - arrowHeight} ${lowerRightY + arrowBase / 2} Z`;
    const pmosCurrentMarker = `M ${channelX} ${upperRightY} L ${channelX + arrowHeight} ${upperRightY - arrowBase / 2} L ${channelX + arrowHeight} ${upperRightY + arrowBase / 2} Z`;
    const nmosBulkMarker = `M ${channelX} ${cy} L ${channelX + arrowHeight} ${cy - arrowBase / 2} L ${channelX + arrowHeight} ${cy + arrowBase / 2} Z`;
    const pmosBulkMarker = `M ${rightInnerX} ${cy} L ${rightInnerX - arrowHeight} ${cy - arrowBase / 2} L ${rightInnerX - arrowHeight} ${cy + arrowBase / 2} Z`;
    const nmosPath = symbolPath(nmos.symbol, nmos.size.width, nmos.size.height);
    const pmosPath = symbolPath(pmos.symbol, pmos.size.width, pmos.size.height);
    const nmos4Path = symbolPath(nmos4.symbol, nmos4.size.width, nmos4.size.height);

    [nmos, pmos].forEach((def) => {
      expect(def.defaultVariantId).toBe(DEFAULT_MOS_VIEW_VARIANT_ID);
      expect(def.variantId).toBe("3pin-current");
      expect(resolveComponentAnalysisModel({ type: def.type, variantId: def.variantId })).toBe("mosfet");
      expect(symbolAccentPath(def.symbol, def.size.width, def.size.height)).toContain(
        `M ${gateInnerX} ${cy - 7 * a} L ${gateInnerX} ${cy + 7 * a}`
      );
      expect(symbolAccentStrokeWidth(def.symbol)).toBe(2 * a);
    });
    expect(nmos.symbol).toBe("nmos-3pin-current");
    expect(pmos.symbol).toBe("pmos-3pin-current");
    expect(nmos.pins.map((pin) => pin.id)).toEqual(["d", "g", "s"]);
    expect(pmos.pins.map((pin) => pin.id)).toEqual(["s", "g", "d"]);
    expect(nmos.pins.find((pin) => pin.id === "d")).toMatchObject({ role: "drain", x: 0, y: -40 });
    expect(pmos.pins.find((pin) => pin.id === "s")).toMatchObject({ role: "source", x: 0, y: -40 });
    expect(nmos4.pins.map((pin) => pin.id)).toEqual(["d", "g", "s", "b"]);
    expect(pmos4.pins.map((pin) => pin.id)).toEqual(["s", "g", "d", "b"]);
    expect(nmos4.pins.find((pin) => pin.id === "b")).toMatchObject({ role: "bulk", x: 0, y: 0 });

    expect(nmosPath).toContain(`M ${channelX} ${upperRightY} L ${rightInnerX} ${upperRightY} L ${rightInnerX} ${cy - 40}`);
    expect(nmosPath).toContain(`M ${channelX} ${lowerRightY} L ${rightInnerX} ${lowerRightY} L ${rightInnerX} ${cy + 40}`);
    expect(pmosPath).toContain(`L ${rightInnerX} ${upperRightY} L ${rightInnerX} ${cy - 40}`);
    expect(nmosPath).not.toContain(`M ${rightInnerX} ${cy} L ${channelX} ${cy}`);
    expect(nmos4Path).toContain(`M ${rightInnerX} ${cy} L ${channelX} ${cy}`);
    expect(symbolMarkerPath(nmos.symbol, nmos.size.width, nmos.size.height)).toBe(nmosCurrentMarker);
    expect(symbolMarkerPath(pmos.symbol, pmos.size.width, pmos.size.height)).toBe(pmosCurrentMarker);
    expect(rightInnerX - channelX).toBe(11 * a);
    expect(channelX - gateInnerX).toBe(4 * a);
    expect(lowerRightY - upperRightY - a).toBe(10 * a);

    const styleCases = [
      ["nmos", "3pin-gate", ""],
      ["nmos", "3pin-gate-current", nmosCurrentMarker],
      ["nmos", "3pin-bulk", nmosBulkMarker],
      ["nmos", "3pin-gate-bulk", nmosBulkMarker],
      ["pmos", "3pin-gate", ""],
      ["pmos", "3pin-gate-current", pmosCurrentMarker],
      ["pmos", "3pin-bulk", pmosBulkMarker],
      ["pmos", "3pin-gate-bulk", pmosBulkMarker]
    ] as const;
    const styleDefs = styleCases.map(([type, variantId, marker], index) => {
      const { def } = resolveMos(type, `Mstyle${index}`, variantId);
      expect(symbolMarkerPath(def.symbol, def.size.width, def.size.height)).toBe(marker);
      return def;
    });
    const nmosGateOnly = styleDefs[0];
    const nmosBulk = styleDefs[2];
    const pmosGateOnly = styleDefs[4];
    const nmosGatePath = symbolPath(nmosGateOnly.symbol, nmosGateOnly.size.width, nmosGateOnly.size.height);
    const pmosGatePath = symbolPath(pmosGateOnly.symbol, pmosGateOnly.size.width, pmosGateOnly.size.height);
    expect(nmosGatePath).not.toContain(" A ");
    expect(pmosGatePath).toContain(circlePath(gateCircleCx, cy, gateCircleRadius));
    expect(pmosGatePath).toContain(`M ${gatePinX} ${cy} L ${gateLeadEndX} ${cy}`);
    expect(gateLeadEndX - gatePinX).toBe(1.5 * a);
    expect(gateCircleCx + gateCircleRadius - a / 2).toBe(gateInnerX - a);
    expect(symbolStrokeWidth(nmosGateOnly.symbol)).toBe(a);
    expect(symbolPath(nmosBulk.symbol, nmosBulk.size.width, nmosBulk.size.height)).toContain(`M ${rightInnerX} ${cy} L ${channelX} ${cy}`);
    expect(nmosBulk.pins.map((pin) => pin.id)).toEqual(["d", "g", "s"]);

    const nmosCell = makeComponentCell(component("nmos", "MN1", 100, 120));
    const pmosCell = makeComponentCell(component("pmos", "MP1", 100, 120));
    const nmos4Cell = makeComponentCell(nmos4Instance);
    expect(String(nmosCell.attr("symbolBody/d"))).toBe(String(pmosCell.attr("symbolBody/d")));
    expect(String(nmosCell.attr("symbolAccent/d"))).toBe(String(pmosCell.attr("symbolAccent/d")));
    expect(String(nmosCell.attr("symbolMarker/d"))).not.toBe(String(pmosCell.attr("symbolMarker/d")));
    expect(nmosCell.prop("ports/items")).toHaveLength(3);
    const nmosFrame = componentFrameBox(nmos4);
    expect(nmos4Cell.prop("ports/items")).toEqual([
      { id: "d", group: "pin", args: { x: 50 - nmosFrame.x, y: 10 - nmosFrame.y }, attrs: { portBody: { title: "D" } } },
      { id: "g", group: "pin", args: { x: 10 - nmosFrame.x, y: 50 - nmosFrame.y }, attrs: { portBody: { title: "G" } } },
      { id: "s", group: "pin", args: { x: 50 - nmosFrame.x, y: 90 - nmosFrame.y }, attrs: { portBody: { title: "S" } } },
      { id: "b", group: "pin", args: { x: 50 - nmosFrame.x, y: 50 - nmosFrame.y }, attrs: { portBody: { title: "B" } } }
    ]);
    expect(nmosCell.attr("frame/width")).toBe(40);
    expect(nmosCell.attr("frame/height")).toBe(80);
    expect(pmosCell.attr("frame/width")).toBe(40);
    expect(pmosCell.attr("frame/height")).toBe(80);
    expect(nmosCell.attr("symbolBody/strokeWidth")).toBe(a);
    expect(nmosCell.attr("symbolAccent/strokeWidth")).toBe(2 * a);
    expect(nmosCell.attr("symbolMarker/fill")).toBe("#111111");
  });

  it("resolves component variants with matching symbol and pin definitions", () => {
    expect(getComponentVariants("switch").map((variant) => variant.id)).toEqual(["open", "closed"]);
    const mosVariantIds = [
      "3pin-current",
      "3pin-bulk",
      "3pin-gate",
      "3pin-gate-current",
      "3pin-gate-bulk",
      "4pin-current",
      "4pin-bulk",
      "4pin-gate",
      "4pin-gate-current",
      "4pin-gate-bulk"
    ];
    expect(getComponentVariants("nmos").map((variant) => variant.id)).toEqual(mosVariantIds);
    expect(getComponentVariants("pmos").map((variant) => variant.id)).toEqual(mosVariantIds);
    expect(getComponentVariants("comparator")).toEqual([]);
    expect(getComponentVariants("diffComparator")).toEqual([]);

    const nmos3 = component("nmos", "MN3", 0, 0);
    const nmos4 = component("nmos", "MN4", 0, 0);
    nmos4.variantId = "4pin-current";
    const resolved3 = resolveComponentDef(nmos3);
    const resolved4 = resolveComponentDef(nmos4);

    expect(resolved3.symbol).toBe("nmos-3pin-current");
    expect(resolved3.terminalClass).toBe("threeTerminal");
    expect(resolved3.pins.map((pin) => pin.id)).toEqual(["d", "g", "s"]);
    expect(resolved4.symbol).toBe("nmos-4pin-current");
    expect(resolved4.terminalClass).toBe("fourTerminal");
    expect(resolved4.pins.map((pin) => pin.id)).toEqual(["d", "g", "s", "b"]);
    expect(resolved4.pins.find((pin) => pin.id === "b")).toMatchObject({ x: 0, y: 0 });
    expect(symbolPath(resolved3.symbol, resolved3.size.width, resolved3.size.height)).not.toContain("M 50 50 L 28 50");
    expect(symbolPath(resolved4.symbol, resolved4.size.width, resolved4.size.height)).toContain("M 50 50 L 28 50");
    expect(symbolPath(resolved4.symbol, resolved4.size.width, resolved4.size.height)).toContain("L 50 61 L 50 90");

    const clockedComparator = component("comparator", "CMPclk", 0, 0);
    clockedComparator.values.clock = "falling";
    const resolvedClockedComparator = resolveComponentDef(clockedComparator);
    expect(resolvedClockedComparator.symbol).toBe("comparator");
    expect(resolvedClockedComparator.terminalClass).toBe("fourTerminal");
    expect(resolvedClockedComparator.pins.map((pin) => pin.id)).toEqual(["inp", "inn", "out", "clk"]);
    expect(resolvedClockedComparator.pins.find((pin) => pin.id === "clk")).toMatchObject({ role: "clk", x: 0, y: 60 });

    const clockedDiffComparator = component("diffComparator", "DCMPclk", 0, 0);
    clockedDiffComparator.values.clock = "falling";
    const resolvedClockedDiffComparator = resolveComponentDef(clockedDiffComparator);
    expect(resolvedClockedDiffComparator.symbol).toBe("differentialComparator");
    expect(resolvedClockedDiffComparator.terminalClass).toBe("fiveTerminal");
    expect(resolvedClockedDiffComparator.pins.map((pin) => pin.id)).toEqual(["inp", "inn", "outp", "outn", "clk"]);
    expect(resolvedClockedDiffComparator.pins.find((pin) => pin.id === "clk")).toMatchObject({ role: "clk", x: 0, y: 80 });

    const doc: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      notes: [], components: [nmos3], wires: [], junctions: [] });
    const netlist = extractNetlist(doc);
    expect(netlist.pins.filter((pin) => pin.componentRef === "MN3").map((pin) => pin.pinId)).toEqual(["d", "g", "s"]);
    expect(netlist.components[0].def.symbol).toBe("nmos-3pin-current");

    expect(MOS_VIEW_STYLES.map((style) => mosViewVariantId({ pins: "3pin", ...style }))).toEqual(mosVariantIds.slice(0, 5));
    expect(normalizeMosViewSettings({ pins: "3pin", gateStyle: false, arrow: "none" })).toEqual({
      pins: "3pin",
      gateStyle: false,
      arrow: "current"
    });
    expect(parseMosViewVariantId("3pin-gate-bulk")).toEqual({ pins: "3pin", gateStyle: true, arrow: "bulk" });
    expect(parseMosViewVariantId("3pin-current-bulk")).toBeNull();
  });

  it("renders GND and its vertically flipped single-bar VDD from shared geometry", () => {
    const gnd = getComponentDef("gnd");
    const vdd = getComponentDef("vdd");
    const cx = gnd.size.width / 2;
    const cy = gnd.size.height / 2;
    const top = cy - 20;
    const firstY = top + 18;
    const horizontalStrokeWidth = 2 * SYMBOL_STROKE_WIDTH;
    const visibleInnerGap = 2 * SYMBOL_STROKE_WIDTH;
    const spacing = horizontalStrokeWidth + visibleInnerGap;
    const gndCell = makeComponentCell(component("gnd", "GNDstroke", 100, 120));
    const vddCell = makeComponentCell(component("vdd", "VDDstroke", 100, 120));
    const valuedVdd = component("vdd", "VDDvalue", 100, 120);
    valuedVdd.values.main = "1.2";
    valuedVdd.values.valueVisible = "true";
    const valuedVddCell = makeComponentCell(valuedVdd);

    expect(symbolPath(gnd.symbol, gnd.size.width, gnd.size.height)).toBe(groundSymbol(gnd.size.width, gnd.size.height));
    expect(symbolAccentPath(gnd.symbol, gnd.size.width, gnd.size.height)).toBe(groundHorizontalSymbol(gnd.size.width, gnd.size.height));
    expect(groundSymbol(gnd.size.width, gnd.size.height)).toBe(`M ${cx} ${top} L ${cx} ${top + 18}`);
    expect(groundHorizontalSymbol(gnd.size.width, gnd.size.height)).toBe(
      `M ${cx - 44 / 3} ${firstY} L ${cx + 44 / 3} ${firstY} M ${cx - 10} ${firstY + spacing} L ${cx + 10} ${firstY + spacing} M ${cx - 16 / 3} ${firstY + 2 * spacing} L ${cx + 16 / 3} ${firstY + 2 * spacing}`
    );
    expect((44 / 3) * 2).toBeCloseTo(44 * (2 / 3), 12);
    expect(20).toBeCloseTo(30 * (2 / 3), 12);
    expect((16 / 3) * 2).toBeCloseTo(16 * (2 / 3), 12);
    expect(spacing - horizontalStrokeWidth).toBe(2 * SYMBOL_STROKE_WIDTH);
    expect(gndCell.attr("symbolBody/strokeWidth")).toBe(SYMBOL_STROKE_WIDTH);
    expect(gndCell.attr("symbolAccent/strokeWidth")).toBe(horizontalStrokeWidth);
    expect(vdd).toMatchObject({
      label: "VDD",
      hotLabel: "vdd",
      terminalClass: "oneTerminal",
      valueKey: "main",
      valueLabel: "Voltage",
      valuePlaceholder: "1",
      valueUnit: "V",
      size: gnd.size,
      pins: [{ id: "vdd", label: "VDD", role: "p", x: 0, y: 20 }],
      symbol: "vdd"
    });
    expect(resolveComponentAnalysisModel(component("vdd", "VDD1", 0, 0))).toBe("annotation");
    expect(vddSymbol(vdd.size.width, vdd.size.height)).toBe(`M ${cx} ${cy + 20} L ${cx} ${cy + 2}`);
    expect(vddHorizontalSymbol(vdd.size.width, vdd.size.height)).toBe(
      `M ${cx - 44 / 3} ${cy + 2} L ${cx + 44 / 3} ${cy + 2}`
    );
    expect(symbolPath(vdd.symbol, vdd.size.width, vdd.size.height)).toBe(vddSymbol(vdd.size.width, vdd.size.height));
    expect(symbolAccentPath(vdd.symbol, vdd.size.width, vdd.size.height)).toBe(vddHorizontalSymbol(vdd.size.width, vdd.size.height));
    expect(vddCell.attr("symbolBody/strokeWidth")).toBe(SYMBOL_STROKE_WIDTH);
    expect(vddCell.attr("symbolAccent/strokeWidth")).toBe(horizontalStrokeWidth);
    expect(vddCell.attr("refLabel/opacity")).toBe(0);
    expect(valuedVddCell.attr("refLabel/opacity")).toBe(0);
    expect(valuedVddCell.attr("refLabelValue/text")).toBe("");
    expect(valuedVddCell.attr("label/text")).toBe("1.2V");
    expect(valuedVddCell.attr("label/opacity")).toBe(1);
    expect(componentLocalFrameBox(valuedVdd)).toEqual({ x: 10, y: 6, width: 40, height: 40 });
    expect(valuedVddCell.attr("label/y")).toBeGreaterThan(0);
    expect(valuedVddCell.attr("label/y")).toBeLessThan(valuedVddCell.size().height);
    expect(renderComponentSvg(valuedVdd)).toMatch(
      /<text data-selector="label"[^>]*>1\.2V<\/text>/
    );

    const labelCenters = new Map<number, number>();
    for (const rotation of [0, 90, 180, 270]) {
      const rotatedVdd = { ...valuedVdd, id: `vdd-${rotation}`, rotation };
      const rotatedCell = makeComponentCell(rotatedVdd);
      const x = rotatedCell.attr("label/x");
      const y = rotatedCell.attr("label/y");
      const visualCenterY = Number(y) - 11 * 0.3;
      labelCenters.set(rotation, visualCenterY);
      const transform = String(rotatedCell.attr("label/transform"));
      if (rotation === 0) {
        expect(transform).toBe("");
        expect(renderComponentSvg(rotatedVdd)).toContain("data-selector=\"label\"");
      } else {
        const match = /^rotate\(-\d+ ([^ ]+) ([^)]+)\)$/.exec(transform);
        expect(match).not.toBeNull();
        expect(Number(match?.[1])).toBe(Number(x));
        expect(Number(match?.[2])).toBeCloseTo(visualCenterY, 12);
        expect(renderComponentSvg(rotatedVdd)).toContain(
          `transform="${transform}"`
        );
      }
    }
    expect(labelCenters.get(90)).toBeLessThan(labelCenters.get(0)!);
    expect(labelCenters.get(270)).toBeCloseTo(labelCenters.get(90)!, 12);
    expect(labelCenters.get(180)).toBeCloseTo(labelCenters.get(0)!, 12);

    const powerNetlist = extractNetlist(fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      notes: [],
      components: [component("gnd", "GNDnet", 0, 0), component("vdd", "VDDnet", 100, 0)],
      wires: [],
      junctions: []
    }));
    expect(powerNetlist.pins.find((pin) => pin.componentType === "gnd")).toMatchObject({ pinRole: "gnd", netId: "0" });
    expect(powerNetlist.pins.find((pin) => pin.componentType === "vdd")).toMatchObject({
      pinRole: "p",
      netId: "VDDnet_VDD"
    });
  });
});
