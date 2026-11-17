import { netNameForJunction, resolveSchematicNets, type NetResolution } from "../netResolution";
import { junctionCustomColor, wireCustomColor } from "../networkColorModel";
import { junctionPointFromId } from "../junctionIdentity";
import { resolvedWireAppearance } from "../wire/wireDecoration";
import type { SchematicPropertyPanelInput } from "../propertyPanelController";
import { uniformValue } from "../propertyPanelModel";
import type { ToolMode } from "../toolState";
import type { ComponentInstance, NetLabel, SchematicDocument, SchematicNote } from "../types";
import type { SchematicViewTarget } from "../viewTargets";
import {
  createSchematicSelectionState,
  selectCell as selectSchematicCell,
  selectNote as selectSchematicNote,
  setMixedSelection,
  setNoteSelection,
  setSelection,
  type SchematicSelectionState,
  type SelectionGesture
} from "./selectionModel";
import {
  projectSchematicSelection,
  remapSelectedJunctionIds,
  singleEditableSelectedComponent,
  singleEditableSelectedNetLabel,
  singleEditableSelectedNote,
  type SchematicSelectionProjection
} from "./selectionProjection";
import {
  buildSchematicSelectionStatus,
  type SelectionMoveBehavior
} from "./selectionSummary";

export interface SelectionDelta {
  previous: SchematicSelectionState;
  next: SchematicSelectionState;
  changedCellIds: ReadonlySet<string>;
  changedNoteIds: ReadonlySet<string>;
}

export type SchematicSelectedNetworkProperty = NonNullable<
  SchematicPropertyPanelInput["network"]
>;

export class SchematicSelectionSessionCoordinator {
  private state = createSchematicSelectionState();

  constructor(
    private readonly document: SchematicDocument,
    initialState?: SchematicSelectionState
  ) {
    if (initialState) this.state = cloneSelectionState(initialState);
  }

  get selectedIds(): ReadonlySet<string> {
    return new Set(this.state.selectedIds);
  }

  get selectedNoteIds(): ReadonlySet<string> {
    return new Set(this.state.selectedNoteIds);
  }

  snapshot() {
    return cloneSelectionState(this.state);
  }

  apply(nextState: SchematicSelectionState): SelectionDelta {
    const previous = this.snapshot();
    this.state = cloneSelectionState(nextState);
    return buildSelectionDelta(previous, this.snapshot());
  }

  setCells(ids: Iterable<string>) {
    return this.apply(setSelection(ids));
  }

  setNotes(ids: Iterable<string>) {
    return this.apply(setNoteSelection(ids));
  }

  setMixed(ids: Iterable<string>, noteIds: Iterable<string>) {
    return this.apply(setMixedSelection(ids, noteIds));
  }

  selectCell(id: string, gesture: SelectionGesture) {
    return this.apply(selectSchematicCell(this.snapshot(), id, gesture));
  }

  selectNote(id: string, gesture: SelectionGesture) {
    return this.apply(selectSchematicNote(this.snapshot(), id, gesture));
  }

  remapJunctions(nextJunctionIds: Iterable<string>) {
    const previous = this.snapshot();
    const previousJunctionIds = Array.from(previous.selectedIds).filter((id) => junctionPointFromId(id));
    const materializedNextJunctionIds = Array.from(nextJunctionIds);
    const selectedIds = new Set(
      remapSelectedJunctionIds(previous.selectedIds, materializedNextJunctionIds)
    );
    const primaryJunctionIndex = previous.primarySelectedId
      ? previousJunctionIds.indexOf(previous.primarySelectedId)
      : -1;
    let primarySelectedId = previous.primarySelectedId;

    if (primaryJunctionIndex >= 0) {
      const correspondingId = materializedNextJunctionIds[primaryJunctionIndex];
      primarySelectedId = correspondingId
        && junctionPointFromId(correspondingId)
        && selectedIds.has(correspondingId)
        ? correspondingId
        : materializedNextJunctionIds.find(
            (id) => junctionPointFromId(id) && selectedIds.has(id)
          ) ?? null;
    }

    this.state = createSchematicSelectionState({
      selectedIds,
      selectedNoteIds: previous.selectedNoteIds,
      primarySelectedId
    });
    return buildSelectionDelta(previous, this.snapshot());
  }

  hasAny() {
    return this.state.selectedIds.size > 0 || this.state.selectedNoteIds.size > 0;
  }

  hasExportableSelection() {
    return this.hasAny();
  }

  isCellSelected(id: string) {
    return this.state.selectedIds.has(id);
  }

