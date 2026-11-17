import { describe, expect, it } from "vitest";
import {
  getSchematicTemplateDef,
  SCHEMATIC_TEMPLATE_ORDER
} from "../../../src/schematic/templates";
import { templateFragment, pinNet } from "../support/testHelpers";

describe("schematic templates", () => {
  it("registers the initial preset template ids", () => {
    expect(SCHEMATIC_TEMPLATE_ORDER).toEqual(["common_source_nmos", "inverter_mos", "flipped_amp_diff"]);
    expect(getSchematicTemplateDef("common_source_nmos").components.map((item) => item.type)).toEqual(["resistor", "nmos", "gnd"]);
    expect(getSchematicTemplateDef("inverter_mos").components.map((item) => item.type)).toEqual(["pmos", "nmos", "gnd"]);
    expect(getSchematicTemplateDef("flipped_amp_diff").components.map((item) => item.type)).toEqual(["diffAmp", "capacitor", "capacitor", "switch", "switch"]);
  });

  it("expands common_source_nmos into ordinary components with the NMOS source grounded", () => {
    const doc = templateFragment("common_source_nmos");

    expect(doc.components.map((item) => item.type)).toEqual(["resistor", "nmos", "gnd"]);
    expect(doc.components.map((item) => item.ref)).toEqual(["R1", "M1", "GND1"]);
    expect(doc.components.find((item) => item.type === "nmos")?.variantId).toBe("3pin-current");
    expect(doc.wires).toHaveLength(0);
    expect(pinNet(doc, "R1", "n")).toBe(pinNet(doc, "M1", "d"));
    expect(pinNet(doc, "M1", "s")).toBe("0");
  });

  it("expands inverter_mos into an editable CMOS inverter stack", () => {
    const doc = templateFragment("inverter_mos");

    expect(doc.components.map((item) => item.type)).toEqual(["pmos", "nmos", "gnd"]);
    expect(doc.components.map((item) => item.ref)).toEqual(["M1", "M2", "GND1"]);
    expect(doc.components.find((item) => item.type === "pmos")?.variantId).toBe("3pin-current");
    expect(doc.components.find((item) => item.type === "nmos")?.variantId).toBe("3pin-current");
    expect(doc.wires).toHaveLength(3);
    expect(pinNet(doc, "M1", "g")).toBe(pinNet(doc, "M2", "g"));
    expect(pinNet(doc, "M1", "d")).toBe(pinNet(doc, "M2", "d"));
    expect(pinNet(doc, "M2", "s")).toBe("0");
    expect(pinNet(doc, "M1", "s")).not.toBe("0");
  });

  it("expands flipped_amp_diff into editable differential flip-around connections", () => {
    const doc = templateFragment("flipped_amp_diff");

    expect(doc.components.map((item) => item.ref)).toEqual(["Ad1", "C1", "C2", "S1", "S2"]);
    expect(doc.wires).toHaveLength(12);
    expect(pinNet(doc, "Ad1", "inp")).toBe(pinNet(doc, "C1", "p"));
    expect(pinNet(doc, "Ad1", "outn")).toBe(pinNet(doc, "C1", "n"));
    expect(pinNet(doc, "S1", "p")).toBe(pinNet(doc, "C1", "p"));
    expect(pinNet(doc, "S1", "n")).toBe(pinNet(doc, "C1", "n"));
    expect(pinNet(doc, "Ad1", "inn")).toBe(pinNet(doc, "C2", "p"));
    expect(pinNet(doc, "Ad1", "outp")).toBe(pinNet(doc, "C2", "n"));
    expect(pinNet(doc, "S2", "p")).toBe(pinNet(doc, "C2", "p"));
    expect(pinNet(doc, "S2", "n")).toBe(pinNet(doc, "C2", "n"));
  });
});
