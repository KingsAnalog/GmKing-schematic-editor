import { circlePath, line, path, SYMBOL_STROKE_WIDTH } from "./symbolPrimitives";
import { spntPins, spntThrowY } from "../spntSwitchModel";

export function spntSwitchSymbol(width: number, height: number, count: number, position: number) {
  const cx = width / 2;
  const cy = height / 2;
  const radius = switchContactPathRadius();
  const commonX = cx - 16;
  const contactX = cx + 16;
  const pins = spntPins(count);
  return path([
    line(cx + pins[0].x, cy, commonX - radius, cy),
    circlePath(commonX, cy, radius),
    spntSwitchBladeSymbol(width, height, count, position),
    ...pins.slice(1).flatMap(pin => [
      circlePath(contactX, cy + pin.y, radius),
      line(contactX + radius, cy + pin.y, cx + pin.x, cy + pin.y)
    ])
  ]);
}

export function spntSwitchBladeSymbol(width: number, height: number, count: number, position: number) {
  const cx = width / 2;
  const cy = height / 2;
  const radius = switchContactPathRadius();
  const commonX = cx - 16;
  const contactX = cx + 16;
  // Position zero leaves a visible gap to every throw, including odd-count center contacts.
  const targetX = position === 0 ? cx + 4 : contactX;
  const targetY = position === 0 ? cy - 10 : cy + spntThrowY(count, position - 1);
  const dx = targetX - commonX;
  const dy = targetY - cy;
  const length = Math.hypot(dx, dy);
  const ux = dx / length;
  const uy = dy / length;
  return line(commonX + ux * radius, cy + uy * radius,
    targetX - (position ? ux * radius : 0), targetY - (position ? uy * radius : 0));
}

export function switchSymbol(
  width: number,
  height: number,
  lineWidth = SYMBOL_STROKE_WIDTH,
  closed = false,
  showControlPin = false
) {
  const { cx, cy, leftPin, rightPin } = twoTerminalGeometry(width, height);
  const leftContactX = cx - 16;
  const rightContactX = cx + 16;
  const contactRadius = switchContactPathRadius(lineWidth);
  const leftContactPoint = { x: leftContactX - contactRadius, y: cy };
  const rightContactPoint = { x: rightContactX + contactRadius, y: cy };
  return path([
    line(leftPin, cy, leftContactPoint.x, leftContactPoint.y),
    line(rightContactPoint.x, rightContactPoint.y, rightPin, cy),
    switchBladeSymbol(width, height, lineWidth, closed),
    circlePath(leftContactX, cy, contactRadius),
    circlePath(rightContactX, cy, contactRadius),
    showControlPin ? line(cx, cy - 10 * lineWidth, cx, cy - 8 * lineWidth) : ""
  ]);
}

export function switchBladeSymbol(width: number, height: number, lineWidth = SYMBOL_STROKE_WIDTH, closed = false) {
  const { cx, cy } = twoTerminalGeometry(width, height);
  const bladeStart = closed
    ? switchClosedBladeStartPoint(cx - 16, cy, lineWidth)
    : switchBladeStartPoint(cx - 16, cy, lineWidth);
  const bladeEnd = closed
    ? switchClosedBladeEndpoint(cx + 16, cy, lineWidth)
    : switchBladeEndpoint(bladeStart.x, bladeStart.y, lineWidth);
  return line(bladeStart.x, bladeStart.y, bladeEnd.x, bladeEnd.y);
}

export function switchContactPathRadius(lineWidth = SYMBOL_STROKE_WIDTH) {
  return 2 * lineWidth;
}

export function switchBladeEndpoint(startX: number, startY: number, lineWidth = SYMBOL_STROKE_WIDTH) {
  const blade = switchBladeVector(lineWidth);
  return {
    x: startX + blade.dx,
    y: startY + blade.dy
  };
}

export function switchClosedBladeEndpoint(contactX: number, contactY: number, lineWidth = SYMBOL_STROKE_WIDTH) {
  const blade = switchBladeVector(lineWidth);
  const length = Math.hypot(blade.dx, blade.dy);
  const contactRadius = switchContactPathRadius(lineWidth);
  return {
    x: contactX - (blade.dx / length) * contactRadius,
    y: contactY + (blade.dy / length) * contactRadius
  };
}

export function switchClosedBladeStartPoint(contactX: number, contactY: number, lineWidth = SYMBOL_STROKE_WIDTH) {
  return { x: contactX + switchContactPathRadius(lineWidth), y: contactY };
}

export function switchBladeStartPoint(contactX: number, contactY: number, lineWidth = SYMBOL_STROKE_WIDTH) {
  const blade = switchBladeVector(lineWidth);
  const length = Math.hypot(blade.dx, blade.dy);
  const radius = switchContactPathRadius(lineWidth);
  return {
    x: contactX + (blade.dx / length) * radius,
    y: contactY + (blade.dy / length) * radius
  };
}

function switchBladeVector(lineWidth = SYMBOL_STROKE_WIDTH) {
  const originalDx = 29;
  const originalDy = -18;
  const length = Math.hypot(originalDx, originalDy) * (7 / 8);
  const fitHalfHeight = 20;
  const angle = Math.asin(Math.min(1, fitHalfHeight / (switchContactPathRadius(lineWidth) + length)));
  return {
    dx: length * Math.cos(angle),
    dy: -length * Math.sin(angle)
  };
}

function twoTerminalGeometry(width: number, height: number) {
  const cx = width / 2;
  const cy = height / 2;
  return { cx, cy, leftPin: cx - 40, rightPin: cx + 40 };
}
