import { renderSchematicDocumentSvg, type SchematicContent } from "@edahelper/schematic/core";
import { hasNoteMath, typesetNotesForExport } from "@edahelper/schematic/editor";
import { createSchematicSvgElement } from "@edahelper/schematic/viewer";

// This only caps the block height. Both renderers retain their existing fit behavior.
const HEIGHT_REFERENCE_ZOOM = 2;
export const SCHEMATIC_HEIGHT_LIMIT_PROPERTY = "--schematic-content-height-limit";

type NoteGraphics = Awaited<ReturnType<typeof typesetNotesForExport>>;

export function renderSchematicBlockSvg(content: SchematicContent, namespace: string, noteGraphics?: NoteGraphics) {
  return renderSchematicDocumentSvg(content, {
    namespace,
    presentationMode: true,
    showGrid: false,
    noteGraphics,
    backgroundColor: "#ffffff"
  });
}

export function renderSchematicBlockPreview(root: HTMLElement, container: HTMLElement, content: SchematicContent, namespace: string) {
  root.append(container);
  const draw = (noteGraphics?: NoteGraphics) => {
    if (!root.contains(container)) return;
    const rendering = renderSchematicBlockSvg(content, namespace, noteGraphics);
    updateSchematicBlockHeight(root, rendering);
    container.replaceChildren(createSchematicSvgElement(container.ownerDocument, rendering.svg));
  };
  draw();
  if (content.notes.some(note => hasNoteMath(note.text))) {
    void typesetNotesForExport(content.notes, root.ownerDocument, content.display?.textFont).then(draw).catch(() => {});
  }
}

export function updateSchematicBlockHeight(
  root: HTMLElement,
  rendering: ReturnType<typeof renderSchematicBlockSvg> | null
) {
  const previousHeight = root.clientHeight;
  if (rendering?.bounds) {
    // The viewBox already includes the renderer's margins and all visible labels/notes.
    root.style.setProperty(SCHEMATIC_HEIGHT_LIMIT_PROPERTY, `${Math.ceil(rendering.viewBox.height * HEIGHT_REFERENCE_ZOOM)}px`);
  } else {
    // Empty canvases retain the original working area.
    root.style.removeProperty(SCHEMATIC_HEIGHT_LIMIT_PROPERTY);
  }
  return root.clientHeight !== previousHeight;
}
