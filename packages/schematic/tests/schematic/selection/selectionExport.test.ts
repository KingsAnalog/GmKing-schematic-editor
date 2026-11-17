import { fixtureDocument } from "../support/fixtureDocument";
import { describe, expect, it } from "vitest";
import { rotatePoint, transformPin } from "../../../src/schematic/geometry";
import { getComponentDef, resolveComponentDef } from "../../../src/schematic/catalog";
import {
  ANALOG_BUFFER_LABEL_FONT_SIZE,
  componentCellAttrs,
  makeComponentCell,
  PORT_MARKER_INNER_SIZE,
  PORT_MARKER_SIZE,
  PORT_MARKER_STROKE_WIDTH
} from "../../../src/schematic/renderer";
import { componentFrameBox, componentSymbolBounds } from "../../../src/schematic/view-geometry";
import {
  buildSchematicSelectionSvg,
  schematicSelectionExportBounds
} from "../../../src/schematic/selection/selectionExport";
import { SYMBOL_STROKE_WIDTH } from "../../../src/schematic/symbols/symbolPrimitives";
import { analogBufferLabelPosition } from "../../../src/schematic/symbols/symbolBuilders";
import { component } from "../support/testHelpers";

describe("schematic selection SVG export", () => {
  it("keeps namespaces distinct when unsafe characters would sanitize identically", () => {
    const input = fixtureDocument({
      netLabels: [],
      components: [],
      wires: [],
      junctionPoints: [],
      notes: [{
        id: "note:a",
        x: 0,
        y: 0,
        width: 120,
        height: 40,
        format: "plain" as const,
        text: "namespace"
      }]
    });
    const first = buildSchematicSelectionSvg({ ...input, namespace: "selection:a", showGrid: true });
    const second = buildSchematicSelectionSvg({ ...input, namespace: "selection?a", showGrid: true });
    const firstIds = [...(first?.svg.matchAll(/\sid="([^"]+)"/g) ?? [])].map((match) => match[1]);
    const secondIds = [...(second?.svg.matchAll(/\sid="([^"]+)"/g) ?? [])].map((match) => match[1]);

    expect(new Set(firstIds).size).toBe(firstIds.length);
    expect(firstIds).not.toEqual(secondIds);
  });

  it("builds a padded SVG export for selected components, wires, junctions, and notes", () => {
    const resistor = component("resistor", "Rcopy", 100, 120);
    const wire = { id: "wcopy", routeMode: "orthogonal" as const, points: [{ x: 140, y: 120 }, { x: 180, y: 120 }] };
    const note = {
      id: "note-copy",
      x: 160,
      y: 70,
      width: 120,
      height: 50,
      format: "plain" as const,
      text: "gain < 1\nok & done"
    };
    const input = fixtureDocument({
      netLabels: [],
      components: [resistor],
      wires: [wire],
      junctionPoints: [{ x: 180, y: 120 }],
      notes: [note]
    });

    const bounds = schematicSelectionExportBounds(input);
    const exported = buildSchematicSelectionSvg(input);

    expect(exported).not.toBeNull();
    expect(exported?.viewBox).toEqual({
      x: (bounds?.x ?? 0) - 24,
      y: (bounds?.y ?? 0) - 24,
      width: (bounds?.width ?? 0) + 48,
      height: (bounds?.height ?? 0) + 48
    });
    expect(exported?.svg).toContain('data-component-id="Rcopy"');
    expect(exported?.svg).toContain('data-wire-id="wcopy"');
    expect(exported?.svg).toContain('data-junction="180,120"');
    expect(exported?.svg).toContain('data-note-id="note-copy"');
    expect(exported?.svg).toContain("<foreignObject");
    expect(exported?.svg).toContain("border:0px solid transparent");
    expect(exported?.svg).toContain("white-space:pre");
    expect(exported?.svg).toContain("gain &lt; 1");
    expect(exported?.svg).toContain("ok &amp; done");
  });

  it("exports schematic selection without selection highlights, grid, or pin markers in presentation mode", () => {
    const exported = buildSchematicSelectionSvg(fixtureDocument({
      netLabels: [],
      components: [component("resistor", "Rclean", 100, 120)],
      wires: [],
      junctionPoints: [],
      notes: [],
      presentationMode: true
    }));

    expect(exported?.svg).not.toContain("#005f9e");
    expect(exported?.svg).not.toContain("joint-grid");
    expect(exported?.svg).not.toContain("data-selector=\"frame\"");
    expect(exported?.svg).not.toContain("<rect");
  });

  it("marks stroked component paths as unfilled for SVG rendering", () => {
    const exported = buildSchematicSelectionSvg(fixtureDocument({
      netLabels: [],
      components: [component("resistor", "Ropen", 100, 120, 90), component("nmos", "Mopen", 180, 120)],
      wires: [],
      junctionPoints: [],
      notes: []
    }));

    expect(exported?.svg).toMatch(/<path data-selector="symbolBody"[^>]*fill="none"[^>]*stroke="#111111"/);
    expect(exported?.svg).toMatch(/<path data-selector="symbolAccent"[^>]*fill="none"[^>]*stroke="#111111"/);
  });

  it("exports endpoint and digital wire decorations with matching dimensions", () => {
    const decorated = {
      id: "wire-export-decoration",
      routeMode: "orthogonal" as const,
      points: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
      appearance: {
        variant: "signal" as const,
        lineWidth: "2a" as const,
        startMarker: "arrow" as const,
        endMarker: "circle" as const,
        digitalSlash: true,
        digitalLabel: "8<"
      }
    };
    const exported = buildSchematicSelectionSvg(fixtureDocument({
      netLabels: [],
      components: [],
      wires: [decorated],
      junctionPoints: [],
      notes: []
    }));

    expect(exported?.svg).toContain('data-wire-id="wire-export-decoration"');
    expect(exported?.svg).toMatch(/<polyline[^>]*stroke-width="4"/);
    expect(exported?.svg).toContain('data-wire-endpoint="start" points="-24,0 0,6 0,-6"');
    expect(exported?.svg).toContain('data-wire-endpoint="end" cx="100" cy="0" r="4"');
    expect(exported?.svg).toContain('stroke-width="2"');
    expect(exported?.svg).toContain('data-wire-digital-slash d="M 46 4 L 54 -4"');
    expect(exported?.svg).toContain('data-wire-digital-label x="58" y="-8"');
    expect(exported?.svg).toContain(">8&lt;</text>");

    decorated.appearance.digitalLabel = "";
    const withoutLabel = buildSchematicSelectionSvg(fixtureDocument({
      netLabels: [],
      components: [],
      wires: [decorated],
      junctionPoints: [],
      notes: []
    }));
    expect(withoutLabel?.svg).toContain("data-wire-digital-slash");
    expect(withoutLabel?.svg).not.toContain("data-wire-digital-label");
  });

  it("keeps an exported arrow tip on a connected symbol pin", () => {
    const resistor = component("resistor", "Rarrow", 100, 100);
    const wire = {
      id: "wire-pin-arrow",
      routeMode: "orthogonal" as const,
      points: [{ x: 0, y: 100 }, { x: 60, y: 100 }],
      appearance: {
        variant: "signal" as const,
        endMarker: "arrow" as const
      }
    };
    const exported = buildSchematicSelectionSvg(fixtureDocument({
      netLabels: [],
      components: [resistor],
      wires: [wire],
      junctionPoints: [],
      notes: []
    }));

    expect(exported?.svg).toContain(
      'data-wire-endpoint="end" points="60,100 36,94 36,106"'
    );
    expect(exported?.svg).not.toContain('points="84,100 60,106 60,94"');
  });

  it("matches JointJS frame-local transforms for rotated and mirrored SVG components", () => {
    for (const mirrored of [false, true]) {
      for (const rotation of [0, 90, 180, 270]) {
        const ota = { ...component("ota", `Gm-${rotation}-${mirrored}`, 400, 300, rotation), mirrored };
        const cell = makeComponentCell(ota);
        const position = cell.position();
        const size = cell.size();
        const expectedTransform = [
          `translate(${position.x} ${position.y})`,
          rotation ? `rotate(${rotation} ${size.width / 2} ${size.height / 2})` : ""
        ].filter(Boolean).join(" ");
        const exported = buildSchematicSelectionSvg(fixtureDocument({
          netLabels: [],
          components: [ota],
          wires: [],
          junctionPoints: [],
          notes: []
        }));

        expect(exported?.svg, `${rotation} degrees, mirrored=${mirrored}`).toContain(
          `data-component-id="${ota.id}" transform="${expectedTransform}"`
        );

        const ports = cell.prop("ports/items") as Array<{ id: string; args: { x: number; y: number } }>;
        for (const pin of resolveComponentDef(ota).pins) {
          const port = ports.find((candidate) => candidate.id === pin.id);
          expect(port, `${rotation} degrees, mirrored=${mirrored}, pin=${pin.id}`).toBeDefined();
          const rotated = rotatePoint({
            x: port!.args.x - size.width / 2,
            y: port!.args.y - size.height / 2
          }, rotation);
          expect({
            x: position.x + size.width / 2 + rotated.x,
            y: position.y + size.height / 2 + rotated.y
          }).toEqual(transformPin(ota, pin));
        }
      }
    }
  });

  it("preserves temporarily-deleted component and wire styling in SVG exports", () => {
    const resistor = { ...component("resistor", "Rdel", 100, 120), temporarilyDeleted: true };
    const wire = {
      id: "wdel",
      routeMode: "orthogonal" as const,
      temporarilyDeleted: true,
      points: [{ x: 140, y: 120 }, { x: 200, y: 120 }]
    };
    const exported = buildSchematicSelectionSvg(fixtureDocument({
      netLabels: [],
      components: [resistor],
      wires: [wire],
      junctionPoints: [],
      notes: []
    }));

    expect(exported?.svg).toContain("#8a8a8a");
    expect(exported?.svg).toContain("#b00020");
    expect(exported?.svg).toContain('stroke-dasharray="7 5"');
  });

  it("exports plus pin role marks and respects per-pin visibility", () => {
    const plus = component("plus", "SUMcopy", 100, 120);
    plus.values["pinVisible:top"] = "true";
    plus.values["pinMode:left"] = "output";
    plus.values["pinMode:top"] = "negative";
    plus.values["pinSymbolVisible:bottom"] = "false";
    plus.values["pinVisible:right"] = "false";
    const exported = buildSchematicSelectionSvg(fixtureDocument({
      netLabels: [],
      components: [plus],
      wires: [],
      junctionPoints: [],
      notes: []
    }));
    const renderedPinMarks = makeComponentCell(plus).attr("symbolPinMarks/d");

    expect(exported?.svg).toContain('data-selector="symbolPinMarks"');
    expect(renderedPinMarks).toBeTruthy();
    expect(exported?.svg).toContain(`d="${renderedPinMarks}"`);
    expect(exported?.svg).toContain('stroke-linecap="square"');
    expect(exported?.svg.match(/<rect /g) ?? []).toHaveLength(3);
  });

  it("exports centered and ordinary reference labels with renderer-independent text baselines", () => {
    const amp = component("amp", "A13", 100, 120);
    amp.values.gainPolarity = "positive";
    const capacitor = component("capacitor", "C13", 220, 120);
    const exported = buildSchematicSelectionSvg(fixtureDocument({
      netLabels: [],
      components: [amp, capacitor],
      wires: [],
      junctionPoints: [],
      notes: []
    }));

    expect(exported?.svg).toMatch(/<g data-selector="refLabel"[^>]*><text data-selector="refLabelSign" x="22\.364" y="46\.3"[^>]*dominant-baseline="alphabetic"[^>]*>\+<\/text>/);
    expect(exported?.svg).toMatch(/<text data-selector="refLabelHead" x="30\.584" y="47"[^>]*>A<\/text>/);
    expect(exported?.svg).toMatch(/<text data-selector="refLabelTail" x="38\.804" y="49\.2"[^>]*>13<\/text>/);
    expect(exported?.svg).not.toContain('dominant-baseline="central"');

    const ordinaryLabel = (exported?.svg.match(/<g data-selector="refLabel"[^>]*>.*?<\/g>/g) ?? [])
      .find((label) => label.includes(">C</text>")) ?? "";
    expect(ordinaryLabel).toBeTruthy();
    expect(ordinaryLabel).toMatch(/<text data-selector="refLabelHead"[^>]*text-anchor="start"[^>]*>C<\/text>/);
    expect(ordinaryLabel).toMatch(/<text data-selector="refLabelTail"[^>]*text-anchor="start"[^>]*>13<\/text>/);
    expect(ordinaryLabel).not.toContain("<tspan");
    expect(ordinaryLabel).not.toContain("baseline-shift");

  });

  it("shares explicit alphabetic baselines for centered symbol text", () => {
    const analogBuffer = component("analogBuffer", "Xcopy", 100, 120);
    const adc = component("adc", "ADCcopy", 220, 120);
    const bufferAttrs = componentCellAttrs(analogBuffer);
    const adcAttrs = componentCellAttrs(adc);
    const exported = buildSchematicSelectionSvg(fixtureDocument({
      netLabels: [],
      components: [analogBuffer, adc],
      wires: [],
      junctionPoints: [],
      notes: []
    }));

    expect(bufferAttrs.label).toMatchObject({
      text: "×1",
      y: 46,
      fontSize: 20,
      textAnchor: "middle",
      dominantBaseline: "alphabetic"
    });
    expect(adcAttrs.label).toMatchObject({
      text: "ADC",
      y: 23.9,
      fontSize: 13,
      textAnchor: "middle",
      dominantBaseline: "alphabetic"
    });
    expect(bufferAttrs.label).not.toHaveProperty("textVerticalAnchor");
    expect(adcAttrs.label).not.toHaveProperty("textVerticalAnchor");
    expect(exported?.svg).toMatch(/<text data-selector="label" x="32" y="46"[^>]*dominant-baseline="alphabetic"[^>]*>×1<\/text>/);
    expect(exported?.svg).toMatch(/<text data-selector="label" x="42" y="23\.9"[^>]*dominant-baseline="alphabetic"[^>]*>ADC<\/text>/);
    expect(exported?.svg).not.toContain('dominant-baseline="central"');
  });

  it("renders all component pins as square markers with 2a inner side length", () => {
    const resistorCell = makeComponentCell(component("resistor", "Rpin", 100, 120));
    const portAttrs = resistorCell.prop("ports/groups/pin/attrs/portBody") as Record<string, unknown>;
    const portMarkup = resistorCell.prop("ports/groups/pin/markup") as Array<Record<string, unknown>>;

    expect(portMarkup).toEqual([{ tagName: "rect", selector: "portBody" }]);
    expect(portAttrs.r).toBeUndefined();
    expect(portAttrs.x).toBe(-PORT_MARKER_SIZE / 2);
    expect(portAttrs.y).toBe(-PORT_MARKER_SIZE / 2);
    expect(portAttrs.width).toBe(PORT_MARKER_SIZE);
    expect(portAttrs.height).toBe(PORT_MARKER_SIZE);
    expect(portAttrs.strokeWidth).toBe(PORT_MARKER_STROKE_WIDTH);
    expect(PORT_MARKER_STROKE_WIDTH).toBe(SYMBOL_STROKE_WIDTH);
    expect(PORT_MARKER_INNER_SIZE).toBe(2 * SYMBOL_STROKE_WIDTH);
    expect(PORT_MARKER_SIZE - PORT_MARKER_STROKE_WIDTH).toBe(PORT_MARKER_INNER_SIZE);
  });

  it("does not render component type labels inside ordinary symbols", () => {
    const resistorCell = makeComponentCell(component("resistor", "Rlabel", 100, 120));
    const switchCell = makeComponentCell(component("switch", "Slabel", 100, 120));
    const nmosCell = makeComponentCell(component("nmos", "Mlabel", 100, 120));
    const annotation = component("annotation", "TXT1", 100, 120);
    annotation.values.main = "note text";
    const annotationCell = makeComponentCell(annotation);

    expect(resistorCell.attr("label/text")).toBe("");
    expect(switchCell.attr("label/text")).toBe("");
    expect(nmosCell.attr("label/text")).toBe("");
    expect(resistorCell.attr("refLabelHead/text")).toBe("R");
    expect(resistorCell.attr("refLabelTail/text")).toBe("label");
    expect(annotationCell.attr("label/text")).toBe("note text");
    expect(annotationCell.attr("refLabelHead/text")).toBe("");
    expect(annotationCell.attr("refLabelTail/text")).toBe("");
  });

  it("renders component names as italic heads with bold subscript tails", () => {
    const resistor = component("resistor", "Rx123", 100, 120);
    const currentSource = component("currentSource", "Ix123", 100, 120);
    const resistorCell = makeComponentCell(resistor);
    const currentSourceCell = makeComponentCell(currentSource);
    const resistorAttrs = componentCellAttrs(resistor);
    const currentSourceAttrs = componentCellAttrs(currentSource);

    expect(resistorCell.attr("refLabelHead/text")).toBe("R");
    expect(resistorCell.attr("refLabelTail/text")).toBe("x123");
    expect(currentSourceCell.attr("refLabelHead/text")).toBe("I");
    expect(currentSourceCell.attr("refLabelTail/text")).toBe("x123");
    expect(resistorCell.attr("refLabelHead/fontWeight")).toBe(700);
    expect(resistorCell.attr("refLabelHead/fontStyle")).toBe("italic");
    expect(resistorCell.attr("refLabelHead/fontSize")).toBe(11);
    expect(resistorCell.attr("refLabelTail/fontWeight")).toBe(700);
    expect(resistorCell.attr("refLabelTail/fontStyle")).toBe("normal");
    expect(resistorCell.attr("refLabelTail/fontSize")).toBe(8);
    expect(resistorCell.attr("refLabelTail/baselineShift")).toBeUndefined();
    [resistorAttrs, currentSourceAttrs].forEach((attrs) => {
      expect(attrs.refLabelHead.textAnchor).toBe("start");
      expect(attrs.refLabelTail.textAnchor).toBe("start");
      expect(attrs.refLabelTail.x as number).toBeGreaterThan(attrs.refLabelHead.x as number);
      expect(attrs.refLabelTail.y as number).toBeGreaterThan(attrs.refLabelHead.y as number);
    });
  });

  it("renders numeric name prefixes upright and punctuation names literally", () => {
    const numericPrefix = makeComponentCell(component("capacitor", "64C2", 100, 120));
    const literal = makeComponentCell(component("capacitor", "a*C2", 100, 120));
    const numericOnly = makeComponentCell(component("capacitor", "123", 100, 120));
    const unicodeHead = makeComponentCell(component("capacitor", "12\u03a93", 100, 120));

    expect(numericPrefix.attr("refLabelPrefix/text")).toBe("64");
    expect(numericPrefix.attr("refLabelPrefix/fontStyle")).toBe("normal");
    expect(numericPrefix.attr("refLabelHead/text")).toBe("C");
    expect(numericPrefix.attr("refLabelHead/fontStyle")).toBe("italic");
    expect(numericPrefix.attr("refLabelTail/text")).toBe("2");
    expect(numericPrefix.attr("refLabelTail/baselineShift")).toBeUndefined();

    expect(literal.attr("refLabelPrefix/text")).toBe("a*C2");
    expect(literal.attr("refLabelHead/text")).toBe("");
    expect(literal.attr("refLabelTail/text")).toBe("");
    expect(numericOnly.attr("refLabelPrefix/text")).toBe("123");
    expect(numericOnly.attr("refLabelHead/text")).toBe("");
    expect(unicodeHead.attr("refLabelPrefix/text")).toBe("12");
    expect(unicodeHead.attr("refLabelHead/text")).toBe("\u03a9");
    expect(unicodeHead.attr("refLabelTail/text")).toBe("3");
  });

  it("renders rectangle names as centered 16px upright literals", () => {
    expect(getComponentDef("resistor").nameFormat).toBe("schematic");
    expect(getComponentDef("rectangle").nameFormat).toBe("literal");

    ["PFD", "64C2", "PFD/CP", "÷2"].forEach((ref) => {
      const cell = makeComponentCell(component("rectangle", ref, 100, 120));
      const centerY = cell.size().height / 2;

      expect(cell.attr("centeredRefLabelPrefix/text"), ref).toBe(ref);
      expect(cell.attr("centeredRefLabelPrefix/fontSize"), ref).toBe(16);
      expect(cell.attr("centeredRefLabelPrefix/fontWeight"), ref).toBe(700);
      expect(cell.attr("centeredRefLabelPrefix/fontStyle"), ref).toBe("normal");
      expect(cell.attr("centeredRefLabelPrefix/x"), ref).toBe(cell.size().width / 2);
      expect(cell.attr("centeredRefLabelPrefix/y"), ref).toBe(centerY + 16 * 0.35);
      expect(cell.attr("centeredRefLabelPrefix/textAnchor"), ref).toBe("middle");
      expect(cell.attr("centeredRefLabel/dominantBaseline"), ref).toBe("alphabetic");
      expect(cell.attr("centeredRefLabelHead/text"), ref).toBe("");
      expect(cell.attr("centeredRefLabelTail/text"), ref).toBe("");
    });
  });

  it("applies component label defaults and per-instance visibility overrides", () => {
    const ground = component("gnd", "GND1", 100, 120);
    const shownGround = component("gnd", "GND2", 100, 120);
    shownGround.values.labelVisible = "true";
    const hiddenResistor = component("resistor", "R2", 100, 120);
    hiddenResistor.values.labelVisible = "false";
    const groundCell = makeComponentCell(ground);
    const shownGroundCell = makeComponentCell(shownGround);
    const vddCell = makeComponentCell(component("vdd", "VDD1", 100, 120));
    const plusCell = makeComponentCell(component("plus", "SUM1", 100, 120));
    const resistorCell = makeComponentCell(component("resistor", "R1", 100, 120));
    const hiddenResistorCell = makeComponentCell(hiddenResistor);

    expect(groundCell.attr("refLabel/opacity")).toBe(0);
    expect(groundCell.attr("refLabelHead/text")).toBe("");
    expect(groundCell.attr("refLabelTail/text")).toBe("");
    expect(vddCell.attr("refLabel/opacity")).toBe(0);
    expect(vddCell.attr("refLabelHead/text")).toBe("");
    expect(vddCell.attr("refLabelTail/text")).toBe("");
    expect(plusCell.attr("refLabel/opacity")).toBe(0);
    expect(shownGroundCell.attr("refLabelHead/text")).toBe("G");
    expect(shownGroundCell.attr("refLabelTail/text")).toBe("ND2");
    expect(resistorCell.attr("refLabelHead/text")).toBe("R");
    expect(resistorCell.attr("refLabelTail/text")).toBe("1");
    expect(hiddenResistorCell.attr("refLabel/opacity")).toBe(0);
  });

  it("renders value visibility independently and inserts equals only with the name", () => {
    const both = component("resistor", "R1", 100, 120);
    both.values.main = "1k";
    both.values.valueVisible = "true";
    const valueOnly = { ...both, id: "R2", ref: "R2", values: { ...both.values, labelVisible: "false" } };
    const nameOnly = { ...both, id: "R3", ref: "R3", values: { main: "1k" } };
    const neither = { ...both, id: "R4", ref: "R4", values: { main: "1k", labelVisible: "false" } };

    const bothCell = makeComponentCell(both);
    const valueOnlyCell = makeComponentCell(valueOnly);
    const nameOnlyCell = makeComponentCell(nameOnly);
    const neitherCell = makeComponentCell(neither);

    expect(bothCell.attr("refLabelHead/text")).toBe("R");
    expect(bothCell.attr("refLabelValue/text")).toBe("\u00a0=\u00a01kΩ");
    expect(valueOnlyCell.attr("refLabelHead/text")).toBe("");
    expect(valueOnlyCell.attr("refLabelValue/text")).toBe("1kΩ");
    expect(nameOnlyCell.attr("refLabelHead/text")).toBe("R");
    expect(nameOnlyCell.attr("refLabelValue/text")).toBe("");
    expect(neitherCell.attr("refLabel/opacity")).toBe(0);

    const exported = buildSchematicSelectionSvg(fixtureDocument({
      components: [both], wires: [], junctionPoints: [], netLabels: [], notes: []
    }));
    expect(exported?.svg).toContain('data-selector="refLabelValue"');
    expect(exported?.svg).toContain("=\u00a01kΩ</text>");
  });

  it("places amplifier instance names and optional polarity signs in the symbol center", () => {
    const cases = [
      { type: "opAmp" as const, ref: "Aop1", head: "A", tail: "op1" },
      { type: "ota" as const, ref: "Gm1", head: "G", tail: "m1" },
      { type: "diffAmp" as const, ref: "Ad1", head: "A", tail: "d1" },
      { type: "diffOta" as const, ref: "Gm2", head: "G", tail: "m2" },
      { type: "idealGm" as const, ref: "gm1", head: "g", tail: "m1" },
      { type: "amp" as const, ref: "A1", head: "A", tail: "1" },
      { type: "gm" as const, ref: "Gm3", head: "G", tail: "m3" }
    ];

    cases.forEach(({ type, ref, head, tail }) => {
      const def = getComponentDef(type);
      const frame = componentFrameBox(def);
      const cell = makeComponentCell(component(type, ref, 100, 120));
      const expectedX = type === "amp" ? analogBufferLabelPosition(def.size.width, def.size.height).x - frame.x : def.size.width / 2 - frame.x;
      const expectedCenterY = def.size.height / 2 - frame.y;
      expect(cell.attr("centeredRefLabel/x"), type).toBe(expectedX);
      expect(cell.attr("centeredRefLabel/y"), type).toBe(expectedCenterY + ANALOG_BUFFER_LABEL_FONT_SIZE * 0.35);
      expect(cell.attr("centeredRefLabel/dominantBaseline"), type).toBe("alphabetic");
      expect(cell.attr("centeredRefLabelHead/text"), type).toBe(head);
      expect(cell.attr("centeredRefLabelTail/text"), type).toBe(tail);
      expect(cell.attr("centeredRefLabelSign/y"), type).toBe(expectedCenterY + 18 * 0.35);
      expect(cell.attr("centeredRefLabelSign/textAnchor"), type).toBe("end");
      expect(cell.attr("centeredRefLabelHead/x"), type).toBeLessThan(expectedX);
      expect(cell.attr("centeredRefLabelHead/y"), type).toBe(expectedCenterY + ANALOG_BUFFER_LABEL_FONT_SIZE * 0.35);
      expect(cell.attr("centeredRefLabelTail/x"), type).toBeGreaterThan(cell.attr("centeredRefLabelHead/x") as number);
      expect(cell.attr("centeredRefLabelTail/y"), type).toBe(expectedCenterY + 5 + 12 * 0.35);
      expect(cell.attr("centeredRefLabelTail/textAnchor"), type).toBe("start");
    });

    const positiveAmp = component("amp", "A4", 100, 120);
    positiveAmp.values.gainPolarity = "positive";
    const negativeGm = component("gm", "Gm5", 100, 120);
    negativeGm.values.gainPolarity = "negative";
    expect(makeComponentCell(positiveAmp).attr("centeredRefLabelSign/text")).toBe("+");
    expect(makeComponentCell(negativeGm).attr("centeredRefLabelSign/text")).toBe("−");
    expect(makeComponentCell(component("amp", "A6", 100, 120)).attr("centeredRefLabelSign/text")).toBe("");

    const centeredA = component("amp", "A", 100, 120);
    const positiveA = component("amp", "A", 100, 120);
    positiveA.values.gainPolarity = "positive";
    const positiveA1 = component("amp", "A1", 100, 120);
    positiveA1.values.gainPolarity = "positive";
    const centeredGm = component("gm", "Gm", 100, 120);
    const positiveGm = component("gm", "Gm", 100, 120);
    positiveGm.values.gainPolarity = "positive";
    const longGm = component("gm", "Gmfb1", 100, 120);
    const ampDef = getComponentDef("amp");
    const ampFrame = componentFrameBox(ampDef);
    const ampCenterX = analogBufferLabelPosition(ampDef.size.width, ampDef.size.height).x - ampFrame.x;
    const gmDef = getComponentDef("gm");
    const gmCenterX = gmDef.size.width / 2 - componentFrameBox(gmDef).x;
    const centeredAX = makeComponentCell(centeredA).attr("centeredRefLabelHead/x") as number;
    const positiveAX = makeComponentCell(positiveA).attr("centeredRefLabelHead/x") as number;
    const positiveA1X = makeComponentCell(positiveA1).attr("centeredRefLabelHead/x") as number;
    const centeredGmX = makeComponentCell(centeredGm).attr("centeredRefLabelHead/x") as number;
    const positiveGmX = makeComponentCell(positiveGm).attr("centeredRefLabelHead/x") as number;
    const longGmX = makeComponentCell(longGm).attr("centeredRefLabelHead/x") as number;

    expect(centeredAX).toBe(ampCenterX);
    expect(positiveAX).toBeGreaterThan(ampCenterX);
    expect(positiveA1X).toBeGreaterThan(ampCenterX);
    expect(positiveA1X).toBeLessThan(positiveAX);
    expect(centeredGmX).toBeLessThan(gmCenterX);
    expect(positiveGmX).toBeCloseTo(gmCenterX, 0);
    expect(longGmX).toBeLessThan(centeredGmX);
  });

  it("places ordinary component names above the actual drawn symbol while keeping text horizontal", () => {
    const frame = componentFrameBox(resolveComponentDef("resistor"));
    const symbol = componentSymbolBounds(resolveComponentDef("resistor"));
    const expectedX = getComponentDef("resistor").size.width / 2 - frame.x;
    const expectedY = symbol.y - 2 - frame.y;

    const cases = [
      { rotation: 0, textAnchor: "middle", dominantBaseline: "text-after-edge", labelY: expectedY, transform: "" },
      { rotation: 90, textAnchor: "start", dominantBaseline: "alphabetic", labelY: expectedY + 11 * 0.35, transform: `rotate(-90 ${expectedX} ${expectedY})` },
      { rotation: 180, textAnchor: "middle", dominantBaseline: "text-before-edge", labelY: expectedY, transform: `rotate(-180 ${expectedX} ${expectedY})` },
      { rotation: 270, textAnchor: "end", dominantBaseline: "alphabetic", labelY: expectedY + 11 * 0.35, transform: `rotate(-270 ${expectedX} ${expectedY})` }
    ];

    cases.forEach(({ rotation, textAnchor, dominantBaseline, labelY, transform }) => {
      const cell = makeComponentCell(component("resistor", `R${rotation}`, 100, 120, rotation));
      expect(cell.attr("refLabel/x"), `${rotation}:x`).toBe(expectedX);
      expect(cell.attr("refLabel/y"), `${rotation}:y`).toBe(labelY);
      expect(cell.attr("refLabel/textAnchor"), `${rotation}:anchor`).toBe(textAnchor);
      expect(cell.attr("refLabel/dominantBaseline"), `${rotation}:baseline`).toBe(dominantBaseline);
      expect(cell.attr("refLabel/transform"), `${rotation}:transform`).toBe(transform);
      expect(cell.attr("refLabelHead/y"), `${rotation}:head-y`).toBe(labelY);
      expect(cell.attr("refLabelTail/y"), `${rotation}:tail-y`).toBe(
        rotation === 90 || rotation === 270
          ? expectedY + 3 + 8 * 0.35
          : expectedY + 3
      );
    });
  });

  it("keeps mirrored component names unmirrored while preserving inverse rotation", () => {
    const frame = componentFrameBox(resolveComponentDef("resistor"));
    const mirrored = component("resistor", "RM1", 100, 120);
    mirrored.mirrored = true;
    const cell = makeComponentCell(mirrored);
    const rotatedMirrored = component("resistor", "RM90", 100, 120, 90);
    rotatedMirrored.mirrored = true;
    const rotatedCell = makeComponentCell(rotatedMirrored);
    const expectedX = getComponentDef("resistor").size.width / 2 - frame.x;
    const expectedY = componentSymbolBounds(resolveComponentDef("resistor")).y - 2 - frame.y;

    expect(cell.attr("symbolBody/transform")).toContain("matrix(-1 0 0 1");
    expect(cell.attr("refLabel/transform")).toBe("");
    expect(rotatedCell.attr("symbolBody/transform")).toContain("matrix(-1 0 0 1");
    expect(rotatedCell.attr("refLabel/transform")).toBe(`rotate(-90 ${expectedX} ${expectedY})`);
  });

  it("exports rendered Markdown notes as XHTML foreignObject content", () => {
    const note = {
      id: "note-markdown",
      x: 40,
      y: 60,
      width: 320,
      height: 120,
      format: "markdown" as const,
      text: "# Gain\n\n$A_v$"
    };
    const exported = buildSchematicSelectionSvg(fixtureDocument({
      netLabels: [],
      components: [],
      wires: [],
      junctionPoints: [],
      notes: [note],
      renderedNoteHtml: {
        [note.id]: '<div class="milkdown"><h1 style="font-size:24px">Gain</h1><span class="schematic-markdown-math"><svg xmlns="http://www.w3.org/2000/svg"><defs><path id="MJX-TEX-A" d="M0 0"/></defs></svg></span></div>'
      },
      renderedNoteText: {
        [note.id]: "Gain\n$A_v$"
      }
    }));

    expect(exported?.svg).toContain("<switch>");
    expect(exported?.svg).toContain("<foreignObject");
    expect(exported?.svg).toContain('requiredExtensions="http://www.w3.org/1999/xhtml"');
    expect(exported?.svg).toContain('xmlns="http://www.w3.org/1999/xhtml"');
    expect(exported?.svg).toContain('data-markdown-note-fallback="note-markdown"');
    expect(exported?.svg).toContain("border:1px solid transparent");
    expect(exported?.svg).toContain("<h1");
    expect(exported?.svg).toContain("<defs>");
    expect(exported?.svg).not.toContain("# Gain");
  });

  it("keeps a native visible fallback for no-fill Markdown SVG exports", () => {
    const note = {
      id: "note-markdown-no-fill",
      x: 740,
      y: 160,
      width: 160,
      height: 40,
      format: "markdown" as const,
      text: "**(Q) Noise**\n",
      backgroundColor: null,
      fontSizePx: 28
    };
    const exported = buildSchematicSelectionSvg(fixtureDocument({
      netLabels: [],
      components: [],
      wires: [],
      junctionPoints: [],
      notes: [note],
      renderedNoteHtml: {
        [note.id]: '<div class="milkdown"><p><strong>(Q) Noise</strong></p></div>'
      },
      renderedNoteText: {
        [note.id]: "(Q) Noise"
      },
      renderedNoteTextStyles: {
        [note.id]: { fontWeight: 700 }
      }
    }));

    expect(exported?.svg).toContain('fill="none"');
    expect(exported?.svg).toContain("<switch>");
    expect(exported?.svg).toContain('data-markdown-note-fallback="note-markdown-no-fill"');
    expect(exported?.svg).toContain(">(Q) Noise</tspan>");
    expect(exported?.svg).not.toContain(">**(Q) Noise**</tspan>");
    expect(exported?.clipboardSvg).toContain('fill="none"');
    expect(exported?.clipboardSvg).toContain('data-markdown-note-fallback="note-markdown-no-fill"');
    expect(exported?.clipboardSvg).toContain('font-size="28"');
    expect(exported?.clipboardSvg).toContain('font-weight="700"');
    expect(exported?.clipboardSvg).toContain(">(Q) Noise</tspan>");
    expect(exported?.clipboardSvg).not.toContain("<switch>");
    expect(exported?.clipboardSvg).not.toContain("<foreignObject");
    expect(exported?.clipboardSvg).not.toContain("**(Q) Noise**");
  });

  it("exports no-fill notes without a background rectangle fill", () => {
    const exported = buildSchematicSelectionSvg(fixtureDocument({
      netLabels: [],
      components: [],
      wires: [],
      junctionPoints: [],
      notes: [{
        id: "note-no-fill",
        x: 40,
        y: 60,
        width: 160,
        height: 60,
        format: "plain",
        text: "Transparent note",
        backgroundColor: null
      }]
    }));

    expect(exported?.svg).toContain('data-note-id="note-no-fill"');
    expect(exported?.svg).toContain('fill="none"');
    expect(exported?.svg).not.toContain('fill-opacity="0.88"');
  });

  it("places MOS names inside the frame toward the source-side blank area", () => {
    const nmosCell = makeComponentCell(component("nmos", "MN1", 100, 120));
    const pmosCell = makeComponentCell(component("pmos", "MP1", 100, 120));
    const frame = componentFrameBox(resolveComponentDef("nmos"));
    const expectedX = 20;
    const nmosExpectedY = 78 - frame.y;
    const pmosExpectedY = 22 - frame.y;

    expect(nmosCell.attr("refLabel/x")).toBe(expectedX);
    expect(nmosCell.attr("refLabel/y")).toBe(nmosExpectedY + 11 * 0.35);
    expect(nmosCell.attr("refLabel/textAnchor")).toBe("middle");
    expect(nmosCell.attr("refLabel/dominantBaseline")).toBe("alphabetic");
    expect(nmosCell.attr("refLabelHead/y")).toBe(nmosExpectedY + 11 * 0.35);
    expect(nmosCell.attr("refLabelTail/y")).toBe(nmosExpectedY + 3 + 8 * 0.35);
    expect(pmosCell.attr("refLabel/x")).toBe(expectedX);
    expect(pmosCell.attr("refLabel/y")).toBe(pmosExpectedY + 11 * 0.35);
    expect(pmosCell.attr("refLabel/textAnchor")).toBe("middle");
    expect(pmosCell.attr("refLabel/dominantBaseline")).toBe("alphabetic");
    expect(pmosCell.attr("refLabelHead/y")).toBe(pmosExpectedY + 11 * 0.35);
    expect(pmosCell.attr("refLabelTail/y")).toBe(pmosExpectedY + 3 + 8 * 0.35);
  });
});
