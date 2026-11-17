import { MarkdownNoteRuntime } from "./markdownNoteRuntime";
import type { SchematicNoteRuntimeAdapter } from "./noteRuntimeAdapter";

export const webMarkdownNoteRuntimeAdapter: SchematicNoteRuntimeAdapter = {
  create: (options) => MarkdownNoteRuntime.create(options)
};
