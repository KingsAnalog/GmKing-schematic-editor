import { describe, expect, it } from "vitest";
import {
  createEmptySchematicContent,
  serializeSchematicContent
} from "@edahelper/schematic/core";
import {
  canonicalFenceBody,
  minimalFenceBodyChange,
  minimalUtf16TextChange,
  parseSchematicFence,
  projectSchematicFenceInsertion
} from "../src/fence";

function schematicJson() {
  return serializeSchematicContent(createEmptySchematicContent());
}

describe("Obsidian schematic fences", () => {
  it("recognizes only json fences carrying the exact schematic envelope", () => {
    const valid = `before\n\`\`\`json\n${schematicJson()}\`\`\`\nafter`;
    expect(parseSchematicFence(valid, 7, valid.length - 5)?.kind).toBe("schematic");
    expect(parseSchematicFence(`\`\`\`javascript\n${schematicJson()}\`\`\``)).toBeNull();
    expect(parseSchematicFence("```json\n{\"ordinary\":true}\n```" )).toBeNull();
  });

  it("diagnoses malformed or unsupported schematic envelopes without changing source", () => {
    const malformed = '```json\n{"format":"adc-helper/schematic", nope}\n```';
    expect(parseSchematicFence(malformed)).toMatchObject({ kind: "diagnostic" });
    const unsupported = JSON.stringify({ ...JSON.parse(schematicJson()), version: 999 });
    expect(parseSchematicFence(`~~~json\n${unsupported}\n~~~`)).toMatchObject({ kind: "diagnostic" });
  });

  it("preserves tilde length, info, callout prefix, list continuation, and CRLF", () => {
    const canonical = schematicJson().replace(/\n$/, "");
    const body = canonical.split("\n").map((line) => `>   ${line}`).join("\r\n");
    const callout = `> ~~~~~json title=adc\r\n${body}\r\n>   ~~~~~\r\n`;
    const projection = parseSchematicFence(callout);
    expect(projection?.kind).toBe("schematic");
    if (!projection || projection.kind !== "schematic") return;
    expect(projection.map).toMatchObject({
      marker: "~",
      markerLength: 5,
      infoString: "json title=adc",
      openingPrefix: "> ",
      bodyPrefix: ">   ",
      newline: "\r\n"
    });
    expect(canonicalFenceBody(projection.content, projection.map)).toBe(`${body}\r\n`);

    const listBody = canonical.split("\n").map((line) => `  ${line}`).join("\n");
    const list = `- \`\`\`json\n${listBody}\n  \`\`\`\n`;
    const listProjection = parseSchematicFence(list);
    expect(listProjection?.kind).toBe("schematic");
    if (listProjection?.kind === "schematic") {
      expect(listProjection.map.openingPrefix).toBe("- ");
      expect(listProjection.map.bodyPrefix).toBe("  ");
    }
  });

  it("dispatches only the minimal fence-body change", () => {
    const source = `\`\`\`json\n${schematicJson()}\`\`\``;
    const projection = parseSchematicFence(source);
    expect(projection?.kind).toBe("schematic");
    if (!projection || projection.kind !== "schematic") return;
    const changed = structuredClone(projection.content);
    changed.notes.push({
      id: "note-1",
      x: 0,
      y: 0,
      text: "hello",
      anchor: "upperLeft",
      fontSizePx: 16,
      width: 120,
      height: 40
    });
    const change = minimalFenceBodyChange(changed, projection.map);
    expect(change).not.toBeNull();
    if (!change) return;
    const updated = source.slice(0, change.from) + change.insert + source.slice(change.to);
    expect(parseSchematicFence(updated)).toMatchObject({ kind: "schematic", content: changed });
    expect(change.from).toBeGreaterThanOrEqual(projection.map.bodyFrom);
    expect(change.to).toBeLessThanOrEqual(projection.map.bodyTo);
  });

  it("never splits UTF-16 surrogate pairs at diff boundaries", () => {
    const previous = "prefix \ud83d\ude00 old suffix";
    const next = "prefix \ud83d\ude00 new suffix";
    const change = minimalUtf16TextChange(previous, next, 10);
    expect(change).toEqual({ from: 20, to: 23, insert: "new" });

    const replaceEmoji = minimalUtf16TextChange("a\ud83d\ude00z", "a\ud83d\ude01z");
    expect(replaceEmoji).toEqual({ from: 1, to: 3, insert: "\ud83d\ude01" });
  });

  it("projects a valid standalone fence when inserted in the middle of a paragraph", () => {
    const source = "beforeafter";
    const insertion = projectSchematicFenceInsertion(source, 6, 6, schematicJson());
    const updated = source.slice(0, insertion.from) + insertion.insert + source.slice(insertion.to);

    expect(updated.startsWith("before\n```json\n")).toBe(true);
    expect(updated.endsWith("```\nafter")).toBe(true);
    const projection = parseSchematicFence(updated, insertion.fenceFrom, insertion.fenceTo);
    expect(projection?.kind).toBe("schematic");
    expect(projection?.map).toMatchObject({
      from: insertion.fenceFrom,
      to: insertion.fenceTo
    });
  });

  it("uses the document newline convention for inserted fences", () => {
    const source = "before\r\nafter";
    const insertion = projectSchematicFenceInsertion(source, source.length, source.length, schematicJson());

    expect(insertion.insert).not.toMatch(/(^|[^\r])\n/);
    expect(insertion.insert.replace(/\r\n/g, "")).not.toContain("\r");
    const updated = source + insertion.insert;
    expect(parseSchematicFence(updated, insertion.fenceFrom, insertion.fenceTo)?.kind).toBe("schematic");
  });

  it("adds only the line boundaries needed at start, end, and existing line breaks", () => {
    const canonical = schematicJson().replace(/\n$/, "");
    const fence = `\`\`\`json\n${canonical}\n\`\`\``;

    const atStart = projectSchematicFenceInsertion("after", 0, 0, schematicJson());
    expect(applyInsertion("after", atStart)).toBe(`${fence}\nafter`);

    const atEnd = projectSchematicFenceInsertion("before", 6, 6, schematicJson());
    expect(applyInsertion("before", atEnd)).toBe(`before\n${fence}\n`);

    const source = "before\nafter";
    const beforeExistingNewline = projectSchematicFenceInsertion(source, 6, 6, schematicJson());
    const afterExistingNewline = projectSchematicFenceInsertion(source, 7, 7, schematicJson());
    const expected = `before\n${fence}\nafter`;
    expect(applyInsertion(source, beforeExistingNewline)).toBe(expected);
    expect(applyInsertion(source, afterExistingNewline)).toBe(expected);
    expect(beforeExistingNewline.insert.endsWith("```")).toBe(true);
    expect(afterExistingNewline.insert.endsWith("```\n")).toBe(true);
  });

  it("preserves content outside an inline selection and replaces only the selection", () => {
    const source = "left selected text right";
    const from = source.indexOf("selected");
    const to = from + "selected text".length;
    const insertion = projectSchematicFenceInsertion(source, from, to, schematicJson());
    const updated = applyInsertion(source, insertion);

    expect(updated.startsWith("left \n```json\n")).toBe(true);
    expect(updated.endsWith("```\n right")).toBe(true);
    expect(updated).not.toContain("selected text");
    const projection = parseSchematicFence(updated, insertion.fenceFrom, insertion.fenceTo);
    expect(projection?.kind).toBe("schematic");
    expect(projection?.map).toMatchObject({
      from: insertion.fenceFrom,
      to: insertion.fenceTo
    });
  });

  it("makes the activation range equal the parsed fence range in LF and CRLF documents", () => {
    const cases = [
      { source: "", from: 0, to: 0 },
      { source: "alpha\nomega", from: 5, to: 5 },
      { source: "alpha\nomega", from: 6, to: 6 },
      { source: "alpha\r\nomega", from: 5, to: 5 },
      { source: "alpha\r\nomega", from: 7, to: 7 }
    ];

    cases.forEach(({ source, from, to }) => {
      const insertion = projectSchematicFenceInsertion(source, from, to, schematicJson());
      const updated = applyInsertion(source, insertion);
      const projection = parseSchematicFence(updated, insertion.fenceFrom, insertion.fenceTo);
      expect(projection?.kind).toBe("schematic");
      expect(projection?.map.from).toBe(insertion.fenceFrom);
      expect(projection?.map.to).toBe(insertion.fenceTo);
    });
  });

  it("rejects ranges that split an existing CRLF line ending", () => {
    expect(() => projectSchematicFenceInsertion("left\r\nright", 5, 5, schematicJson()))
      .toThrow(/must not split a CRLF/);
  });
});

function applyInsertion(
  source: string,
  insertion: ReturnType<typeof projectSchematicFenceInsertion>
) {
  return source.slice(0, insertion.from) + insertion.insert + source.slice(insertion.to);
}
