import { SchematicInductorInteractionController } from "./inductorInteractionController";
import { ComponentRefAllocator } from "./componentRefAllocator";
import { switchStateCycleCommand } from "./switchInteractionModel";
import { buildVisibleJunctions, presentationJunctions } from "./connectivity";
import {
  SchematicCellGeometryInteractionCoordinator,
  type CellGeometryInteractionFinalizeResult,
  type CellGeometryInteractionLiveResult
} from "./cellGeometryInteractionCoordinator";
import { InstanceSelector, type InstancePaletteItem } from "./instanceSelector";
import type { SchematicGraphAdapter } from "./graphAdapter";
import { SchematicIncrementalRenderCoordinator } from "./incrementalRenderCoordinator";
import { SchematicJunctionRenderCoordinator } from "./junctionRenderCoordinator";
import { resolveSchematicNets, type NetResolution } from "./netResolution";
import {
  bindStandaloneNetLabelsAtPoint,
  netLabelPosition
} from "./netLabelModel";
import { SchematicNetLabelToolController } from "./netLabelToolController";
import {
  SchematicNetLabelCommitCoordinator,
  type SchematicNetLabelCommitOutcome
} from "./netLabelCommitCoordinator";
import { SchematicNoteLayer } from "./notes/noteLayer";
import { SchematicNoteInteractionController } from "./notes/noteInteractionController";
import {
  NotePropertyBatchSession,
  type NotePropertyBatchProjectionContext
} from "./notes/notePropertyBatchSession";
import { noteFontSizePx } from "./notes/noteSizing";
import { createSchematicPaperSurface, type SchematicPaperSurface } from "./paperLifecycle";
import { SchematicPreviewRenderer } from "./previewRenderer";
import { SchematicPropertyInteractionController } from "./propertyInteractionController";
import { SchematicPropertyPanelController } from "./propertyPanelController";
import {
  createPlainSchematicNoteDocumentOp,
  resetSchematicDocument,
  restoreSchematicDocumentOp,
  transformSelectionDocumentGeometryOp,
  transformSingleComponentOrientationDocumentOp,
  type SchematicDocumentHistoryIntent,
  type SchematicDocumentOpResult
} from "./document/documentOps";
import { SchematicPlacementToolController } from "./placementToolController";
import { buildPlacementStatusMessage } from "./placementProjection";
import {
  SchematicPlacementCommitCoordinator,
  type SchematicPlacementCommitOutcome
} from "./placementCommitCoordinator";
import type { SchematicPropertyBatchCommandResult } from "./propertyBatchCommands";
import {
  ShapeResizeSession,
  type ShapeResizeHandle
} from "./shapeResizeSession";
import { pointKey, snapPoint } from "./geometry";
import { junctionCustomColor, pruneJunctionAppearances } from "./networkColorModel";
import type {
  SchematicEditorCommand,
  SchematicEditorMountElements,
  SchematicEditorMutationOptions,
  SchematicEditorState,
  SchematicEditorStateListener
} from "./editorHandle";
import type {
  SchematicEditorAnalysisBridge,
  SchematicEditorContextMenuBridge,
  SchematicEditorHostBridge,
  SchematicEditorRuntimeServices,
  SchematicHostedDocumentActivation,
  SchematicHostedDocumentSnapshot,
  SchematicHostedEditor
} from "./schematicHostedEditor";
import { SchematicToolbarController } from "./toolbar";
import {
  SchematicTransientToolSessionCoordinator,
  type TransientInteractionCleanupPolicy
} from "./transientToolSessionCoordinator";
import {
  buildCancelToolIntent,
  buildDeleteToolEntryIntent,
  buildMoveBehaviorToolEntryIntent,
  buildPlacementToolEntryIntent,
  buildWireToolEntryIntent,
  isDeleteToolMode as isSchematicDeleteToolMode,
  projectSchematicEscapeKeyIntent,
  projectSchematicKeyboardShortcut,
  projectSchematicToolbarCommandIntent,
  type CopyToolEntryIntent,
  type DeleteToolEntryIntent,
  type MoveBehaviorToolEntryIntent,
  type PlacementToolEntryIntent,
  type SchematicEscapeKeyIntent,
  type SchematicKeyboardShortcutIntent,
  type SchematicToolbarCommandIntent,
  type WireToolEntryIntent,
  type WireToolVariant
} from "./toolState";
import {
  buildSelectionCopySource,
  buildSelectionExportInput,
  selectedExportJunctionPoints
} from "./selection/selectionCopyExportModel";
import { SchematicCopyController } from "./copyController";
import {
  copySourceCenterAnchor,
  copySourceCount,
  copySourceFromDocument
} from "./copyModel";
import { buildSchematicSelectionNetlist } from "./selection/selectionNetlist";
import { decideSchematicContextMenuOpen, projectSchematicContextMenuTarget, type SchematicContextMenuDecision } from "./contextMenuModel";
import { SchematicDeleteToolController, type DeleteToolMode } from "./deleteToolController";
import {
  SchematicDeleteCommitCoordinator,
  type SchematicDeleteCommitOutcome
} from "./deleteCommitCoordinator";
import {
  projectDeleteHoverElementTarget,
  projectDeleteHoverLinkTarget,
  projectDeleteHoverModelTarget,
  projectDeleteHoverNoteTarget
} from "./deleteHoverTargetProjection";
import {
  decideSchematicPointerClick,
  type PointerClickTarget,
  type PointerClickRoutingIntent
} from "./pointerClickRoutingModel";
import {
  projectBlankPointerClickTarget,
  projectElementPointerClickTarget,
  projectLinkPointerClickTarget,
  projectPinPointerClickTarget
} from "./pointerClickTargetProjection";
import type { SelectionMoveBehavior } from "./selection/selectionMoveTransaction";
import type { SelectionGesture } from "./selection/selectionModel";
import { SchematicSelectionBoxController } from "./selection/selectionBoxController";
import { projectFinishedSelectionBox, type FinishedSelectionBoxIntent } from "./selection/selectionBoxModel";
import { SchematicSelectionSessionCoordinator } from "./selection/selectionSessionCoordinator";
import { remapSelectionAfterGeometryTransform } from "./selection/selectionTransformRemap";
import { buildSchematicSelectionUiProjection } from "./selection/selectionUiProjection";
import {
  DELETE_SELECTION_EMPTY_STATUS,
  DELETE_TARGET_EMPTY_STATUS,
  TEMPORARY_DELETE_SELECTION_EMPTY_STATUS,
  TEMPORARY_DELETE_TARGET_EMPTY_STATUS
} from "./selection/selectionDeleteModel";
import type { GroupTransformKind } from "./selection/selectionTransformModel";
import {
  cloneSchematicDocument,
  contentFromDocument,
  documentFromContent,
  normalizeSchematicContent
} from "./document/documentModel";
import { applyNormalizedDocumentWires } from "./document/documentWires";
import {
  captureTransformRenderSnapshot,
  changedTransformWireIds,
  type TransformRenderSnapshot
} from "./transformRenderModel";
import { schematicDocumentVisualBounds } from "./view-geometry";
import { wireEndpointConnections } from "./wire/wireEndpointConnection";
import { reconcileConnectionEdit } from "./connectionGraph";
import type { WireEndpointConnections } from "./wire/wireDecoration";
import {
  beginWireSegmentMove,
  type WireSegmentMoveTransaction
} from "./wire/wireSegmentMoveModel";
import {
  SCHEMATIC_GRID,
  componentCellAttrs,
  JUNCTION_MARKER_RADIUS,
  junctionId,
  makeComponentCell,
  makeJunctionCell,
  makeNetLabelCell,
  makeWireCell,
  PREVIEW_NET_LABEL_ID,
  parseJunctionKey
} from "./renderer";
import { makeInductorCouplingCell } from "./inductorCouplingCell";
import { inductorCouplingFlipsReferenceLabel } from "./inductorCouplingGeometry";
import type { SchematicSelectionContents } from "./selection/selectionSummary";
import { renderSchematicSelectionSummary } from "./selection/selectionSummaryRenderer";
import {
  computeFitView,
  defaultSchematicView,
  expandedRect,
  type SchematicViewAdapter,
  type SchematicView
} from "./viewAdapter";
import { isViewportPanMouseEvent, SchematicViewportController } from "./viewportController";
import type { SchematicViewTarget } from "./viewTargets";
import {
  SchematicWireCommitCoordinator,
  type SchematicWireCommitOutcome
} from "./wire/wireCommitCoordinator";
import { SchematicWireToolController } from "./wire/wireToolController";
import {
  applySchematicCellSelectionStyles,
  setSchematicPresentationClass,
  setSchematicPresentationState,
  syncSchematicPaperModeClasses
} from "./viewStyling";
import { serializeSchematicDocumentFile } from "./schematicDocumentCodec";
import { resolveSymbolTemplate, type SymbolTemplateId } from "./symbolTemplateModel";
import type {
  AnalysisPortSelection,
  ComponentInstance,
  ComponentType,
  Point,
  SchematicContent,
  SchematicDocument,
  SchematicNote,
  SchematicNoteFormat,
  SchematicViewState,
  Wire,
  WireRouteMode
} from "./types";

const MIN_ZOOM = 0.0035;
const MIN_FIT_ZOOM = 0.00001;
const MAX_ZOOM = 280;
const FIT_PADDING_PX = 48;
const FIT_BOUNDS_MARGIN = 28;
const NOTE_COMMIT_DEBOUNCE_MS = 400;

type SchematicEditorOptions = SchematicEditorMountElements;
type MoveBehavior = SelectionMoveBehavior;
type SchematicContextTarget = SchematicViewTarget;

interface SchematicDocumentRenderRuntime {
  host: HTMLElement;
  surface: SchematicPaperSurface;
}

export class SchematicEditor implements SchematicHostedEditor {
  private readonly graphAdapter: SchematicGraphAdapter<any>;
  private readonly incrementalRenderer: SchematicIncrementalRenderCoordinator<any>;
  private readonly viewAdapter: SchematicViewAdapter;
  private readonly activeRenderRuntime: SchematicDocumentRenderRuntime;
  private readonly toolbarController: SchematicToolbarController | null;
  private readonly document: SchematicDocument = {
    components: [],
    wires: [],
    junctions: [],
    connections: { wires: {}, pins: {} },
    junctionAppearances: [],
    netLabels: [],
    notes: []
  };
  private readonly componentRefs = new ComponentRefAllocator();
  private readonly selectionSession = new SchematicSelectionSessionCoordinator(this.document);
  private readonly deleteToolController = new SchematicDeleteToolController();
  private readonly deleteCommitCoordinator: SchematicDeleteCommitCoordinator;
  private readonly noteLayer: SchematicNoteLayer;
  private readonly instanceSelector: InstanceSelector;
  private readonly contextMenuController;
  private readonly propertyPanelController: SchematicPropertyPanelController;
  private readonly analysisController;
  private readonly transientToolSession: SchematicTransientToolSessionCoordinator;
  private readonly placementToolController = new SchematicPlacementToolController();
  private readonly placementCommitCoordinator: SchematicPlacementCommitCoordinator;
  private presentationMode = false;
  private lastPointerPoint: Point | null = null;
  private readonly wireToolController = new SchematicWireToolController();
  private readonly wireCommitCoordinator: SchematicWireCommitCoordinator;
  private readonly previewRenderer: SchematicPreviewRenderer<any>;
  private readonly copyController = new SchematicCopyController();
  private readonly selectionBoxController: SchematicSelectionBoxController<any>;
  private readonly viewportController: SchematicViewportController;
  private readonly noteInteractionController: SchematicNoteInteractionController;
  private readonly notePropertyBatchSession: NotePropertyBatchSession;
  private readonly propertyInteractions: SchematicPropertyInteractionController;
  private readonly shapeResizeSession = new ShapeResizeSession(this.document);
  private shapeResizePointerId: number | null = null;
  private readonly cellGeometryInteractionCoordinator: SchematicCellGeometryInteractionCoordinator<any>;
  private readonly junctionRenderCoordinator: SchematicJunctionRenderCoordinator<any>;
  private wireSegmentMove: WireSegmentMoveTransaction | null = null;
  private readonly netLabelToolController = new SchematicNetLabelToolController();
  private readonly netLabelCommitCoordinator: SchematicNetLabelCommitCoordinator;
  private netResolutionCache: NetResolution | undefined;
  private activeHostedDocumentId = "";
  private readonly copyMarkdownPreviewContent = new Map<string, HTMLElement>();
  private copyMarkdownPreviewGeneration = 0;
  private copyPreviewNeedsPointer = false;
  private readonly inductorInteractions: SchematicInductorInteractionController;
  private readonly lifecycleController: AbortController;
  private readonly stateListeners = new Set<SchematicEditorStateListener>();
  private readonly scheduledFrames = new Set<number>();
  private destroyResult: Promise<void> | null = null;
  private initialized = false;
  private destroyed = false;
  private revision = 0;
  private lastOrigin = "init";
  private lastReason = "init";
  private statusMessage = "";
  private noteCommitTimer: number | null = null;

  private get paper() {
    return this.activeRenderRuntime.surface.paper as any;
  }

  private get zoom() {
    return this.viewAdapter.getView().zoom;
  }

  private get viewTranslate() {
    return this.viewAdapter.getView().translate;
  }

  private readonly handleGlobalPointerMove = (event: MouseEvent | PointerEvent) => {
    if (this.viewportController.handleGlobalPointerMove(event)) {
      return;
    }

    const dragSelectStart = this.selectionBoxController.startPoint();
    if (dragSelectStart) {
      const point = this.pointFromClientEvent(event);
      this.selectionBoxController.update(point);
      if (Math.hypot(point.x - dragSelectStart.x, point.y - dragSelectStart.y) > 8) {
        this.viewportController.suppressBlankClickOnce();
      }
    }
  };

