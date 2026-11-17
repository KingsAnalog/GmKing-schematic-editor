export const MAX_SCHEMATIC_TAB_TITLE_LENGTH = 80;

export function uniqueSchematicTabTitle(
  requestedTitle: string,
  existingTitles: readonly string[]
) {
  const trimmed = requestedTitle.trim();
  if (!trimmed) return null;

  const base = trimmed.slice(0, MAX_SCHEMATIC_TAB_TITLE_LENGTH).trimEnd();
  const occupied = new Set(existingTitles);
  if (!occupied.has(base)) return base;

  for (let index = 2; ; index += 1) {
    const suffix = ` (${index})`;
    const prefix = base
      .slice(0, MAX_SCHEMATIC_TAB_TITLE_LENGTH - suffix.length)
      .trimEnd();
    const candidate = `${prefix}${suffix}`;
    if (!occupied.has(candidate)) return candidate;
  }
}
