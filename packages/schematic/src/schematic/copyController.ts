import { snapPoint } from "./geometry";
import {
  captureCopyLayers, copySourceCount, instantiateCopyAt, mirrorCopySourceAroundAnchor,
  planCopyLayers, rotateCopySourceAroundAnchor, type CopyLayerTarget, type CopySource, type CopyState
} from "./copyModel";
import {
  buildSelectionCopySource,
  buildTargetCopySource,
  copyAnchorFromBounds,
  type SelectionCopyExportProjection
} from "./selection/selectionCopyExportModel";
import {
  buildCopyToolNoSourceEntryIntent,
  buildCopyToolSourceEntryIntent,
  COPY_PICK_STATUS,
  type CopyToolEntryIntent
} from "./toolState";
import type { ComponentType, InductorCoupling, JunctionAppearance, Point, SchematicDocument, SchematicNote } from "./types";
import type { Rect } from "./view-geometry";

type CopyInstantiationFactories = {
  nextComponentRef: (type: ComponentType) => string;
  createId: () => string;
};

type CopySourceEntryOptions = {
  emptyStatus?: string;
};

type SelectionCopyInput = SelectionCopyExportProjection & { transformBounds: Rect | null };

type CopySourceEntryResult =
  | {
      ok: true;
      intent: CopyToolEntryIntent;
      state: CopyState;
      previewPoint: Point;
      attachSource: () => void;
    }
  | {
      ok: false;
      status: string;
    };

type CopySelectionEntryResult =
  | {
      kind: "no-source";
      intent: CopyToolEntryIntent;
    }
  | {
      kind: "source";
      entry: Extract<CopySourceEntryResult, { ok: true }>;
    }
  | {
      kind: "empty-source";
      status: string;
    };

type CopyTargetEntryResult =
  | {
      kind: "source";
      ids: string[];
      noteIds: string[];
      entry: Extract<CopySourceEntryResult, { ok: true }>;
    }
  | {
      kind: "empty-target";
      status: string;
    };

type CopyPreviewResult =
  | {
      ok: true;
      preview: CopySource;
    }
  | {
      ok: false;
      status: string;
    };

type CopyPlacementPreparation =
  | {
      ok: true;
      copied: CopySource;
      previewPoint: Point;
      keepSourceArmed: true;
    }
  | {
      ok: false;
      status: string;
      copied?: CopySource;
      keepSourceArmed: boolean;
    };

const COPY_EMPTY_SELECTION_STATUS = "Select objects before copying.";
const COPY_EMPTY_TARGET_STATUS = "Copy mode: click a component, wire, junction, or note.";

export class SchematicCopyController {
  private copyState: CopyState | null = null;

  get hasSource() {
    return !!this.copyState;
  }

  get hasSheetBlocks() {
    return this.copyState?.source.components.some(component => component.type === "sheetBlock") ?? false;
  }

  get anchor() {
    return this.copyState?.anchor ?? null;
  }

  get sourceNotes(): readonly SchematicNote[] {
    return this.copyState?.source.notes ?? [];
  }

  prepareNoSourceEntry(): CopyToolEntryIntent {
    return buildCopyToolNoSourceEntryIntent();
  }

  prepareSelectionEntry(input: {
    selection: SelectionCopyInput;
    junctionAppearances?: JunctionAppearance[];
    inductorCouplings?: InductorCoupling[];
    connections: SchematicDocument["connections"];
    lastPointerPoint: Point | null;
    document?: SchematicDocument;
    documentId?: string;
  }): CopySelectionEntryResult {
    const bounds = input.selection.transformBounds;
    if (!bounds) return { kind: "no-source", intent: this.prepareNoSourceEntry() };

    const source = buildSelectionCopySource(
      input.selection,
      input.junctionAppearances ?? [],
      input.inductorCouplings ?? [],
      input.connections,
      input.document?.symbolTemplate
    );
    const captured = input.document ? captureCopyLayers(source, input.document, input.documentId) : source;
    const anchor = singleCopyObjectAnchor(source) ?? copyAnchorFromBounds(bounds, null);
    const entry = this.prepareSourceEntry(captured, anchor, input.lastPointerPoint ?? anchor);
    if (!entry.ok) return { kind: "empty-source", status: entry.status };
    return { kind: "source", entry };
  }

