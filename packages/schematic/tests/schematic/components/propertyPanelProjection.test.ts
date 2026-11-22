import { fixtureDocument } from "../support/fixtureDocument";
import { describe, expect, it } from "vitest";
import { getComponentDef } from "../../../src/schematic/catalog";
import { resolveSchematicNets, type NetResolution } from "../../../src/schematic/netResolution";
import { setRectangleProperty } from "../../../src/schematic/rectangleComponentModel";
import {
  setFilterKind,
  setFunctionBlockTimeDomain
} from "../../../src/schematic/functionBlockModel";
import { DFF_VALUE_KEYS } from "../../../src/schematic/dffModel";
import {
  buildSchematicPropertyPanelInput,
  type SchematicPropertySelectionTargets
} from "../../../src/schematic/propertyPanelProjection";
import type {
  ComponentInstance,
  NetLabel,
  Point,
  SchematicDocument,
  SchematicNote
} from "../../../src/schematic/types";
import {
  emptyDoc,
  fixtureComponent,
  fixtureNote,
  fixtureWire
} from "../support/fixtures";

const uniform = <T>(value: T) => ({ state: "uniform" as const, value });
const mixed = { state: "mixed" as const };

function component(overrides: Partial<ComponentInstance> = {}) {
  return { ...fixtureComponent("resistor", "R1", 40, 40), ...overrides };
}

function note(id: string, overrides: Partial<SchematicNote> = {}) {
  return { ...fixtureNote(id, 80, 100), ...overrides };
}

function targets(
  overrides: Partial<SchematicPropertySelectionTargets> = {}
): SchematicPropertySelectionTargets {
  return {
    components: [],
    wires: [],
    junctionPoints: [],
    netLabels: [],
    notes: [],
    ...overrides
  };
}

function documentFor(selection: SchematicPropertySelectionTargets): SchematicDocument {
  return fixtureDocument({
    ...emptyDoc(),
    components: [...selection.components],
    wires: [...selection.wires],
    junctions: selection.junctionPoints.map((point) => ({ ...point })),
    netLabels: [...selection.netLabels],
    notes: [...selection.notes]
  });
}

function project(
  selection: SchematicPropertySelectionTargets,
  options: {
    document?: SchematicDocument;
    hasSelection?: boolean;
    resolution?: NetResolution;
    couplingPickSourceId?: string | null;
  } = {}
) {
  return buildSchematicPropertyPanelInput({
    document: options.document ?? documentFor(selection),
    targets: selection,
    hasSelection: options.hasSelection ?? true,
    resolution: options.resolution,
    couplingPickSourceId: options.couplingPickSourceId
  });
}

function resolutionWith(options: {
  wireNames?: ReadonlyArray<readonly [string, string]>;
  junctionNames?: ReadonlyArray<readonly [string, string]>;
  labels?: readonly NetLabel[];
  labelNames?: readonly string[];
}) {
  const resolution = resolveSchematicNets(emptyDoc());
  resolution.wireNetNames = new Map(options.wireNames);
  resolution.junctionNetNames = new Map(options.junctionNames);
  options.labels?.forEach((label, index) => {
    resolution.labelStates.set(label.id, {
      label,
      status: "valid",
      netName: options.labelNames?.[index] ?? ""
    });
  });
  return resolution;
}