  isNoteSelected(id: string) {
    return this.state.selectedNoteIds.has(id);
  }

  targetIsSelected(target: SchematicViewTarget) {
    return target.kind === "note"
      ? this.isNoteSelected(target.id)
      : this.isCellSelected(target.id);
  }

  project(): SchematicSelectionProjection {
    return projectSchematicSelection(this.document, this.snapshot());
  }

  selectedComponent(): ComponentInstance | null {
    return singleEditableSelectedComponent(this.document, this.snapshot());
  }

  selectedNote(): SchematicNote | null {
    return singleEditableSelectedNote(this.document, this.snapshot());
  }

  selectedNetLabel(): NetLabel | null {
    return singleEditableSelectedNetLabel(this.document, this.snapshot());
  }

  status(moveBehavior: SelectionMoveBehavior) {
    return buildSchematicSelectionStatus({
      selection: this.project().summaryContents,
      moveBehavior
    });
  }

  selectedNetworkResolution(): NetResolution | undefined {
    const target = this.selectedNetworkTarget();
    return target && target.kind !== "component"
      ? resolveSchematicNets(this.document)
      : undefined;
  }

  selectedNetworkProperty(
    mode: ToolMode,
    resolution?: NetResolution
  ): SchematicSelectedNetworkProperty | undefined {
    if (mode === "label") return undefined;
    const target = this.selectedNetworkTarget();
    if (!target || target.kind === "component") return undefined;

    const netResolution = resolution ?? resolveSchematicNets(this.document);
    if (target.kind === "label") {
      const labelState = netResolution.labelStates.get(target.label.id);
      return {
        netName: uniformValue(labelState?.netName ?? ""),
        label: {
          name: uniformValue(target.label.name),
          message: labelState?.message
        }
      };
    }
    if (target.kind === "wire") {
      const appearance = resolvedWireAppearance(target.wire);
      return {
        netName: uniformValue(netResolution.wireNetNames.get(target.wire.id) ?? ""),
        color: uniformValue(wireCustomColor(target.wire)),
        wire: {
          lineWidth: uniformValue(appearance.lineWidth),
          startMarker: uniformValue(appearance.startMarker),
          endMarker: uniformValue(appearance.endMarker),
          digitalSlash: uniformValue(appearance.digitalSlash),
          ...(appearance.digitalSlash
            ? { digitalLabel: uniformValue(appearance.digitalLabel) }
            : {})
        }
      };
    }
    return {
      netName: uniformValue(netNameForJunction(netResolution, target.point)),
      color: uniformValue(junctionCustomColor(this.document, target.point))
    };
  }

  private selectedNetworkTarget():
    | { kind: "component" }
    | { kind: "label"; label: NetLabel }
    | { kind: "wire"; wire: SchematicDocument["wires"][number] }
    | { kind: "junction"; point: NonNullable<ReturnType<typeof junctionPointFromId>> }
    | null {
    const selection = this.snapshot();
    if (selection.selectedNoteIds.size !== 0 || selection.selectedIds.size !== 1) {
      return null;
    }
    const id = selection.selectedIds.values().next().value;
    if (typeof id !== "string") return null;
    if (this.document.components.some((component) => component.id === id)) {
      return { kind: "component" };
    }
    const label = this.document.netLabels.find((candidate) => candidate.id === id);
    if (label) return { kind: "label", label };
    const wire = this.document.wires.find((candidate) => candidate.id === id);
    if (wire) return { kind: "wire", wire };
    const point = junctionPointFromId(id);
    return point ? { kind: "junction", point } : null;
  }
}

function buildSelectionDelta(
  previous: SchematicSelectionState,
  next: SchematicSelectionState
): SelectionDelta {
  return {
    previous: cloneSelectionState(previous),
    next: cloneSelectionState(next),
    changedCellIds: symmetricDifference(previous.selectedIds, next.selectedIds),
    changedNoteIds: symmetricDifference(previous.selectedNoteIds, next.selectedNoteIds)
  };
}

function cloneSelectionState(state: SchematicSelectionState): SchematicSelectionState {
  return {
    selectedIds: new Set(state.selectedIds),
    selectedNoteIds: new Set(state.selectedNoteIds),
    primarySelectedId: state.primarySelectedId
  };
}

function symmetricDifference(
  previous: ReadonlySet<string>,
  next: ReadonlySet<string>
): ReadonlySet<string> {
  const changed = new Set<string>();
  previous.forEach((id) => {
    if (!next.has(id)) changed.add(id);
  });
  next.forEach((id) => {
    if (!previous.has(id)) changed.add(id);
  });
  return changed;
}