  prepareTargetEntry(
    document: SchematicDocument,
    ids: string[],
    noteIds: string[],
    anchor: Point,
    previewPoint: Point = anchor,
    documentId?: string
  ): CopyTargetEntryResult {
    const projection = buildTargetCopySource(document, ids, noteIds);
    const source = captureCopyLayers(projection.source, document, documentId);
    const reference = singleCopyObjectAnchor(source) ?? anchor;
    const entry = this.prepareSourceEntry(source, reference, previewPoint, {
      emptyStatus: COPY_EMPTY_TARGET_STATUS
    });
    if (!entry.ok) return { kind: "empty-target", status: entry.status };
    return { kind: "source", ids: projection.ids, noteIds: projection.noteIds, entry };
  }

  prepareSourceEntry(source: CopySource, anchor: Point, previewPoint: Point, options: CopySourceEntryOptions = {}): CopySourceEntryResult {
    const count = copySourceCount(source);
    if (count === 0) {
      return { ok: false, status: options.emptyStatus ?? COPY_EMPTY_SELECTION_STATUS };
    }
    const state = { source, anchor: snapPoint(anchor) };
    return {
      ok: true,
      intent: buildCopyToolSourceEntryIntent(count),
      state,
      previewPoint,
      attachSource: () => {
        this.attachSource(state);
      }
    };
  }

  attachSource(state: CopyState) {
    this.copyState = state;
  }

  rotateSource() {
    if (!this.copyState) {
      return {
        ok: false as const,
        status: COPY_PICK_STATUS
      };
    }
    if (!rotateCopySourceAroundAnchor(this.copyState)) {
      return { ok: false as const, status: "Nothing to rotate." };
    }
    return { ok: true as const, status: "Copy preview rotated 90 deg. Click to place; Esc cancels." };
  }

  mirrorSource(axis: "x" | "y") {
    if (!this.copyState) {
      return {
        ok: false as const,
        status: COPY_PICK_STATUS
      };
    }
    if (!mirrorCopySourceAroundAnchor(this.copyState, axis)) {
      return { ok: false as const, status: "Nothing to mirror." };
    }
    const label = axis === "x" ? "left-right" : "up-down";
    return { ok: true as const, status: `Copy preview mirrored ${label}. Click to place; Esc cancels.` };
  }

  clear() {
    this.copyState = null;
  }

  cancel() {
    this.clear();
  }

  preparePreview(point: Point, factories: CopyInstantiationFactories, document?: SchematicDocument, target?: CopyLayerTarget): CopyPreviewResult {
    if (!this.copyState) {
      return { ok: false, status: COPY_PICK_STATUS };
    }
    const layerPlan = document && target ? planCopyLayers(this.copyState.source, document, target) : undefined;
    return {
      ok: true,
      preview: instantiateCopyAt(this.copyState, point, {
        ...factories,
        layerPlan,
        preview: true
      })
    };
  }

  preparePlacement(point: Point, factories: CopyInstantiationFactories, document?: SchematicDocument, target?: CopyLayerTarget): CopyPlacementPreparation {
    if (!this.copyState) {
      return {
        ok: false,
        status: COPY_PICK_STATUS,
        keepSourceArmed: false
      };
    }
    const layerPlan = document && target ? planCopyLayers(this.copyState.source, document, target) : undefined;
    if (layerPlan?.locked) {
      return {
        ok: false,
        status: "A destination layer is locked. Unlock it before placing the copy.",
        keepSourceArmed: true
      };
    }
    const copied = instantiateCopyAt(this.copyState, point, {
      ...factories,
      layerPlan,
      preview: false
    });
    if (copySourceCount(copied) === 0) {
      return { ok: false, status: "Nothing to copy.", copied, keepSourceArmed: true };
    }
    return {
      ok: true,
      copied,
      previewPoint: point,
      keepSourceArmed: true
    };
  }
}

function singleCopyObjectAnchor(source: CopySource): Point | undefined {
  return copySourceCount(source) === 1 ? source.components[0] ?? source.notes[0] : undefined;
}
