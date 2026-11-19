import {
  querySchematicEditorMountElements,
  type SchematicEditorMountElements
} from "./schematicTabShell";
export type {
  SchematicEditorHandle,
  SchematicEditorHistoryMode,
  SchematicEditorMutationOptions,
  SchematicEditorState,
  SchematicEditorStateListener
} from "./editorHandle";
import type { SchematicEditorHandle } from "./editorHandle";
import { SchematicLayoutController } from "./schematicLayoutController";

export type SchematicEditorLifecycle = Pick<SchematicEditorHandle, "init" | "destroy">;

export type SchematicEditorFactory<Editor extends SchematicEditorLifecycle> = (mountElements: SchematicEditorMountElements) => Editor;

export function mountSchematicEditorFacade<Editor extends SchematicEditorLifecycle>(
  root: HTMLElement,
  createEditor: SchematicEditorFactory<Editor>
) {
  const mountElements = querySchematicEditorMountElements(root);
  if (!mountElements) return null;
  const layout = canMountLayout(mountElements.shellEl)
    ? new SchematicLayoutController(mountElements.shellEl)
    : null;
  let editor: Editor | null = null;
  try {
    editor = createEditor(mountElements);
    const destroyEditor = editor.destroy.bind(editor);
    let destroyResult: ReturnType<Editor["destroy"]> | undefined;
    let destroyed = false;
    editor.destroy = () => {
      if (destroyed) return destroyResult;
      destroyed = true;
      try {
        destroyResult = destroyEditor() as ReturnType<Editor["destroy"]>;
        return destroyResult;
      } finally {
        layout?.destroy();
      }
    };
    layout?.init();
    editor.init();
    return editor;
  } catch (error) {
    void editor?.destroy();
    layout?.destroy();
    throw error;
  }
}

function canMountLayout(element: HTMLElement) {
  return typeof element.addEventListener === "function" && !!element.ownerDocument;
}
