import { describe, expect, it } from "vitest";
import { splitComponentName, symbolicValueRuns } from "../../../src/schematic/componentNameFormat";
import { splitIndexedComponentName } from "../../../src/schematic/componentVisualModel";
import { makeComponentCell } from "../../../src/schematic/componentRenderer";
import { renderComponentSvg } from "../../../src/schematic/componentSvgRenderer";
import { fixtureComponent } from "../support/fixtures";

describe("component name numeric prefixes", () => {
  it.each([
    ["C", "", "C", ""], ["1C", "1", "C", ""], ["1.5C", "1.5", "C", ""],
    ["+1C", "+1", "C", ""], ["-1C", "−1", "C", ""],
    ["1.5C2", "1.5", "C", "2"], ["+1.5R12", "+1.5", "R", "12"],
    ["-1.5Lout", "−1.5", "L", "out"], ["−1.5C2", "−1.5", "C", "2"],
    [".5C2", ".5", "C", "2"], ["-.5C2", "−.5", "C", "2"],
    ["+C2", "+", "C", "2"], ["-R2", "−", "R", "2"],
    ["01.50C2", "01.50", "C", "2"], ["-1.5Ω3", "−1.5", "Ω", "3"]
  ])("formats %s without changing its coefficient or suffix", (ref, prefix, head, tail) => {
    expect(splitComponentName(ref)).toEqual({ prefix, head, tail, literal: false });
  });

  it.each(["1..5C2", ".C2", "a*C2", "R+C", "C-1", "-1.5", "123"])("keeps %s literal", ref => {
    expect(splitComponentName(ref)).toEqual({ prefix: ref, head: "", tail: "", literal: true });
  });

  it.each(["1.5", "+1", "-1.5", "−.5"])("also accepts %s on indexed names", prefix => {
    expect(splitIndexedComponentName(`${prefix}ADC12`)).toEqual({
      prefix: prefix.replace(/^-/, "−"), head: "ADC", tail: "12", literal: false
    });
  });

  it.each([
    ["capacitor", "1.5C2", "1.5", "C", "2"],
    ["resistor", "+1R12", "+1", "R", "12"],
    ["inductor", "-1.5Lout", "−1.5", "L", "out"],
    ["opAmp", "-1A2", "−1", "A", "2"]
  ] as const)("renders %s coefficients upright and letters italic in the editor and SVG", (type, ref, prefix, head, tail) => {
    const component = fixtureComponent(type, ref, 100, 100);
    const cell = makeComponentCell(component);
    const selector = type === "opAmp" ? "centeredRefLabel" : "refLabel";
    expect(cell.attr(`${selector}Prefix/text`)).toBe(prefix);
    expect(cell.attr(`${selector}Prefix/fontStyle`)).toBe("normal");
    expect(cell.attr(`${selector}Head/text`)).toBe(head);
    expect(cell.attr(`${selector}Head/fontStyle`)).toBe("italic");
    expect(cell.attr(`${selector}Tail/text`)).toBe(tail);
    expect(cell.attr(`${selector}Tail/y`)).toBeGreaterThan(cell.attr(`${selector}Head/y`) as number);
    expect(cell.attr(`${selector}Tail/fontSize`)).toBeLessThan(cell.attr(`${selector}Head/fontSize`) as number);
    const svg = renderComponentSvg(component);
    expect(svg).toContain(`>${prefix}</text>`);
    expect(svg).toMatch(new RegExp(`data-selector="refLabelHead"[^>]*font-style="italic"[^>]*>${head}</text>`));
    expect(svg).toContain(`>${tail}</text>`);
    expect(component.ref).toBe(ref);
  });

  it("keeps symbolic values consistent with the name formatter", () => {
    expect(symbolicValueRuns("-1.5k2", 12, 8)).toMatchObject([
      { text: "−1.5", fontStyle: "normal" },
      { text: "k", fontStyle: "italic" },
      { text: "2", script: "subscript" }
    ]);
    expect(symbolicValueRuns("-1.5", 12, 8)).toMatchObject([{ text: "-1.5", fontStyle: "normal" }]);
  });
});
