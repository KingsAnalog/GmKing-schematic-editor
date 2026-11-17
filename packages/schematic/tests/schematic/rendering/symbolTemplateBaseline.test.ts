import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { COMPONENT_CATALOG } from "../../../src/schematic/catalog";
import { resolveComponentVisualModel } from "../../../src/schematic/componentVisualModel";
import { renderComponentSvg } from "../../../src/schematic/componentSvgRenderer";
import type { ComponentType } from "../../../src/schematic/types";
import { symbolTemplateCases } from "../support/symbolTemplateCases";

const fixture = new URL("../fixtures/razavi-visual-baseline.json", import.meta.url);
const actual = Object.fromEntries((Object.keys(COMPONENT_CATALOG) as ComponentType[]).map(type => {
  const hash = createHash("sha256");
  for (const instance of symbolTemplateCases(type)) {
    hash.update(JSON.stringify(resolveComponentVisualModel(instance), (key, value) =>
      key === "artworkScale" || key === "terminalLeadPath" ? undefined : value instanceof Set ? [...value] : value));
    hash.update(renderComponentSvg(instance));
  }
  return [type, hash.digest("hex")];
}));
if (process.env.UPDATE_RAZAVI_BASELINE === "1") writeFileSync(fixture, JSON.stringify(actual, null, 2) + "\n");
const baseline = JSON.parse(readFileSync(fixture, "utf8")) as Record<string, string>;

describe("Razavi visual baseline before symbol-template extraction", () => {
  it.each(Object.keys(actual))("preserves %s variants, rotations, mirrors, labels and SVG", type => {
    expect(actual[type]).toBe(baseline[type]);
  });
});
