/**
 * System-only font stack: no webfont download, with CJK fallbacks.
 * Kept in sync with `--schematic-font-family` in schematic.css.
 */
export const SCHEMATIC_FONT_STACK =
  '"Inter", "Segoe UI", "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", Arial, Helvetica, sans-serif';

export const SCHEMATIC_MONO_FONT_STACK =
  'Consolas, "Cascadia Mono", "Courier New", monospace';

export const SCHEMATIC_TEXT_FONTS = ["sans", "serif", "mono"] as const;
export type SchematicTextFont = typeof SCHEMATIC_TEXT_FONTS[number];

const TEXT_FONT_STACKS: Record<SchematicTextFont, string> = {
  sans: SCHEMATIC_FONT_STACK,
  serif: 'Georgia, "Times New Roman", "Songti SC", SimSun, "Noto Serif CJK SC", serif',
  mono: 'Consolas, "Cascadia Mono", "Courier New", "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", monospace'
};

export function schematicTextFontStack(override?: SchematicTextFont, documentFont?: SchematicTextFont) {
  return TEXT_FONT_STACKS[override ?? documentFont ?? "sans"];
}

export function isSchematicTextFont(value: unknown): value is SchematicTextFont {
  return SCHEMATIC_TEXT_FONTS.some(font => font === value);
}
