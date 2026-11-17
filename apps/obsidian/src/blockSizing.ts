import { renderSchematicDocumentSvg, type SchematicContent } from "@edahelper/schematic/core";

// This only caps the block height. Both renderers retain their existing fit behavior.
const HEIGHT_REFERENCE_ZOOM = 2;
export const SCHEMATIC_HEIGHT_LIMIT_PROPERTY = "--schematic-content-height-limit";

export function renderSchematicBlockSvg(content: SchematicContent, namespace: string) {
  return renderSchematicDocumentSvg(content, {
    namespace,
    presentationMode: true,
    showGrid: false,
    backgroundColor: "#ffffff"
  });
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
