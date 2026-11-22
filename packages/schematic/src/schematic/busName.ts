export const SCALAR_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const MAX_BUS_WIDTH = 256;

export function parseBusName(name: string) {
  const match = /^([A-Za-z_][A-Za-z0-9_]{0,63})<(\d{1,6})(?::(\d{1,6}))?>$/.exec(name);
  if (!match) return null;
  const [, base, firstText, lastText] = match;
  const first = Number(firstText);
  const last = lastText === undefined ? first : Number(lastText);
  const width = Math.abs(first - last) + 1;
  if (width > MAX_BUS_WIDTH) return null;
  const step = first <= last ? 1 : -1;
  return {
    name: width === 1 ? `${base}<${first}>` : `${base}<${first}:${last}>`,
    bits: Array.from({ length: width }, (_unused, offset) => `${base}<${first + step * offset}>`)
  };
}

export function netMembers(name: string) {
  return parseBusName(name)?.bits ?? [name];
}

export function isPortName(name: string) {
  return SCALAR_IDENTIFIER.test(name) || parseBusName(name) !== null;
}

export function hasUniquePortNames(names: Iterable<string>) {
  const bits = new Set<string>();
  for (const name of names) {
    for (const bit of netMembers(name)) {
      if (bits.has(bit)) return false;
      bits.add(bit);
    }
  }
  return true;
}
