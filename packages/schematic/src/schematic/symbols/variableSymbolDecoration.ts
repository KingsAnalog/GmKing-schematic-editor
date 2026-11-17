import { line, SYMBOL_STROKE_WIDTH } from "./symbolPrimitives";

export function variableSymbolArrowShaftSymbol(
  width: number,
  height: number,
  lineWidth = SYMBOL_STROKE_WIDTH,
  tailOffset = 9
) {
  const geometry = variableSymbolArrowGeometry(width, height, lineWidth, tailOffset);
  return line(geometry.start.x, geometry.start.y, geometry.baseCenter.x, geometry.baseCenter.y);
}

export function variableSymbolArrowMarkerSymbol(
  width: number,
  height: number,
  lineWidth = SYMBOL_STROKE_WIDTH
) {
  const geometry = variableSymbolArrowGeometry(width, height, lineWidth);
  return `M ${geometry.tip.x} ${geometry.tip.y} L ${geometry.baseA.x} ${geometry.baseA.y} L ${geometry.baseB.x} ${geometry.baseB.y} Z`;
}

export function variableSymbolArrowHeadSize(lineWidth = SYMBOL_STROKE_WIDTH) {
  return { base: 6 * lineWidth, height: 12 * lineWidth };
}

function variableSymbolArrowGeometry(width: number, height: number, lineWidth: number, tailOffset = 9) {
  const cx = width / 2;
  const cy = height / 2;
  const start = { x: cx - tailOffset * lineWidth, y: cy + tailOffset * lineWidth };
  const tip = { x: cx + 9 * lineWidth, y: cy - 9 * lineWidth };
  const inverseSqrtTwo = Math.SQRT1_2;
  const headSize = variableSymbolArrowHeadSize(lineWidth);
  const baseCenter = {
    x: tip.x - headSize.height * inverseSqrtTwo,
    y: tip.y + headSize.height * inverseSqrtTwo
  };
  const perpendicular = {
    x: (headSize.base / 2) * inverseSqrtTwo,
    y: (headSize.base / 2) * inverseSqrtTwo
  };
  return {
    start,
    tip,
    baseCenter,
    baseA: { x: baseCenter.x - perpendicular.x, y: baseCenter.y - perpendicular.y },
    baseB: { x: baseCenter.x + perpendicular.x, y: baseCenter.y + perpendicular.y }
  };
}
