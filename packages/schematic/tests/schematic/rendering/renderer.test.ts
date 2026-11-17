import { describe, expect, it } from "vitest";
import { getComponentDef } from "../../../src/schematic/catalog";
import {
  componentCellAttrs,
  JUNCTION_MARKER_DIAMETER,
  JUNCTION_MARKER_RADIUS,
  junctionBodyAttrs,
  makeComponentCell,
  makeJunctionCell,
  makeWireCell,
  wireAppearance,
  wireLineAttrs,
  wireSelectionHaloAttrs
} from "../../../src/schematic/renderer";
import { SYMBOL_STROKE_WIDTH } from "../../../src/schematic/symbols/symbolPrimitives";
import { symbolAccentPath, symbolPath } from "../../../src/schematic/symbols/symbolRegistry";
import { wireEndpointDecorationGeometry } from "../../../src/schematic/wire/wireDecoration";
import { component } from "../support/testHelpers";

describe("schematic renderer", () => {
  it("uses shared renderer factories for symbols, wires, and junctions", () => {
    const capacitor = getComponentDef("capacitor");
    expect(symbolPath(capacitor.symbol, capacitor.size.width, capacitor.size.height)).toContain("M");

    const capCell = makeComponentCell(component("capacitor", "Cshare", 100, 120), { presentationMode: true });
    expect(capCell.get("componentId")).toBe("Cshare");
    expect(capCell.get("preview")).toBe(false);
    expect(String(capCell.attr("symbolBody/d"))).toBe(symbolPath(capacitor.symbol, capacitor.size.width, capacitor.size.height));
    expect(String(capCell.attr("symbolAccent/d"))).toBe(symbolAccentPath(capacitor.symbol, capacitor.size.width, capacitor.size.height));

    const wideWire = { id: "wshare", routeMode: "orthogonal" as const, points: [{ x: 0, y: 0 }, { x: 40, y: 0 }], appearance: { variant: "wide" as const } };
    const wireCell = makeWireCell(wideWire);
    expect(wireAppearance(wideWire).variant).toBe("wide");
    expect(wireCell.get("wireId")).toBe("wshare");
    expect(wireCell.attr("line/strokeWidth")).toBe(6);
    expect(wireCell.attr("selectionHalo/opacity")).toBe(0);
    expect(wireCell.attr("selectionHalo/pointerEvents")).toBe("none");
    expect(wireCell.attr("wrapper/pointerEvents")).toBe("stroke");
    expect(wireCell.attr("wrapper/strokeWidth")).toBe(10);

    const previewWireCell = makeWireCell(wideWire, { preview: true });
    expect(previewWireCell.id).toBe("wshare");
    expect(previewWireCell.attr("line/pointerEvents")).toBe("none");
    expect(previewWireCell.attr("selectionHalo/opacity")).toBe(0);
    expect(previewWireCell.attr("wrapper/pointerEvents")).toBe("none");

    const junctionCell = makeJunctionCell({ x: 20, y: 40 });
    expect(junctionCell.get("junction")).toBe(true);
    expect(junctionCell.get("junctionKey")).toBe("20,40");
    expect(JUNCTION_MARKER_DIAMETER).toBe(5 * SYMBOL_STROKE_WIDTH);
    expect(JUNCTION_MARKER_RADIUS).toBe(JUNCTION_MARKER_DIAMETER / 2);
    expect(junctionCell.position()).toEqual({ x: 20 - JUNCTION_MARKER_RADIUS, y: 40 - JUNCTION_MARKER_RADIUS });
    expect(junctionCell.size()).toEqual({ width: JUNCTION_MARKER_DIAMETER, height: JUNCTION_MARKER_DIAMETER });

    const selectedJunction = makeJunctionCell({ x: 20, y: 40 }, { selected: true });
    expect(selectedJunction.size()).toEqual({ width: JUNCTION_MARKER_DIAMETER, height: JUNCTION_MARKER_DIAMETER });
  });

  it("uses exported renderer attrs for component, wire, and junction selection styles", () => {
    const resistor = component("resistor", "Rattr", 100, 120);
    const componentCell = makeComponentCell(resistor, { selected: true });
    const componentAttrs = componentCellAttrs(resistor, { selected: true });
    expect(componentCell.attr("frame/stroke")).toBe(componentAttrs.frame.stroke);
    expect(componentCell.attr("symbolBody/opacity")).toBe(componentAttrs.symbolBody.opacity);
    expect(componentCell.prop("ports/groups/pin/attrs/portBody")).toEqual(componentAttrs.portBody);

    const wire = { id: "wattr", routeMode: "orthogonal" as const, points: [{ x: 0, y: 0 }, { x: 40, y: 0 }], appearance: { variant: "wide" as const } };
    const wireCell = makeWireCell(wire, { selected: true });
    const wireAttrs = wireLineAttrs(wire, { selected: true });
    const wireHaloAttrs = wireSelectionHaloAttrs(wire, { selected: true });
    expect(wireCell.attr("line/stroke")).toBe(wireAttrs.stroke);
    expect(wireCell.attr("line/strokeWidth")).toBe(wireAttrs.strokeWidth);
    expect(wireCell.attr("line/strokeDasharray")).toBe(wireAttrs.strokeDasharray);
    expect(wireCell.attr("line/opacity")).toBe(wireAttrs.opacity);
    expect(wireCell.attr("selectionHalo/stroke")).toBe(wireHaloAttrs.stroke);
    expect(wireCell.attr("selectionHalo/strokeWidth")).toBe(9);
    expect(wireCell.attr("selectionHalo/strokeDasharray")).toBe("3 3");
    expect(wireCell.attr("selectionHalo/opacity")).toBe(1);

    const junctionCell = makeJunctionCell({ x: 20, y: 40 }, { selected: true });
    const junctionAttrs = junctionBodyAttrs({ selected: true });
    expect(junctionCell.attr("body/fill")).toBe(junctionAttrs.fill);
    expect(junctionCell.attr("body/stroke")).toBe(junctionAttrs.stroke);
    expect(junctionCell.attr("body/strokeWidth")).toBe(junctionAttrs.strokeWidth);
    expect(junctionCell.attr("body/strokeDasharray")).toBe("3 3");
  });

  it("renders exact a-scaled wire decorations through JointJS labels", () => {
    const wire = {
      id: "decorated-wire",
      routeMode: "orthogonal" as const,
      points: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
      appearance: {
        variant: "signal" as const,
        lineWidth: "2a" as const,
        startMarker: "arrow" as const,
        endMarker: "circle" as const,
        digitalSlash: true,
        digitalLabel: "8"
      }
    };
    const cell = makeWireCell(wire);
    const labels = cell.labels();

    expect(cell.attr("line/strokeWidth")).toBe(4);
    expect(cell.attr("selectionHalo/strokeWidth")).toBe(7);
    expect(labels).toHaveLength(3);
    expect(labels[0]).toMatchObject({
      position: { distance: 0, args: { keepGradient: false } },
      attrs: {
        endpointMarker: {
          d: "M -24 0 L 0 6 L 0 -6 Z",
          fill: "#111111",
          stroke: "none"
        }
      }
    });
    expect(labels[1]).toMatchObject({
      position: { distance: 1, args: { keepGradient: false } },
      attrs: {
        endpointMarker: {
          r: 4,
          fill: "#ffffff",
          stroke: "#111111",
          strokeWidth: 2
        }
      }
    });
    expect(labels[2]).toMatchObject({
      position: { distance: 0.5, args: { keepGradient: false } },
      attrs: {
        digitalSlash: {
          d: "M -4 4 L 4 -4",
          strokeWidth: 2
        },
        digitalLabel: {
          text: "8",
          x: 8,
          y: -8,
          fontSize: 12
        }
      }
    });

    const connectedCell = makeWireCell(wire, {
      endpointConnections: { start: true, end: false }
    });
    expect(connectedCell.labels()[0]).toMatchObject({
      attrs: {
        endpointMarker: {
          d: "M 0 0 L 24 6 L 24 -6 Z"
        }
      }
    });

    const previewCell = makeWireCell(wire, { preview: true });
    expect(previewCell.labels()).toHaveLength(3);
    expect(previewCell.labels()[0]).toMatchObject({
      attrs: {
        endpointMarker: {
          fill: "#005f9e",
          opacity: 0.62
        }
      }
    });
    expect(previewCell.labels()[1]).toMatchObject({
      attrs: {
        endpointMarker: {
          fill: "#ffffff",
          stroke: "#005f9e",
          opacity: 0.62
        }
      }
    });
    expect(previewCell.labels()[2]).toMatchObject({
      attrs: {
        digitalSlash: { stroke: "#005f9e", opacity: 0.62 },
        digitalLabel: { fill: "#005f9e", opacity: 0.62 }
      }
    });
  });

  it("uses the shared world geometry for an arrow after an angled bend", () => {
    const wire = {
      id: "angled-arrow",
      routeMode: "freeAngle" as const,
      points: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 40, y: -20 }],
      appearance: { variant: "signal" as const, endMarker: "arrow" as const }
    };
    const geometry = wireEndpointDecorationGeometry(wire, "end");
    const label = makeWireCell(wire).labels()[0];
    const values = String(label.attrs?.endpointMarker?.d)
      .match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi)
      ?.map(Number) ?? [];
    const endpoint = wire.points[wire.points.length - 1];
    const worldPolygon = [
      { x: endpoint.x + values[0], y: endpoint.y + values[1] },
      { x: endpoint.x + values[2], y: endpoint.y + values[3] },
      { x: endpoint.x + values[4], y: endpoint.y + values[5] }
    ];

    expect(label.position).toMatchObject({
      distance: 1,
      args: { keepGradient: false }
    });
    expect(worldPolygon).toEqual(geometry?.polygon);
  });

  it("keeps selected and temporarily deleted wire ink independent from the selection halo", () => {
    const selectedSignal = {
      id: "selected-signal",
      routeMode: "orthogonal" as const,
      points: [{ x: 0, y: 0 }, { x: 40, y: 0 }],
      appearance: { variant: "signal" as const, color: "#0072b2" }
    };
    const deletedSignal = { ...selectedSignal, id: "deleted-signal", temporarilyDeleted: true };

    const selectedCell = makeWireCell(selectedSignal, { selected: true });
    expect(selectedCell.attr("line/stroke")).toBe("#0072b2");
    expect(selectedCell.attr("line/strokeWidth")).toBe(2);
    expect(selectedCell.attr("selectionHalo/stroke")).toBe("#005f9e");
    expect(selectedCell.attr("selectionHalo/strokeWidth")).toBe(5);
    expect(selectedCell.attr("selectionHalo/strokeDasharray")).toBe("3 3");
    expect(selectedCell.attr("selectionHalo/opacity")).toBe(1);

    const deletedCell = makeWireCell(deletedSignal, { selected: true });
    expect(deletedCell.attr("line/stroke")).toBe("#b00020");
    expect(deletedCell.attr("line/strokeDasharray")).toBe("7 5");
    expect(deletedCell.attr("line/opacity")).toBe(0.48);
    expect(deletedCell.attr("selectionHalo/stroke")).toBe("#005f9e");
    expect(deletedCell.attr("selectionHalo/opacity")).toBe(1);
  });
});
