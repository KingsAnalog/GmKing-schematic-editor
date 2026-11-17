import { line, path, SYMBOL_STROKE_WIDTH } from "./symbolPrimitives";

export function quantizerThresholdBarsSymbol(
  width: number,
  height: number,
  levels: number,
  lineWidth = SYMBOL_STROKE_WIDTH,
  offsetX = 0
) {
  const normalizedLevels = Math.max(0, Math.min(12, Math.round(levels)));
  const cx = width / 2;
  const cy = height / 2;
  const spineX = cx - 2 * lineWidth + offsetX;
  const halfBarWidth = 4 * lineWidth;
  const halfSpineLength = 6 * lineWidth;
  const topY = cy - halfSpineLength;
  const bottomY = cy + halfSpineLength;
  const leftX = spineX - halfBarWidth;
  const rightX = spineX + halfBarWidth;
  const commands = [
    line(spineX, topY, spineX, bottomY),
    line(spineX, topY, rightX, topY)
  ];
  for (let index = 1; index <= normalizedLevels; index += 1) {
    const y = topY + (index * (bottomY - topY)) / (normalizedLevels + 1);
    commands.push(line(leftX, y, rightX, y));
  }
  commands.push(line(leftX, bottomY, spineX, bottomY));
  return path(commands);
}

export function quantizerTransferStaircaseSymbol(
  width: number,
  height: number,
  lineWidth = SYMBOL_STROKE_WIDTH,
  levels = 4,
  compact = false
) {
  const cx = width / 2;
  const cy = height / 2;
  const normalizedLevels = Number.isInteger(levels) && levels >= 2 && levels <= 32
    ? levels
    : 4;
  const halfWidth = 6 * lineWidth;
  const halfHeight = (compact ? 3 : 4.5) * lineWidth;
  const centerY = cy + (compact ? 2 * lineWidth : 0);
  const leftX = cx - halfWidth;
  const segmentWidth = 2 * halfWidth / normalizedLevels;
  const levelY = (index: number) =>
    centerY + halfHeight - index * (2 * halfHeight / (normalizedLevels - 1));
  const commands = [`M ${leftX} ${levelY(0)}`];

  for (let index = 0; index < normalizedLevels; index += 1) {
    const nextX = leftX + (index + 1) * segmentWidth;
    commands.push(`L ${nextX} ${levelY(index)}`);
    if (index < normalizedLevels - 1) {
      commands.push(`L ${nextX} ${levelY(index + 1)}`);
    }
  }
  return commands.join(" ");
}
