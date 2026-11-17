import { resolveRazaviComponentVisualModel, type ComponentVisualOptions } from "./razaviComponentVisualModel";
import { resolveSymbolTemplate, type SymbolTemplateId } from "./symbolTemplateModel";
import type { ComponentInstance } from "./types";

// Templates own appearance; catalog pins and the shared layout frame are imposed
// by componentVisualModel so changing templates cannot change wire attachments.
export type SymbolTemplateAppearance = Omit<ReturnType<typeof resolveRazaviComponentVisualModel>,
  "def" | "frameBox" | "visiblePinIds">;
export type SymbolTemplateRenderer = (instance: ComponentInstance, options: ComponentVisualOptions) => SymbolTemplateAppearance;

const RENDERERS: Partial<Record<SymbolTemplateId, SymbolTemplateRenderer>> = {
  razavi: resolveRazaviComponentVisualModel
};

export function getSymbolTemplateRenderer(templateId?: SymbolTemplateId): SymbolTemplateRenderer {
  const template = resolveSymbolTemplate(templateId);
  const renderer = RENDERERS[template.id];
  if (!renderer) throw new Error(`Symbol template ${template.label} has no renderer.`);
  return renderer;
}
