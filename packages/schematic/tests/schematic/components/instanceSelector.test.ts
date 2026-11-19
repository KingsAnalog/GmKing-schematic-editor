// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { findInstancePaletteMatches, InstanceSelector } from "../../../src/schematic/instanceSelector";

describe("schematic instance palette search", () => {
  it("finds component and template names containing the query", () => {
    expect(findInstancePaletteMatches("amp")).toEqual(["amp", "opAmp", "diffAmp", "flipped_amp_diff"]);
  });

  it("ranks prefix matches before other substring matches", () => {
    expect(findInstancePaletteMatches("diff")).toEqual([
      "diffProbe",
      "differentiator",
      "diffAmp",
      "diffOta",
      "diffComparator",
      "flipped_amp_diff"
    ]);
    expect(findInstancePaletteMatches("sli")).toEqual(["slicer"]);
  });

  it("namespaces combobox and listbox IDs for independently mounted editors", () => {
    const first = selectorFixture();
    const second = selectorFixture();

    first.selector.render();
    second.selector.render();

    const firstIds = idsIn(first.target.innerHTML);
    const secondIds = idsIn(second.target.innerHTML);
    expect(firstIds.size).toBeGreaterThan(2);
    expect([...firstIds].every((id) => !secondIds.has(id))).toBe(true);
    expect(first.target.innerHTML).not.toContain('id="schematic-instance-query"');
  });

  it.each([
    ["transmission_gate", "transmissionGate"],
    ["pass_gate", "transmissionGate"],
    ["pass_g", "transmissionGate"],
    ["gate", "transmissionGate"],
    [" PASS_GATE ", "transmissionGate"],
    ["nch", "nmos"],
    ["NCH", "nmos"],
    ["pch", "pmos"]
  ])("resolves %s to one canonical component", (query, type) => {
    expect(findInstancePaletteMatches(query)).toEqual([type]);
  });
});

function selectorFixture() {
  const root = document.createElement("div");
  const target = root.appendChild(document.createElement("div"));
  target.dataset.paletteItems = "";
  const selector = new InstanceSelector(root, {
    currentItem: () => "resistor",
    activeItem: () => null,
    isPlacementMode: () => false,
    activateItem: () => {},
    previewItem: () => {},
    onStatusChange: () => {}
  });
  return { selector, target };
}

function idsIn(source: string) {
  return new Set([...source.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]));
}
