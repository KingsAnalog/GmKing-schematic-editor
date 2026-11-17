import type { Editor } from "obsidian";
import { describe, expect, it } from "vitest";
import {
  createEmptySchematicContent,
  serializeSchematicContent
} from "@edahelper/schematic/core";
import { parseSchematicFence } from "../src/fence";
import { insertSchematicFenceAtSelection } from "../src/insertCommand";

describe("Obsidian Insert schematic command", () => {
  it("queues the projected fence before replacing an inline selection", () => {
    let source = "left selected right";
    const from = source.indexOf("selected");
    const to = from + "selected".length;
    const calls: string[] = [];
    const queued: Array<{ from: number; to: number }> = [];
    const editor = {
      getCursor(which: "from" | "to") {
        return { line: 0, ch: which === "from" ? from : to };
      },
      getValue() {
        return source;
      },
      posToOffset(position: { ch: number }) {
        return position.ch;
      },
      offsetToPos(offset: number) {
        return { line: 0, ch: offset };
      },
      replaceRange(
        insert: string,
        start: { ch: number },
        end: { ch: number },
        origin: string
      ) {
        calls.push(`replace:${origin}`);
        source = source.slice(0, start.ch) + insert + source.slice(end.ch);
      }
    } as unknown as Pick<
      Editor,
      "getCursor" | "getValue" | "offsetToPos" | "posToOffset" | "replaceRange"
    >;

    const insertion = insertSchematicFenceAtSelection(
      editor,
      serializeSchematicContent(createEmptySchematicContent()),
      (queueFrom, queueTo) => {
        calls.push("queue");
        queued.push({ from: queueFrom, to: queueTo });
      }
    );

    expect(calls).toEqual(["queue", "replace:schematic-editor-insert"]);
    expect(queued).toEqual([{ from: insertion.fenceFrom, to: insertion.fenceTo }]);
    expect(source).toMatch(/^left \n```json\n/);
    expect(source).toMatch(/```\n right$/);
    const projection = parseSchematicFence(source, queued[0].from, queued[0].to);
    expect(projection?.kind).toBe("schematic");
    expect(projection?.map).toMatchObject(queued[0]);
  });
});
