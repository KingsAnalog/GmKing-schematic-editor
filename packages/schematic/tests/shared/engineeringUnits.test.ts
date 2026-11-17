import { describe, expect, it } from "vitest";
import { formatEngineeringValue, parseEngineeringValue, scaleByEngineeringPrefix } from "../../src/shared/engineeringUnits";

describe("engineering unit parsing", () => {
  it("parses frequency suffixes with optional unit text", () => {
    expect(parseEngineeringValue("16G", { baseUnit: "Hz" })).toBe(16e9);
    expect(parseEngineeringValue("16GHz", { baseUnit: "Hz" })).toBe(16e9);
    expect(parseEngineeringValue("100 M Hz", { baseUnit: "Hz" })).toBe(100e6);
  });

  it("parses time, capacitance, and voltage suffixes", () => {
    expect(parseEngineeringValue("250ps", { baseUnit: "s" })).toBeCloseTo(250e-12, 21);
    expect(parseEngineeringValue("0.1ns", { baseUnit: "s" })).toBeCloseTo(0.1e-9, 21);
    expect(parseEngineeringValue("63fs", { baseUnit: "s" })).toBeCloseTo(63e-15, 24);
    expect(parseEngineeringValue("64fF", { baseUnit: "F" })).toBeCloseTo(64e-15, 24);
    expect(parseEngineeringValue("160uV", { baseUnit: "V" })).toBeCloseTo(160e-6, 18);
    expect(parseEngineeringValue("160\u00b5V", { baseUnit: "V" })).toBeCloseTo(160e-6, 18);
  });

  it("keeps SI prefix case significant", () => {
    expect(parseEngineeringValue("100M", { baseUnit: "Hz" })).toBe(100e6);
    expect(parseEngineeringValue("100m", { baseUnit: "Hz" })).toBe(100e-3);
  });

  it("rejects malformed values and mismatched units", () => {
    expect(parseEngineeringValue("", { baseUnit: "Hz" })).toBeNull();
    expect(parseEngineeringValue("abc", { baseUnit: "Hz" })).toBeNull();
    expect(parseEngineeringValue("16Q", { baseUnit: "Hz" })).toBeNull();
    expect(parseEngineeringValue("16GV", { baseUnit: "Hz" })).toBeNull();
    expect(parseEngineeringValue(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe("engineering unit formatting", () => {
  it("formats values with readable engineering prefixes", () => {
    expect(formatEngineeringValue(16e9, { unit: "Hz" })).toBe("16GHz");
    expect(formatEngineeringValue(62.5e-12, { unit: "s" })).toBe("62.5ps");
    expect(formatEngineeringValue(100e6, { unit: "", precision: 3 })).toBe("100M");
  });

  it("exposes prefix scaling for existing numeric inputs", () => {
    expect(scaleByEngineeringPrefix(64, "f")).toBe(64e-15);
    expect(scaleByEngineeringPrefix(10, "G")).toBe(10e9);
  });
});
