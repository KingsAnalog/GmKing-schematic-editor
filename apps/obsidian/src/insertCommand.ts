import type { Editor } from "obsidian";
import {
  projectSchematicFenceInsertion,
  type SchematicFenceInsertion
} from "./fence";

type SchematicInsertionEditor = Pick<
  Editor,
  "getCursor" | "getValue" | "offsetToPos" | "posToOffset" | "replaceRange"
>;

export function insertSchematicFenceAtSelection(
  editor: SchematicInsertionEditor,
  canonical: string,
  queueAutoActivation: (from: number, to: number) => void
): SchematicFenceInsertion {
  const selectionFrom = editor.posToOffset(editor.getCursor("from"));
  const selectionTo = editor.posToOffset(editor.getCursor("to"));
  const insertion = projectSchematicFenceInsertion(
    editor.getValue(),
    selectionFrom,
    selectionTo,
    canonical
  );

  queueAutoActivation(insertion.fenceFrom, insertion.fenceTo);
  editor.replaceRange(
    insertion.insert,
    editor.offsetToPos(insertion.from),
    editor.offsetToPos(insertion.to),
    "schematic-editor-insert"
  );
  return insertion;
}
