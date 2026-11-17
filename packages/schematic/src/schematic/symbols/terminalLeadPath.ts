import type { PinDef, Point } from "../types";

/** Separate terminal-adjacent straight segments without changing the artwork.
 * Symbol builders emit absolute SVG commands; pin IDs/geometry remain catalog-owned.
 */
export function separateTerminalLeads(data: string, pins: readonly PinDef[], width: number, height: number) {
  const terminals = pins.map(pin => ({ x: width / 2 + pin.x, y: height / 2 + pin.y }));
  const isTerminal = (point: Point) => terminals.some(pin => Math.abs(pin.x - point.x) < 1e-6 && Math.abs(pin.y - point.y) < 1e-6);
  let point = { x: 0, y: 0 };
  let start = point;
  const body: string[] = [];
  const leads: string[] = [];
  for (const match of data.matchAll(/([MLHVCSQTAZ])([^MLHVCSQTAZ]*)/g)) {
    const [, command, args] = match;
    const numbers = args.match(/[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/gi)?.map(Number) ?? [];
    const next = command === "Z" ? start : command === "H" ? { x: numbers[0], y: point.y }
      : command === "V" ? { x: point.x, y: numbers[0] }
      : { x: numbers.at(-2)!, y: numbers.at(-1)! };
    if (command === "M") start = next;
    if (["L", "H", "V"].includes(command) && (isTerminal(point) || isTerminal(next))) {
      leads.push(`M ${point.x} ${point.y} L ${next.x} ${next.y}`);
      body.push(`M ${next.x} ${next.y}`);
    } else body.push(match[0].trim());
    point = next;
  }
  return { body: body.join(" "), leads: leads.join(" ") };
}
