import { fixtureDocument } from "../support/fixtureDocument";
import { describe, expect, it } from "vitest";
import { readSchematicDocumentFromClipboard } from "../../../src/schematic/schematicClipboard";
import { contentFromDocument } from "../../../src/schematic/document/documentModel";

const validSchematicJson = JSON.stringify({
  format: "adc-helper/schematic",
  schematic: contentFromDocument(fixtureDocument({
    components: [],
    wires: [],

    junctionAppearances: [],
    netLabels: [],
    notes: [{
      id: "note-clipboard",
      x: 20,
      y: 40,
      width: 160,
      format: "plain",
      text: "clipboard"
    }]
  }))
});

const validSchematic = (JSON.parse(validSchematicJson) as {
  schematic: Record<string, unknown>;
}).schematic;

function clipboardText(source: string) {
  return {
    async readText() {
      return source;
    }
  };
}

describe("readSchematicDocumentFromClipboard", () => {
  it("rejects when the text clipboard API is unavailable", async () => {
    await expect(readSchematicDocumentFromClipboard(null)).rejects.toThrow(
      "Text clipboard is not available."
    );
  });

  it("preserves clipboard permission failures", async () => {
    const deniedClipboard = {
      async readText(): Promise<string> {
        throw new Error("Read permission denied.");
      }
    };

    await expect(readSchematicDocumentFromClipboard(deniedClipboard)).rejects.toThrow(
      "Read permission denied."
    );
  });

  it("rejects empty clipboard text before parsing", async () => {
    await expect(readSchematicDocumentFromClipboard(clipboardText(" \r\n\t "))).rejects.toThrow(
      "The clipboard does not contain schematic JSON."
    );
  });

  it("parses a current schematic envelope through the file codec", async () => {
    const document = await readSchematicDocumentFromClipboard(clipboardText(validSchematicJson));

    expect(document).toMatchObject(fixtureDocument({
      components: [],
      wires: [],

      junctionAppearances: [],
      netLabels: [],
      notes: [{
        id: "note-clipboard",
        x: 20,
        y: 40,
        width: 160,
        format: "plain",
        text: "clipboard"
      }],
      junctions: []
    }));
  });

  it("reports malformed JSON with the file codec error", async () => {
    await expect(readSchematicDocumentFromClipboard(clipboardText("{not json"))).rejects.toMatchObject({
      name: "SchematicDocumentFileError",
      code: "invalid-json"
    });
  });

  it.each([
    [
      "wrong format",
      {
        format: "other/schematic",
        schematic: validSchematic
      },
      "invalid-format"
    ],
    [
      "unexpected envelope field",
      {
        format: "adc-helper/schematic",
        version: 3,
        schematic: validSchematic
      },
      "invalid-schema"
    ],
    [
      "wrong schema",
      {
        format: "adc-helper/schematic",
        schematic: {
          components: [],
          wires: []
        }
      },
      "invalid-schema"
    ]
  ])("rejects a %s envelope", async (_case, value, code) => {
    await expect(
      readSchematicDocumentFromClipboard(clipboardText(JSON.stringify(value)))
    ).rejects.toMatchObject({
      name: "SchematicDocumentFileError",
      code
    });
  });
});
