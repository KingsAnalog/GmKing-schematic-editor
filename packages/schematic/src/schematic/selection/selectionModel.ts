export type SelectionGesture = "plain" | "shift" | "ctrl";

export interface SchematicSelectionState {
  selectedIds: ReadonlySet<string>;
  selectedNoteIds: ReadonlySet<string>;
  primarySelectedId: string | null;
}

export interface SelectionInput {
  selectedIds?: Iterable<string>;
  selectedNoteIds?: Iterable<string>;
  primarySelectedId?: string | null;
}

export function createSchematicSelectionState(input: SelectionInput = {}): SchematicSelectionState {
  return {
    selectedIds: new Set(input.selectedIds ?? []),
    selectedNoteIds: new Set(input.selectedNoteIds ?? []),
    primarySelectedId: input.primarySelectedId ?? null
  };
}

export function setSelection(ids: Iterable<string>): SchematicSelectionState {
  const selectedIds = Array.from(ids);
  return {
    selectedIds: new Set(selectedIds),
    selectedNoteIds: new Set(),
    primarySelectedId: selectedIds[selectedIds.length - 1] ?? null
  };
}

export function setNoteSelection(ids: Iterable<string>): SchematicSelectionState {
  const selectedNoteIds = Array.from(ids);
  return {
    selectedIds: new Set(),
    selectedNoteIds: new Set(selectedNoteIds),
    primarySelectedId: selectedNoteIds[selectedNoteIds.length - 1] ?? null
  };
}

export function setMixedSelection(ids: Iterable<string>, noteIds: Iterable<string>): SchematicSelectionState {
  const selectedIds = Array.from(ids);
  const selectedNoteIds = Array.from(noteIds);
  return {
    selectedIds: new Set(selectedIds),
    selectedNoteIds: new Set(selectedNoteIds),
    primarySelectedId: selectedNoteIds[selectedNoteIds.length - 1] ?? selectedIds[selectedIds.length - 1] ?? null
  };
}

export function mergeMixedSelection(state: SchematicSelectionState, ids: Iterable<string>, noteIds: Iterable<string>): SchematicSelectionState {
  const selectedIds = new Set(state.selectedIds);
  const selectedNoteIds = new Set(state.selectedNoteIds);
  const addedIds = Array.from(ids);
  const addedNoteIds = Array.from(noteIds);
  addedIds.forEach((id) => selectedIds.add(id));
  addedNoteIds.forEach((id) => selectedNoteIds.add(id));

  return {
    selectedIds,
    selectedNoteIds,
    primarySelectedId: addedNoteIds[addedNoteIds.length - 1] ?? addedIds[addedIds.length - 1] ?? state.primarySelectedId
  };
}

export function selectCell(state: SchematicSelectionState, id: string, gesture: SelectionGesture): SchematicSelectionState {
  const selectedIds = new Set(state.selectedIds);
  const selectedNoteIds = gesture === "plain"
    ? new Set<string>()
    : new Set(state.selectedNoteIds);
  let primarySelectedId = state.primarySelectedId;

  if (gesture === "ctrl") {
    selectedIds.delete(id);
    if (primarySelectedId === id) {
      primarySelectedId = selectedIds.values().next().value
        ?? selectedNoteIds.values().next().value
        ?? null;
    }
  } else if (gesture === "shift") {
    selectedIds.add(id);
    primarySelectedId = id;
  } else {
    selectedIds.clear();
    selectedIds.add(id);
    primarySelectedId = id;
  }

  return { selectedIds, selectedNoteIds, primarySelectedId };
}

export function selectNote(state: SchematicSelectionState, id: string, gesture: SelectionGesture): SchematicSelectionState {
  const selectedNoteIds = new Set(state.selectedNoteIds);
  let primarySelectedId = state.primarySelectedId;

  if (gesture === "ctrl") {
    selectedNoteIds.delete(id);
    if (primarySelectedId === id) {
      primarySelectedId = state.selectedIds.values().next().value
        ?? selectedNoteIds.values().next().value
        ?? null;
    }
    return {
      selectedIds: new Set(state.selectedIds),
      selectedNoteIds,
      primarySelectedId
    };
  }

  if (gesture === "shift") {
    selectedNoteIds.add(id);
    return {
      selectedIds: new Set(state.selectedIds),
      selectedNoteIds,
      primarySelectedId: id
    };
  }

  selectedNoteIds.clear();
  selectedNoteIds.add(id);
  return {
    selectedIds: new Set(),
    selectedNoteIds,
    primarySelectedId: id
  };
}
