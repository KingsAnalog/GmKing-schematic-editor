import { SYMBOL_GRID_SIZE, type PinDef, type PinRole } from "./types";

export const BOXED_COMPONENT_LEAD_GRID = 1;

export type BoxedComponentSide = "left" | "right" | "top" | "bottom";

export interface BoxedComponentSize {
  width: number;
  height: number;
}

export interface BoxedComponentBodyBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface BoxedHorizontalPinOptions {
  inputId?: string;
  inputLabel?: string;
  inputRole?: PinRole;
  outputId?: string;
  outputLabel?: string;
  outputRole?: PinRole;
}

export function boxedComponentSize(
  bodyWidthGrid: number,
  bodyHeightGrid: number,
  leadGrid = BOXED_COMPONENT_LEAD_GRID
): BoxedComponentSize {
  return {
    width: (normalizeGridSpan(bodyWidthGrid) + 2 * normalizeGridSpan(leadGrid)) * SYMBOL_GRID_SIZE,
    height: (normalizeGridSpan(bodyHeightGrid) + 2 * normalizeGridSpan(leadGrid)) * SYMBOL_GRID_SIZE
  };
}

export function boxedComponentBodyBounds(
  width: number,
  height: number,
  inset = BOXED_COMPONENT_LEAD_GRID * SYMBOL_GRID_SIZE
): BoxedComponentBodyBounds {
  const normalizedInset = Math.max(0, finite(inset));
  const left = normalizedInset;
  const top = normalizedInset;
  const right = Math.max(left, finite(width) - normalizedInset);
  const bottom = Math.max(top, finite(height) - normalizedInset);
  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top
  };
}

export function boxedComponentPinPoint(
  size: BoxedComponentSize,
  side: BoxedComponentSide,
  offset = 0
) {
  const halfWidth = size.width / 2;
  const halfHeight = size.height / 2;
  if (side === "left") return { x: -halfWidth, y: offset };
  if (side === "right") return { x: halfWidth, y: offset };
  if (side === "top") return { x: offset, y: -halfHeight };
  return { x: offset, y: halfHeight };
}

export function boxedHorizontalPins(
  size: BoxedComponentSize,
  options: BoxedHorizontalPinOptions = {}
): PinDef[] {
  const input = boxedComponentPinPoint(size, "left");
  const output = boxedComponentPinPoint(size, "right");
  return [
    {
      id: options.inputId ?? "in",
      label: options.inputLabel ?? "Input",
      role: options.inputRole ?? "in",
      ...input
    },
    {
      id: options.outputId ?? "out",
      label: options.outputLabel ?? "Output",
      role: options.outputRole ?? "out",
      ...output
    }
  ];
}

function normalizeGridSpan(value: number) {
  return Math.max(0, Math.ceil(finite(value)));
}

function finite(value: number) {
  return Number.isFinite(value) ? value : 0;
}
