import type { SchematicDocument, Wire } from "./types";

export interface TransformRenderSnapshot {
  componentIds: string[];
  noteIds: string[];
  wireSignatures: Map<string, string>;
}

export function captureTransformRenderSnapshot(
  document: SchematicDocument,
  selection: { componentIds: Iterable<string>; noteIds: Iterable<string> }
): TransformRenderSnapshot {
  return {
    componentIds: Array.from(selection.componentIds),
    noteIds: Array.from(selection.noteIds),
    wireSignatures: new Map(document.wires.map((wire) => [wire.id, wireRenderSignature(wire)]))
  };
}

export function changedTransformWireIds(snapshot: TransformRenderSnapshot, document: SchematicDocument) {
  const changedIds = new Set<string>();
  const remainingIds = new Set(snapshot.wireSignatures.keys());
  document.wires.forEach((wire) => {
    remainingIds.delete(wire.id);
    if (snapshot.wireSignatures.get(wire.id) !== wireRenderSignature(wire)) changedIds.add(wire.id);
  });
  remainingIds.forEach((wireId) => changedIds.add(wireId));
  return changedIds;
}

function wireRenderSignature(wire: Wire) {
  return JSON.stringify([
    wire.routeMode,
    wire.points,
    Boolean(wire.temporarilyDeleted),
    wire.appearance?.variant ?? "signal",
    wire.appearance?.color ?? ""
  ]);
}
