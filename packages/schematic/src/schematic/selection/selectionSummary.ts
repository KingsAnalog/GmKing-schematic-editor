import type { ComponentInstance, NetLabel, Point, SchematicNote, Wire, WireVariant } from "../types";
import type { ToolMode } from "../toolState";

export type SelectionSummaryMode = ToolMode;
export type SelectionMoveBehavior = "stretch" | "moveOnly";

export type SchematicSelectionSummaryPlacement =
  | { kind: "invalid" }
  | { kind: "component"; hotLabel: string; label: string }
  | { kind: "template"; id: string };

export type SchematicSelectionSummarySelectionItem =
  | { kind: "component"; component: Pick<ComponentInstance, "ref" | "temporarilyDeleted"> }
  | { kind: "inductor-coupling"; coupling: { firstRef: string; secondRef: string } }
  | { kind: "wire"; wire: Pick<Wire, "appearance" | "temporarilyDeleted"> }
  | { kind: "junction"; point: Point }
  | { kind: "net-label"; label: Pick<NetLabel, "name"> }
  | { kind: "unknown"; id: string };

export interface SchematicSelectionContents {
  items: SchematicSelectionSummarySelectionItem[];
  notes: Pick<SchematicNote, "x" | "y">[];
}

export interface SchematicSelectionSummaryPart {
  text: string;
  muted?: boolean;
}

export type SchematicSelectionSummary =
  | { kind: "plain"; text: string }
  | { kind: "labeled"; title: string; separator: "space" | "comma"; parts: SchematicSelectionSummaryPart[] };

export interface SchematicSelectionSummaryInput {
  mode: SelectionSummaryMode;
  selection: SchematicSelectionContents;
  placement?: SchematicSelectionSummaryPlacement | null;
  wire?: {
    variant: WireVariant;
    routePointCount: number;
  };
  copy?: {
    hasSource: boolean;
  };
  move?: { behavior: SelectionMoveBehavior; hasSource: boolean };
}

export interface SchematicSelectionStatusInput {
  selection: SchematicSelectionContents;
  moveBehavior: SelectionMoveBehavior;
}

export function buildSchematicSelectionSummary(input: SchematicSelectionSummaryInput): SchematicSelectionSummary {
  if (input.mode === "place") return buildPlacementSummary(input.placement ?? { kind: "invalid" });
  if (input.mode === "wire") return buildWireToolSummary(input.wire ?? { variant: "signal", routePointCount: 0 });
  if (input.mode === "copy") return toolSummary("Copy", input.copy?.hasSource ? "click to place" : "click an object or drag a box");
  if (input.mode === "rotate") return toolSummary("Rotate", input.move?.hasSource ? "click to place" : "click a component");
  if (input.mode === "move") {
    return toolSummary(input.move?.behavior === "moveOnly" ? "Move only" : "Stretch move",
      input.move?.hasSource ? "click to place" : "click an object or drag a box");
  }
  if (input.mode === "label") return toolSummary("Label", "enter a name, then click a wire");
  if (input.mode === "delete") return toolSummary("Delete", "click or drag a box");
  if (input.mode === "temp-delete") return toolSummary("Temporary Delete", "click or drag a box");

  if (isSelectionEmpty(input.selection)) return { kind: "plain", text: "No object selected." };

  return {
    kind: "labeled",
    title: "Selected:",
    separator: "comma",
    parts: selectionLabels(input.selection).map((text) => ({ text }))
  };
}

