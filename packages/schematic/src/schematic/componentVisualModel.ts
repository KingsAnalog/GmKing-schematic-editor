import { isLibraryShapeType } from "./libraryShapeStyleModel";
import { resolveComponentDef } from "./catalog";
import { componentScale } from "./componentScaleModel";
import { scaleComponentAppearance } from "./componentScaleVisualModel";
import { separateTerminalLeads } from "./symbols/terminalLeadPath";
import { getSymbolTemplateRenderer } from "./symbolTemplateRenderers";
import { hierarchyArtwork } from "./hierarchyArtwork";
import { componentLocalFrameBox } from "./view-geometry";
import type { ComponentInstance } from "./types";
import type { ComponentVisualOptions } from "./razaviComponentVisualModel";
import type { SymbolTemplateContext } from "./symbolTemplateModel";

export {
  splitComponentName, splitIndexedComponentName, ANALOG_BUFFER_LABEL_FONT_SIZE,
  REF_LABEL_FONT_SIZE, REF_LABEL_TAIL_FONT_SIZE,
  RECTANGLE_REF_LABEL_FONT_SIZE, RECTANGLE_REF_LABEL_TAIL_FONT_SIZE
} from "./razaviComponentVisualModel";

export interface ComponentRenderOptions extends ComponentVisualOptions, SymbolTemplateContext {}

/** One document-local appearance dispatch for editor, preview, viewer and export. */
export function resolveComponentVisualModel(instance: ComponentInstance, options: ComponentRenderOptions = {}) {
  const scale = componentScale(instance);
  const baseInstance = scale === 1 ? instance : { ...instance, scale: 1 as const };
  const baseDef = resolveComponentDef(baseInstance);
  const base = { ...getSymbolTemplateRenderer(options.symbolTemplate)(baseInstance, options), def: baseDef,
    frameBox: componentLocalFrameBox(baseInstance), visiblePinIds: new Set(baseDef.pins.map(pin => pin.id)) };
  const hierarchy = hierarchyArtwork(baseInstance);
  if (hierarchy) {
    base.path = hierarchy.path;
    base.symbolFill = hierarchy.fill === "currentColor" ? base.color : "none";
    base.symbolContentLayout = hierarchy.content;
    base.showSymbolLabel = false;
    if (instance.type === "sheetPort") base.showRefLabel = false;
  }
  const def = resolveComponentDef(instance);
  const frameBox = componentLocalFrameBox(instance);
  const appearance = scaleComponentAppearance(base, instance, def, frameBox, scale, options.flipReferenceLabelSide);
  let terminalLeadPath = "";
  if (scale !== 1) {
    for (const key of ["path", "accentPath", "pinMarksPath"] as const) {
      const separated = separateTerminalLeads(appearance[key], base.def.pins, base.def.size.width, base.def.size.height);
      appearance[key] = separated.body;
      terminalLeadPath += " " + separated.leads;
    }
  }
  return {
    ...appearance,
    artworkScale: scale,
    terminalLeadPath: isLibraryShapeType(instance.type)
      ? ""
      : terminalLeadPath.trim(),
    def,
    frameBox,
    visiblePinIds: isLibraryShapeType(instance.type)
      ? new Set<string>()
      : new Set(def.pins.map(pin => pin.id))
  };
}
