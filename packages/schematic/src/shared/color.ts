export interface ColorPreset {
  name: string;
  color: string;
}

export const PAPER_COLOR_PRESETS: readonly ColorPreset[] = [
  { name: "Red", color: "#ff0000" },
  { name: "Blue", color: "#0000ff" },
  { name: "Green", color: "#008000" },
  { name: "Purple", color: "#800080" },
  { name: "White", color: "#ffffff" },
  { name: "IEEE blue", color: "#0072b2" },
  { name: "Vermilion", color: "#d55e00" },
  { name: "Bluish green", color: "#009e73" },
  { name: "Reddish purple", color: "#cc79a7" },
  { name: "Sky blue", color: "#56b4e9" },
  { name: "Orange", color: "#e69f00" },
  { name: "Black", color: "#111111" },
  { name: "Gray", color: "#a0a0a0" }
];

export const NOTE_BACKGROUND_COLOR_PRESETS: readonly ColorPreset[] = [
  { name: "Light yellow", color: "#ffffe8" },
  { name: "Light orange", color: "#fef3c7" },
  { name: "Light green", color: "#dcfce7" },
  { name: "Light blue", color: "#dbeafe" },
  { name: "Light pink", color: "#fce7f3" },
  { name: "Light gray", color: "#f3f4f6" },
  ...PAPER_COLOR_PRESETS
];

export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
}

export function normalizeHexColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return isHexColor(trimmed) ? trimmed.toLowerCase() : null;
}
