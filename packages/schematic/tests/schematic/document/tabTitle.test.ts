import { describe, expect, it } from "vitest";
import {
  MAX_SCHEMATIC_TAB_TITLE_LENGTH,
  uniqueSchematicTabTitle
} from "../../../src/schematic/schematicTabTitle";

describe("schematic tab titles", () => {
  it("trims titles and rejects an empty value", () => {
    expect(uniqueSchematicTabTitle("  Front End  ", [])).toBe("Front End");
    expect(uniqueSchematicTabTitle("   ", [])).toBeNull();
  });

  it("adds the first available browser-style duplicate suffix", () => {
    expect(uniqueSchematicTabTitle("Front End", ["Front End", "Front End (2)"])).toBe("Front End (3)");
  });

  it("keeps the title within the 80 character limit when suffixing", () => {
    const longTitle = "x".repeat(100);
    const first = uniqueSchematicTabTitle(longTitle, [])!;
    const duplicate = uniqueSchematicTabTitle(longTitle, [first])!;

    expect(first).toHaveLength(MAX_SCHEMATIC_TAB_TITLE_LENGTH);
    expect(duplicate).toHaveLength(MAX_SCHEMATIC_TAB_TITLE_LENGTH);
    expect(duplicate.endsWith(" (2)")).toBe(true);
  });
});