describe("schematic property panel projection", () => {
  it("returns explicit empty inputs for empty and unsupported selections", () => {
    expect(project(targets(), { hasSelection: false })).toEqual({
      hasSelection: false
    });

    expect(project(targets({
      components: [component()],
      notes: [note("note-1")]
    }))).toEqual({
      hasSelection: true
    });
  });

  it("projects a single component through uniform aggregate values", () => {
    const projected = project(targets({ components: [component()] })).component;

    expect(projected).toMatchObject({
      cellType: uniform("resistor"),
      ref: uniform("R1"),
      labelVisible: uniform(true),
      valueVisible: uniform(false),
      color: uniform(null),
      value: {
        label: "Resistance",
        value: uniform("R1"),
        placeholder: "1k",
        unit: getComponentDef("resistor").valueUnit
      },
      variants: {
        options: [
          { id: "fixed", label: "Fixed" },
          { id: "variable", label: "Variable" }
        ],
        value: uniform("fixed")
      }
    });
    expect(projected?.cells).toEqual(expect.any(Array));
  });

  it("aggregates same-type component fields independently as uniform or mixed", () => {
    const first = component({
      id: "r1",
      ref: "R1",
      values: { main: "1k" },
      variantId: "fixed"
    });
    const second = component({
      id: "r2",
      ref: "R2",
      values: { main: "2k", labelVisible: "false" },
      variantId: "variable",
      appearance: { color: "#0072b2" }
    });

    const projected = project(targets({ components: [first, second] })).component;

    expect(projected).toMatchObject({
      cellType: uniform("resistor"),
      ref: mixed,
      labelVisible: mixed,
      valueVisible: uniform(false),
      color: mixed,
      value: { value: mixed },
      variants: { value: mixed }
    });
    expect(projected?.cells).toEqual(expect.any(Array));
  });

  it("projects Show value across different Value-bearing component types", () => {
    const resistor = fixtureComponent("resistor", "R1", 40, 40);
    const capacitor = fixtureComponent("capacitor", "C1", 120, 40);
    capacitor.values.valueVisible = "true";

    const projected = project(targets({ components: [resistor, capacitor] })).component;
    expect(projected?.value).toBeUndefined();
    expect(projected?.valueVisible).toEqual(mixed);
  });

  it("projects only pure rectangle dimensions with mixed values", () => {
    const first = fixtureComponent("rectangle", "X1", 40, 40);
    const second = fixtureComponent("rectangle", "X2", 160, 40);
    setRectangleProperty(second, "width", 8);

    const projected = project(targets({ components: [first, second] })).component;

    expect(projected?.value).toBeUndefined();
    expect(projected?.libraryShape).toBe(true);
    expect(projected?.rectangle).toEqual({
      widthGrid: mixed,
      heightGrid: uniform(2)
    });
  });

  it("projects shared shape styles and reserves corner radius for rectangles", () => {
    const rectangle = fixtureComponent("rectangle", "X1", 40, 40);
    const triangle = fixtureComponent("triangle", "X2", 160, 40);
    rectangle.values.libraryShapeStrokeWidth = "2.5";
    rectangle.values.libraryShapeCornerRadius = "6";
    triangle.values.libraryShapeFillEnabled = "true";
    triangle.values.libraryShapeFillColor = "#123456";

    const projected = project(targets({ components: [rectangle, triangle] })).component;
    expect(projected?.libraryShapeStyle).toEqual({
      strokeWidth: mixed,
      lineStyle: uniform("solid"),
      fillEnabled: mixed,
      fillColor: mixed,
      fillOpacity: uniform(1)
    });
    expect(project(targets({ components: [rectangle] })).component?.libraryShapeStyle?.cornerRadius)
      .toEqual(uniform(6));
    expect(project(targets({ components: [triangle] })).component?.libraryShapeStyle?.cornerRadius)
      .toBeUndefined();
  });

  it("projects Filter kind only for all-Filter selections and aggregates mixed values", () => {
    const first = fixtureComponent("filter", "FLT1", 40, 40);
    const second = fixtureComponent("filter", "FLT2", 160, 40);
    setFilterKind(second, "bandstop");

    const projected = project(targets({ components: [first, second] })).component;
    expect(projected?.filterKind).toEqual({
      options: [
        { value: "lowpass", label: "Low-pass" },
        { value: "highpass", label: "High-pass" },
        { value: "bandpass", label: "Band-pass" },
        { value: "bandstop", label: "Band-stop" }
      ],
      value: mixed
    });

    const resistor = fixtureComponent("resistor", "R1", 260, 40);
    expect(project(targets({ components: [first, resistor] })).component?.filterKind)
      .toBeUndefined();
  });

  it("projects the shared Gain field for integrators and differentiators", () => {
    const integrator = fixtureComponent("integrator", "INT1", 40, 40);
    const differentiator = fixtureComponent("differentiator", "DIF1", 160, 40);
    expect(project(targets({ components: [integrator, differentiator] })).component?.value)
      .toEqual({ label: "Gain", value: uniform("1"), placeholder: "1" });
    integrator.values.gain = "k1";
    expect(project(targets({ components: [integrator] })).component?.value?.value).toEqual(uniform("k1"));
    expect(project(targets({ components: [integrator, differentiator] })).component?.value?.value).toEqual(mixed);
  });

  it("projects Domain for uniform and mixed function-block selections only", () => {
    const integrator = fixtureComponent("integrator", "INT1", 40, 40);
    const delay = fixtureComponent("delay", "DLY1", 160, 40);

    expect(project(targets({ components: [integrator] })).component?.timeDomain)
      .toEqual(uniform("continuous"));

    setFunctionBlockTimeDomain(delay, "discrete");
    expect(project(targets({ components: [integrator, delay] })).component?.timeDomain)
      .toEqual(mixed);

    const resistor = fixtureComponent("resistor", "R1", 260, 40);
    expect(project(targets({ components: [integrator, resistor] })).component?.timeDomain)
      .toBeUndefined();
  });

  it("shares only compatible Value and View fields across component types", () => {
    const voltageSource = fixtureComponent("voltageSource", "V1", 40, 40);
    voltageSource.values.main = "1.2";
    const battery = fixtureComponent("battery", "VBAT", 120, 40);
    battery.values.main = "3.3";
    const voltageProjection = project(targets({
      components: [voltageSource, battery]
    })).component;

    expect(voltageProjection).not.toHaveProperty("cellType");
    expect(voltageProjection).not.toHaveProperty("cells");
    expect(voltageProjection?.value).toEqual({
      label: "Voltage",
      value: mixed,
      placeholder: "1",
      unit: "V"
    });

    const resistor = fixtureComponent("resistor", "R1", 40, 40);
    const capacitor = fixtureComponent("capacitor", "C1", 120, 40);
    const inverter = fixtureComponent("inverter", "X1", 200, 40);
    const passiveProjection = project(targets({
      components: [resistor, capacitor, inverter]
    })).component;

    expect(passiveProjection?.value).toBeUndefined();
    expect(passiveProjection?.variants).toEqual({
      label: "View",
      options: [
        { id: "fixed", label: "Fixed" },
        { id: "variable", label: "Variable" }
      ],
      value: uniform("fixed")
    });
  });

  it("shares Comparator Levels and ordered Clock options", () => {
    const comparator = fixtureComponent("comparator", "CMP1", 40, 40);
    comparator.values.levels = "3";
    comparator.values.clock = "falling";
    const differential = fixtureComponent("diffComparator", "DCMP1", 160, 40);
    differential.values.levels = "5";

    const projected = project(targets({
      components: [comparator, differential]
    })).component;

    expect(projected?.value).toEqual({
      label: "Levels",
      value: mixed,
      placeholder: "1"
    });
    expect(projected?.clock).toEqual({
      label: "Clock",
      options: [
        { id: "none", label: "No" },
        { id: "rising", label: "Rising" },
        { id: "falling", label: "Falling" }
      ],
      value: mixed
    });
  });

  it("aggregates differential output order only across compatible differential cells", () => {
    const amplifier = fixtureComponent("diffAmp", "DA1", 40, 40);
    const ota = fixtureComponent("diffOta", "DOTA1", 160, 40);
    ota.values.differentialOutputsSame = "true";

    expect(project(targets({ components: [amplifier] })).component?.differentialOutputsSame)
      .toEqual(uniform(false));
    expect(project(targets({ components: [amplifier, ota] })).component?.differentialOutputsSame)
      .toEqual(mixed);

    const comparator = fixtureComponent("diffComparator", "DCMP1", 280, 40);
    expect(project(targets({ components: [comparator] })).component?.differentialOutputsSame)
      .toEqual(uniform(true));
    expect(project(targets({ components: [amplifier, comparator] })).component?.differentialOutputsSame)
      .toEqual(mixed);

    const singleEnded = fixtureComponent("opAmp", "OA1", 400, 40);
    expect(project(targets({ components: [amplifier, singleEnded] })).component?.differentialOutputsSame)
      .toBeUndefined();
  });

  it("shows the layout subtype only under the inductor layout view", () => {
    const inductor = component({ type: "inductor", ref: "L1" });
    expect(project(targets({ components: [inductor] })).component?.inductorLayout).toBeUndefined();
    inductor.variantId = "planar";
    expect(project(targets({ components: [inductor] })).component?.inductorLayout).toEqual(uniform("double"));
    inductor.values.inductorLayout = "single";
    expect(project(targets({ components: [inductor] })).component?.inductorLayout).toEqual(uniform("single"));
    inductor.variantId = "coil";
    expect(project(targets({ components: [inductor] })).component?.inductorLayout).toBeUndefined();
  });

  it.each([2, 3])("aggregates layout turns for %s inductors independently of pair coupling controls", count => {
    const components = Array.from({ length: count }, (_, i) => component({ id: `l${i}`, type: "inductor", ref: `L${i}`, x: i * 240, variantId: "planar" }));
    const projected = project(targets({ components }));
    expect(projected.component?.inductorLayout).toEqual(uniform("double"));
    expect(projected.component?.inductor).toBeUndefined();
    if (count === 2) expect(projected.inductorCoupling).toMatchObject({ exists: false, firstRef: "L0", secondRef: "L1" });
    else expect(projected.inductorCoupling).toBeUndefined();
    components[0].values.inductorLayout = "single";
    expect(project(targets({ components })).component?.inductorLayout).toEqual(mixed);
    components.forEach(c => { c.values.inductorLayout = "single"; });
    expect(project(targets({ components })).component?.inductorLayout).toEqual(uniform("single"));
    components[0].variantId = "coil";
    expect(project(targets({ components })).component?.inductorLayout).toBeUndefined();
  });

  it("projects canvas coupling availability and separate coupling label visibility", () => {
    const l1 = component({ id: "l1", type: "inductor", ref: "L1" });
    const l2 = component({ id: "l2", type: "inductor", ref: "L2", x: 120 });
    const l3 = component({ id: "l3", type: "inductor", ref: "L3", x: 200 });
    const relation = {
      id: "k12",
      inductorAId: "l1",
      inductorBId: "l2",
      coefficient: "k12",
      coefficientAuto: true,
      labelMode: "coefficient" as const,
      showLabel: false,
      showArc: true,
      showCore: false,
      arcFlipped: false
    };
    const document: SchematicDocument = {
      ...emptyDoc(),
      components: [l1, l2, l3],
      inductorCouplings: [relation]
    };

    expect(project(targets({ components: [l1] }), {
      document,
      couplingPickSourceId: "l1"
    }).component?.inductor)
      .toMatchObject({
        couplings: [{ id: "k12", partnerId: "l2", partnerRef: "L2" }],
        canAddCoupling: true,
        pickingCoupling: true
      });
    expect(project(targets({ inductorCouplings: [relation] }), { document }).inductorCoupling)
      .toMatchObject({
        id: "k12",
        labelMode: "coefficient",
        showLabel: false,
        color: uniform(null)
      });
    const pair = project(targets({ components: [l1, l2] }), { document });
    expect(pair.component).toMatchObject({
      ref: mixed,
      color: uniform(null)
    });
    expect(pair.inductorCoupling).toMatchObject({ id: "k12", exists: true });
  });

  it("projects thick gate only for MOS selections, with mixed state support", () => {
    const first = fixtureComponent("nmos", "M1", 0, 0);
    const second = fixtureComponent("pmos", "M2", 100, 0);
    expect(project(targets({ components: [first] })).component?.mosThickGate).toEqual(uniform(false));
    second.values.mosThickGate = "true";
    expect(project(targets({ components: [second] })).component?.mosThickGate).toEqual(uniform(true));
    expect(project(targets({ components: [first, second] })).component?.mosThickGate).toEqual(mixed);
    expect(project(targets({ components: [fixtureComponent("npn", "Q1", 0, 0)] })).component?.mosThickGate).toBeUndefined();
  });

  it("projects ADC and DAC Bits with Show value support", () => {
    for (const type of ["adc", "dac"] as const) {
      const converter = fixtureComponent(type, `${type.toUpperCase()}1`, 40, 40);
      const projected = project(targets({ components: [converter] })).component;
      expect(projected).toMatchObject({
        valueVisible: uniform(false),
        value: {
          label: "Bits",
          value: uniform("k1"),
          placeholder: "k1",
          unit: "b"
        }
      });
      expect(projected?.variants).toEqual(type === "adc"
        ? {
            label: "View",
            options: [
              { id: "plain", label: "Plain" },
              { id: "quantizer", label: "Quantizer" }
            ],
            value: uniform("plain")
          }
        : undefined);
      expect(projected?.clock).toEqual({
        label: "Clock",
        options: [
          { id: "none", label: "No" },
          { id: "rising", label: "Rising" },
          { id: "falling", label: "Falling" }
        ],
        value: uniform("none")
      });
    }
  });

  it("projects slicer clock selection through the shared Clock control", () => {
    const slicer = fixtureComponent("slicer", "SLC1", 40, 40);
    slicer.values.clock = "falling";
    expect(project(targets({ components: [slicer] })).component?.clock).toEqual({
      label: "Clock",
      options: [
        { id: "none", label: "No" },
        { id: "rising", label: "Rising" },
        { id: "falling", label: "Falling" }
      ],
      value: uniform("falling")
    });
  });

  it("labels logic-gate variants as Inputs and projects every DFF setting", () => {
    const gate = fixtureComponent("and", "X1", 40, 40);
    gate.variantId = "4-input";
    expect(project(targets({ components: [gate] })).component?.variants).toEqual({
      label: "Inputs",
      options: [
        { id: "2-input", label: "2" },
        { id: "3-input", label: "3" },
        { id: "4-input", label: "4" }
      ],
      value: uniform("4-input")
    });

    const first = fixtureComponent("dff", "X2", 160, 80);
    first.values[DFF_VALUE_KEYS.clockEdge] = "falling";
    first.values[DFF_VALUE_KEYS.setMode] = "synchronous";
    first.values[DFF_VALUE_KEYS.setActiveLevel] = "low";
    first.values[DFF_VALUE_KEYS.resetMode] = "asynchronous";
    const single = project(targets({ components: [first] })).component;
    expect(single?.dff).toEqual({
      clockEdge: uniform("falling"),
      setMode: uniform("synchronous"),
      setActiveLevel: uniform("low"),
      resetMode: uniform("asynchronous"),
      resetActiveLevel: uniform("high")
    });
    expect(single?.pinSettings?.map((pin) => ({
      id: pin.id,
      visible: pin.visible,
      modeEditable: pin.modeEditable
    }))).toEqual([
      { id: "q", visible: uniform(true), modeEditable: false },
      { id: "qbar", visible: uniform(true), modeEditable: false }
    ]);

    const second = fixtureComponent("dff", "X3", 320, 80);
    const combined = project(targets({ components: [first, second] })).component?.dff;
    expect(combined).toEqual({
      clockEdge: mixed,
      setMode: mixed,
      setActiveLevel: mixed,
      resetMode: mixed,
      resetActiveLevel: uniform("high")
    });
  });

  it("aggregates NMOS and PMOS view dimensions without exposing generic View", () => {
    const nmos = fixtureComponent("nmos", "MN1", 40, 40);
    nmos.variantId = "3pin-current";
    const pmos = fixtureComponent("pmos", "MP1", 140, 40);
    pmos.variantId = "4pin-gate-bulk";

    const projected = project(targets({ components: [nmos, pmos] })).component;

    expect(projected?.variants).toBeUndefined();
    expect(projected?.mosView).toEqual({
      pins: mixed,
      gateStyle: mixed,
      arrow: mixed,
      noneAllowed: false
    });
    expect(projected?.transistorCircle).toEqual(uniform(false));
  });

  it("aggregates the shared transistor circle setting across MOS and BJT selections", () => {
    const nmos = fixtureComponent("nmos", "M1", 40, 40);
    const npn = fixtureComponent("npn", "Q1", 140, 40);
    npn.values.transistorCircle = "true";

    const projected = project(targets({ components: [nmos, npn] })).component;

    expect(projected?.mosView).toBeUndefined();
    expect(projected?.variants).toBeUndefined();
    expect(projected?.transistorCircle).toEqual(mixed);
  });

  it("aggregates compatible pin settings and hides them when pin capabilities differ", () => {
    const first = fixtureComponent("plus", "SUM1", 40, 40);
    const second = fixtureComponent("plus", "SUM2", 140, 40);
    second.values["pinVisible:top"] = "true";
    second.values["pinMode:left"] = "negative";
    second.values["pinSymbolVisible:left"] = "false";

    const projected = project(targets({ components: [first, second] })).component;
    const left = projected?.pinSettings?.find((pin) => pin.id === "left");
    const top = projected?.pinSettings?.find((pin) => pin.id === "top");
    const right = projected?.pinSettings?.find((pin) => pin.id === "right");

    expect(left).toMatchObject({
      label: "Left",
      visible: uniform(true),
      modeEditable: true,
      mode: mixed,
      symbolVisible: mixed,
      symbolEditable: true
    });
    expect(top?.visible).toEqual(mixed);
    expect(right?.symbolEditable).toBe(false);

    const switchInstance = fixtureComponent("switch", "S1", 240, 40);
    expect(project(targets({
      components: [first, switchInstance]
    })).component?.pinSettings).toBeUndefined();
  });

  it("shares Ink Color across Component, Wire, and Junction selections", () => {
    const coloredComponent = component({
      appearance: { color: "#0072b2" }
    });
    const coloredWire = fixtureWire(
      "w1",
      [{ x: 0, y: 0 }, { x: 40, y: 0 }],
      { variant: "signal", color: "#0072b2" }
    );
    const point = { x: 40, y: 0 };
    const selection = targets(fixtureDocument({
      components: [coloredComponent],
      wires: [coloredWire],
      junctionPoints: [point]
    }));
    const document = {
      ...documentFor(selection),
      junctionAppearances: [{ point, color: "#0072b2" }]
    };

    expect(project(selection, { document })).toEqual({
      hasSelection: true,
      network: { color: uniform("#0072b2") }
    });

    delete coloredComponent.appearance;
    expect(project(selection, { document }).network?.color).toEqual(mixed);
  });

  it("aggregates Wire appearance and hides Bits until Digital is on for every Wire", () => {
    const first = fixtureWire(
      "w1",
      [{ x: 0, y: 0 }, { x: 40, y: 0 }],
      {
        variant: "signal",
        color: "#d55e00",
        lineWidth: "2a",
        startMarker: "arrow",
        digitalSlash: true,
        digitalLabel: "8"
      }
    );
    const second = fixtureWire(
      "w2",
      [{ x: 0, y: 40 }, { x: 40, y: 40 }],
      {
        variant: "wide",
        color: "#d55e00",
        lineWidth: "2a",
        startMarker: "circle",
        digitalSlash: true,
        digitalLabel: "16"
      }
    );
    const selection = targets({ wires: [first, second] });
    const resolution = resolutionWith({
      wireNames: [["w1", "BUS"], ["w2", "BUS"]]
    });
    const projected = project(selection, { resolution }).network;

    expect(projected).toEqual({
      netName: uniform("BUS"),
      color: uniform("#d55e00"),
      wire: {
        lineWidth: uniform("2a"),
        startMarker: mixed,
        endMarker: uniform("default"),
        digitalSlash: uniform(true),
        digitalLabel: mixed
      }
    });

    second.appearance = { ...second.appearance!, digitalSlash: false };
    const mixedDigital = project(selection, { resolution }).network?.wire;
    expect(mixedDigital?.digitalSlash).toEqual(mixed);
    expect(mixedDigital).not.toHaveProperty("digitalLabel");
  });

  it("aggregates Net Label names and exposes mixed read-only Net Name", () => {
    const firstWire = fixtureWire("w1", [{ x: 0, y: 0 }, { x: 40, y: 0 }]);
    const firstLabel: NetLabel = {
      id: "label-1",
      name: "OUT",
      attachment: { wireId: "w1", point: { x: 20, y: 0 } }
    };
    const secondLabel: NetLabel = {
      id: "label-2",
      name: "CLK",
      attachment: { wireId: "w2", point: { x: 120, y: 0 } }
    };
    const labelResolution = resolutionWith({
      labels: [firstLabel, secondLabel],
      labelNames: ["OUT", "CLK"]
    });

    expect(project(targets({
      netLabels: [firstLabel, secondLabel]
    }), { resolution: labelResolution }).network).toEqual({
      netName: mixed,
      label: { name: mixed }
    });

    const point: Point = { x: 40, y: 0 };
    const mixedNetworkResolution = resolutionWith({
      wireNames: [["w1", "OUT"]],
      junctionNames: [["40,0", "OUT"]],
      labels: [secondLabel],
      labelNames: ["CLK"]
    });
    expect(project(targets({
      wires: [firstWire],
      junctionPoints: [point],
      netLabels: [secondLabel]
    }), { resolution: mixedNetworkResolution })).toEqual({
      hasSelection: true,
      network: { netName: mixed }
    });
  });

  it("aggregates Note fields and only exposes Width when every Note is Markdown", () => {
    const first = note("note-1", {
      format: "markdown",
      width: 320,
      backgroundColor: null,
      fontSizePx: 12
    });
    const second = note("note-2", {
      format: "markdown",
      width: 333,
      backgroundColor: undefined,
      fontSizePx: 18
    });
    const markdownProjection = project(targets({
      notes: [first, second]
    })).note;

    expect(markdownProjection).toEqual({
      backgroundColor: mixed,
      fontSizePx: mixed,
      format: uniform("markdown"),
      widthPx: mixed
    });
    second.format = "plain";
    const mixedFormat = project(targets({ notes: [first, second] })).note;
    expect(mixedFormat?.format).toEqual(mixed);
    expect(mixedFormat).not.toHaveProperty("widthPx");
  });

  it("resolves default Note fill and size before aggregating", () => {
    const first = note("note-1", {
      format: "markdown",
      width: 333,
      backgroundColor: undefined,
      fontSizePx: 0
    });
    const second = note("note-2", {
      format: "markdown",
      width: 340,
      backgroundColor: "#ffffe8",
      fontSizePx: 1
    });

    expect(project(targets({ notes: [first, second] })).note).toEqual({
      backgroundColor: uniform("#ffffe8"),
      fontSizePx: uniform(1),
      format: uniform("markdown"),
      widthPx: uniform(340)
    });

  });
});
