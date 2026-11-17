import { describe, expect, it } from "vitest";
import schematicRaw from "../fixtures/schematic-golden.sch.json?raw";
import {
  parseSchematicDocumentFile,
  serializeSchematicDocumentFile
} from "../../../src/schematic/schematicDocumentCodec";

describe("schematic current persisted-format golden", () => {
  it("keeps canonical bytes stable and round trips their semantics", () => {
    const parsed = parseSchematicDocumentFile(schematicRaw);
    const serialized = serializeSchematicDocumentFile(parsed);
    const reparsed = parseSchematicDocumentFile(serialized);

    expect(serialized).toBe(schematicRaw);
    expect(serializeSchematicDocumentFile(reparsed)).toBe(schematicRaw);
    expect(reparsed).toEqual(parsed);
    expect(parsed.junctions).toEqual([{ x: 100, y: 60 }]);
    expect(parsed.notes[0]?.text).toBe("Golden note");
  });
});
