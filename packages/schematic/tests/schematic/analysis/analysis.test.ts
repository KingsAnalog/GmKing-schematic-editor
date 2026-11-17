import { fixtureDocument } from "../support/fixtureDocument";
import { describe, expect, it } from "vitest";
import { analyzeSchematic } from "../../../src/schematic/analysis/analysis";
import { getComponentDef } from "../../../src/schematic/catalog";
import type { ComponentType, SchematicDocument } from "../../../src/schematic/types";
import { slowIt } from "../../support/slowTest";
import {
  component,
  expectEquivalentBySamples,
  netAt,
  pinNet
} from "../support/testHelpers";

describe("symbolic MNA", () => {
  it("computes R driving-point impedance", () => {
    const doc: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      notes: [],
      junctions: [],
      wires: [],
      components: [
        component("voltageSource", "V1", 40, 0),
        component("resistor", "R1", 40, 0),
        component("gnd", "GND1", 80, 20)
      ]
    });
    const input = netAt(doc, 0, 0);
    const result = analyzeSchematic(doc, { inputP: input, inputN: "0", outputP: input, outputN: "0" });
    expect(result.ok).toBe(true);
    expect(result.transferExpression).toBe("1");
    expect(result.inputImpedanceExpression).toContain("R1");
    expect(result.outputImpedanceExpression).toBe("0");
  });

  it("requires an explicit ground or a net label named 0 for symbolic analysis", () => {
    const doc: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      notes: [],
      junctions: [],
      wires: [],
      components: [component("voltageSource", "V1", 40, 0), component("resistor", "R1", 40, 0)]
    });
    const port = netAt(doc, 80, 0);
    const result = analyzeSchematic(doc, { inputP: port, inputN: "0", outputP: port, outputN: "0" });
    expect(result.ok).toBe(false);
    expect(result.diagnostics.join(" ")).toContain("No reference ground");
  });

  it("supports C and L admittances in s-domain", () => {
    const capacitorDoc: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      notes: [],
      junctions: [],
      wires: [],
      components: [
        component("voltageSource", "V1", 40, 0),
        component("capacitor", "C1", 40, 0),
        component("gnd", "GND1", 80, 20)
      ]
    });
    const capInput = netAt(capacitorDoc, 0, 0);
    const cap = analyzeSchematic(capacitorDoc, { inputP: capInput, inputN: "0", outputP: capInput, outputN: "0" });
    expect(cap.ok).toBe(true);
    expect(cap.inputImpedanceExpression).toContain("C1");
    expect(cap.inputImpedanceExpression).toContain("s");
    expect(cap.inputImpedanceTex).toContain("C_{1}");

    const inductorDoc: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      notes: [],
      junctions: [],
      wires: [],
      components: [
        component("voltageSource", "V1", 40, 0),
        component("inductor", "L1", 40, 0),
        component("gnd", "GND1", 80, 20)
      ]
    });
    const indInput = netAt(inductorDoc, 0, 0);
    const ind = analyzeSchematic(inductorDoc, { inputP: indInput, inputN: "0", outputP: indInput, outputN: "0" });
    expect(ind.ok).toBe(true);
    expect(ind.inputImpedanceExpression).toContain("L1");
    expect(ind.inputImpedanceExpression).toContain("s");
  });

  it("blocks center-tapped and coupled inductors until mutual-inductance analysis is implemented", () => {
    const tapped = component("inductor", "L1", 40, 0);
    tapped.values.inductorTap = "top";
    const tappedDocument: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      notes: [],
      junctions: [],
      wires: [],
      components: [tapped]
    });
    const tappedResult = analyzeSchematic(tappedDocument, {
      inputP: "missing",
      inputN: "0",
      outputP: "missing",
      outputN: "0"
    });
    expect(tappedResult.diagnostics).toContain(
      "Center-tapped inductor symbolic s-domain analysis is not yet supported."
    );

    const first = component("inductor", "L1", 40, 0);
    const second = component("inductor", "L2", 40, 80);
    const coupledDocument: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      notes: [],
      junctions: [],
      wires: [],
      components: [first, second],
      inductorCouplings: [{ showLabel: true,
        id: "coupling-12",
        inductorAId: first.id,
        inductorBId: second.id,
        coefficient: "k12",
        coefficientAuto: true,
        labelMode: "coefficient",
        showArc: true,
        showCore: false,
        arcFlipped: false
      }]
    });
    const coupledResult = analyzeSchematic(coupledDocument, {
      inputP: "missing",
      inputN: "0",
      outputP: "missing",
      outputN: "0"
    });
    expect(coupledResult.diagnostics).toContain(
      "Coupled-inductor symbolic s-domain analysis is not yet supported."
    );
  });

  it("renders a first-order RC low-pass transfer in simplified form", () => {
    const doc: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      notes: [],
      junctions: [],
      wires: [],
      components: [
        component("resistor", "R1", 40, 0),
        component("capacitor", "C1", 80, 40, 90),
        component("gnd", "GND1", 80, 100)
      ]
    });
    const input = netAt(doc, 0, 0);
    const output = netAt(doc, 80, 0);
    const common = netAt(doc, 80, 80);
    const result = analyzeSchematic(doc, { inputP: input, inputN: common, outputP: output, outputN: common });
    expect(result.ok, result.diagnostics.join("; ")).toBe(true);
    expect(result.transferExpression).toBe("(1+C1*R1*s)^(-1)");
    expect(result.transferTex).not.toContain("\\frac{1}{R_{1}}");
  });

  it("stamps voltage and current controlled sources", () => {
    const baseComponents = [
      component("voltageSource", "V1", 40, 0),
      component("resistor", "Rin", 40, 0),
      component("resistor", "RL", 160, 0),
      component("gnd", "GND1", 80, 20)
    ];
    const controlled: ComponentType[] = ["vcvs", "vccs", "cccs", "ccvs"];
    controlled.forEach((type) => {
      const source = component(type, getComponentDef(type).valuePrefix === "A" ? "A1" : `${getComponentDef(type).valuePrefix}1`, 120, 0);
      const currentControlled = type === "cccs" || type === "ccvs";
      const doc: SchematicDocument = fixtureDocument({

        junctionAppearances: [],
        netLabels: [],
        notes: [],
        junctions: [],
        wires: currentControlled
          ? [
              { id: "out-load", routeMode: "orthogonal", points: [{ x: 70, y: -20 }, { x: 120, y: -20 }, { x: 120, y: 0 }] },
              { id: "load-ground", routeMode: "orthogonal", points: [{ x: 200, y: 0 }, { x: 200, y: 80 }, { x: 80, y: 80 }, { x: 80, y: 0 }] },
              { id: "out-ground", routeMode: "orthogonal", points: [{ x: 70, y: 20 }, { x: 80, y: 20 }, { x: 80, y: 0 }] },
              { id: "sense-in", routeMode: "orthogonal", points: [{ x: 160, y: -20 }, { x: 160, y: -60 }, { x: 0, y: -60 }, { x: 0, y: 0 }] },
              { id: "sense-load-ground", routeMode: "orthogonal", points: [{ x: 240, y: 20 }, { x: 240, y: 80 }, { x: 80, y: 80 }, { x: 80, y: 0 }] }
            ]
          : [
              { id: "out-load", routeMode: "orthogonal", points: [{ x: 70, y: -20 }, { x: 120, y: -20 }, { x: 120, y: 0 }] },
              { id: "load-ground", routeMode: "orthogonal", points: [{ x: 200, y: 0 }, { x: 200, y: 80 }, { x: 80, y: 80 }, { x: 80, y: 0 }] },
              { id: "out-ground", routeMode: "orthogonal", points: [{ x: 70, y: 20 }, { x: 80, y: 20 }, { x: 80, y: 0 }] },
              { id: "ctrl-in", routeMode: "orthogonal", points: [{ x: 160, y: -20 }, { x: 160, y: -60 }, { x: 0, y: -60 }, { x: 0, y: 0 }] },
              { id: "ctrl-ground", routeMode: "orthogonal", points: [{ x: 160, y: 20 }, { x: 160, y: 60 }, { x: 80, y: 60 }, { x: 80, y: 0 }] }
            ],
        components: currentControlled
          ? [
              component("voltageSource", "V1", 40, 0),
              component("resistor", "Rin", 200, 20),
              component("resistor", "RL", 160, 0),
              component("gnd", "GND1", 80, 20),
              source
            ]
          : [...baseComponents, source]
      });
      const input = netAt(doc, 0, 0);
      const output = pinNet(doc, source.ref, "p");
      const result = analyzeSchematic(doc, { inputP: input, inputN: "0", outputP: output, outputN: "0" });
      expect(result.ok, `${type}: ${result.diagnostics.join("; ")}`).toBe(true);
    });
  });

  it("keeps op amp symbols as ideal voltage outputs", () => {
    const singleEndedDoc: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      notes: [],
      junctions: [],
      wires: [
        { id: "opamp-minus-ground", routeMode: "orthogonal", points: [{ x: 60, y: 40 }, { x: 140, y: 40 }, { x: 140, y: 0 }] }
      ],
      components: [
        component("voltageSource", "V1", 100, 0),
        component("gnd", "GND1", 140, 20),
        component("opAmp", "Aop1", 120, 20),
        component("resistor", "RL", 240, 20),
        component("gnd", "GND2", 280, 40)
      ]
    });
    const singleInput = netAt(singleEndedDoc, 60, 0);
    const singleOutput = pinNet(singleEndedDoc, "Aop1", "out");
    const single = analyzeSchematic(singleEndedDoc, { inputP: singleInput, inputN: "0", outputP: singleOutput, outputN: "0" });
    expect(single.ok, single.diagnostics.join("; ")).toBe(true);
    expectEquivalentBySamples(single.transferExpression ?? "", "Aop1");
    expectEquivalentBySamples(single.outputImpedanceExpression ?? "", "0");

    const differentialDoc: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      notes: [],
      junctions: [],
      wires: [
        { id: "diffamp-minus-ground", routeMode: "orthogonal", points: [{ x: 80, y: 100 }, { x: 160, y: 100 }, { x: 160, y: 20 }] }
      ],
      components: [
        component("voltageSource", "V1", 120, 20),
        component("gnd", "GND1", 160, 40),
        component("diffAmp", "Ad1", 160, 60),
        component("resistor", "RL", 220, 60, 90),
        component("gnd", "GND2", 220, 120)
      ]
    });
    const differentialInput = netAt(differentialDoc, 80, 20);
    const differentialOutputP = pinNet(differentialDoc, "Ad1", "outp");
    const differentialOutputN = pinNet(differentialDoc, "Ad1", "outn");
    const differential = analyzeSchematic(differentialDoc, {
      inputP: differentialInput,
      inputN: "0",
      outputP: differentialOutputP,
      outputN: differentialOutputN
    });
    expect(differential.ok, differential.diagnostics.join("; ")).toBe(true);
    expectEquivalentBySamples(differential.transferExpression ?? "", "Ad1");
    expectEquivalentBySamples(differential.outputImpedanceExpression ?? "", "0");
  });

  it("stamps OTA symbols as transconductance outputs instead of ideal voltage outputs", () => {
    const singleEndedDoc: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      notes: [],
      junctions: [],
      wires: [
        { id: "ota-minus-ground", routeMode: "orthogonal", points: [{ x: 60, y: 40 }, { x: 140, y: 40 }, { x: 140, y: 0 }] }
      ],
      components: [
        component("voltageSource", "V1", 100, 0),
        component("gnd", "GND1", 140, 20),
        component("ota", "Gm1", 120, 20),
        component("resistor", "RL", 240, 20),
        component("gnd", "GND2", 280, 40)
      ]
    });
    const singleInput = netAt(singleEndedDoc, 60, 0);
    const singleOutput = pinNet(singleEndedDoc, "Gm1", "out");
    const single = analyzeSchematic(singleEndedDoc, { inputP: singleInput, inputN: "0", outputP: singleOutput, outputN: "0" });
    expect(single.ok, single.diagnostics.join("; ")).toBe(true);
    expectEquivalentBySamples(single.transferExpression ?? "", "-(Gm1*RL)");
    expectEquivalentBySamples(single.outputImpedanceExpression ?? "", "RL");

    const differentialDoc: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      notes: [],
      junctions: [],
      wires: [
        { id: "diffota-minus-ground", routeMode: "orthogonal", points: [{ x: 80, y: 100 }, { x: 160, y: 100 }, { x: 160, y: 20 }] }
      ],
      components: [
        component("voltageSource", "V1", 120, 20),
        component("gnd", "GND1", 160, 40),
        component("diffOta", "Gm1", 160, 60),
        component("resistor", "RL", 220, 60, 90),
        component("gnd", "GND2", 220, 120)
      ]
    });
    const differentialInput = netAt(differentialDoc, 80, 20);
    const differentialOutputP = pinNet(differentialDoc, "Gm1", "outp");
    const differentialOutputN = pinNet(differentialDoc, "Gm1", "outn");
    const differential = analyzeSchematic(differentialDoc, {
      inputP: differentialInput,
      inputN: "0",
      outputP: differentialOutputP,
      outputN: differentialOutputN
    });
    expect(differential.ok, differential.diagnostics.join("; ")).toBe(true);
    expectEquivalentBySamples(differential.transferExpression ?? "", "-(Gm1*RL)");
    expectEquivalentBySamples(differential.outputImpedanceExpression ?? "", "RL");
  });

  it("blocks MOSFET s-domain analysis for now", () => {
    const doc: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      notes: [],
      junctions: [],
      wires: [],
      components: [component("nmos", "M1", 0, 0), component("gnd", "GND1", 34, 54)]
    });
    const result = analyzeSchematic(doc, { inputP: "n1", inputN: "0", outputP: "n1", outputN: "0" });
    expect(result.ok).toBe(false);
    expect(result.diagnostics.join(" ")).toContain("MOSFET");
  });

  it("blocks BJT s-domain analysis with a specific diagnostic", () => {
    const doc: SchematicDocument = fixtureDocument({
       junctionAppearances: [], netLabels: [], notes: [],
      junctions: [], wires: [],
      components: [component("npn", "Q1", 0, 0), component("gnd", "GND1", 0, 80)]
    });
    const result = analyzeSchematic(doc, { inputP: "n1", inputN: "0", outputP: "n1", outputN: "0" });
    expect(result.ok).toBe(false);
    expect(result.diagnostics.join(" ")).toContain("BJT small-signal");
  });

  it("solves a source-free third-order passive RC low-pass network and matches manual formulas", () => {
    const doc: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      notes: [],
      junctions: [],
      wires: [
        { id: "vin-r1", routeMode: "orthogonal", points: [{ x: 80, y: 200 }, { x: 120, y: 200 }] },
        { id: "n1-r2", routeMode: "orthogonal", points: [{ x: 200, y: 200 }, { x: 220, y: 200 }] },
        { id: "n2-r3", routeMode: "orthogonal", points: [{ x: 300, y: 200 }, { x: 320, y: 200 }] },
        { id: "ground-bus", routeMode: "orthogonal", points: [{ x: 80, y: 280 }, { x: 400, y: 280 }] },
        { id: "out-stub", routeMode: "orthogonal", points: [{ x: 400, y: 200 }, { x: 440, y: 200 }] }
      ],
      components: [
        component("resistor", "R1", 160, 200),
        component("resistor", "R2", 260, 200),
        component("resistor", "R3", 360, 200),
        component("capacitor", "C1", 200, 240, 90),
        component("capacitor", "C2", 300, 240, 90),
        component("capacitor", "C3", 400, 240, 90),
        component("gnd", "GND1", 80, 300)
      ]
    });
    const input = netAt(doc, 80, 200);
    const common = netAt(doc, 80, 280);
    const output = netAt(doc, 440, 200);
    const result = analyzeSchematic(doc, { inputP: input, inputN: common, outputP: output, outputN: common });
    expect(result.ok, result.diagnostics.join("; ")).toBe(true);
    expect(result.transferExpression).not.toMatch(/\b[ V_]*x\d+\b|V_n/);
    expect(result.inputImpedanceExpression).not.toMatch(/\b[ V_]*x\d+\b|V_n/);
    expect(result.outputImpedanceExpression).not.toMatch(/\b[ V_]*x\d+\b|V_n/);

    const z3 = "1/(s*C3)";
    const z2 = `1/(s*C2+1/(R3+(${z3})))`;
    const z1 = `1/(s*C1+1/(R2+(${z2})))`;
    const expectedTransfer = `((${z1})/(R1+(${z1})))*((${z2})/(R2+(${z2})))*((${z3})/(R3+(${z3})))`;
    const expectedInputImpedance = `R1+(${z1})`;
    const zLeft1 = "1/(1/R1+s*C1)";
    const zLeft2 = `1/(s*C2+1/(R2+(${zLeft1})))`;
    const expectedOutputImpedance = `1/(s*C3+1/(R3+(${zLeft2})))`;

    expectEquivalentBySamples(result.transferExpression ?? "", expectedTransfer);
    expectEquivalentBySamples(result.inputImpedanceExpression ?? "", expectedInputImpedance);
    expectEquivalentBySamples(result.outputImpedanceExpression ?? "", expectedOutputImpedance);
  });

  slowIt("solves a third-order passive C-L-C low-pass fixture symbolically", () => {
    const doc: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      notes: [],
      junctions: [],
      wires: [
        { id: "ground-bus", routeMode: "orthogonal", points: [{ x: 0, y: 80 }, { x: 160, y: 80 }] }
      ],
      components: [
        component("voltageSource", "V1", 0, 40, 90),
        component("resistor", "Rs", 40, 0),
        component("capacitor", "C1", 80, 40, 90),
        component("inductor", "L2", 120, 0),
        component("capacitor", "C3", 160, 40, 90),
        component("resistor", "RL", 160, 40, 90),
        component("gnd", "GND1", 0, 100)
      ]
    });
    const input = netAt(doc, 0, 0);
    const output = netAt(doc, 160, 0);
    const result = analyzeSchematic(doc, { inputP: input, inputN: "0", outputP: output, outputN: "0" });
    expect(result.ok, result.diagnostics.join("; ")).toBe(true);
    expect(result.transferExpression).toContain("s^3");
    expect(result.inputImpedanceExpression).toContain("s");
    expect(result.outputImpedanceExpression).toContain("s");
  }, 60000);
});
