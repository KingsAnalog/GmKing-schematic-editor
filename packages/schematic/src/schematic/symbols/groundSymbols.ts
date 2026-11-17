import { line, path, SYMBOL_STROKE_WIDTH } from "./symbolPrimitives";

export function groundSymbol(width: number, height: number) {
  return powerTerminalLeadSymbol(width, height, 1);
}

export function groundHorizontalSymbol(width: number, height: number) {
  return powerTerminalBarSymbol(width, height, 1, [44 / 3, 10, 16 / 3]);
}

export function vddSymbol(width: number, height: number) {
  return powerTerminalLeadSymbol(width, height, -1);
}

export function vddHorizontalSymbol(width: number, height: number) {
  return powerTerminalBarSymbol(width, height, -1, [44 / 3]);
}

function powerTerminalLeadSymbol(width: number, height: number, direction: 1 | -1) {
  const { cx, pinY, firstBarY } = powerTerminalGeometry(width, height, direction);
  return line(cx, pinY, cx, firstBarY);
}

function powerTerminalBarSymbol(width: number, height: number, direction: 1 | -1, halfWidths: readonly number[]) {
  const { cx, firstBarY } = powerTerminalGeometry(width, height, direction);
  const spacing = 2 * SYMBOL_STROKE_WIDTH + 2 * SYMBOL_STROKE_WIDTH;
  return path(halfWidths.map((halfWidth, index) => {
    const y = firstBarY + direction * index * spacing;
    return line(cx - halfWidth, y, cx + halfWidth, y);
  }));
}

function powerTerminalGeometry(width: number, height: number, direction: 1 | -1) {
  const cx = width / 2;
  const cy = height / 2;
  const pinY = cy - direction * 20;
  return { cx, pinY, firstBarY: pinY + direction * 18 };
}
