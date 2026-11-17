import type { ComponentInstance, ComponentType } from "./types";

export const MOS_THICK_GATE_VALUE_KEY = "mosThickGate";
export const MOS_THICK_GATE_SYMBOL_SUFFIX = "-thick-gate";

export function mosThickGate(instance: Pick<ComponentInstance, "type" | "values">) {
  return isMosComponentType(instance.type) && instance.values[MOS_THICK_GATE_VALUE_KEY] === "true";
}

export function setMosThickGate(instance: Pick<ComponentInstance, "type" | "values">, thick: boolean) {
  if (!isMosComponentType(instance.type)) return { kind: "noop", reason: "unsupported" };
  if (mosThickGate(instance) === thick) return { kind: "noop", reason: "unchanged" };
  if (thick) instance.values[MOS_THICK_GATE_VALUE_KEY] = "true";
  else delete instance.values[MOS_THICK_GATE_VALUE_KEY];
  return { kind: "changed" };
}

export type MosComponentType = Extract<ComponentType, "nmos" | "pmos">;
export type MosPinView = "3pin" | "4pin";
export type MosArrowView = "none" | "current" | "bulk";
export type MosViewStyleId = "current" | "bulk" | "gate" | "gate-current" | "gate-bulk";

export interface MosViewSettings {
  pins: MosPinView;
  gateStyle: boolean;
  arrow: MosArrowView;
}

export const MOS_PIN_VIEWS: readonly MosPinView[] = ["3pin", "4pin"];
export const MOS_VIEW_STYLES = [
  { id: "current", label: "source arrow", gateStyle: false, arrow: "current" },
  { id: "bulk", label: "bulk arrow", gateStyle: false, arrow: "bulk" },
  { id: "gate", label: "gate style", gateStyle: true, arrow: "none" },
  { id: "gate-current", label: "gate style + source arrow", gateStyle: true, arrow: "current" },
  { id: "gate-bulk", label: "gate style + bulk arrow", gateStyle: true, arrow: "bulk" }
] as const satisfies ReadonlyArray<{ id: MosViewStyleId; label: string; gateStyle: boolean; arrow: MosArrowView }>;

export const DEFAULT_MOS_VIEW_SETTINGS: Readonly<MosViewSettings> = settingsForStyle("3pin", MOS_VIEW_STYLES[0]);

export function isMosComponentType(type: ComponentType): type is MosComponentType {
  return type === "nmos" || type === "pmos";
}

export function normalizeMosViewSettings(settings: MosViewSettings): MosViewSettings {
  const pins = settings.pins === "4pin" ? "4pin" : "3pin";
  const gateStyle = !!settings.gateStyle;
  const arrow = settings.arrow === "bulk" || settings.arrow === "none" ? settings.arrow : "current";
  return { pins, gateStyle, arrow: !gateStyle && arrow === "none" ? "current" : arrow };
}

export function mosViewVariantId(settings: MosViewSettings): string {
  const normalized = normalizeMosViewSettings(settings);
  return `${normalized.pins}-${findMosViewStyle(normalized).id}`;
}

export const DEFAULT_MOS_VIEW_VARIANT_ID = mosViewVariantId(DEFAULT_MOS_VIEW_SETTINGS);

export function parseMosViewVariantId(variantId: string | undefined): MosViewSettings | null {
  if (!variantId) return null;
  const separatorIndex = variantId.indexOf("-");
  const pins = variantId.slice(0, separatorIndex);
  if (pins !== "3pin" && pins !== "4pin") return null;
  const style = MOS_VIEW_STYLES.find((candidate) => candidate.id === variantId.slice(separatorIndex + 1));
  return style ? settingsForStyle(pins, style) : null;
}

export function mosViewLabel(settings: MosViewSettings): string {
  const normalized = normalizeMosViewSettings(settings);
  const pinLabel = normalized.pins === "3pin" ? "3-pin bulk hidden" : "4-pin bulk";
  return `${pinLabel}, ${findMosViewStyle(normalized).label}`;
}

function findMosViewStyle(settings: MosViewSettings) {
  return MOS_VIEW_STYLES.find((style) => style.gateStyle === settings.gateStyle && style.arrow === settings.arrow)
    ?? MOS_VIEW_STYLES[0];
}

function settingsForStyle(pins: MosPinView, style: typeof MOS_VIEW_STYLES[number]): MosViewSettings {
  return { pins, gateStyle: style.gateStyle, arrow: style.arrow };
}