export function buildSchematicSelectionStatus(input: SchematicSelectionStatusInput) {
  if (isSelectionEmpty(input.selection)) return "Selection cleared.";

  const componentNames = input.selection.items
    .filter((item): item is Extract<SchematicSelectionSummarySelectionItem, { kind: "component" }> => item.kind === "component")
    .map((item) => item.component.ref);
  const unknownNames = input.selection.items
    .filter((item): item is Extract<SchematicSelectionSummarySelectionItem, { kind: "unknown" }> => item.kind === "unknown")
    .map((item) => item.id);
  const couplingNames = input.selection.items
    .filter((item): item is Extract<SchematicSelectionSummarySelectionItem, { kind: "inductor-coupling" }> =>
      item.kind === "inductor-coupling"
    )
    .map((item) => `coupling ${item.coupling.firstRef}-${item.coupling.secondRef}`);
  const wireCount = input.selection.items.filter((item) => item.kind === "wire").length;
  const junctionCount = input.selection.items.filter((item) => item.kind === "junction").length;
  const labelCount = input.selection.items.filter((item) => item.kind === "net-label").length;
  const noteCount = input.selection.notes.length;
  const moveText =
    input.moveBehavior === "stretch" ? "M/stretch move pulls attached wires" : "Shift+M/move-only leaves attached wires in place";

  return `Selected ${[
    ...componentNames,
    ...couplingNames,
    ...unknownNames,
    formatCount(wireCount, "wire"),
    formatCount(junctionCount, "junction"),
    formatCount(labelCount, "label"),
    formatCount(noteCount, "note")
  ]
    .filter(Boolean)
    .join(", ")}. ${moveText}; Shift-click adds; Ctrl-click deselects.`;
}

export function labelSchematicSelectionItem(item: SchematicSelectionSummarySelectionItem) {
  if (item.kind === "component") return `${item.component.ref}${temporaryDeletedSuffix(item.component.temporarilyDeleted)}`;
  if (item.kind === "inductor-coupling") return `coupling ${item.coupling.firstRef}-${item.coupling.secondRef}`;
  if (item.kind === "wire") return `${wireVariantLabel(item.wire.appearance?.variant)}${temporaryDeletedSuffix(item.wire.temporarilyDeleted)}`;
  if (item.kind === "junction") return `junction (${item.point.x}, ${item.point.y})`;
  if (item.kind === "net-label") return `label ${item.label.name}`;
  return item.id;
}

export function labelSchematicSelectionNote(note: Pick<SchematicNote, "x" | "y">) {
  return `note (${note.x}, ${note.y})`;
}

function buildPlacementSummary(placement: SchematicSelectionSummaryPlacement): SchematicSelectionSummary {
  if (placement.kind === "invalid") {
    return labeledSummary("Placing:", [{ text: "type a valid component or template name", muted: true }]);
  }
  if (placement.kind === "template") {
    return labeledSummary("Placing:", [{ text: placement.id }, { text: "template", muted: true }]);
  }
  return labeledSummary("Placing:", [{ text: placement.hotLabel }, { text: placement.label, muted: true }]);
}

function buildWireToolSummary(wire: { variant: WireVariant; routePointCount: number }): SchematicSelectionSummary {
  const routeText = wire.routePointCount
    ? `${wire.routePointCount} route point${wire.routePointCount === 1 ? "" : "s"}`
    : "waiting for start";
  return toolSummary(wire.variant === "wide" ? "Wide wire" : "Wire", routeText);
}

function toolSummary(name: string, detail: string): SchematicSelectionSummary {
  return labeledSummary("Tool:", [{ text: name }, { text: detail, muted: true }]);
}

function labeledSummary(title: string, parts: SchematicSelectionSummaryPart[]): SchematicSelectionSummary {
  return { kind: "labeled", title, separator: "space", parts };
}

function selectionLabels(selection: SchematicSelectionContents) {
  return [...selection.items.map(labelSchematicSelectionItem), ...selection.notes.map(labelSchematicSelectionNote)];
}

function isSelectionEmpty(selection: SchematicSelectionContents) {
  return selection.items.length === 0 && selection.notes.length === 0;
}

function wireVariantLabel(variant: WireVariant = "signal") {
  return variant === "wide" ? "wide wire" : "wire";
}

function temporaryDeletedSuffix(temporarilyDeleted?: boolean) {
  return temporarilyDeleted ? " (temp deleted)" : "";
}

function formatCount(count: number, noun: string) {
  return count ? `${count} ${noun}${count === 1 ? "" : "s"}` : "";
}