  private readonly handleShapeResizePointerDown = (event: PointerEvent) => {
    const handle = (event.target as Element | null)?.closest<SVGElement>(
      "[data-rectangle-resize-handle], [data-triangle-resize-handle]"
    );
    if (
      !handle
      || event.button !== 0
      || this.transientToolSession.mode !== "select"
      || this.selectionSession.selectedIds.size !== 1
      || this.selectionSession.selectedNoteIds.size !== 0
    ) {
      return;
    }
    const componentId = handle.getAttribute("data-component-id") ?? "";
    const corner = (handle.getAttribute("data-rectangle-resize-handle") ?? handle.getAttribute("data-triangle-resize-handle")) as ShapeResizeHandle;
    if (!this.shapeResizeSession.begin(componentId, corner)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.shapeResizePointerId = event.pointerId;
    this.host.ownerWindow.addEventListener("pointermove", this.handleShapeResizePointerMove, true);
    this.host.ownerWindow.addEventListener("pointerup", this.handleShapeResizePointerUp, true);
    this.host.ownerWindow.addEventListener("pointercancel", this.handleShapeResizePointerCancel, true);
  };

  private readonly handleShapeResizePointerMove = (event: PointerEvent) => {
    if (
      !this.shapeResizeSession.isActive
      || event.pointerId !== this.shapeResizePointerId
    ) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    const result = this.shapeResizeSession.move(this.pointFromClientEvent(event));
    if (!result.active) return;
    this.renderDocument();
    this.renderPropertyEditor();
  };

  private readonly handleShapeResizePointerUp = (event: PointerEvent) => {
    if (
      !this.shapeResizeSession.isActive
      || event.pointerId !== this.shapeResizePointerId
    ) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    const result = this.shapeResizeSession.commit();
    this.removeShapeResizeListeners();
    if (result.changed) this.consumeHistoryIntent("push");
    this.renderPropertyEditor();
    this.setStatus(result.status || this.selectionStatus());
  };

  private readonly handleShapeResizePointerCancel = (event: PointerEvent) => {
    if (event.pointerId !== this.shapeResizePointerId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.cancelShapeResize();
  };

  private readonly handleGlobalPointerUp = (event: MouseEvent | PointerEvent) => {
    if (this.viewportController.handleGlobalPointerUp(event)) {
      return;
    }

    if (this.selectionBoxController.isActive()) {
      event.preventDefault();
      this.finishDragSelection(this.pointFromClientEvent(event));
    }
  };

  private readonly handleCanvasMouseMove = (event: MouseEvent) => {
    if (this.viewportController.isMousePanActive() || this.selectionBoxController.isActive()) return;
    if (this.isDeleteToolMode()) this.setDeleteHoverFromEvent(event);
    this.handlePointerMove(this.pointFromClientEvent(event));
  };

  private readonly handleGlobalNotePointerMove = (event: PointerEvent) => {
    const drag = this.noteInteractionController.moveDrag({
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      zoom: this.zoom
    });
    if (drag.kind === "ignored") return;
    event.preventDefault();
    drag.changedNoteIds.forEach((noteId) => {
      const note = this.noteById(noteId);
      if (note) this.noteLayer.positionNoteElement(note, this.noteLayerState());
    });
    const geometry = this.cellGeometryInteractionCoordinator.syncNoteMove(
      drag.noteId,
      drag.changedNoteIds,
      this.transientToolSession.moveBehavior
    );
    if (!geometry) return;
    this.projectCellGeometryInteraction(geometry);
    if (geometry.requestJunctionRefresh) this.junctionRenderCoordinator.scheduleLiveRefresh();
  };

  private readonly handleGlobalNotePointerUp = (event: PointerEvent) => {
    const noteCommit = this.noteInteractionController.endDrag(event.pointerId);
    if (!noteCommit) return;
    event.preventDefault();
    this.removeNoteDragListeners();
    const geometry = this.cellGeometryInteractionCoordinator.finalizeNoteMove(
      noteCommit.noteIds,
      this.transientToolSession.moveBehavior
    );
    if (geometry) this.projectCellGeometryInteraction(geometry);
    const geometryCommit = geometry?.commit;
    const changed = noteCommit.changed || Boolean(geometryCommit?.changed);
    if (!changed) {
      this.setStatus(this.selectionStatus());
      return;
    }
    if ((geometryCommit?.affectedGraphIds.length ?? 0) > 0) {
      applyNormalizedDocumentWires(this.document);
      this.document.junctions = buildVisibleJunctions(this.document);
      pruneJunctionAppearances(this.document);
      this.renderDocument();
    }
    this.consumeHistoryIntent(geometryCommit?.changed ? geometryCommit : noteCommit);
    this.setStatus((geometryCommit?.affectedGraphIds.length ?? 0) > 0 ? geometryCommit!.status : noteCommit.status);
  };

  private readonly handleGlobalNoteWidthPointerMove = (event: PointerEvent) => {
    const result = this.noteInteractionController.moveWidthDrag({
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      zoom: this.zoom
    });
    if (!result.valid) return;
    event.preventDefault();
    if (result.changed) {
      this.persistWorkspaceState();
      this.renderPropertyEditor();
    }
  };

  private readonly handleGlobalNoteWidthPointerUp = (event: PointerEvent) => {
    const result = this.noteInteractionController.endWidthDrag(event.pointerId);
    if (result.kind === "ignored") return;
    event.preventDefault();
    this.removeNoteWidthDragListeners();
    this.commitNotePropertyResult(result.commit);
    this.renderPropertyEditor();
  };

  constructor(
    private readonly options: SchematicEditorOptions,
    private readonly host: SchematicEditorRuntimeServices,
    private readonly hostBridge: SchematicEditorHostBridge
  ) {
    if (host.ownerDocument !== options.paperEl.ownerDocument) {
      throw new Error("Schematic editor host services must belong to the mount root document.");
    }
    this.lifecycleController = host.createAbortController();
    this.analysisController = hostBridge.analysis ?? createNoopAnalysisBridge();
    this.contextMenuController = hostBridge.contextMenu ?? createNoopContextMenuBridge();
    this.deleteCommitCoordinator = new SchematicDeleteCommitCoordinator(this.document);
    this.placementCommitCoordinator = new SchematicPlacementCommitCoordinator(
      this.document,
      this.placementToolController,
      this.copyController,
      {
        createId: () => this.host.idFactory(),
        nextComponentRef: (type) => this.nextComponentRef(type)
      }
    );
    this.wireCommitCoordinator = new SchematicWireCommitCoordinator(
      this.document,
      this.wireToolController,
      () => this.host.idFactory()
    );
    this.netLabelCommitCoordinator = new SchematicNetLabelCommitCoordinator(
      this.document,
      this.netLabelToolController,
      () => this.host.idFactory()
    );
    this.activeRenderRuntime = this.createDocumentRenderRuntime();
    this.graphAdapter = this.activeRenderRuntime.surface.graphAdapter;
    this.viewAdapter = this.activeRenderRuntime.surface.viewAdapter;
    const makeJunctionViewCell = (point: Point) => makeJunctionCell(point, {
      selected: this.selectionSession.isCellSelected(junctionId(point)),
      color: junctionCustomColor(this.document, point)
    });
    this.incrementalRenderer = new SchematicIncrementalRenderCoordinator({
      graphAdapter: this.graphAdapter,
      document: this.document,
      makeComponentCell: (component) => this.makeComponentCell(component),
      makeWireCell: (wire) => this.makeWireCell(wire),
      makeJunctionCell: makeJunctionViewCell,
      isWireSelected: (wireId) => this.selectionSession.isCellSelected(wireId)
    });
    this.cellGeometryInteractionCoordinator = new SchematicCellGeometryInteractionCoordinator({
      document: this.document,
      graphAdapter: this.graphAdapter,
      incrementalRenderer: this.incrementalRenderer
    });
    const viewportListeners = {
      add: () => {
        this.host.ownerWindow.addEventListener("pointermove", this.handleGlobalPointerMove, true);
        this.host.ownerWindow.addEventListener("pointerup", this.handleGlobalPointerUp, true);
        this.host.ownerWindow.addEventListener("mousemove", this.handleGlobalPointerMove, true);
        this.host.ownerWindow.addEventListener("mouseup", this.handleGlobalPointerUp, true);
      },
      remove: () => {
        this.host.ownerWindow.removeEventListener("pointermove", this.handleGlobalPointerMove, true);
        this.host.ownerWindow.removeEventListener("pointerup", this.handleGlobalPointerUp, true);
        this.host.ownerWindow.removeEventListener("mousemove", this.handleGlobalPointerMove, true);
        this.host.ownerWindow.removeEventListener("mouseup", this.handleGlobalPointerUp, true);
      }
    };
    this.selectionBoxController = new SchematicSelectionBoxController({
      graphAdapter: this.graphAdapter,
      listeners: viewportListeners
    });
    this.viewportController = new SchematicViewportController({
      host: this.options.paperEl,
      containsEventTarget: (target) => {
        if (!target) return false;
        try {
          return this.options.paperEl.contains(target as Node);
        } catch {
          return false;
        }
      },
      getView: () => this.viewAdapter.getView(),
      setView: (view) => this.setView(view),
      localPointFromClient: (clientX, clientY) => this.localPointFromClient(clientX, clientY),
      zoomAtClientPoint: (nextZoom, clientX, clientY, localAnchor) => this.applyZoomAtClientPoint(nextZoom, clientX, clientY, localAnchor),
      persistWorkspaceState: () => this.persistWorkspaceState(),
      onMiddleClick: () => {
        this.executeTypedCommand({ kind: "wire-route", routeMode: "toggle" });
      },
      canStartTouchPan: () => this.transientToolSession.mode === "select",
      cancelConflictingGestures: () => {
        if (!this.selectionBoxController.isActive()) return false;
        this.cancelDragSelection();
        return true;
      },
      listeners: viewportListeners,
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM
    });
    setSchematicPresentationClass(this.options.paperEl, this.presentationMode);
    this.options.paperEl.style.setProperty(
      "--schematic-delete-cursor",
      this.host.cursors?.delete ?? "crosshair"
    );
    this.options.paperEl.style.setProperty(
      "--schematic-temp-delete-cursor",
      this.host.cursors?.temporaryDelete ?? "crosshair"
    );
    this.noteLayer = new SchematicNoteLayer(this.options.paperEl, {
      runtimeAdapter: this.host.noteRuntimeAdapter,
      onMarkdownChange: (noteId, markdown) => this.updateMarkdownNoteText(noteId, markdown),
      onMarkdownResize: (noteId, height) => this.updateMarkdownNoteHeight(noteId, height)
    });
    const frameScheduler = {
      request: (callback: () => void) => this.requestOwnedFrame(() => callback()),
      cancel: (handle: number) => this.cancelOwnedFrame(handle)
    };
    this.noteInteractionController = new SchematicNoteInteractionController(
      this.document,
      this.noteLayer,
      (callback) => this.requestOwnedFrame(() => callback())
    );
    this.notePropertyBatchSession = new NotePropertyBatchSession(
      this.document,
      (note, context) => this.projectNotePropertyBatch(note, context),
      frameScheduler
    );
    this.inductorInteractions = new SchematicInductorInteractionController({
      document: this.document,
      selectedComponent: () => this.selectionSession.selectedComponent(),
      selectedComponents: () => this.selectionSession.project().components,
      select: (id, refresh) => { this.selectionSession.setMixed([id], []); if (refresh) this.finishSelectionChange(); },
      renderDocument: () => this.renderDocument(),
      renderCouplings: () => this.renderInductorCouplings(),
      renderEndpoints: id => this.renderInductorCouplingEndpoints(id),
      commit: () => { this.consumeHistoryIntent("push"); },
      status: message => this.setStatus(message),
      focus: () => this.focusCanvas(),
      refreshUi: () => this.syncToolUi(),
      createId: () => this.host.idFactory()
    });
    this.propertyInteractions = new SchematicPropertyInteractionController({
      document: this.document,
      selection: () => this.selectionSession,
      moveBehavior: () => this.transientToolSession.moveBehavior,
      render: result => result.renderScope === "document" ? this.renderDocument() : this.renderIncrementalPropertyBatch(result),
      restorePreview: () => this.restoreSelectedPropertyPreview(),
      renderPanel: () => this.renderPropertyEditor(),
      rebuildCounters: () => this.rebuildCounters(),
      commit: () => { this.consumeHistoryIntent("push"); },
      status: message => this.setStatus(message, this.netResolutionCache),
      scheduler: frameScheduler
    });
    this.previewRenderer = new SchematicPreviewRenderer({
      symbolTemplate: () => this.document.symbolTemplate,
      graphAdapter: this.graphAdapter,
      noteLayerElement: this.noteLayer.element,
      makeComponentCell: (component) => this.makeComponentCell(component),
      makeWireCell: (wire, options) => this.makeWireCell(wire, options),
      makeNetLabelCell: (label, options) => makeNetLabelCell(label, options),
      presentationMode: () => this.presentationMode,
      worldToScreenPoint: (point) => this.worldToScreenPoint(point),
      zoom: () => this.zoom,
      cloneRenderedNoteContent: (note) =>
        this.copyMarkdownPreviewContent.get(note.text)?.cloneNode(true) as HTMLElement | undefined
        ?? this.noteLayer.cloneRenderedMarkdownByText(note.text)
    });
    this.propertyPanelController = new SchematicPropertyPanelController(this.options.propertyEl, this.propertyInteractions.callbacks({
      ...this.inductorInteractions.callbacks(),

      onNoteFontSizeEditStart: () => this.beginNoteFontSizePropertyEdit(),
      onNoteFontSizeInput: (value) => this.setSelectedNoteFontSize(value, { commit: false }),
      onNoteFontSizeCommit: (value) => this.setSelectedNoteFontSize(value, { commit: true }),
      onNoteFormatChange: (format) => this.setSelectedNoteFormat(format),
      onNoteWidthEditStart: () => this.beginNoteWidthPropertyEdit(),
      onNoteWidthInput: (value) => this.setSelectedNoteWidth(value, { commit: false }),
      onNoteWidthCommit: (value) => this.setSelectedNoteWidth(value, { commit: true }),
      onNoteFontSizeCancel: () => this.cancelNoteFontSizePropertyEdit(),
      onNoteWidthCancel: () => this.cancelNoteWidthPropertyEdit(),
      onLabelToolInput: (value) => this.netLabelToolController.updateDraft(value),
      onLabelToolSubmit: (value) => this.armLabelPlacement(value)
    }));
    this.junctionRenderCoordinator = new SchematicJunctionRenderCoordinator({
      document: this.document,
      graphAdapter: this.graphAdapter,
      makeJunctionCell: makeJunctionViewCell,
      getPresentationMode: () => this.presentationMode,
      requestAnimationFrame: (callback) => this.host.requestAnimationFrame(callback),
      cancelAnimationFrame: (handle) => this.host.cancelAnimationFrame(handle)
    });
    this.transientToolSession = new SchematicTransientToolSessionCoordinator({
      clearWireSegmentMove: () => {
        this.wireSegmentMove = null;
      },
      resetWireTool: () => this.wireToolController.reset(),
      clearActiveNetPick: () => this.analysisController.clearActivePick(),
      clearDeleteHover: () => this.clearDeleteHover(),
      clearPlacementPreview: () => this.removePlacementPreview(),
      clearWirePreview: () => this.removeWirePreview(),
      clearCopyPreview: () => this.removeCopyPreview(),
      clearCopyState: () => this.clearCopyState(),
      clearLabelDocumentInteraction: () => this.clearNetLabelDocumentInteraction(),
      clearLabelState: () => this.clearNetLabelTransientState(),
      clearSelectionBox: () => this.clearSelectionBoxTransient(),
      clearNotePointerInteractions: (policy) => this.clearNotePointerInteractions(policy),
      clearCellGeometryInteraction: (policy) => this.clearCellGeometryInteraction(policy),
      updatePlacementPreview: (point) => this.updatePlacementPreview(point),
      updateWirePreview: (point) => this.updateWirePreview(point),
      updateCopyPreview: (point) => this.updateCopyPreview(point),
      updateLabelPreview: (point) => this.updateNetLabelPreview(point)
    });
    this.instanceSelector = new InstanceSelector(this.options.paletteEl, {
      symbolTemplate: () => this.document.symbolTemplate,
      currentItem: () => this.placementToolController.selectedItem,
      activeItem: () => this.placementToolController.activeItem,
      isPlacementMode: () => this.transientToolSession.mode === "place",
      shouldIgnoreFocusOut: () => this.transientToolSession.mode === "place" && this.options.paperEl.contains(this.host.ownerDocument.activeElement),
      activateItem: (item, options) => this.activatePlacementItem(item, options),
      previewItem: (item) => this.previewPlacementItem(item),
      onStatusChange: () => this.syncPlacementStatus(),
      focusCanvas: () => this.focusCanvas(),
      closeAfterActivation: this.hostBridge.closeInstanceSearchAfterActivation,
      onPanelVisibilityChange: (open) => this.hostBridge.onInstanceSearchVisibilityChange?.(open)
    });
    const toolbarRoot = this.options.paperEl.closest(".schematic-shell");
    this.toolbarController = toolbarRoot
      ? new SchematicToolbarController(toolbarRoot, {
          onCommand: (command) => this.runCommand(command)
        })
      : null;
  }

  private createDocumentRenderRuntime(): SchematicDocumentRenderRuntime {
    const host = this.host.ownerDocument.createElement("div");
    host.className = "schematic-document-paper-runtime";
    host.hidden = true;
    this.options.paperEl.prepend(host);
    const surface = createSchematicPaperSurface({
      paperEl: host,
      viewportEl: this.options.paperEl,
      interactive: (cellView: any) => this.paperInteractivity(cellView)
    });
    surface.paper.freeze?.();
    return { host, surface };
  }

  private paperInteractivity(cellView: any) {
    if (cellView.model.get("preview")) return false;
    if (cellView.model.get("couplingId")) return false;
    if (cellView.model.get("junction")) {
      return { labelMove: false, elementMove: false, linkMove: false, vertexMove: false, arrowheadMove: false };
    }
    if (this.transientToolSession.mode !== "select") {
      return { labelMove: false, elementMove: false, linkMove: false, vertexMove: false, arrowheadMove: false };
    }
    if (cellView.model.get("netLabelId")) {
      return this.transientToolSession.mode === "select" ? { labelMove: false } : false;
    }
    if (cellView.model.get("wireId")) {
      return { labelMove: false, linkMove: false, vertexMove: false, arrowheadMove: false };
    }
    return { labelMove: false };
  }

  init() {
    if (this.initialized || this.destroyed) return;
    this.initialized = true;
    this.activeRenderRuntime.host.hidden = false;
    this.activeRenderRuntime.surface.paper.unfreeze?.();
    this.renderPalette();
    this.bindEvents();
    this.syncToolUi();
    this.renderSelectionSummary();
    this.setStatus("Press i for instances, w for wire, r to rotate, f to fit. Wheel/pinch zooms; middle mouse or touch-drag pans.");
    this.emitStateChange();
  }

  destroy() {
    if (this.destroyResult) return this.destroyResult;
    if (this.destroyed) return Promise.resolve();
    this.flushTransientEdits("destroy");
    this.destroyed = true;
    this.destroyResult = Promise.resolve();
    this.copyMarkdownPreviewGeneration += 1;
    this.lifecycleController.abort();
    this.cancelOwnedFrames();
    this.cancelScheduledNoteCommit();
    this.cancelShapeResize();
    this.removeNoteDragListeners();
    this.removeNoteWidthDragListeners();
    this.selectionBoxController.cancel();
    this.viewportController.cancelActiveGestures();
    this.junctionRenderCoordinator.cancelScheduledRefresh();
    this.notePropertyBatchSession.dispose();
    this.propertyInteractions.dispose();
    this.noteInteractionController.dispose();
    this.instanceSelector.destroy();
    this.toolbarController?.destroy();
    this.propertyPanelController.destroy();
    this.activeRenderRuntime.surface.destroy();
    this.activeRenderRuntime.host.remove();
    this.destroyResult = this.noteLayer.destroy().catch((error) => {
      console.error("Schematic Note runtime cleanup failed.", error);
    });
    this.copyMarkdownPreviewContent.clear();
    this.stateListeners.clear();
    return this.destroyResult;
  }

  getState(): SchematicEditorState {
    return {
      content: this.getContent(),
      view: {
        zoom: this.zoom,
        translate: { ...this.viewTranslate },
        presentationMode: this.presentationMode
      },
      canUndo: this.hostBridge.canUndo(),
      canRedo: this.hostBridge.canRedo(),
      status: this.statusMessage,
      origin: this.lastOrigin,
      reason: this.lastReason,
      revision: this.revision,
      saveState: this.hostBridge.saveState?.() ?? "saved"
    };
  }

  getContent(): SchematicContent {
    return contentFromDocument(this.document);
  }

  replaceContent(
    content: SchematicContent,
    originOrOptions: string | SchematicEditorMutationOptions = {}
  ) {
    if (this.destroyed) return;
    const options = typeof originOrOptions === "string"
      ? { origin: originOrOptions }
      : originOrOptions;
    this.hostFinishActiveEdits();
    this.transientToolSession.prepareHistoryRestore();
    const nextDocument = documentFromContent(content);
    this.restoreDocumentState(nextDocument);
    this.renderDocument();

    const shouldCommit = options.commit ?? options.history === "push";
    if (shouldCommit) this.commitCurrentContent(options.reason ?? "replace-content", options.origin ?? "editor");
    else this.recordExternalChange(options);
    this.syncToolUi();
    this.emitStateChange();
  }

  transact(
    mutate: (draft: SchematicContent) => void,
    options: SchematicEditorMutationOptions = {}
  ) {
    if (this.destroyed) return;
    const before = this.getContent();
    const draft = structuredClone(before);
    mutate(draft);
    reconcileConnectionEdit(draft, before);
    this.replaceContent(draft, {
      ...options,
      commit: options.commit ?? options.history !== "none",
      reason: options.reason ?? "transaction"
    });
  }

  execute(command: SchematicEditorCommand) {
    if (this.destroyed) return false;
    return this.executeTypedCommand(command);
  }

  run(command: string) {
    if (!this.destroyed) this.runCommand(command);
  }

  flushTransientEdits(_reason = "flush") {
    if (this.destroyed) return;
    this.hostFinishActiveEdits();
  }

  focus() {
    if (!this.destroyed) this.focusCanvas();
  }

  subscribe(listener: SchematicEditorStateListener) {
    if (this.destroyed) return () => {};
    this.stateListeners.add(listener);
    listener(this.getState());
    return () => this.stateListeners.delete(listener);
  }

  private emitStateChange() {
    if (this.destroyed || this.stateListeners.size === 0) return;
    const state = this.getState();
    this.stateListeners.forEach((listener) => listener(state));
  }

  hostNotifySaveStateChange() {
    this.emitStateChange();
  }

  private commitCurrentContent(reason: string, origin = "editor") {
    const revision = this.revision + 1;
    const metadata = { origin, reason, revision };
    const accepted = this.hostBridge.commit(this.getContent(), metadata);
    if (!accepted) return false;
    this.revision = revision;
    this.lastOrigin = origin;
    this.lastReason = reason;
    this.emitStateChange();
    return true;
  }

  private recordExternalChange(options: SchematicEditorMutationOptions) {
    this.revision = options.revision ?? this.revision + 1;
    this.lastOrigin = options.origin ?? "host";
    this.lastReason = options.reason ?? "replace-content";
  }

  private currentViewState(): SchematicViewState {
    return {
      zoom: this.zoom,
      translate: { ...this.viewTranslate },
      presentationMode: this.presentationMode
    };
  }

  private executeTypedCommand(command: SchematicEditorCommand) {
    switch (command.kind) {
      case "symbol-template":
        return this.changeSymbolTemplate(command.templateId);
      case "instance":
        if (command.item) this.beginPlacement(command.item);
        else this.openInstancePalette();
        return true;
      case "wire":
        this.beginWire(command.variant);
        return true;
      case "wire-route":
        return this.applyWireRouteModeCommand(command.routeMode);
      case "label":
        this.beginLabelTool();
        return true;
      case "note":
        this.createNoteAtCurrentPoint();
        return true;
      case "copy":
        this.beginCopyCommand();
        return true;
      case "paste":
        return this.hostBeginClipboardCopy(documentFromContent(command.content));
      case "move":
        this.setMoveBehavior(command.behavior);
        return true;
      case "rotate":
        this.rotateSelectedOrPreview();
        return true;
      case "mirror":
        this.mirrorSelectedOrPreview(command.axis);
        return true;
      case "delete":
        this.applyDeleteSelectionCommand(command.temporary ? "temp-delete" : "delete");
        return true;
      case "fit":
        this.fit();
        return true;
      case "reset":
        this.resetToEmptySchematic();
        return true;
      case "undo":
        this.undo();
        return true;
      case "redo":
        this.redo();
        return true;
      case "cancel":
        this.cancelTool();
        return true;
    }
  }

  private renderPalette() {
    this.instanceSelector.render();
  }

  private changeSymbolTemplate(templateId: SymbolTemplateId) {
    const errorEl = this.options.paletteEl.querySelector<HTMLElement>("[data-symbol-template-error]");
    if (errorEl) { errorEl.hidden = true; errorEl.textContent = ""; }
    try {
      const template = resolveSymbolTemplate(templateId);
      const previous = resolveSymbolTemplate(this.document.symbolTemplate).id;
      if (previous === template.id) return false;
      this.hostFinishActiveEdits();
      // Cancel unfinished drawing/placement and roll back any held geometry drag.
      this.transientToolSession.transition("select", "cancel");
      this.document.symbolTemplate = template.id;
      if (!this.commitCurrentContent("symbol-template")) {
        this.document.symbolTemplate = previous;
        throw new Error("The host could not accept the symbol template change.");
      }
      this.document.components.forEach(component => this.incrementalRenderer.replaceComponent(component));
      this.renderPalette();
      this.syncSelectionStyles();
      this.syncToolUi();
      this.setStatus(`Symbol template: ${template.label}.`);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (errorEl) { errorEl.textContent = message; errorEl.hidden = false; }
      this.setStatus(message);
      this.syncToolUi();
      return false;
    }
  }

  private bindEvents() {
    this.bindControllerEvents();
    this.bindGlobalDocumentWindowInteractions();
    this.bindNoteLayerInteractions();
    this.bindCellGeometrySelectionMovePaperHooks();
    this.bindPaperElementViewportCanvasDomInteractions();
    this.bindPaperPointerMoveDownClickJointJsInteractions();
  }

  private bindControllerEvents() {
    this.options.paletteEl.querySelector<HTMLSelectElement>("[data-symbol-template]")?.addEventListener("change", event => {
      this.execute({ kind: "symbol-template", templateId: (event.currentTarget as HTMLSelectElement).value as SymbolTemplateId });
    }, { signal: this.lifecycleController.signal });
    this.instanceSelector.bind();
    this.toolbarController?.bind();
    this.propertyPanelController.bind();
  }

  private bindGlobalDocumentWindowInteractions() {
    const { signal } = this.lifecycleController;
    this.host.ownerDocument.addEventListener("pointerdown", (event) => {
      if (!this.contextMenuController.containsTarget(event.target)) this.contextMenuController.close();
      if (this.transientToolSession.mode === "place" && this.options.paperEl.contains(event.target as Node)) return;
      if (!this.instanceSelector.contains(event.target)) {
        if (this.transientToolSession.mode === "place") this.instanceSelector.settle();
        else {
          this.instanceSelector.closeDropdown();
          this.instanceSelector.closeOptions();
        }
      }
    }, { signal });

    this.host.ownerWindow.addEventListener("keydown", (event) => this.handleKeydown(event), {
      capture: true,
      signal
    });
  }

  private bindNoteLayerInteractions() {
    const { signal } = this.lifecycleController;
    this.noteLayer.element.addEventListener("pointerdown", (event) => this.handleNotePointerDown(event), { signal });
    this.noteLayer.element.addEventListener("pointermove", (event) => this.handleNotePointerMove(event), { signal });
    this.noteLayer.element.addEventListener("click", (event) => this.handleNoteClick(event), { signal });
    this.noteLayer.element.addEventListener("dblclick", (event) => this.handleNoteDoubleClick(event), { signal });
    this.noteLayer.element.addEventListener("blur", (event) => this.handleNoteBlur(event), { capture: true, signal });
    this.noteLayer.element.addEventListener("input", (event) => this.handleNoteInput(event), { signal });
    this.noteLayer.element.addEventListener("compositionend", () => this.flushScheduledNoteCommit(), { signal });
    ["mousedown", "mouseup", "pointerup"].forEach((type) => {
      this.noteLayer.element.addEventListener(
        type,
        (event) => {
          if (this.noteElementFromEvent(event)) event.stopPropagation();
        },
        { signal }
      );
    });
  }

  private bindCellGeometrySelectionMovePaperHooks(runtime = this.activeRenderRuntime) {
    const { surface } = runtime;
    const paper = surface.paper as any;
    surface.onGeometryChange((cell) => {
      if (runtime === this.activeRenderRuntime) this.handleLiveCellGeometry(cell);
    });

    paper.on("cell:pointerup", (view: any) => {
      if (runtime !== this.activeRenderRuntime) return;
      this.commitCellGeometry(view.model);
    });

    paper.on("element:pointerdown", (view: any, event: MouseEvent) => {
      if (runtime !== this.activeRenderRuntime) return;
      if (event.button !== 0) return;
      if (this.inductorInteractions.pendingSourceId) return;
      const componentId = view.model.get("componentId");
      const netLabelId = view.model.get("netLabelId");
      if (netLabelId && this.transientToolSession.mode === "select") {
        const label = (this.document.netLabels ?? []).find((candidate) => candidate.id === netLabelId);
        if (label) this.netLabelToolController.beginDrag(label);
      }
      const instance = this.document.components.find((component) => component.id === componentId);
      if (componentId && instance && this.transientToolSession.mode === "select") {
        this.cellGeometryInteractionCoordinator.beginComponentMove({
          activeComponentId: componentId,
          selectedIds: this.selectionSession.selectedIds,
          selectedNoteIds: this.selectionSession.selectedNoteIds
        });
      }
    });
  }

  private bindPaperElementViewportCanvasDomInteractions() {
    const { signal } = this.lifecycleController;
    this.options.paperEl.addEventListener(
      "pointerdown",
      this.handleShapeResizePointerDown,
      { capture: true, signal }
    );
    this.options.paperEl.addEventListener("pointerdown", (event) => {
      this.focusCanvas();
      this.viewportController.handleTouchPointerDown(event);
    }, { signal });
    this.options.paperEl.addEventListener("pointermove", (event) => this.viewportController.handleTouchPointerMove(event), { passive: false, signal });
    this.options.paperEl.addEventListener("pointerup", (event) => this.viewportController.handleTouchPointerEnd(event), { signal });
    this.options.paperEl.addEventListener("pointercancel", (event) => this.viewportController.handleTouchPointerEnd(event), { signal });
    this.options.paperEl.addEventListener("mousedown", (event) => {
      this.focusCanvas();
      if (isViewportPanMouseEvent(event)) this.viewportController.startMousePan(event);
    }, { signal });
    this.options.paperEl.addEventListener("mousemove", this.handleCanvasMouseMove, { signal });
    this.options.paperEl.addEventListener("scroll", () => this.updateNoteLayerTransform(), { signal });
    this.options.paperEl.addEventListener("auxclick", (event) => {
      if (isViewportPanMouseEvent(event)) event.preventDefault();
    }, { signal });
    this.options.paperEl.addEventListener("contextmenu", (event) => this.handleSchematicContextMenu(event), { signal });
    this.options.paperEl.addEventListener("wheel", (event) => this.viewportController.handleWheel(event), { passive: false, signal });
  }

  private bindPaperPointerMoveDownClickJointJsInteractions(runtime = this.activeRenderRuntime) {
    const paper = runtime.surface.paper as any;
    paper.on("blank:pointerdown", (event: MouseEvent, x: number, y: number) => {
      if (runtime !== this.activeRenderRuntime) return;
      this.handleBlankPointerDown(event, x, y);
    });

    paper.on("blank:pointermove", (_event: MouseEvent, x: number, y: number) => {
      if (runtime !== this.activeRenderRuntime) return;
      this.handleBlankPointerMove(x, y);
    });

    paper.on("element:pointermove", (view: any, _event: MouseEvent, x: number, y: number) => {
      if (runtime !== this.activeRenderRuntime) return;
      this.handleElementPointerMove(view, x, y);
    });

    paper.on("link:pointerdown", (view: any, event: MouseEvent, x: number, y: number) => {
      if (runtime !== this.activeRenderRuntime) return;
      this.handleLinkPointerDown(view, event, x, y);
    });

    paper.on("link:pointermove", (view: any, _event: MouseEvent, x: number, y: number) => {
      if (runtime !== this.activeRenderRuntime) return;
      this.handleLinkPointerMove(view, x, y);
    });

    paper.on("blank:pointerclick", (event: MouseEvent, x: number, y: number) => {
      if (runtime !== this.activeRenderRuntime) return;
      this.handleBlankPointerClick(event, x, y);
    });

    paper.on("element:pointerclick", (view: any, event: MouseEvent) => {
      if (runtime !== this.activeRenderRuntime) return;
      this.handleElementPointerClick(view, event);
    });

    paper.on("link:pointerclick", (view: any, event: MouseEvent, x: number, y: number) => {
      if (runtime !== this.activeRenderRuntime) return;
      this.handleLinkPointerClick(view, event, x, y);
    });

    paper.on("element:magnet:pointerclick", (view: any, event: MouseEvent, magnet: SVGElement) => {
      if (runtime !== this.activeRenderRuntime) return;
      this.handleMagnetPointerClick(view, event, magnet);
    });
  }

  private handleBlankPointerDown(event: MouseEvent, x: number, y: number) {
    if (this.inductorInteractions.pendingSourceId) return;
    if ((this.transientToolSession.mode !== "select" && !this.isDeleteToolMode()) || event.button !== 0) return;
    this.startDragSelection(event, snapPoint({ x, y }));
  }

  private handleBlankPointerMove(x: number, y: number) {
    if (this.isDeleteToolMode()) this.setDeleteHover([]);
    this.handlePointerMove(snapPoint({ x, y }));
  }

  private handleElementPointerMove(view: any, x: number, y: number) {
    if (this.isDeleteToolMode()) this.setDeleteHover(this.deleteHoverIdsForElement(view));
    this.handlePointerMove(snapPoint({ x, y }));
  }

  private handleLinkPointerDown(view: any, event: MouseEvent, x: number, y: number) {
    this.wireSegmentMove = null;
    if (event.button !== 0 || this.transientToolSession.mode !== "select" || view.model.get("preview")) return;
    const wireId = view.model.get("wireId");
    const wire = this.document.wires.find((candidate) => candidate.id === wireId);
    if (wire) {
      if (this.selectionSession.selectedIds.has(wire.id)
        && this.selectionSession.selectedIds.size + this.selectionSession.selectedNoteIds.size > 1
        && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
        this.cellGeometryInteractionCoordinator.beginWireSelectionMove({
          activeWireId: wire.id, pointer: { x, y },
          selectedIds: this.selectionSession.selectedIds,
          selectedNoteIds: this.selectionSession.selectedNoteIds
        });
        return;
      }
      this.wireSegmentMove = beginWireSegmentMove(this.document, wire.id, { x, y });
      if (this.wireSegmentMove) this.cellGeometryInteractionCoordinator.beginWireMove(wire.id);
    }
  }

  private handleLinkPointerMove(view: any, x: number, y: number) {
    const result = this.cellGeometryInteractionCoordinator.syncWireSelectionMove(
      view.model.get("wireId"), { x, y }, this.transientToolSession.moveBehavior
    );
    if (result) {
      this.projectCellGeometryInteraction(result);
      this.renderInductorCouplings();
      if (result.requestJunctionRefresh) this.junctionRenderCoordinator.scheduleLiveRefresh();
    } else {
      this.moveActiveWireSegment(view.model, { x, y });
    }
    if (this.isDeleteToolMode()) this.setDeleteHover(this.deleteHoverIdsForLink(view, snapPoint({ x, y })));
    this.handlePointerMove(snapPoint({ x, y }));
  }

  private moveActiveWireSegment(cell: any, pointer: Point) {
    const transaction = this.wireSegmentMove;
    if (!transaction || cell.get("wireId") !== transaction.activeWireId) return;
    const result = this.cellGeometryInteractionCoordinator.syncWireSegmentMove(transaction, pointer);
    if (result?.requestJunctionRefresh) this.junctionRenderCoordinator.scheduleLiveRefresh();
  }

  private handleBlankPointerClick(event: MouseEvent, x: number, y: number) {
    if (event.button !== 0) return;
    if (this.viewportController.consumeSuppressedBlankClick()) {
      return;
    }

    const point = snapPoint({ x, y });
    this.applyPointerClickTarget(projectBlankPointerClickTarget(point), event);
  }

  private handleElementPointerClick(view: any, event: MouseEvent) {
    if (event.button !== 0) return;
    event.stopPropagation();
    const clickPoint = this.pointFromClientEvent(event);
    const target = projectElementPointerClickTarget({
      model: view.model,
      clickPoint,
      junctionPoint: view.model.get("junction") ? this.junctionPointFromCell(view.model) : null,
      switchBlade: !!(event.target as Element | null)?.closest?.("[data-switch-blade]")
    });
    if (!target) return;
    this.applyPointerClickTarget(target, event);
  }

  private handleLinkPointerClick(view: any, event: MouseEvent, x: number, y: number) {
    if (event.button !== 0) return;
    event.stopPropagation();
    const point = snapPoint({ x, y });
    this.applyPointerClickTarget(
      projectLinkPointerClickTarget({
        model: view.model,
        point,
        junctions: this.document.junctions,
        junctionHitPoint: this.localPointFromClient(event.clientX, event.clientY),
        junctionHitRadius: JUNCTION_MARKER_RADIUS
      }),
      event
    );
  }

  private handleMagnetPointerClick(view: any, event: MouseEvent, magnet: SVGElement) {
    if (event.button !== 0) return;
    event.stopPropagation();
    const portId = magnet.getAttribute("port");
    const target = projectPinPointerClickTarget({
      model: view.model,
      portId,
      components: this.document.components
    });
    if (!target) return;
    this.applyPointerClickTarget(target, event);
  }

  private applyPointerClickTarget(target: PointerClickTarget, event: MouseEvent) {
    if (this.inductorInteractions.pendingSourceId) {
      this.inductorInteractions.applyInductorCouplingPartnerPick(target);
      return;
    }
    this.applyPointerClickIntent(
      decideSchematicPointerClick({
        mode: this.transientToolSession.mode,
        target,
        copyHasSource: this.copyController.hasSource,
        copyAwaitingReference: this.copyController.awaitingReference,
        analysisPickActive: this.analysisController.hasActivePick(),
        deleteMode: this.isDeleteToolMode(),
        selectionModified: event.shiftKey || event.ctrlKey || event.metaKey || event.altKey
      }),
      event
    );
  }

  private applyPointerClickIntent(intent: PointerClickRoutingIntent, event: MouseEvent) {
    switch (intent.kind) {
      case "ignore":
        return;
      case "status":
        this.setStatus(intent.message);
        return;
      case "clear-selection":
        this.setSelection([]);
        return;
      case "set-copy-reference":
        this.setCopyReference(intent.point);
        return;
      case "place-copy":
        this.placeCopyAt(intent.point);
        return;
      case "place-active-item":
        this.placeActiveItem(intent.point);
        return;
      case "wire-blank-click":
        this.handleWireBlankClick(intent.point);
        return;
      case "wire-pin-click":
        this.handleWirePinClick(intent.point);
        return;
      case "place-label":
        this.placeNetLabel(intent.point, intent.wireId);
        return;
      case "begin-copy":
        this.beginCopyFromTargets([...intent.ids], [], intent.point);
        return;
      case "delete-targets":
        this.applyDeleteToolToIds([...intent.ids]);
        return;
      case "analysis-pick-net":
        this.analysisController.pickNet(intent.point);
        return;
      case "select-target":
        this.selectCell(intent.id, event);
        return;
      case "cycle-switch": {
        this.selectCell(intent.id, event);
        const instance = this.document.components.find(component => component.id === intent.id);
        const command = instance ? switchStateCycleCommand(instance) : null;
        if (command) this.propertyInteractions.run(command);
        return;
      }
    }
  }

  private handleKeydown(event: KeyboardEvent) {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    const ownsKeyboardTarget = this.hostBridge.ownsKeyboardTarget?.(target)
      ?? this.options.shellEl.contains(target);
    if (!ownsKeyboardTarget) return;
    const editable = isEditableTarget(target, this.options.shellEl);
    const key = event.key.toLowerCase();
    if (key === "escape" && this.shapeResizeSession.isActive) {
      event.preventDefault();
      event.stopPropagation();
      this.cancelShapeResize();
      return;
    }
    if (key === "escape" && (target?.closest("[data-math-source-editor]") || this.noteLayer.element.querySelector(".is-source-editing [data-math-source-editor]"))) return;

    const escapeIntent = projectSchematicEscapeKeyIntent({
      key,
      contextMenuOpen: !this.contextMenuController.hidden,
      queryTarget: this.instanceSelector.isQueryTarget(target),
      dropdownOpen: this.instanceSelector.hasDropdownOpen(),
      optionsOpen: this.instanceSelector.hasOptionsOpen(),
      editable,
      noteEditorTarget: !!target && this.noteLayer.element.contains(target),
      noteEditingActive: this.noteInteractionController.hasActiveEdit()
    });
    if (escapeIntent.kind !== "none") {
      this.applySchematicEscapeKeyIntent(event, escapeIntent);
      return;
    }

    if (
      !editable
      && this.noteInteractionController.hasActiveEdit()
      && isUnmodifiedPrintableKey(event)
      && this.noteInteractionController.insertText(event.key)
    ) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (editable) return;

    if (this.instanceSelector.handleKeyboardCapture(event)) return;

    const shortcutIntent = projectSchematicKeyboardShortcut(
      {
        key,
        shiftKey: event.shiftKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey
      },
      this.transientToolSession.mode
    );
    if (shortcutIntent.kind === "none") return;

    this.applySchematicKeyboardShortcutIntent(event, shortcutIntent);
  }

  private applySchematicKeyboardShortcutIntent(event: KeyboardEvent, shortcutIntent: SchematicKeyboardShortcutIntent) {
    if (shortcutIntent.kind === "none") return;

    if (shortcutIntent.preventDefault) event.preventDefault();
    if (shortcutIntent.stopPropagation) event.stopPropagation();

    switch (shortcutIntent.kind) {
      case "undo":
        this.undo();
        return;
      case "redo":
        this.redo();
        return;
      case "finish-wire":
        this.finishWireFromKeyboard();
        return;
      case "delete-selected-or-begin-tool":
        this.deleteSelectedOrBeginTool();
        return;
      case "temporary-delete-selected-or-begin-tool":
        this.temporaryDeleteSelectedOrBeginTool();
        return;
      case "open-instance-palette":
        this.openInstancePalette();
        return;
      case "begin-wire":
        this.beginWire(shortcutIntent.variant);
        return;
      case "begin-copy":
        this.beginCopyCommand();
        return;
      case "begin-label":
        this.beginLabelTool();
        return;
      case "create-note":
        this.createNoteAtCurrentPoint();
        return;
      case "set-move-behavior":
        this.setMoveBehavior(shortcutIntent.behavior);
        return;
      case "rotate":
        this.rotateSelectedOrPreview();
        return;
      case "mirror":
        this.mirrorSelectedOrPreview(shortcutIntent.axis);
        return;
      case "fit":
        this.fit();
        return;
    }
  }

  private applySchematicEscapeKeyIntent(event: KeyboardEvent, intent: SchematicEscapeKeyIntent) {
    if (intent.preventDefault) event.preventDefault();
    if (intent.stopPropagation) event.stopPropagation();

    switch (intent.kind) {
      case "close-context-menu":
        this.contextMenuController.close();
        break;
      case "close-instance-dropdown":
        this.instanceSelector.closeDropdown();
        break;
      case "close-instance-options":
        this.instanceSelector.closeOptions();
        break;
      case "finish-note-edit": {
        const noteId = this.noteInteractionController.editingNoteId;
        if (noteId) this.finishNoteEditing(noteId);
        break;
      }
      case "cancel-tool":
        this.cancelTool();
        return;
      case "none":
        return;
    }

    if (intent.focusCanvas) this.focusCanvas();
  }

  private runCommand(command: string) {
    const intent = projectSchematicToolbarCommandIntent(command);
    this.applySchematicToolbarCommandIntent(intent);
  }

  private applySchematicToolbarCommandIntent(intent: SchematicToolbarCommandIntent) {
    switch (intent.kind) {
      case "toggle-instance-tool":
        this.toggleInstanceTool();
        break;
      case "toggle-wire-tool":
        this.toggleWireTool(intent.variant);
        break;
      case "toggle-label-tool":
        this.toggleLabelTool();
        break;
      case "create-note":
        this.createNoteAtCurrentPoint();
        break;
      case "rotate":
        this.rotateSelectedOrPreview();
        break;
      case "mirror":
        this.mirrorSelectedOrPreview(intent.axis);
        break;
      case "delete-selected-or-begin-tool":
        this.deleteSelectedOrBeginTool();
        break;
      case "temporary-delete-selected-or-begin-tool":
        this.temporaryDeleteSelectedOrBeginTool();
        break;
      case "toggle-presentation-mode":
        this.togglePresentationMode();
        break;
      case "fit":
        this.fit();
        break;
      case "reset":
        this.resetToEmptySchematic();
        break;
      case "undo":
        this.undo();
        break;
      case "redo":
        this.redo();
        break;
      case "none":
        break;
    }
  }

  private handleSchematicContextMenu(event: MouseEvent) {
    const isPanning = this.viewportController.isMousePanActive();
    const isSelectMode = this.transientToolSession.mode === "select";
    const isEditableContextTarget = !isPanning && isSelectMode
      ? isEditableTarget(event.target, this.options.shellEl)
      : false;
    const target = !isPanning && isSelectMode && !isEditableContextTarget ? this.contextTargetFromEvent(event) : null;
    const targetSelected = target ? this.contextTargetIsSelected(target) : false;
    const hasExportableSelection = this.hasExportableSelection();
    const decision = decideSchematicContextMenuOpen({
      isPanning,
      isSelectMode,
      isEditableTarget: isEditableContextTarget,
      isBlankCanvas: !target && !(event.target as Element | null)?.closest?.("[model-id], [data-note-id]"),
      target,
      targetSelected,
      hasExportableSelection
    });

    this.applySchematicContextMenuDecision(event, target, decision);
  }

  private applySchematicContextMenuDecision(event: MouseEvent, target: SchematicContextTarget | null, decision: SchematicContextMenuDecision) {
    if (decision.preventDefault) {
      event.preventDefault();
    }
    if (decision.stopPropagation) {
      event.stopPropagation();
    }
    if (decision.focusCanvas) {
      this.focusCanvas();
    }

    if (decision.selectTarget && target) {
      this.selectContextTarget(target);
    }

    if (decision.closeMenu) {
      this.contextMenuController.close();
      return;
    }

    if (decision.showMenu) {
      this.contextMenuController.show(event.clientX, event.clientY, decision.kind === "show-blank" ? "blank" : "selection");
    }
  }

  hasExportableSelection() {
    return this.selectionSession.hasExportableSelection();
  }

  getSelectionExportInput() {
    return this.prepareSelectionExportInput();
  }

  getSelectionContent() {
    const source = buildSelectionCopySource(
      this.selectedTransformObjects(),
      this.document.junctionAppearances,
      this.document.inductorCouplings,
      this.document.connections,
      this.document.symbolTemplate
    );
    return copySourceCount(source) > 0 ? normalizeSchematicContent(source) : null;
  }

  private async prepareSelectionExportInput() {
    const selection = this.selectedTransformObjects();
    const junctionPoints = selectedExportJunctionPoints(
      this.document,
      this.selectionSession.selectedIds,
      this.presentationMode
    );
    const resolution = resolveSchematicNets(this.document);
    const netLabelStatuses = Object.fromEntries(
      selection.netLabels.flatMap((label) => {
        const status = resolution.labelStates.get(label.id)?.status;
        return status ? [[label.id, status] as const] : [];
      })
    );
    const junctionColors = Object.fromEntries(
      junctionPoints.flatMap((point) => {
        const color = junctionCustomColor(this.document, point);
        return color ? [[pointKey(point), color] as const] : [];
      })
    );
    const input = buildSelectionExportInput(
      { ...selection, junctionPoints },
      this.presentationMode,
      netLabelStatuses,
      junctionColors,
      this.document.connections,
      this.document.symbolTemplate
    );
    const renderedNotes = await Promise.all(input.notes.map(async (note) => {
      const rendered = await this.noteLayer.waitForRenderedNoteExport(note, { inlineStyles: true });
      return {
        id: note.id,
        html: rendered.content ? new this.host.ownerWindow.XMLSerializer().serializeToString(rendered.content) : "",
        text: rendered.text,
        textStyle: rendered.textStyle
      };
    }));
    return {
      ...input,
      renderedNoteHtml: Object.fromEntries(renderedNotes.map(({ id, html }) => [id, html])),
      renderedNoteText: Object.fromEntries(renderedNotes.map(({ id, text }) => [id, text])),
      renderedNoteTextStyles: Object.fromEntries(renderedNotes.map(({ id, textStyle }) => [id, textStyle]))
    };
  }

  private prepareSelectionNetlistText() {
    const componentIds = this.selectedTransformObjects().components.map((component) => component.id);
    return buildSchematicSelectionNetlist(this.document, componentIds)?.text ?? null;
  }

  private prepareSelectionJsonText() {
    const source = buildSelectionCopySource(
      this.selectedTransformObjects(),
      this.document.junctionAppearances,
      this.document.inductorCouplings,
      this.document.connections,
      this.document.symbolTemplate
    );
    return copySourceCount(source) > 0 ? serializeSchematicDocumentFile(source) : null;
  }

  private contextTargetFromEvent(event: MouseEvent): SchematicContextTarget | null {
    const noteTarget = projectSchematicContextMenuTarget({
      noteId: this.noteElementFromEvent(event)?.dataset.noteId
    });
    if (noteTarget) return noteTarget;

    const target = event.target;
    if (!(target instanceof this.host.ownerWindow.Element)) return null;
    const view = this.paper.findView?.(target);
    return projectSchematicContextMenuTarget({ model: view?.model });
  }

  private contextTargetIsSelected(target: SchematicContextTarget) {
    return this.selectionSession.targetIsSelected(target);
  }

  private selectContextTarget(target: SchematicContextTarget) {
    this.finishNoteFontSizePropertyEdit();
    this.clearDeleteHover();
    this.selectionSession.setMixed(
      target.kind === "note" ? [] : [target.id],
      target.kind === "note" ? [target.id] : []
    );
    this.finishSelectionChange();
  }

  private togglePresentationMode() {
    this.presentationMode = !this.presentationMode;
    setSchematicPresentationState({
      paperEl: this.options.paperEl,
      paper: this.paper,
      presentationMode: this.presentationMode,
      grid: SCHEMATIC_GRID
    });
    this.syncPresentationModeGraph();
    this.writeStatus(this.presentationMode
      ? "Presentation mode on: grid and pin markers hidden."
      : "Presentation mode off: grid and pin markers visible.");
    this.syncToolUi(this.netResolutionCache);
    this.persistWorkspaceState();
  }

  private syncPresentationModeGraph() {
    this.junctionRenderCoordinator.cancelScheduledRefresh();
    const previousHoverIds = this.deleteHoverState();
    const clearedDeleteHover = this.deleteToolController.clearHover();
    this.document.components.forEach((component) => {
      const cell: any = this.graphAdapter.getCell(component.id);
      if (!cell) return;
      const attrs = componentCellAttrs(component, {
        symbolTemplate: this.document.symbolTemplate,
        selected: this.selectionSession.isCellSelected(component.id),
        presentationMode: this.presentationMode,
        flipReferenceLabelSide: inductorCouplingFlipsReferenceLabel(this.document, component)
      });
      cell.attr(attrs);
      cell.prop("ports/groups/pin/attrs/portBody", attrs.portBody);
    });
    this.junctionRenderCoordinator.refreshViews();
    if (clearedDeleteHover) {
      this.syncSelectionStyles({ cellIds: previousHoverIds, resolution: this.netResolutionCache });
      this.syncNoteSelectionStyles();
    }
  }

  private openInstancePalette() {
    this.beginPlacement(this.placementToolController.selectedItem, { armPaletteKeyboard: true, prefillQuery: true });
  }

  private toggleInstanceTool() {
    if (this.transientToolSession.mode === "place") {
      this.cancelTool();
      return;
    }
    this.openInstancePalette();
  }

  private beginPlacement(item: InstancePaletteItem, options: { armPaletteKeyboard?: boolean; prefillQuery?: boolean } = {}) {
    this.applyPlacementToolEntryIntent(buildPlacementToolEntryIntent(item, options));
  }

  private applyPlacementToolEntryIntent(intent: PlacementToolEntryIntent<InstancePaletteItem>) {
    this.placementToolController.setItem(intent.placementItem);
    this.transientToolSession.transition(intent.nextMode, "enter-tool");
    this.instanceSelector.beginPlacement(intent.placementItem, intent.instanceSelectorBeginPlacementOptions);
    if (intent.updatePlacementPreview) this.updatePlacementPreview(this.lastPointerPoint);
    if (intent.syncToolUi) this.syncToolUi();
    if (intent.focusTarget === "canvas") this.focusCanvas();
    if (intent.syncPlacementStatus) this.syncPlacementStatus();
  }

  private activatePlacementItem(item: InstancePaletteItem, options: { selectAll?: boolean } = {}) {
    this.placementToolController.setItem(item);
    this.enterPalettePlacementMode();
    this.updatePlacementPreview(this.lastPointerPoint);
    this.syncToolUi();
    this.syncPlacementStatus();
    if (options.selectAll) {
      this.renderSelectionSummary();
    }
  }

  private previewPlacementItem(item: InstancePaletteItem | null) {
    this.placementToolController.previewItem(item);
    if (!this.placementToolController.activeItem) {
      this.removePlacementPreview();
      this.syncPlacementStatus();
      return;
    }
    this.updatePlacementPreview(this.lastPointerPoint);
    this.syncPlacementStatus();
  }

  private enterPalettePlacementMode() {
    this.transientToolSession.transition("place", "enter-tool");
    this.instanceSelector.enterPlacementMode();
  }

  private syncPlacementStatus() {
    if (this.transientToolSession.mode !== "place") return;
    this.writeStatus(buildPlacementStatusMessage(this.placementToolController.activeItem));
    this.renderSelectionSummary();
  }

  private beginCopyCommand() {
    const result = this.copyController.prepareSelectionEntry({
      selection: this.selectedTransformObjects(),
      junctionAppearances: this.document.junctionAppearances,
      inductorCouplings: this.document.inductorCouplings,
      connections: this.document.connections,
      lastPointerPoint: this.lastPointerPoint
    });
    if (result.kind === "no-source") {
      this.applyCopyToolEntryIntent(result.intent);
      return;
    }
    if (result.kind === "empty-source") {
      this.setStatus(result.status);
      return;
    }
    this.applyCopyToolEntryIntent(result.entry.intent, result.entry.attachSource, result.entry.previewPoint);
  }

  private beginCopyFromTargets(ids: string[], noteIds: string[], anchor: Point) {
    const result = this.copyController.prepareTargetEntry(this.document, ids, noteIds, anchor, this.lastPointerPoint ?? anchor);
    if (result.kind === "empty-target") {
      this.setStatus(result.status);
      return;
    }

    this.selectionSession.setMixed(result.ids, result.noteIds);
    this.syncSelectionUi();
    this.applyCopyToolEntryIntent(result.entry.intent, result.entry.attachSource, result.entry.previewPoint);
  }

  private applyCopyToolEntryIntent(intent: CopyToolEntryIntent, attachSource?: () => void, previewPoint?: Point) {
    this.transientToolSession.transition(intent.nextMode, "enter-tool");
    if (intent.closeInstancePanel) this.instanceSelector.closePanel();
    this.viewportController.setNextBlankClickSuppressed(intent.suppressNextBlankClick);
    if (intent.hasSource || intent.awaitingReference) attachSource?.();
    if (intent.hasSource || intent.awaitingReference) this.cacheCopyMarkdownPreviewContent();
    this.copyPreviewNeedsPointer = false;
    if (intent.syncToolUi) this.syncToolUi();
    if (intent.focusTarget === "canvas") this.focusCanvas();
    if (intent.updateCopyPreview) this.updateCopyPreview(previewPoint ?? this.lastPointerPoint);
    this.setStatus(intent.status);
  }

  private placeCopyAt(point: Point) {
    this.copyPreviewNeedsPointer = false;
    this.applyPlacementCommitOutcome(this.placementCommitCoordinator.commitCopy(point));
  }

  private setCopyReference(point: Point) {
    const result = this.copyController.setReferencePoint(point);
    if (!result.ok) {
      this.setStatus(result.status);
      return;
    }
    this.copyPreviewNeedsPointer = false;
    this.updateCopyPreview(point);
    this.syncToolUi();
    this.setStatus(result.status);
  }

  private copyInstantiationFactories(): { nextComponentRef: (type: ComponentType) => string; createId: () => string } {
    return {
      nextComponentRef: (type) => this.nextComponentRef(type),
      createId: () => this.host.idFactory()
    };
  }

  private placeActiveItem(point: Point) {
    if (!this.placementToolController.activeItem) {
      this.setStatus("Type a valid component or template name before placing.");
      return;
    }
    this.instanceSelector.closeDropdown();
    this.commitPlacementItem(point);
  }

  private beginWire(variant: WireToolVariant = "signal") {
    this.applyWireToolEntryIntent(buildWireToolEntryIntent(variant));
  }

  private applyWireRouteModeCommand(routeMode: WireRouteMode | "toggle") {
    if (this.transientToolSession.mode !== "wire") return false;
    if (routeMode === "toggle") this.wireToolController.toggleRouteMode();
    else this.wireToolController.setRouteMode(routeMode);
    this.updateWirePreview(this.lastPointerPoint);
    return true;
  }

  private toggleLabelTool() {
    if (this.transientToolSession.mode === "label") {
      this.cancelTool();
      return;
    }
    this.beginLabelTool();
  }

  private beginLabelTool() {
    this.transientToolSession.transition("label", "enter-tool");
    this.instanceSelector.closePanel();
    this.netLabelToolController.begin();
    this.setSelection([], false);
    this.syncToolUi();
    this.renderPropertyEditor();
    this.requestOwnedFrame(() => this.propertyPanelController.focusLabelToolInput());
    this.setStatus("Label mode: enter a net name, press Enter, then click wires or junctions. Esc cancels.");
  }

  private armLabelPlacement(value: string) {
    const result = this.netLabelToolController.arm(value);
    this.renderPropertyEditor();
    if (result.kind === "invalid") {
      this.propertyPanelController.focusLabelToolInput();
      return;
    }
    this.focusCanvas();
    this.updateNetLabelPreview(this.lastPointerPoint);
    this.setStatus(`Label ${result.name}: click a wire or junction to place; Esc cancels.`);
  }

  private placeNetLabel(point: Point, preferredWireId?: string) {
    this.applyNetLabelCommitOutcome(
      this.netLabelCommitCoordinator.commitPlacement(point, preferredWireId)
    );
  }

  private applyNetLabelCommitOutcome(outcome: SchematicNetLabelCommitOutcome) {
    if (outcome.kind === "status") {
      this.setStatus(outcome.status);
      if (outcome.focusInput) this.propertyPanelController.focusLabelToolInput();
      return;
    }
    this.setSelection([], false);
    this.renderDocument();
    this.consumeHistoryIntent(outcome.result);
    this.syncToolUi();
    this.setStatus(outcome.result.status);
  }

  private toggleWireTool(variant: WireToolVariant = "signal") {
    if (this.transientToolSession.mode === "wire") {
      this.cancelTool();
      return;
    }
    this.beginWire(variant);
  }

  private applyWireToolEntryIntent(intent: WireToolEntryIntent) {
    this.transientToolSession.transition(intent.nextMode, "enter-tool");
    if (intent.closeInstancePanel) this.instanceSelector.closePanel();
    this.wireToolController.begin(intent.wireVariant);
    this.syncToolUi();
    if (intent.focusTarget === "canvas") this.focusCanvas();
    this.setStatus(intent.status);
  }

  private isDeleteToolMode() {
    return isSchematicDeleteToolMode(this.transientToolSession.mode);
  }

  private beginDeleteTool() {
    this.applyDeleteToolEntryIntent(buildDeleteToolEntryIntent("delete"));
  }

  private beginTemporaryDeleteTool() {
    this.applyDeleteToolEntryIntent(buildDeleteToolEntryIntent("temp-delete"));
  }

  private applyDeleteToolEntryIntent(intent: DeleteToolEntryIntent) {
    this.transientToolSession.transition(intent.nextMode, "enter-tool");
    if (intent.closeInstancePanel) this.instanceSelector.closePanel();
    if (intent.clearSelection) {
      this.setSelection([], false);
      this.syncSelectionStyles();
      this.syncNoteSelectionStyles();
    }
    this.syncToolUi();
    if (intent.focusTarget === "canvas") this.focusCanvas();
    this.setStatus(intent.status);
  }

  private deleteSelectedOrBeginTool() {
    this.applyDeleteSelectionCommand("delete");
  }

  private temporaryDeleteSelectedOrBeginTool() {
    this.applyDeleteSelectionCommand("temp-delete");
  }

  private applyDeleteSelectionCommand(mode: DeleteToolMode) {
    const intent = this.deleteToolController.commandForSelection(mode, this.hasExportableSelection());
    switch (intent.kind) {
      case "begin-tool":
        if (intent.mode === "temp-delete") this.beginTemporaryDeleteTool();
        else this.beginDeleteTool();
        return;
      case "delete-selected":
        this.deleteSelected();
        return;
      case "temporary-delete-selected":
        this.toggleTemporaryDeleteSelected();
        return;
    }
  }

  private setMoveBehavior(behavior: MoveBehavior) {
    this.applyMoveBehaviorToolEntryIntent(buildMoveBehaviorToolEntryIntent(behavior));
  }

  private applyMoveBehaviorToolEntryIntent(intent: MoveBehaviorToolEntryIntent) {
    this.transientToolSession.setMoveBehavior(intent.moveBehavior);
    this.transientToolSession.transition(intent.nextMode, "move-behavior");
    if (intent.closeInstancePanel) this.instanceSelector.closePanel();
    if (intent.syncToolUi) this.syncToolUi();
    if (intent.focusTarget === "canvas") this.focusCanvas();
    this.setStatus(intent.status);
  }

  private prepareAnalysisNetPick() {
    this.transientToolSession.transition("select", "analysis");
    this.instanceSelector.closePanel();
    this.syncToolUi();
  }

  private cancelTool() {
    if (this.inductorInteractions.pendingSourceId) {
      this.inductorInteractions.cancel();
      this.focusCanvas();
      this.setStatus("Coupling selection cancelled.");
      return;
    }
    const intent = buildCancelToolIntent();
    this.transientToolSession.transition(intent.nextMode, "cancel");
    if (intent.closeInstancePanel) this.instanceSelector.closePanel();
    this.syncToolUi();
    if (intent.focusTarget === "canvas") this.focusCanvas();
    this.setStatus(intent.status);
  }

  private createNoteAtCurrentPoint() {
    this.transientToolSession.transition("select", "create-note");
    this.instanceSelector.closePanel();
    const anchor = snapPoint(this.lastPointerPoint ?? this.viewportCenterPoint());
    const noteId = this.host.idFactory();
    const result = createPlainSchematicNoteDocumentOp(this.document, noteId, anchor);
    this.setNoteSelection(result.noteIds);
    this.renderNotes();
    this.consumeHistoryIntent(result);
    this.beginNoteEditing(noteId);
    this.setStatus(result.status);
  }

  private nextComponentRef(type: ComponentType) {
    return this.componentRefs.next(type);
  }

  private applyPlacementCommitOutcome(outcome: SchematicPlacementCommitOutcome) {
    if (outcome.kind === "status") {
      this.setStatus(outcome.status);
      return;
    }

    this.setMixedSelection(outcome.result.selectedIds, outcome.result.noteIds, false);
    applyNormalizedDocumentWires(this.document);
    this.renderDocument();
    this.consumeHistoryIntent(outcome.result);
    if (outcome.nextPlacementItem) {
      this.instanceSelector.prepareNextPlacementInput(outcome.nextPlacementItem);
    }
    if (outcome.source === "placement") this.updatePlacementPreview(outcome.previewPoint);
    else this.updateCopyPreview(outcome.previewPoint);
    if (outcome.syncToolUiAfterPreview) this.syncToolUi();
    this.setStatus(outcome.result.status);
  }

  private commitPlacementItem(point: Point) {
    this.applyPlacementCommitOutcome(this.placementCommitCoordinator.commitPlacement(point));
  }

  private handlePointerMove(point: Point) {
    this.lastPointerPoint = point;
    if (this.transientToolSession.mode === "copy") this.copyPreviewNeedsPointer = false;
    this.transientToolSession.projectActivePreview(point);
  }

  private setDeleteHover(ids: string[], noteIds: string[] = []) {
    const mode = this.transientToolSession.mode === "temp-delete" ? "temp-delete" : "delete";
    if (!this.deleteToolController.setHover(this.document, mode, ids, noteIds)) return;
    this.syncSelectionStyles();
    this.syncNoteSelectionStyles();
  }

  private setDeleteHoverFromEvent(event: MouseEvent | PointerEvent) {
    const noteHover = projectDeleteHoverNoteTarget(this.noteElementFromEvent(event)?.dataset.noteId);
    if (noteHover.noteIds.length) {
      this.setDeleteHover(noteHover.ids, noteHover.noteIds);
      return;
    }

    const cellElement = (event.target as Element | null)?.closest<SVGElement>(".joint-cell");
    const cellId = cellElement?.getAttribute("model-id");
    const cell = cellId ? this.graphAdapter.getCell(cellId) : null;
    const isJunction = Boolean(cell?.get("junction"));
    const junctionPoint = isJunction ? this.junctionPointFromCell(cell) : null;
    const cellHover = projectDeleteHoverModelTarget({ model: cell, junctionPoint });
    this.setDeleteHover(cellHover.ids, cellHover.noteIds);
  }

  private clearDeleteHover() {
    if (!this.deleteToolController.clearHover()) return;
    this.syncSelectionStyles();
    this.syncNoteSelectionStyles();
  }

  private deleteHoverIdsForElement(view: any) {
    const isJunction = Boolean(view.model.get("junction"));
    const junctionPoint = isJunction ? this.junctionPointFromCell(view.model) : null;
    return projectDeleteHoverElementTarget({ model: view.model, junctionPoint });
  }

  private deleteHoverIdsForLink(view: any, point: Point) {
    return projectDeleteHoverLinkTarget({ model: view.model, point, junctions: this.document.junctions });
  }

  private handleWireBlankClick(point: Point) {
    this.applyWireCommitOutcome(this.wireCommitCoordinator.applyBlankClick(point));
  }

  private handleWirePinClick(point: Point) {
    this.applyWireCommitOutcome(this.wireCommitCoordinator.applyPinClick(point));
  }

  private finishWireFromKeyboard() {
    this.applyWireCommitOutcome(this.wireCommitCoordinator.finishFromKeyboard(this.lastPointerPoint));
  }

  private applyWireCommitOutcome(outcome: SchematicWireCommitOutcome) {
    if (outcome.kind === "none") return;
    if (outcome.kind === "pending") {
      this.updateWirePreview(outcome.previewPoint);
      this.setStatus(outcome.status);
      return;
    }
    if (outcome.kind === "status") {
      this.setStatus(outcome.status);
      return;
    }
    this.setMixedSelection(outcome.result.selectedIds, outcome.result.noteIds, false);
    this.removeWirePreview();
    this.commitChangedRenderedDocumentTail(outcome.result, outcome.result.status);
  }

  private rotateSelectedOrPreview() {
    if (this.transientToolSession.mode === "place") {
      const result = this.placementToolController.rotatePreview();
      if (result.kind === "template") {
        this.setStatus("Place the template, then rotate or mirror the selected objects.");
        return;
      }
      this.updatePlacementPreview(this.lastPointerPoint);
      this.setStatus(`Preview rotation ${result.pose.rotation} deg. Click to place.`);
      return;
    }
    if (this.transientToolSession.mode === "copy" && (this.copyController.hasSource || this.copyController.awaitingReference)) {
      const result = this.copyController.rotateSource();
      if (!result.ok) {
        this.setStatus(result.status);
        return;
      }
      this.updateCopyPreview(this.lastPointerPoint ?? this.copyController.anchor);
      this.setStatus(result.status);
      return;
    }

    const selection = this.selectedTransformObjects();
    if (selection.count === 0) {
      this.setStatus("Select at least one object before rotating.");
      return;
    }
    if (!this.hasSingleSelectedComponentOnly()) {
      this.transformSelectedObjects("rotate", selection);
      return;
    }
    const instance = selection.components[0];
    const renderSnapshot = captureTransformRenderSnapshot(this.document, {
      componentIds: [instance.id],
      noteIds: []
    });
    const before = this.getContent();
    const result = transformSingleComponentOrientationDocumentOp([instance], "rotate");
    reconcileConnectionEdit(this.document, before);
    this.commitChangedTransformedDocument(result, renderSnapshot);
  }

  private mirrorSelectedOrPreview(axis: "x" | "y") {
    if (this.transientToolSession.mode === "place") {
      const result = this.placementToolController.mirrorPreview(axis);
      if (result.kind === "template") {
        this.setStatus("Place the template, then rotate or mirror the selected objects.");
        return;
      }
      this.updatePlacementPreview(this.lastPointerPoint);
      this.setStatus(`Preview mirrored ${axis === "x" ? "left-right" : "up-down"}. Click to place.`);
      return;
    }
    if (this.transientToolSession.mode === "copy" && (this.copyController.hasSource || this.copyController.awaitingReference)) {
      const result = this.copyController.mirrorSource(axis);
      if (!result.ok) {
        this.setStatus(result.status);
        return;
      }
      this.updateCopyPreview(this.lastPointerPoint ?? this.copyController.anchor);
      this.setStatus(result.status);
      return;
    }

    const selection = this.selectedTransformObjects();
    if (selection.count === 0) {
      this.setStatus("Select at least one object before mirroring.");
      return;
    }
    if (!this.hasSingleSelectedComponentOnly()) {
      this.transformSelectedObjects(axis === "x" ? "mirror-x" : "mirror-y", selection);
      return;
    }
    const instance = selection.components[0];
    const renderSnapshot = captureTransformRenderSnapshot(this.document, {
      componentIds: [instance.id],
      noteIds: []
    });
    const before = this.getContent();
    const result = transformSingleComponentOrientationDocumentOp(
      [instance],
      axis === "x" ? "mirror-x" : "mirror-y"
    );
    reconcileConnectionEdit(this.document, before);
    this.commitChangedTransformedDocument(result, renderSnapshot);
  }

  private hasSingleSelectedComponentOnly() {
    return !!this.selectedSingleComponent();
  }

  private transformSelectedObjects(kind: GroupTransformKind, selection = this.selectedTransformObjects()) {
    const renderSnapshot = captureTransformRenderSnapshot(this.document, {
      componentIds: selection.components.map((component) => component.id),
      noteIds: selection.notes.map((note) => note.id)
    });
    const previousSelection = this.selectionSession.snapshot();
    const result = transformSelectionDocumentGeometryOp(this.document, selection, kind);
    if (!result.changed) {
      this.setStatus(result.status);
      return;
    }

    this.selectionSession.apply(remapSelectionAfterGeometryTransform({
      selection: previousSelection,
      transformedJunctionIds: result.transformedJunctionIds,
      projection: selection,
      kind
    }));
    this.commitChangedTransformedDocumentTail(result, result.status, renderSnapshot);
  }

  private selectedTransformObjects() {
    return this.selectionSession.project();
  }

  private selectedSingleComponent() {
    return this.selectionSession.selectedComponent();
  }

  private restoreSelectedPropertyPreview() {
    this.rebuildCounters();
    this.renderDocument();
    this.renderPropertyEditor();
  }

  private renderIncrementalPropertyBatch(outcome: SchematicPropertyBatchCommandResult) {
    this.incrementalRenderer.runWithDocumentGeometryGuard(() => {
      outcome.targets.componentIds.forEach((componentId) => {
        const component = this.document.components.find((candidate) => candidate.id === componentId);
        if (component) this.incrementalRenderer.replaceComponent(component);
      });
      outcome.targets.wireIds.forEach((wireId) => {
        const wire = this.document.wires.find((candidate) => candidate.id === wireId);
        if (wire) this.incrementalRenderer.replaceWire(wire);
      });
      outcome.targets.junctionPoints.forEach((point) => {
        this.incrementalRenderer.replaceJunction(point);
      });
    });
    if (outcome.targets.componentIds.length > 0) this.renderInductorCouplings();
    if (outcome.targets.noteIds.length > 0) this.renderNotes();
  }

  private deleteSelected() {
    if (!this.selectionSession.hasAny()) {
      this.setStatus(DELETE_SELECTION_EMPTY_STATUS);
      return;
    }
    this.clearDeleteHover();
    const selection = this.selectionSession.project();
    this.applyDeleteCommitOutcome(this.deleteCommitCoordinator.deleteSelection(selection));
  }

  private deleteIds(ids: string[], noteIds: string[] = []) {
    if (ids.length === 0 && noteIds.length === 0) {
      this.setStatus(DELETE_TARGET_EMPTY_STATUS);
      return;
    }
    this.finishNoteFontSizePropertyEdit();
    this.clearDeleteHover();
    this.selectionSession.setMixed(ids, noteIds);
    this.renderSelectionSummary();
    this.deleteSelected();
    this.transientToolSession.setMode("delete");
    this.syncToolUi();
  }

  private applyDeleteToolToIds(ids: string[], noteIds: string[] = []) {
    const mode = this.transientToolSession.mode === "temp-delete" ? "temp-delete" : "delete";
    const plan = this.deleteToolController.planTargetApplication(this.document, mode, ids, noteIds);
    switch (plan.kind) {
      case "status":
        this.setStatus(plan.status);
        return;
      case "temporary-delete-targets":
        this.temporaryDeleteIds(plan.ids);
        return;
      case "delete-targets":
        this.deleteIds(plan.ids, plan.noteIds);
        return;
    }
  }

  private temporaryDeleteIds(ids: string[]) {
    if (ids.length === 0) {
      this.setStatus(TEMPORARY_DELETE_TARGET_EMPTY_STATUS);
      return;
    }
    this.setSelection(ids, false);
    this.toggleTemporaryDeleteSelected();
    this.transientToolSession.setMode("temp-delete");
    this.syncToolUi();
  }

  private toggleTemporaryDeleteSelected() {
    if (this.selectionSession.selectedIds.size === 0) {
      this.setStatus(TEMPORARY_DELETE_SELECTION_EMPTY_STATUS);
      return;
    }

    this.applyDeleteCommitOutcome(
      this.deleteCommitCoordinator.toggleTemporary(this.selectionSession.selectedIds)
    );
  }

  private applyDeleteCommitOutcome(outcome: SchematicDeleteCommitOutcome) {
    if (outcome.kind === "status") {
      this.setStatus(outcome.status);
      return;
    }
    this.setMixedSelection(outcome.result.selectedIds, outcome.result.noteIds, false);
    this.commitChangedRenderedDocumentTail(outcome.result, outcome.result.status);
  }

  private setView(view: SchematicView) {
    this.viewAdapter.setView(view);
    this.updateNoteLayerTransform();
    this.hostBridge.onViewChange(this.currentViewState());
    this.emitStateChange();
  }

  fit() {
    const bounds = expandedRect(schematicDocumentVisualBounds(this.document, { includeNotes: true }), FIT_BOUNDS_MARGIN);
    const fitResult = computeFitView(
      bounds,
      { width: this.options.paperEl.clientWidth, height: this.options.paperEl.clientHeight },
      FIT_PADDING_PX,
      { minZoom: MIN_FIT_ZOOM, maxZoom: MAX_ZOOM }
    );
    this.viewAdapter.resetScroll();
    this.setView(fitResult.view);

    if (!bounds) {
      this.setStatus("Fit view: canvas is empty.");
      return;
    }

    this.setStatus(fitResult.clampedToMinZoom ? "Fit view reached minimum zoom; contents may exceed the viewport." : "Fit view to schematic contents.");
  }

  private consumeHistoryIntent(intentOrResult: SchematicDocumentHistoryIntent | Pick<SchematicDocumentOpResult, "historyIntent">): boolean {
    const historyIntent = typeof intentOrResult === "string" ? intentOrResult : intentOrResult.historyIntent;
    if (historyIntent !== "push") return false;
    this.commitCurrentContent("edit", "editor");
    return true;
  }

  private commitChangedTransformedDocument(
    result: Pick<SchematicDocumentOpResult, "historyIntent" | "status">,
    renderSnapshot: TransformRenderSnapshot
  ) {
    this.commitChangedTransformedDocumentTail(result, result.status, renderSnapshot);
  }

  private commitChangedNoteDocument(
    result: Pick<SchematicDocumentOpResult, "historyIntent">,
    options: { afterCommit?: () => void } = {}
  ) {
    options.afterCommit?.();
    this.consumeHistoryIntent(result);
  }

  private commitChangedRenderedDocumentTail(result: Pick<SchematicDocumentOpResult, "historyIntent">, status: string) {
    applyNormalizedDocumentWires(this.document);
    this.renderDocument();
    this.consumeHistoryIntent(result);
    this.setStatus(status);
  }

  private commitChangedTransformedDocumentTail(
    result: Pick<SchematicDocumentOpResult, "historyIntent">,
    status: string,
    renderSnapshot: TransformRenderSnapshot
  ) {
    applyNormalizedDocumentWires(this.document);
    const resolution = this.renderTransformedDocument(renderSnapshot);
    this.consumeHistoryIntent(result);
    this.setStatus(status, resolution);
  }

  private undo() {
    const previous = this.hostBridge.undo();
    this.restoreHistoryContent(previous, "undo");
  }

  private redo() {
    const next = this.hostBridge.redo();
    this.restoreHistoryContent(next, "redo");
  }

  private restoreHistoryContent(content: SchematicContent | null, origin: "undo" | "redo") {
    if (!content) return;
    this.transientToolSession.prepareHistoryRestore();
    this.restoreDocumentState(documentFromContent(content));
    this.renderDocument();
    this.syncToolUi();
    this.recordExternalChange({ origin, reason: origin });
    this.emitStateChange();
  }

  private restoreDocumentState(parsed: SchematicDocument) {
    const templateOnly = parsed.symbolTemplate !== this.document.symbolTemplate
      && JSON.stringify({ ...contentFromDocument(parsed), symbolTemplate: undefined })
        === JSON.stringify({ ...this.getContent(), symbolTemplate: undefined });
    restoreSchematicDocumentOp(this.document, parsed);
    this.rebuildCounters();
    if (!templateOnly) this.setMixedSelection([], [], false);
  }

  private persistWorkspaceState() {
    this.hostBridge.onViewChange(this.currentViewState());
    return true;
  }

  hostCaptureDocument(): SchematicHostedDocumentSnapshot {
    return {
      document: cloneSchematicDocument(this.document),
      view: {
        zoom: this.zoom,
        translate: { ...this.viewTranslate },
        presentationMode: this.presentationMode
      }
    };
  }

  hostCaptureView() { return this.currentViewState(); }

  hostActivateDocument(input: SchematicHostedDocumentActivation) {
    if (this.destroyed) return;
    const preserveCopy =
      this.transientToolSession.mode === "copy"
      && this.copyController.hasSource;
    if (preserveCopy) this.cacheCopyMarkdownPreviewContent();

    this.hostFinishActiveEdits();
    this.viewportController.cancelActiveGestures();
    this.transientToolSession.prepareDocumentSwitch(preserveCopy);
    this.analysisController.cancelPendingCompute();

    if (this.activeHostedDocumentId) {
      const selectedIds = new Set(this.selectionSession.selectedIds);
      this.selectionSession.setMixed([], []);
      this.syncSelectionStyles({ cellIds: selectedIds, resolution: this.netResolutionCache });
      this.syncNoteSelectionStyles();
      this.junctionRenderCoordinator.cancelScheduledRefresh();
      this.noteLayer.deactivateDocument(this.activeHostedDocumentId);
      this.noteLayer.discardDocument(this.activeHostedDocumentId);
    }

    this.lastPointerPoint = null;
    this.copyPreviewNeedsPointer = preserveCopy;
    this.activeHostedDocumentId = input.id;
    this.noteLayer.activateDocument(input.id);
    this.restoreDocumentState(input.document);
    this.presentationMode = input.view.presentationMode;
    setSchematicPresentationState({
      paperEl: this.options.paperEl,
      paper: this.paper,
      presentationMode: this.presentationMode,
      grid: SCHEMATIC_GRID
    });
    this.setView({
      zoom: input.view.zoom,
      translate: { ...input.view.translate }
    });
    this.renderDocument();
    this.analysisController.setSelection(
      input.analysisSelection ?? { inputP: "", inputN: "", outputP: "", outputN: "" }
    );
    this.syncToolUi();
    this.renderSelectionSummary();
    this.setStatus(
      preserveCopy
        ? `Switched to ${input.title}. Move over the canvas and click to place the copied objects.`
        : `Switched to ${input.title}.`
    );
  }

  hostDocument() {
    return cloneSchematicDocument(this.document);
  }

  hostBeginClipboardCopy(document: SchematicDocument) {
    if (this.destroyed) return false;
    const source = copySourceFromDocument(document);
    const anchor = copySourceCenterAnchor(source);
    if (copySourceCount(source) === 0 || !anchor) {
      this.setStatus("The clipboard schematic does not contain copyable objects.");
      return false;
    }

    const previewPoint = this.lastPointerPoint ?? this.viewportCenterPoint();
    const entry = this.copyController.prepareSourceEntry(source, anchor, previewPoint, {
      emptyStatus: "The clipboard schematic does not contain copyable objects."
    });
    if (!entry.ok) {
      this.setStatus(entry.status);
      return false;
    }
    this.hostFinishActiveEdits();
    this.applyCopyToolEntryIntent(entry.intent, entry.attachSource, entry.previewPoint);
    return true;
  }

  hostFinishActiveEdits() {
    const editingNoteId = this.noteInteractionController.editingNoteId;
    if (editingNoteId) this.finishNoteEditing(editingNoteId);
    this.finishNoteFontSizePropertyEdit();
    this.finishNoteWidthPropertyEdit();
    this.propertyInteractions.flush();
  }

  hostSetStatus(message: string) {
    this.setStatus(message);
  }

  hostPrepareAnalysisNetPick() {
    this.prepareAnalysisNetPick();
  }

  hostFocusCanvas() {
    this.focusCanvas();
  }

  hostPrepareSelectionExportInput() {
    return this.prepareSelectionExportInput();
  }

  hostPrepareSelectionNetlistText() {
    return this.prepareSelectionNetlistText();
  }

  hostPrepareSelectionJsonText() {
    return this.prepareSelectionJsonText();
  }

  private cacheCopyMarkdownPreviewContent() {
    const generation = ++this.copyMarkdownPreviewGeneration;
    const notesByMarkdown = new Map<string, SchematicNote>();
    this.copyController.sourceNotes.forEach((note) => {
      if (
        note.format === "markdown"
        && !this.copyMarkdownPreviewContent.has(note.text)
        && !notesByMarkdown.has(note.text)
      ) {
        notesByMarkdown.set(note.text, note);
      }
    });
    const notes = Array.from(notesByMarkdown.values());
    if (notes.length === 0) return;

    void Promise.all(notes.map(async (note) => {
      const existing = this.noteLayer.cloneRenderedMarkdownByText(note.text);
      if (existing) return [note.text, existing] as const;
      const liveContent = this.noteLayer.getNoteElement(note.id)
        ? await this.noteLayer.waitForRenderedNoteContent(note).catch(() => null)
        : null;
      const content = liveContent ?? await this.noteLayer.renderDetachedMarkdown(note.text);
      return [note.text, content] as const;
    })).then((entries) => {
      if (generation !== this.copyMarkdownPreviewGeneration) return;
      let changed = false;
      entries.forEach(([markdown, content]) => {
        if (!content || !this.copyController.sourceNotes.some((note) => note.format === "markdown" && note.text === markdown)) return;
        this.copyMarkdownPreviewContent.set(markdown, content);
        changed = true;
      });
      if (changed && this.transientToolSession.mode === "copy") {
        this.updateCopyPreview(this.lastPointerPoint ?? this.copyController.anchor);
      }
    });
  }

  private rebuildCounters() {
    this.componentRefs.rebuild(this.document);
  }

  private resetToEmptySchematic() {
    this.transientToolSession.transition("select", "reset");
    const result = resetSchematicDocument(this.document);
    this.rebuildCounters();
    this.setMixedSelection(result.selectedIds, result.noteIds, false);
    this.setView(defaultSchematicView());
    this.analysisController.setSelection({ inputP: "", inputN: "", outputP: "", outputN: "" });
    syncSchematicPaperModeClasses(this.options.paperEl, this.transientToolSession.mode);
    applyNormalizedDocumentWires(this.document);
    this.renderDocument();
    if (!this.consumeHistoryIntent(result)) {
      this.persistWorkspaceState();
    }
    this.syncToolUi();
    this.setStatus(result.status);
  }

  private renderDocument() {
    this.cellGeometryInteractionCoordinator.invalidateAgainstDocument();
    this.junctionRenderCoordinator.prepareForGraphClear();
    this.previewRenderer.prepareForGraphClear();
    this.selectionBoxController.forgetCell();
    this.deleteToolController.clearHover();
    this.graphAdapter.clear();
    this.graphAdapter.addCells(
      (this.document.inductorCouplings ?? [])
        .map((coupling) => this.makeInductorCouplingCell(coupling))
        .filter((cell): cell is NonNullable<typeof cell> => !!cell)
    );
    this.graphAdapter.addCells(this.document.components.map((component) => this.makeComponentCell(component)));
    this.graphAdapter.addCells(this.document.wires.map((wire) => this.makeWireCell(wire)));
    const resolution = resolveSchematicNets(this.document);
    this.netResolutionCache = resolution;
    this.analysisController.refreshNetSelectorsFromNames(resolution.nets.keys());
    this.graphAdapter.addCells((this.document.netLabels ?? []).map((label) =>
      makeNetLabelCell(label, {
        selected: this.selectionSession.isCellSelected(label.id),
        status: resolution.labelStates.get(label.id)?.status
      })
    ));
    this.junctionRenderCoordinator.refreshFull(resolution);
    this.syncSelectionStyles({ resolution });
    this.renderNotes();
    this.transientToolSession.projectActivePreview(
      this.lastPointerPoint,
      this.lastPointerPoint ?? this.copyController.anchor
    );
    syncSchematicPaperModeClasses(this.options.paperEl, this.transientToolSession.mode);
  }

  private renderTransformedDocument(renderSnapshot: TransformRenderSnapshot) {
    this.cellGeometryInteractionCoordinator.invalidateAgainstDocument();
    this.junctionRenderCoordinator.cancelScheduledRefresh();
    this.selectionBoxController.forgetCell();
    const clearedDeleteHover = this.deleteToolController.clearHover();

    this.incrementalRenderer.runWithDocumentGeometryGuard(() => {
      const componentIds = new Set(renderSnapshot.componentIds);
      for (const coupling of this.document.inductorCouplings ?? []) {
        if (
          componentIds.has(coupling.inductorAId)
          || componentIds.has(coupling.inductorBId)
        ) {
          componentIds.add(coupling.inductorAId);
          componentIds.add(coupling.inductorBId);
        }
      }
      componentIds.forEach((componentId) => {
        const component = this.document.components.find((candidate) => candidate.id === componentId);
        if (component) this.incrementalRenderer.replaceComponent(component);
      });
    });
    this.renderInductorCouplings();

    this.incrementalRenderer.updateWireCellsFromDocument(changedTransformWireIds(renderSnapshot, this.document));
    const resolution = resolveSchematicNets(this.document);
    this.netResolutionCache = resolution;
    this.analysisController.refreshNetSelectorsFromNames(resolution.nets.keys());
    (this.document.netLabels ?? []).forEach((label) => {
      this.incrementalRenderer.replaceGraphCellPreservingZ(label.id, makeNetLabelCell(label, {
        selected: this.selectionSession.isCellSelected(label.id),
        status: resolution.labelStates.get(label.id)?.status
      }));
    });
    this.junctionRenderCoordinator.refreshFull(resolution);

    renderSnapshot.noteIds.forEach((noteId) => {
      const note = (this.document.notes ?? []).find((candidate) => candidate.id === noteId);
      if (note) this.noteLayer.positionNoteElement(note, this.noteLayerState());
    });
    if (clearedDeleteHover) {
      this.syncSelectionStyles({ resolution });
      this.syncNoteSelectionStyles();
    }
    this.transientToolSession.projectActivePreview(
      this.lastPointerPoint,
      this.lastPointerPoint ?? this.copyController.anchor
    );
    syncSchematicPaperModeClasses(this.options.paperEl, this.transientToolSession.mode);
    return resolution;
  }

  private handleLiveCellGeometry(cell: any) {
    if (this.transientToolSession.mode !== "select") return;
    const result = this.cellGeometryInteractionCoordinator.syncLive(
      cell,
      this.transientToolSession.moveBehavior
    );
    if (!result) return;
    this.projectCellGeometryInteraction(result);
    this.renderInductorCouplings();
    if (!result.requestJunctionRefresh) return;
    this.junctionRenderCoordinator.scheduleLiveRefresh();
  }

  private commitCellGeometry(cell: any) {
    if (!cell) return;
    if (cell.get("netLabelId")) {
      this.commitNetLabelGeometry(cell);
      return;
    }
    if (cell.get("wireId") === this.wireSegmentMove?.activeWireId) this.wireSegmentMove = null;
    const result = this.cellGeometryInteractionCoordinator.finalize(
      cell,
      this.transientToolSession.moveBehavior
    );
    if (!result) return;
    this.projectCellGeometryInteraction(result);
    const { commit } = result;
    if (!commit.changed) return;
    applyNormalizedDocumentWires(this.document);
    this.document.junctions = buildVisibleJunctions(this.document);
    pruneJunctionAppearances(this.document);
    this.renderDocument();
    this.consumeHistoryIntent(commit);
    this.setStatus(commit.status);
  }

  private projectCellGeometryInteraction(
    result: CellGeometryInteractionLiveResult | CellGeometryInteractionFinalizeResult
  ) {
    const selectionMove = result.selectionMove;
    if (!selectionMove?.changed) return;
    if (selectionMove.transformedJunctionIds.length > 0) {
      this.selectionSession.remapJunctions(selectionMove.transformedJunctionIds);
      this.renderSelectionSummary();
    }
    selectionMove.movedNoteIds.forEach((noteId) => {
      const note = this.noteById(noteId);
      if (note) this.noteLayer.positionNoteElement(note, this.noteLayerState());
    });
  }

  private junctionPointFromCell(cell: any) {
    const key = String(cell.get("junctionKey") ?? "");
    return parseJunctionKey(key);
  }

  private makeComponentCell(instance: ComponentInstance, options: { preview?: boolean } = {}) {
    return makeComponentCell(instance, {
      ...options,
      symbolTemplate: this.document.symbolTemplate,
      presentationMode: this.presentationMode,
      selected: this.selectionSession.isCellSelected(instance.id),
      flipReferenceLabelSide: inductorCouplingFlipsReferenceLabel(this.document, instance),
      resizeHandles:
        (instance.type === "rectangle" || instance.type === "triangle")
        && this.selectionSession.selectedIds.size === 1
        && this.selectionSession.selectedNoteIds.size === 0
        && this.selectionSession.isCellSelected(instance.id)
    });
  }

  private makeInductorCouplingCell(
    coupling: NonNullable<SchematicDocument["inductorCouplings"]>[number]
  ) {
    return makeInductorCouplingCell(
      this.document,
      coupling,
      this.selectionSession.isCellSelected(coupling.id)
    );
  }

  private renderInductorCouplings() {
    this.graphAdapter.getCells().forEach((cell) => {
      if (cell.get("couplingId")) cell.remove();
    });
    this.graphAdapter.addCells(
      (this.document.inductorCouplings ?? [])
        .map((coupling) => this.makeInductorCouplingCell(coupling))
        .filter((cell): cell is NonNullable<typeof cell> => !!cell)
    );
  }

  private renderInductorCouplingEndpoints(couplingId: string) {
    const coupling = (this.document.inductorCouplings ?? [])
      .find((candidate) => candidate.id === couplingId);
    if (!coupling) return;
    this.incrementalRenderer.runWithDocumentGeometryGuard(() => {
      [coupling.inductorAId, coupling.inductorBId].forEach((componentId) => {
        const component = this.document.components.find((candidate) => candidate.id === componentId);
        if (component) this.incrementalRenderer.replaceComponent(component);
      });
    });
  }

  private cancelShapeResize() {
    if (!this.shapeResizeSession.cancel()) return;
    this.removeShapeResizeListeners();
    this.renderDocument();
    this.renderPropertyEditor();
    this.setStatus("Shape resize cancelled.");
  }

  private removeShapeResizeListeners() {
    this.host.ownerWindow.removeEventListener("pointermove", this.handleShapeResizePointerMove, true);
    this.host.ownerWindow.removeEventListener("pointerup", this.handleShapeResizePointerUp, true);
    this.host.ownerWindow.removeEventListener("pointercancel", this.handleShapeResizePointerCancel, true);
    this.shapeResizePointerId = null;
  }

  private makeWireCell(
    wire: Wire,
    options: { preview?: boolean; endpointConnections?: WireEndpointConnections } = {}
  ) {
    return makeWireCell(wire, {
      ...options,
      selected: this.selectionSession.isCellSelected(wire.id),
      endpointConnections: options.endpointConnections
        ?? (options.preview ? undefined : wireEndpointConnections(this.document, wire))
    });
  }

  private updatePlacementPreview(point: Point | null) {
    if (this.transientToolSession.mode !== "place" || !point || !this.placementToolController.activeItem) {
      this.previewRenderer.clearPlacement();
      return;
    }
    const preview = this.placementToolController.buildPreview(point);
    this.previewRenderer.renderPlacement(preview);
  }

  private updateNetLabelPreview(point: Point | null) {
    if (this.transientToolSession.mode !== "label") {
      this.previewRenderer.clearLabel();
      return;
    }
    const preview = this.netLabelToolController.buildPreview(this.document, point);
    this.previewRenderer.renderLabel(preview
      ? { id: PREVIEW_NET_LABEL_ID, name: preview.name, attachment: preview.attachment }
      : null);
  }

  private commitNetLabelGeometry(cell: any) {
    const labelId = String(cell.get("netLabelId") ?? "");
    const result = this.netLabelToolController.finishDrag(this.document, labelId, cell.position());
    if (result.kind === "ignored") return;
    const label = (this.document.netLabels ?? []).find((candidate) => candidate.id === result.labelId);
    if (!label) return;
    switch (result.kind) {
      case "canceled":
        label.attachment = result.attachment;
        this.renderDocument();
        this.setStatus("Label move canceled: drop it on an active wire or junction.");
        return;
      case "unchanged":
        this.renderDocument();
        return;
      case "changed":
        label.attachment = result.attachment;
        break;
    }
    this.renderDocument();
    this.consumeHistoryIntent("push");
    this.setStatus(`Moved label ${label.name}.`);
  }

  private updateCopyPreview(point: Point | null) {
    if (this.copyPreviewNeedsPointer || this.transientToolSession.mode !== "copy" || !point) {
      this.previewRenderer.clearCopy();
      return;
    }
    const previewInput = this.copyController.preparePreview(point, this.copyInstantiationFactories());
    if (!previewInput.ok) {
      this.previewRenderer.renderCopy(null);
      return;
    }
    const previewLabels = previewInput.preview.netLabels ?? [];
    bindStandaloneNetLabelsAtPoint(this.document, previewLabels, point);
    this.previewRenderer.renderCopy(previewInput.preview);
  }

  private updateWirePreview(point: Point | null) {
    if (this.transientToolSession.mode !== "wire") {
      this.previewRenderer.clearWire();
      return;
    }
    const points = this.wireToolController.previewPath(point);
    this.previewRenderer.renderWire(
      points,
      this.wireToolController.appearance(),
      this.wireToolController.routeMode
    );
  }

  private removePlacementPreview() {
    this.previewRenderer.clearPlacement();
  }

  private clearCopyState() {
    this.copyController.cancel();
    this.copyMarkdownPreviewGeneration += 1;
    this.copyMarkdownPreviewContent.clear();
    this.copyPreviewNeedsPointer = false;
    this.removeCopyPreview();
  }

  private removeCopyPreview() {
    this.previewRenderer.clearCopy();
  }

  private removeWirePreview() {
    this.previewRenderer.clearWire();
  }

  private clearNetLabelTransientState() {
    const draggedLabelId = this.netLabelToolController.snapshot().drag?.id;
    this.netLabelToolController.cancel();
    this.previewRenderer.clearLabel();
    if (!draggedLabelId) return;
    const label = (this.document.netLabels ?? []).find((candidate) => candidate.id === draggedLabelId);
    const cell = this.graphAdapter.getCell(draggedLabelId);
    if (!label || !cell) return;
    const position = netLabelPosition(label);
    cell.position(position.x, position.y);
  }

  private clearNetLabelDocumentInteraction() {
    this.netLabelToolController.clearDrag();
    this.previewRenderer.clearLabel();
  }

  private clearSelectionBoxTransient() {
    this.selectionBoxController.clearTransient();
  }

  private clearNotePointerInteractions(policy: TransientInteractionCleanupPolicy) {
    const cleanup = this.noteInteractionController.clearPointerInteractions(policy);
    if (cleanup.dragNoteIds.length > 0) {
      this.removeNoteDragListeners();
      if (policy === "rollback") {
        cleanup.dragNoteIds.forEach((noteId) => {
          const note = this.noteById(noteId);
          if (note) this.noteLayer.positionNoteElement(note, this.noteLayerState());
        });
      }
    }
    if (cleanup.widthNoteId) this.removeNoteWidthDragListeners();
  }

  private clearCellGeometryInteraction(policy: TransientInteractionCleanupPolicy) {
    if (policy === "discard") {
      this.cellGeometryInteractionCoordinator.invalidateAgainstDocument();
      return;
    }
    const canceled = this.cellGeometryInteractionCoordinator.cancelActiveInteraction();
    if (!canceled) return;
    if (canceled.restoredJunctionIds.length > 0) {
      this.selectionSession.remapJunctions(canceled.restoredJunctionIds);
    }
    this.renderDocument();
  }

  private removeNoteDragListeners() {
    this.host.ownerWindow.removeEventListener("pointermove", this.handleGlobalNotePointerMove, true);
    this.host.ownerWindow.removeEventListener("pointerup", this.handleGlobalNotePointerUp, true);
  }

  private removeNoteWidthDragListeners() {
    this.host.ownerWindow.removeEventListener("pointermove", this.handleGlobalNoteWidthPointerMove, true);
    this.host.ownerWindow.removeEventListener("pointerup", this.handleGlobalNoteWidthPointerUp, true);
  }

  private commitNotePropertyResult(result: SchematicDocumentOpResult | null) {
    if (!result?.changed) return false;
    this.commitChangedNoteDocument(result);
    this.setStatus(result.status);
    return true;
  }

  private renderNotes() {
    this.notePropertyBatchSession.invalidateAgainstDocument(
      Array.from(this.selectionSession.selectedNoteIds)
    );
    const invalidation = this.noteInteractionController.invalidateAgainstDocument();
    if (invalidation.drag) this.removeNoteDragListeners();
    if (invalidation.width) this.removeNoteWidthDragListeners();
    this.noteLayer.render(this.document.notes ?? [], this.noteLayerState());
  }

  private updateNoteLayerTransform() {
    this.noteLayer.updateTransform(this.document.notes ?? [], this.noteLayerState());
    if (this.transientToolSession.mode === "copy" && this.copyController.hasSource) {
      this.updateCopyPreview(this.lastPointerPoint ?? this.copyController.anchor);
    }
  }

  private noteLayerState() {
    return {
      selectedIds: this.selectionSession.selectedNoteIds,
      editingNoteId: this.noteInteractionController.editingNoteId,
      zoom: this.zoom,
      noteFontSizePx,
      worldToScreenPoint: (point: Point) => this.worldToScreenPoint(point)
    };
  }

  private handleNotePointerDown(event: PointerEvent) {
    const element = this.noteElementFromEvent(event);
    if (!element) return;
    const noteId = element.dataset.noteId;
    if (!noteId) return;
    const widthHandle = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-note-width-handle]");
    if (widthHandle && element.contains(widthHandle)) {
      this.beginNoteWidthDrag(event, noteId);
      return;
    }
    event.stopPropagation();
    if (this.isDeleteToolMode()) {
      this.handleDeleteModeNotePointerDown(event, noteId);
      return;
    }
    if (this.transientToolSession.mode === "copy") {
      this.handleCopyModeNotePointerDown(event, noteId);
      return;
    }
    if (this.noteInteractionController.isEditing(noteId)) return;
    event.preventDefault();
    this.focusCanvas();
    const note = this.noteById(noteId);
    if (!note) return;
    if (event.button !== 0 && this.selectionSession.isNoteSelected(noteId)) return;
    const preserveSelectedGroup = event.button === 0 &&
      selectionGestureFromEvent(event) === "plain" &&
      this.selectionSession.isNoteSelected(noteId) &&
      this.selectionSession.selectedIds.size + this.selectionSession.selectedNoteIds.size > 1;
    if (!preserveSelectedGroup) this.setNoteSelectionFromEvent(noteId, event);
    if (event.button !== 0) return;
    this.beginNoteDrag(event, element, noteId);
  }

  private handleDeleteModeNotePointerDown(event: PointerEvent, noteId: string) {
    event.preventDefault();
    this.applyDeleteToolToIds([], [noteId]);
  }

  private handleCopyModeNotePointerDown(event: PointerEvent, noteId: string) {
    if (event.button !== 0) return;
    event.preventDefault();
    this.focusCanvas();
    const point = this.pointFromClientEvent(event);
    if (this.copyController.awaitingReference) this.setCopyReference(point);
    else if (this.copyController.hasSource) this.placeCopyAt(point);
    else this.beginCopyFromTargets([], [noteId], point);
  }

  private beginNoteDrag(event: PointerEvent, element: HTMLElement, noteId: string) {
    if (!this.cellGeometryInteractionCoordinator.beginNoteMove({
      activeNoteId: noteId,
      selectedIds: this.selectionSession.selectedIds,
      selectedNoteIds: this.selectionSession.selectedNoteIds
    })) return;
    if (!this.noteInteractionController.beginDrag({
      noteId,
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      selectedNoteIds: this.selectionSession.selectedNoteIds
    })) {
      this.cellGeometryInteractionCoordinator.invalidateAgainstDocument();
      return;
    }
    element.setPointerCapture?.(event.pointerId);
    this.host.ownerWindow.addEventListener("pointermove", this.handleGlobalNotePointerMove, true);
    this.host.ownerWindow.addEventListener("pointerup", this.handleGlobalNotePointerUp, true);
  }

  private handleNotePointerMove(event: PointerEvent) {
    if (!this.isDeleteToolMode()) return;
    const noteId = this.noteElementFromEvent(event)?.dataset.noteId;
    this.setDeleteHover([], noteId ? [noteId] : []);
  }

  private beginNoteWidthDrag(event: PointerEvent, noteId: string) {
    const note = this.noteById(noteId);
    if (!note || note.format !== "markdown" || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    this.setNoteSelection([noteId]);
    if (!this.noteInteractionController.beginWidthDrag({
      noteId,
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY
    })) return;
    this.host.ownerWindow.addEventListener("pointermove", this.handleGlobalNoteWidthPointerMove, true);
    this.host.ownerWindow.addEventListener("pointerup", this.handleGlobalNoteWidthPointerUp, true);
  }

  private handleNoteClick(event: MouseEvent) {
    const element = this.noteElementFromEvent(event);
    if (!element) return;
    event.stopPropagation();
    if (this.transientToolSession.mode === "copy" || this.isDeleteToolMode()) return;
    const noteId = element.dataset.noteId;
    if (!noteId || this.noteInteractionController.isEditing(noteId) || this.noteInteractionController.consumeMoved(noteId)) return;
    this.setNoteSelectionFromEvent(noteId, event);
  }

  private handleNoteDoubleClick(event: MouseEvent) {
    const element = this.noteElementFromEvent(event);
    if (!element) return;
    event.stopPropagation();
    if (this.transientToolSession.mode === "copy" || this.isDeleteToolMode()) return;
    const noteId = element.dataset.noteId;
    if (noteId && this.noteInteractionController.isEditing(noteId)) return;
    event.preventDefault();
    if (noteId) this.beginNoteEditing(noteId);
  }

  private handleNoteBlur(event: FocusEvent) {
    const element = this.noteElementFromEvent(event);
    const noteId = element?.dataset.noteId;
    const nextTarget = event.relatedTarget;
    const notePropertySelector = "[data-property-note-form]";
    if ((event.target as Element | null)?.closest?.("[data-math-source-editor]")) {
      if (element && nextTarget instanceof this.host.ownerWindow.Node && element.contains(nextTarget)) return;
      if (nextTarget instanceof this.host.ownerWindow.Element && nextTarget.closest(notePropertySelector)) return;
      if (noteId) {
        queueMicrotask(() => {
          const currentElement = this.noteLayer.getNoteElement(noteId);
          const activeElement = currentElement?.ownerDocument.activeElement;
          if (currentElement && activeElement instanceof this.host.ownerWindow.Node && currentElement.contains(activeElement)) return;
          if (activeElement instanceof this.host.ownerWindow.Element && activeElement.closest(notePropertySelector)) return;
          if (this.noteInteractionController.isEditing(noteId)) this.finishNoteEditing(noteId);
        });
      }
      return;
    }
    if (element && nextTarget instanceof this.host.ownerWindow.Node && element.contains(nextTarget)) return;
    if (
      nextTarget instanceof this.host.ownerWindow.Element
      && nextTarget.closest(notePropertySelector)
    ) return;
    if (noteId && this.noteInteractionController.isEditing(noteId)) {
      this.finishNoteEditing(noteId);
    }
  }

  private handleNoteInput(event: Event) {
    if ((event.target as Element | null)?.closest?.("[data-math-source-editor]")) return;
    const element = this.noteElementFromEvent(event);
    const noteId = element?.dataset.noteId;
    if (!noteId || !this.noteInteractionController.isEditing(noteId)) return;
    this.updateNoteFromElement(noteId);
  }

  private beginNoteEditing(noteId: string) {
    this.setNoteSelection([noteId]);
    if (!this.noteInteractionController.beginEdit(noteId)) return;
    this.syncNoteSelectionStyles();
    this.renderPropertyEditor();
  }

  private finishNoteEditing(noteId: string) {
    this.flushScheduledNoteCommit();
    const result = this.noteInteractionController.finishEdit(noteId);
    if (!result) return;
    this.commitNotePropertyResult(result);
    this.syncNoteSelectionStyles();
    this.renderPropertyEditor();
  }

  private updateNoteFromElement(noteId: string) {
    if (this.noteInteractionController.readEditor(noteId)) this.scheduleNoteCommit();
  }

  private noteElementFromEvent(event: Event) {
    return this.noteLayer.noteElementFromEvent(event);
  }

  private noteById(id: string) {
    return (this.document.notes ?? []).find((note) => note.id === id);
  }

  private updateMarkdownNoteText(noteId: string, markdown: string) {
    if (this.noteInteractionController.acceptMarkdownChange(noteId, markdown)) {
      this.scheduleNoteCommit();
    }
  }

  private updateMarkdownNoteHeight(noteId: string, height: number) {
    this.noteInteractionController.acceptMarkdownResize(noteId, height);
  }

  private scheduleNoteCommit() {
    this.cancelScheduledNoteCommit();
    this.noteCommitTimer = this.host.setTimeout(() => {
      this.noteCommitTimer = null;
      this.commitNotePropertyResult(this.noteInteractionController.checkpointEdit());
    }, NOTE_COMMIT_DEBOUNCE_MS);
  }

  private flushScheduledNoteCommit() {
    if (this.noteCommitTimer === null) return false;
    this.cancelScheduledNoteCommit();
    return this.commitNotePropertyResult(this.noteInteractionController.checkpointEdit());
  }

  private cancelScheduledNoteCommit() {
    if (this.noteCommitTimer === null) return;
    this.host.clearTimeout(this.noteCommitTimer);
    this.noteCommitTimer = null;
  }

  private beginNoteFontSizePropertyEdit() {
    this.beginSelectedNotePropertyBatch("font-size");
  }

  private finishNoteFontSizePropertyEdit() {
    const result = this.notePropertyBatchSession.activeKind === "font-size"
      ? this.notePropertyBatchSession.commit()
      : this.noteInteractionController.finishFontSizePropertyEdit();
    this.commitNotePropertyResult(result);
    this.renderPropertyEditor();
  }

  private cancelNoteFontSizePropertyEdit() {
    if (this.notePropertyBatchSession.activeKind === "font-size") {
      this.notePropertyBatchSession.cancel();
    }
    this.renderPropertyEditor();
  }

  private beginNoteWidthPropertyEdit() {
    this.beginSelectedNotePropertyBatch("width");
  }

  private finishNoteWidthPropertyEdit() {
    const result = this.notePropertyBatchSession.activeKind === "width"
      ? this.notePropertyBatchSession.commit()
      : this.noteInteractionController.finishWidthPropertyEdit();
    this.commitNotePropertyResult(result);
    this.renderPropertyEditor();
  }

  private cancelNoteWidthPropertyEdit() {
    if (this.notePropertyBatchSession.activeKind === "width") {
      this.notePropertyBatchSession.cancel();
    }
    this.renderPropertyEditor();
  }

  private setSelectedNoteWidth(value: string, options: { commit?: boolean } = { commit: true }) {
    if (this.notePropertyBatchSession.activeKind !== "width") {
      const started = this.beginSelectedNotePropertyBatch("width");
      if (!started) {
        if (options.commit) this.renderPropertyEditor();
        return;
      }
    }
    if (options.commit) {
      this.commitNotePropertyResult(this.notePropertyBatchSession.commit(value));
      this.renderPropertyEditor();
      return;
    }
    this.notePropertyBatchSession.input(value);
  }

  private setSelectedNoteFormat(format: SchematicNoteFormat) {
    this.finishNoteFontSizePropertyEdit();
    this.finishNoteWidthPropertyEdit();
    const editingNoteId = this.noteInteractionController.editingNoteId;
    if (editingNoteId && this.selectionSession.isNoteSelected(editingNoteId)) {
      this.finishNoteEditing(editingNoteId);
    }
    this.propertyInteractions.run({ kind: "note-format", format });
    if (editingNoteId && this.selectionSession.isNoteSelected(editingNoteId)) {
      this.beginNoteEditing(editingNoteId);
    }
  }

  private setSelectedNoteFontSize(value: string, options: { commit?: boolean } = { commit: true }) {
    if (this.notePropertyBatchSession.activeKind !== "font-size") {
      const started = this.beginSelectedNotePropertyBatch("font-size");
      if (!started) {
        if (options.commit) this.renderPropertyEditor();
        return;
      }
    }
    if (options.commit) {
      this.commitNotePropertyResult(this.notePropertyBatchSession.commit(value));
      this.renderPropertyEditor();
      return;
    }
    this.notePropertyBatchSession.input(value);
  }

  private beginSelectedNotePropertyBatch(kind: "font-size" | "width") {
    if (this.selectionSession.selectedIds.size !== 0) return false;
    const result = this.notePropertyBatchSession.begin(
      kind,
      Array.from(this.selectionSession.selectedNoteIds)
    );
    if (!result.ok) {
      this.setStatus(
        result.reason === "requires-markdown"
          ? "Width is available only when every selected Note uses Markdown."
          : "The selected Notes changed before the property edit began."
      );
      return false;
    }
    return true;
  }

  private projectNotePropertyBatch(
    note: SchematicNote,
    context: NotePropertyBatchProjectionContext
  ) {
    if (context.kind === "font-size") {
      const fontSize = noteFontSizePx(note);
      if (context.phase === "preview" && note.format !== "markdown") {
        this.noteLayer.resizeNoteToText(note, note.text, fontSize);
      }
      this.noteLayer.setNoteFontSize(note, fontSize);
      if (note.format === "markdown") this.noteLayer.refreshMarkdownLayout(note.id);
      return;
    }
    this.noteLayer.applyNoteElementSize(note);
    this.noteLayer.refreshMarkdownLayout(note.id);
  }

  private setNoteSelectionFromEvent(id: string, event: MouseEvent | PointerEvent) {
    this.finishNoteFontSizePropertyEdit();
    this.finishNoteWidthPropertyEdit();
    this.selectionSession.selectNote(id, selectionGestureFromEvent(event));
    this.finishSelectionChange();
  }

  private setNoteSelection(ids: string[], updateStyles = true) {
    this.finishNoteFontSizePropertyEdit();
    this.finishNoteWidthPropertyEdit();
    this.selectionSession.setNotes(ids);
    if (updateStyles) {
      this.syncSelectionUi();
    } else {
      this.renderSelectionSummary();
    }
  }

  private setMixedSelection(ids: string[], noteIds: string[], updateStyles = true) {
    this.finishNoteFontSizePropertyEdit();
    this.finishNoteWidthPropertyEdit();
    this.clearDeleteHover();
    this.selectionSession.setMixed(ids, noteIds);
    if (updateStyles) {
      this.syncSelectionUi();
    } else {
      this.renderSelectionSummary();
    }
  }

  private syncNoteSelectionStyles() {
    this.noteLayer.syncSelectionStyles(
      this.selectionSession.selectedNoteIds,
      this.noteInteractionController.editingNoteId,
      this.deleteHoverState()
    );
  }

  private selectCell(id: string, event: MouseEvent) {
    this.finishNoteFontSizePropertyEdit();
    this.clearDeleteHover();
    const delta = this.selectionSession.selectCell(id, selectionGestureFromEvent(event));
    this.finishSelectionChange({
      styleCellIds: delta.changedCellIds
    });
  }

  private finishSelectionChange(options: { styleCellIds?: ReadonlySet<string> } = {}) {
    this.transientToolSession.transition("select", "selection");
    this.clearDeleteHover();
    const resolution = this.selectedNetworkResolution();
    this.netResolutionCache = resolution ?? this.netResolutionCache;
    this.syncSelectionStyles({ cellIds: options.styleCellIds, resolution });
    this.syncNoteSelectionStyles();
    this.writeStatus(this.selectionStatus());
    this.syncToolUi(resolution);
  }

  private setSelection(ids: string[], updateStyles = true) {
    this.finishNoteFontSizePropertyEdit();
    this.clearDeleteHover();
    this.selectionSession.setCells(ids);
    if (updateStyles) {
      this.syncSelectionUi();
    } else {
      this.renderSelectionSummary();
    }
  }

  private syncSelectionStyles(options: { cellIds?: ReadonlySet<string>; resolution?: NetResolution } = {}) {
    const cells = options.cellIds
      ? Array.from(options.cellIds)
          .map((id) => this.graphAdapter.getCell(id))
          .filter((cell): cell is NonNullable<typeof cell> => !!cell)
      : this.graphAdapter.getCells();
    applySchematicCellSelectionStyles({
      cells,
      document: this.document,
      selectedIds: this.selectionSession.selectedIds,
      hoverIds: this.deleteHoverState(),
      presentationMode: this.presentationMode,
      resolution: options.resolution
    });
    this.syncShapeResizeHandles();
  }

  private syncShapeResizeHandles() {
    const selectedId = this.selectionSession.selectedIds.size === 1
      && this.selectionSession.selectedNoteIds.size === 0
      ? this.selectionSession.selectedIds.values().next().value
      : undefined;
    const selectedShape = this.document.components.find((component) =>
      component.id === selectedId
      && (component.type === "rectangle" || component.type === "triangle")
      && !component.temporarilyDeleted
    );
    this.graphAdapter.getCells().forEach((cell) => {
      const componentId = cell.get("componentId");
      if (!componentId) return;
      const selected = componentId === selectedShape?.id && !this.presentationMode;
      const visible = selected && selectedShape?.type === "rectangle";
      [
        "rectangleResizeNw",
        "rectangleResizeNe",
        "rectangleResizeSe",
        "rectangleResizeSw"
      ].forEach((selector) => {
        cell.attr(`${selector}/opacity`, visible ? 1 : 0);
        cell.attr(`${selector}/pointerEvents`, visible ? "all" : "none");
      });
      ["A", "B", "C"].forEach(vertex => {
        const show = selected && selectedShape?.type === "triangle";
        cell.attr(`triangleResize${vertex}/opacity`, show ? 1 : 0);
        cell.attr(`triangleResize${vertex}/pointerEvents`, show ? "all" : "none");
        cell.attr(`triangleVertex${vertex}/opacity`, show ? 1 : 0);
      });
    });
  }

  private syncSelectionUi() {
    this.syncSelectionStyles();
    this.syncNoteSelectionStyles();
    this.renderSelectionSummary();
  }

  private deleteHoverState() {
    return this.deleteToolController.hoverState();
  }

  private startDragSelection(event: MouseEvent, point: Point) {
    this.selectionBoxController.start(point, event.shiftKey);
    this.viewportController.setNextBlankClickSuppressed(false);
  }

  private finishDragSelection(point: Point) {
    const visibleJunctions = this.presentationMode && this.transientToolSession.mode === "select"
      ? presentationJunctions(this.document)
      : this.document.junctions;
    const result = this.selectionBoxController.finish(this.document, point, visibleJunctions);
    if (!result) return;
    const intent = projectFinishedSelectionBox({
      selectionBox: result.selectionBox,
      mode: this.transientToolSession.mode,
      additive: result.additive,
      hasActiveAnalysisPick: this.analysisController.hasActivePick(),
      selectionState: this.selectionSession.snapshot()
    });
    this.applyFinishedSelectionBoxIntent(intent);
  }

  private applyFinishedSelectionBoxIntent(intent: FinishedSelectionBoxIntent) {
    if (intent.kind === "noop") {
      return;
    }

    if (intent.kind === "clear-selection") {
      this.setSelection([]);
      this.setStatus("Selection cleared.");
      return;
    }

    if (intent.kind === "delete-targets") {
      this.applyDeleteToolToIds(intent.ids, intent.noteIds);
      return;
    }

    if (intent.kind === "merge-selection") {
      this.selectionSession.apply(intent.selection);
      this.syncSelectionUi();
    } else {
      this.finishNoteFontSizePropertyEdit();
      this.clearDeleteHover();
      this.selectionSession.apply(intent.selection);
      this.syncSelectionUi();
    }
    this.setStatus(this.selectionStatus());
  }

  private cancelDragSelection() {
    this.selectionBoxController.cancel();
  }

  private applyZoomAtClientPoint(nextZoom: number, clientX: number, clientY: number, localAnchor = this.localPointFromClient(clientX, clientY)) {
    this.viewAdapter.zoomAtClientPoint(nextZoom, clientX, clientY, localAnchor);
    this.updateNoteLayerTransform();
  }

  private pointFromClientEvent(event: MouseEvent | PointerEvent) {
    const point = this.localPointFromClient(event.clientX, event.clientY);
    return snapPoint(point);
  }

  private viewportCenterPoint() {
    return this.viewAdapter.viewportCenterWorldPoint();
  }

  private worldToScreenPoint(point: Point) {
    return this.viewAdapter.worldToScreenPoint(point);
  }

  private localPointFromClient(clientX: number, clientY: number): Point {
    return this.viewAdapter.localPointFromClient(clientX, clientY);
  }

  private syncToolUi(resolution?: NetResolution) {
    const templateSelect = this.options.paletteEl.querySelector<HTMLSelectElement>("[data-symbol-template]");
    if (templateSelect) templateSelect.value = resolveSymbolTemplate(this.document.symbolTemplate).id;
    syncSchematicPaperModeClasses(this.options.paperEl, this.transientToolSession.mode);
    this.options.paperEl.classList.toggle(
      "is-coupling-pick-mode",
      this.inductorInteractions.pendingSourceId !== null
    );
    this.instanceSelector.update();
    const toolbarState = {
      mode: this.transientToolSession.mode,
      presentationMode: this.presentationMode,
      canUndo: this.hostBridge.canUndo(),
      canRedo: this.hostBridge.canRedo()
    };
    this.toolbarController?.sync(toolbarState);
    this.renderSelectionSummary(resolution);
  }

  private renderSelectionSummary(resolution?: NetResolution) {
    const projection = this.currentSelectionUiProjection(resolution);
    this.propertyPanelController.sync(projection.propertyPanel);
    const target = this.options.selectionSummaryEl;
    if (!target) return;
    renderSchematicSelectionSummary(target, projection.summary);
  }

  private currentSelectionContents(): SchematicSelectionContents {
    return this.selectedTransformObjects().summaryContents;
  }

  private currentSelectionUiProjection(resolution?: NetResolution) {
    const targets = this.selectedTransformObjects();
    const needsResolution =
      targets.wires.length > 0
      || targets.junctionPoints.length > 0
      || targets.netLabels.length > 0;
    const propertyResolution = needsResolution
      ? resolution ?? this.netResolutionCache ?? resolveSchematicNets(this.document)
      : undefined;
    const labelToolState = this.netLabelToolController.snapshot();
    return buildSchematicSelectionUiProjection({
      mode: this.transientToolSession.mode,
      selection: this.currentSelectionContents(),
      propertyPanel: {
        document: this.document,
        targets,
        resolution: propertyResolution,
        labelTool: this.transientToolSession.mode === "label"
          ? { value: labelToolState.draft, error: labelToolState.error || undefined }
          : undefined,
        hasSelection: this.selectionSession.hasAny(),
        couplingPickSourceId: this.inductorInteractions.pendingSourceId
      },
      activePlacementItem: this.placementToolController.activeItem,
      wire: { variant: this.wireToolController.variant, routePointCount: this.wireToolController.routePointCount() },
      copy: { hasSource: this.copyController.hasSource, awaitingReference: this.copyController.awaitingReference },
      moveBehavior: this.transientToolSession.moveBehavior
    });
  }

  private selectedNetworkResolution() {
    return this.selectionSession.selectedNetworkResolution();
  }

  private renderPropertyEditor() {
    this.propertyPanelController.sync(this.currentSelectionUiProjection().propertyPanel);
  }

  private selectionStatus() {
    return this.selectionSession.status(this.transientToolSession.moveBehavior);
  }

  private focusCanvas() {
    this.options.paperEl.focus({ preventScroll: true });
    this.requestOwnedFrame(() => {
      if (!this.noteInteractionController.hasActiveEdit()) {
        this.options.paperEl.focus({ preventScroll: true });
      }
    });
  }

  private requestOwnedFrame(callback: FrameRequestCallback) {
    const frame = { handle: null as number | null, completed: false };
    const handle = this.host.requestAnimationFrame((timestamp) => {
      frame.completed = true;
      if (frame.handle !== null) this.scheduledFrames.delete(frame.handle);
      if (!this.destroyed) callback(timestamp);
    });
    frame.handle = handle;
    if (!frame.completed) this.scheduledFrames.add(handle);
    return handle;
  }

  private cancelOwnedFrame(handle: number) {
    if (!this.scheduledFrames.delete(handle)) return;
    this.host.cancelAnimationFrame(handle);
  }

  private cancelOwnedFrames() {
    [...this.scheduledFrames].forEach((handle) => this.cancelOwnedFrame(handle));
  }

  private setStatus(message: string, resolution?: NetResolution) {
    if (this.destroyed) return;
    this.writeStatus(message);
    this.syncToolUi(resolution);
    this.emitStateChange();
  }

  private writeStatus(message: string) {
    this.statusMessage = message;
    if (this.options.statusEl) this.options.statusEl.textContent = message;
    this.hostBridge.onStatusChange?.(message);
  }
}

function selectionGestureFromEvent(event: MouseEvent | PointerEvent): SelectionGesture {
  if (event.ctrlKey) return "ctrl";
  if (event.shiftKey) return "shift";
  return "plain";
}

function createNoopAnalysisBridge(): SchematicEditorAnalysisBridge {
  let selection: AnalysisPortSelection = {
    inputP: "",
    inputN: "",
    outputP: "",
    outputN: ""
  };
  return {
    clearActivePick() {},
    hasActivePick: () => false,
    pickNet: () => false,
    refreshNetSelectorsFromNames() {},
    refreshNetSelectors() {},
    selection: () => ({ ...selection }),
    setSelection: (next) => {
      selection = { ...next };
    },
    cancelPendingCompute() {}
  };
}

function createNoopContextMenuBridge(): SchematicEditorContextMenuBridge {
  return {
    hidden: true,
    containsTarget: () => false,
    show() {},
    close() {}
  };
}

function isEditableTarget(target: EventTarget | null, shellEl: HTMLElement) {
  if (!isElementLike(target)) return false;
  const editable = target.closest('input, select, textarea, [contenteditable="true"]');
  return !!editable && shellEl.contains(editable);
}

function isUnmodifiedPrintableKey(event: KeyboardEvent) {
  if (event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) return false;
  if (
    event.key === " "
    && isElementLike(event.target)
    && event.target.closest("button, [role='button']")
  ) {
    return false;
  }
  return true;
}

function isElementLike(target: EventTarget | null): target is Element {
  return !!target && typeof (target as Element).closest === "function";
}
