import { normalizeHexColor } from "../shared/color";
import { pointKey, snapPoint } from "./geometry";
import type { JunctionAppearance, Point, SchematicDocument, Wire } from "./types";
import { compactWireAppearance } from "./wire/wireDecoration";

export const DEFAULT_NETWORK_COLOR = "#111111";

export type NetworkColorMutationResult =
  | { kind: "noop"; reason: "invalid" | "unchanged" | "missing" }
  | { kind: "changed"; color: string | null };

export function wireCustomColor(wire: Wire): string | null {
  const color = normalizeHexColor(wire.appearance?.color);
  return color && color !== DEFAULT_NETWORK_COLOR ? color : null;
}

export function wireColor(wire: Wire): string {
  return wireCustomColor(wire) ?? DEFAULT_NETWORK_COLOR;
}

export function junctionCustomColor(document: Pick<SchematicDocument, "junctionAppearances">, point: Point): string | null {
  const key = pointKey(snapPoint(point));
  const appearance = document.junctionAppearances.find(
    (candidate) => pointKey(snapPoint(candidate.point)) === key
  );
  const color = normalizeHexColor(appearance?.color);
  return color && color !== DEFAULT_NETWORK_COLOR ? color : null;
}

export function setWireColor(wire: Wire | undefined, value: string | null): NetworkColorMutationResult {
  if (!wire) return { kind: "noop", reason: "missing" };
  const nextColor = canonicalCustomColor(value);
  if (value !== null && nextColor === undefined) return { kind: "noop", reason: "invalid" };
  const canonicalColor = nextColor ?? null;
  if (wireCustomColor(wire) === canonicalColor) return { kind: "noop", reason: "unchanged" };

  wire.appearance = compactWireAppearance({
    ...wire.appearance,
    variant: wire.appearance?.variant ?? "signal",
    color: canonicalColor ?? undefined
  });
  return { kind: "changed", color: canonicalColor };
}

export function setJunctionColor(
  document: SchematicDocument,
  point: Point,
  value: string | null
): NetworkColorMutationResult {
  const nextColor = canonicalCustomColor(value);
  if (value !== null && nextColor === undefined) return { kind: "noop", reason: "invalid" };
  const canonicalColor = nextColor ?? null;
  const snapped = snapPoint(point);
  if (!document.junctions.some((junction) => pointKey(snapPoint(junction)) === pointKey(snapped))) {
    return { kind: "noop", reason: "missing" };
  }
  if (junctionCustomColor(document, snapped) === canonicalColor) return { kind: "noop", reason: "unchanged" };

  const key = pointKey(snapped);
  const retained = document.junctionAppearances.filter(
    (appearance) => pointKey(snapPoint(appearance.point)) !== key
  );
  if (canonicalColor) retained.push({ point: snapped, color: canonicalColor });
  document.junctionAppearances = retained;
  return { kind: "changed", color: canonicalColor };
}

export function normalizeWireColors(document: Pick<SchematicDocument, "wires">) {
  document.wires.forEach((wire) => {
    const variant = wire.appearance?.variant === "wide" ? "wide" : "signal";
    const color = wireCustomColor(wire);
    if (wire.appearance || color) {
      wire.appearance = compactWireAppearance({
        ...wire.appearance,
        variant,
        color: color ?? undefined
      });
    }
  });
}

export function normalizeJunctionAppearances(
  appearances: readonly JunctionAppearance[]
): JunctionAppearance[] {
  const normalized = new Map<string, JunctionAppearance>();
  appearances.forEach((appearance) => {
    const color = normalizeHexColor(appearance?.color);
    if (
      !color ||
      color === DEFAULT_NETWORK_COLOR ||
      !appearance?.point ||
      !Number.isFinite(appearance.point.x) ||
      !Number.isFinite(appearance.point.y)
    ) return;
    const point = snapPoint(appearance.point);
    normalized.set(pointKey(point), { point, color });
  });
  return Array.from(normalized.values());
}

export function pruneJunctionAppearances(document: Pick<SchematicDocument, "junctions" | "junctionAppearances">) {
  if (!document.junctionAppearances.length) return;
  const visibleKeys = new Set(document.junctions.map((point) => pointKey(snapPoint(point))));
  document.junctionAppearances = normalizeJunctionAppearances(
    document.junctionAppearances.filter((appearance) => visibleKeys.has(pointKey(snapPoint(appearance.point))))
  );
}

export function moveJunctionAppearances(
  document: Pick<SchematicDocument, "junctionAppearances">,
  movePoint: (point: Point) => Point,
  shouldMove: (point: Point) => boolean
) {
  if (!document.junctionAppearances.length) return;
  document.junctionAppearances = normalizeJunctionAppearances(
    document.junctionAppearances.map((appearance) => {
      const point = snapPoint(appearance.point);
      return shouldMove(point) ? { ...appearance, point: snapPoint(movePoint(point)) } : appearance;
    })
  );
}

function canonicalCustomColor(value: string | null): string | null | undefined {
  if (value === null) return null;
  const color = normalizeHexColor(value);
  if (!color) return undefined;
  return color === DEFAULT_NETWORK_COLOR ? null : color;
}
