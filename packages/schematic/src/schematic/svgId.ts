const ENCODED_SVG_ID_PREFIX = "schematic-u";

/**
 * Produces a collision-free SVG ID fragment while preserving ordinary readable IDs.
 * The reserved prefix prevents an encoded value from colliding with a literal ID.
 */
export function svgIdFragment(value: string) {
  if (
    /^[A-Za-z_][A-Za-z0-9_-]*$/.test(value)
    && !value.startsWith(ENCODED_SVG_ID_PREFIX)
  ) {
    return value;
  }

  const encoded = new TextEncoder()
    .encode(value)
    .reduce((hex, byte) => `${hex}${byte.toString(16).padStart(2, "0")}`, "");
  return `${ENCODED_SVG_ID_PREFIX}${encoded}`;
}
