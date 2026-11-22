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
import { InstanceBrowser } from "./instanceBrowser";
import { SidebarLibrary } from "./sidebarLibrary";
import { RightDockController, type RightDockState, type RightDockView } from "./rightDock";
import { SchematicEventLog, type LogEntry } from "./eventLog";
import { NetlistPanelController } from "./netlist/panel";
import { DEFAULT_NETLIST_PROCESS, isDeviceKind, isNetlistModelText, isProcessId, NETLIST_MODEL_VALUE_KEY, processProfile, type ProcessId } from "./netlist/profiles";
import { ARC_THROUGH_POINT_STEP, createArcGeometry } from "./arcComponentModel";
import { createCircleGeometry } from "./circleComponentModel";
import { LIBRARY_PATH_MAX_POINTS } from "./libraryPathPoints";
import { createPolygonGeometry } from "./polygonComponentModel";
import { quadraticArcSymbol } from "./symbols/arcSymbols";
import { createPolylineGeometry } from "./polylineComponentModel";
import { isLibraryShapeType, isVertexLibraryShapeType, type LibraryShapeType } from "./libraryShapeStyleModel";
import { componentName, t, uiFormat } from "./schematicI18n";
import { localizeSchematicStatus } from "./schematicUiText";
import { getComponentDef } from "./catalog";
import { RECTANGLE_RESIZE_HANDLE_SELECTORS } from "./componentRenderer";
import {
  RECTANGLE_HEIGHT_VALUE_KEY,
  RECTANGLE_WIDTH_VALUE_KEY
} from "./rectangleComponentModel";
import {
  TRIANGLE_VERTICES,
  triangleVertexKey
} from "./triangleComponentModel";
import { DEFAULT_LAYER_ID, defaultSchematicLayer, nextLayerId, normalizeLayers, type SchematicLayer } from "./layers";
import {
  buildSchematicLayerObjectTree,
  layerObjectStackIds,
  type SchematicLayerObjectNode
} from "./layerObjectTreeModel";
import {
  applyLayerAssignment,
  applyLayerObjectMove,
  planLayerAssignment,
  planLayerObjectMove,
  projectLayerAssignment,
  type LayerObjectMoveDirection
} from "./layerObjectCommands";
import {
  resolveLayerObjects,
  setLayerObjectVisible as setLayerObjectVisibleState
} from "./layerObjectStateModel";
import { setComponentPinVisibility } from "./pinConfigurationModel";
import type { SchematicGraphAdapter } from "./graphAdapter";
import { SchematicIncrementalRenderCoordinator } from "./incrementalRenderCoordinator";
import { SchematicJunctionRenderCoordinator } from "./junctionRenderCoordinator";
import { resolveSchematicNets, type NetResolution } from "./netResolution";
import {
  bindStandaloneNetLabelsAtPoint,
  nearestWireAttachment,
  netLabelPosition
} from "./netLabelModel";
import { SchematicNetLabelDialog } from "./netLabelDialog";
import type { WireAngle } from "./wire/wireAngle";
import { wireRouteModeForPath } from "./wire/wireGeometry";
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
import { isSchematicTextFont } from "./schematicFont";
import { wireHopPaths } from "./wire/wireCrossings";
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
import { GRID_SIZE, SYMBOL_GRID_SIZE } from "./types";
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
  captureCopyLayers,
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
import { applyNormalizedDocumentWires, reconcileDocumentConnectionEdit } from "./document/documentWires";
import {
  captureTransformRenderSnapshot,
  changedTransformWireIds,
  type TransformRenderSnapshot
} from "./transformRenderModel";
import { componentVisualBounds, schematicDocumentVisualBounds } from "./view-geometry";
import { wireEndpointConnections } from "./wire/wireEndpointConnection";
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
// Shape creation follows the visible 10 px canvas grid.
const LIBRARY_SHAPE_DRAW_GRID_SIZE = GRID_SIZE;
const VERTEX_SHAPE_GEOMETRY = {
  arc: createArcGeometry,
  circle: createCircleGeometry,
  polygon: createPolygonGeometry,
  polyline: createPolylineGeometry
};
const SHAPE_FINISH_MIN_VERTICES = { polyline: 2, polygon: 3 };

function isPathDraft(kind: LibraryShapeType | undefined): kind is keyof typeof SHAPE_FINISH_MIN_VERTICES {
  return kind === "polyline" || kind === "polygon";
}

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
  private readonly sidebarLibrary: SidebarLibrary;
  private readonly instanceBrowser: InstanceBrowser;
  private readonly rightDock: RightDockController | null;
  private readonly eventLog: SchematicEventLog;
  private readonly netlistPanel: NetlistPanelController | null;
  private netlistRefreshTimer: number | null = null;
  private activeLayerId = "layer-1";
  private readonly collapsedLayerTreeNodes = new Set<string>();
  private libraryShapeDraw: { kind: LibraryShapeType; points: Point[] } | null = null;
  private libraryShapeDragStart: Point | null = null;
  private shapeDraftOverlay: SVGSVGElement | null = null;
  private routingSnapMarker: SVGCircleElement | null = null;
  private shapeFinishButton: HTMLButtonElement | null = null;
  private placementPointerStart: { x: number; y: number; blank: boolean; maxDistance: number } | null = null;
  private hierarchyPlacement: ComponentInstance | null = null;
  private lastLoggedStatus = "";
  private lastHadSelection = false;
  private readonly contextMenuController;
  private readonly propertyPanelController: SchematicPropertyPanelController;
  private readonly analysisController;
  private readonly transientToolSession: SchematicTransientToolSessionCoordinator;
  private readonly placementToolController = new SchematicPlacementToolController();
  private readonly placementCommitCoordinator: SchematicPlacementCommitCoordinator;
  private presentationMode = false;
  private lastPointerPoint: Point | null = null;
  private routingPointer: { point: Point; wireId?: string } | null = null;
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
  private readonly netLabelDialog: SchematicNetLabelDialog;
  private readonly netLabelCommitCoordinator: SchematicNetLabelCommitCoordinator;
  private netResolutionCache: NetResolution | undefined;
  private activeHostedDocumentId = "";
  private readonly hostedActiveLayerIds = new Map<string, string>();
  private readonly copyMarkdownPreviewContent = new Map<string, HTMLElement>();
  private copyMarkdownPreviewGeneration = 0;
  private copyPreviewNeedsPointer = false;
  private readonly inductorInteractions: SchematicInductorInteractionController;
  private readonly lifecycleController: AbortController;
  private readonly stateListeners = new Set<SchematicEditorStateListener>();
  private readonly scheduledFrames = new Set<number>();
  private wireCrossingFramePending = false;
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
      "[data-rectangle-resize-handle], [data-triangle-resize-handle], [data-shape-vertex]"
    );
    if (
      !handle
      || this.libraryShapeDraw
      || event.button !== 0
      || this.transientToolSession.mode !== "select"
      || this.selectionSession.selectedIds.size !== 1
      || this.selectionSession.selectedNoteIds.size !== 0
    ) {
      return;
    }
    const componentId = handle.getAttribute("data-component-id") ?? "";
    const vertex = handle.getAttribute("data-shape-vertex");
    const resizeHandle: ShapeResizeHandle = vertex === null
      ? (handle.getAttribute("data-rectangle-resize-handle") ?? handle.getAttribute("data-triangle-resize-handle")) as ShapeResizeHandle
      : Number(vertex);
    if (!this.shapeResizeSession.begin(componentId, resizeHandle)) return;
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
    const result = this.shapeResizeSession.move(this.localPointFromClient(event.clientX, event.clientY));
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
    const point = this.localPointFromClient(event.clientX, event.clientY);
    this.routingPointer = { point, wireId: this.wireIdAt(event.target) };
    this.handlePointerMove(point);
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
    this.netLabelDialog = new SchematicNetLabelDialog(options.shellEl);
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
      () => this.host.idFactory(),
      () => this.activeLayerId
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
      isWireSelected: (wireId) => this.selectionSession.isCellSelected(wireId),
      isBusWire: (wireId) => this.netResolutionCache?.busWireIds.has(wireId) ?? false
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
      defaultTextFont: () => this.document.display?.textFont,
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
      makeNetLabelCell: (label, options) => makeNetLabelCell(label, { ...options, documentFont: this.document.display?.textFont }),
      defaultTextFont: () => this.document.display?.textFont,
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
      onNoteWidthCancel: () => this.cancelNoteWidthPropertyEdit()
    }));
    this.junctionRenderCoordinator = new SchematicJunctionRenderCoordinator({
      document: this.document,
      graphAdapter: this.graphAdapter,
      makeJunctionCell: makeJunctionViewCell,
      getPresentationMode: () => this.presentationMode,
      onLiveRefresh: () => this.applyLayerObjectStackOrder(),
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
      clearShapeDraft: () => this.clearLibraryShapeDraw(),
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
    const layout = this.options.layout;
    this.sidebarLibrary = new SidebarLibrary(this.options.paletteEl, {
      symbolTemplate: () => this.document.symbolTemplate,
      initialTab: layout?.getSidebarTab?.() ?? "library",
      onTabChange: (tab) => layout?.setSidebarTab?.(tab),
      hierarchy: this.hostBridge.hierarchyLibrary,
      onHierarchyPick: this.hostBridge.placeHierarchySheet,
      onPick: (item) => {
        this.beginPlacement(item);
        this.focusCanvas();
      }
    });
    this.instanceBrowser = new InstanceBrowser(this.options.shellEl, {
      symbolTemplate: () => this.document.symbolTemplate,
      onPick: (item) => {
        this.beginPlacement(item);
        this.focusCanvas();
      },
      onClose: () => this.focusCanvas()
    });
    const { analysisEl } = this.options;
    this.rightDock = analysisEl
      ? new RightDockController(analysisEl, {
          initial: layout?.getRightDockState?.(),
          onChange: (state) => this.handleRightDockChange(state)
        })
      : null;
    this.eventLog = new SchematicEventLog(this.options.shellEl, {
      initialHeight: layout?.getLogHeight?.() ?? 230,
      onHeightChange: (height) => layout?.setLogHeight?.(height)
    });
    this.netlistPanel = analysisEl
      ? new NetlistPanelController(analysisEl, {
          onSelect: (componentId, sheetId) => sheetId
            ? this.hostBridge.selectProjectDiagnostic?.(sheetId, componentId)
            : this.selectNetlistDiagnostic(componentId),
          buildDesign: document => this.hostBridge.projectNetlist?.(document) ?? null
        })
      : null;

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
    this.sidebarLibrary.mount();
    this.instanceBrowser.mount();
    this.rightDock?.mount();
    this.eventLog.mount();
    this.netlistPanel?.mount();
    this.netlistPanel?.refresh(this.document);
    this.renderPalette();
    this.renderLayersPanel();
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
    this.sidebarLibrary.destroy();
    this.instanceBrowser.destroy();
    this.rightDock?.destroy();
    this.eventLog.destroy();
    if (this.netlistRefreshTimer !== null) this.host.clearTimeout(this.netlistRefreshTimer);
    this.netlistPanel?.destroy();
    this.toolbarController?.destroy();
    this.propertyPanelController.destroy();
    this.netLabelDialog.close();
    this.routingSnapMarker?.parentElement?.remove();
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
    reconcileDocumentConnectionEdit(draft, before);
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
        this.cancelHierarchyPlacement();
        this.cancelTool();
        return true;
    }
  }

  private renderPalette() {
    this.instanceSelector.render();
    this.sidebarLibrary.refresh();
  }

  private changeSymbolTemplate(templateId: SymbolTemplateId) {
    const errorEl = this.options.shellEl.querySelector<HTMLElement>("[data-symbol-template-error]");
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
    this.bindHierarchyPlacement();
    this.bindControllerEvents();
    this.bindDisplaySettings();
    this.bindLibraryShapeDrawEvents();
    this.bindGlobalDocumentWindowInteractions();
    this.bindNoteLayerInteractions();
    this.bindCellGeometrySelectionMovePaperHooks();
    this.bindPaperElementViewportCanvasDomInteractions();
    this.bindPaperPointerMoveDownClickJointJsInteractions();
  }

  private bindHierarchyPlacement() {
    const { signal } = this.lifecycleController;
    const paper = this.options.paperEl;
    paper.addEventListener("pointermove", event => {
      if (this.hierarchyPlacement && !event.buttons) this.previewHierarchyPlacement(this.pointFromClientEvent(event));
    }, { signal });
    paper.addEventListener("pointerdown", event => {
      const pending = this.hierarchyPlacement;
      if (!pending || event.button !== 0) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const layer = this.editablePlacementLayer();
      if (!layer) return;
      const point = this.pointFromClientEvent(event);
      this.cancelHierarchyPlacement();
      const component = { ...pending, ...point, values: { ...pending.values, "layer:id": layer.id } };
      this.transact(content => content.components.push(component), { origin: "editor", reason: "hierarchy-place" });
      this.hostSelectHierarchyComponent(component.id);
    }, { capture: true, signal });
  }

  private previewHierarchyPlacement(point: Point) {
    if (this.hierarchyPlacement) {
      this.previewRenderer.renderPlacement({ components: [{ ...this.hierarchyPlacement, ...point }], wires: [] });
    }
  }

  private cancelHierarchyPlacement() {
    if (!this.hierarchyPlacement) return;
    this.hierarchyPlacement = null;
    this.previewRenderer.clearPlacement();
    this.options.paperEl.classList.remove("is-hierarchy-placing");
  }

  hostArmHierarchyPlacement(component: ComponentInstance) {
    this.cancelTool();
    this.hierarchyPlacement = component;
    if (this.options.layout?.isNarrow?.()) this.options.layout.closePanel("left");
    this.options.paperEl.classList.add("is-hierarchy-placing");
    this.previewHierarchyPlacement(this.lastPointerPoint ?? this.viewportCenterPoint());
    this.focusCanvas();
  }

  hostSelectedHierarchyComponent() {
    return this.selectedSingleComponent();
  }

  hostShowHierarchy() {
    this.openRightView("hierarchy");
  }

  hostRefreshHierarchy() {
    this.sidebarLibrary.refresh();
    this.scheduleNetlistRefresh();
    this.syncToolUi();
  }

  hostSelectHierarchyComponent(id: string, center = false) {
    if (center) this.selectNetlistDiagnostic(id);
    else {
      this.selectionSession.setMixed([id], []);
      this.finishSelectionChange();
      this.sidebarLibrary.showProperties();
    }
  }

  private bindDisplaySettings() {
    const { signal } = this.lifecycleController;
    this.options.shellEl.addEventListener("change", event => {
      const select = event.target;
      if (!(select instanceof this.host.ownerWindow.HTMLSelectElement)) return;
      const { value } = select;
      if (select.hasAttribute("data-schematic-wire-crossings") && (value === "plain" || value === "hop")) {
        if (value === (this.document.display?.wireCrossings ?? "plain")) return;
        this.commitDisplayChange(() => {
          this.document.display = { ...this.document.display, wireCrossings: value };
        });
      } else if (select.hasAttribute("data-schematic-text-font") && isSchematicTextFont(value)) {
        if (value === (this.document.display?.textFont ?? "sans")) return;
        this.commitDisplayChange(() => {
          this.document.display = { ...this.document.display, textFont: value };
          this.document.notes.filter(note => !note.fontFamily).forEach(note => {
            this.noteLayer.resizeNoteToContent(note, noteFontSizePx(note));
          });
        });
      } else if (select.hasAttribute("data-netlist-process") && isProcessId(value)) {
        this.changeNetlistProcess(value);
      } else if (select.hasAttribute("data-property-text-font") && (value === "" || isSchematicTextFont(value))) {
        const target = this.selectedTextObject();
        if (!target || select.dataset.propertyTextFont !== target.kind || value === (target.object.fontFamily ?? "")) return;
        this.commitDisplayChange(() => {
          if (value === "") delete target.object.fontFamily;
          else target.object.fontFamily = value;
          if (target.kind === "note") this.noteLayer.resizeNoteToContent(target.object, noteFontSizePx(target.object));
        });
      }
    }, { signal });
  }

  private selectedTextObject() {
    const { selectedIds, selectedNoteIds } = this.selectionSession;
    if (this.transientToolSession.mode !== "select" || selectedIds.size + selectedNoteIds.size !== 1) return null;
    const note = this.document.notes.find(candidate => selectedNoteIds.has(candidate.id));
    if (note) return { kind: "note", object: note } as const;
    const label = this.document.netLabels.find(candidate => selectedIds.has(candidate.id));
    return label ? { kind: "label", object: label } as const : null;
  }

  private commitDisplayChange(change: () => void) {
    this.hostFinishActiveEdits();
    const previous = this.getContent();
    change();
    if (!this.commitCurrentContent("display-settings")) {
      this.restoreDocumentState(documentFromContent(previous));
    }
    this.renderDocument();
    this.syncToolUi();
  }

  private bindControllerEvents() {
    this.options.shellEl.querySelector<HTMLSelectElement>("[data-symbol-template]")?.addEventListener("change", event => {
      this.execute({ kind: "symbol-template", templateId: (event.currentTarget as HTMLSelectElement).value as SymbolTemplateId });
    }, { signal: this.lifecycleController.signal });
    this.instanceSelector.bind();
    this.toolbarController?.bind();
    this.propertyPanelController.bind();
    this.bindMosParamEvents();
    this.bindDeviceModelEvents();
    this.bindLayerEvents();
    this.bindLayerAssignmentEvents();
  }

  private layers(): SchematicLayer[] {
    return normalizeLayers(this.document.layers);
  }

  private bindLayerEvents() {
    const { signal } = this.lifecycleController;
    const root = this.options.paletteEl;
    root.addEventListener("click", (event) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const add = target.closest<HTMLElement>("[data-layer-add]");
      const remove = target.closest<HTMLElement>("[data-layer-delete]");
      const up = target.closest<HTMLElement>("[data-layer-up]");
      const down = target.closest<HTMLElement>("[data-layer-down]");
      const select = target.closest<HTMLElement>("[data-layer-select]");
      const treeToggle = target.closest<HTMLElement>("[data-layer-tree-toggle]");
      const objectSelect = target.closest<HTMLElement>("[data-layer-object-select]");
      const objectMove = target.closest<HTMLElement>("[data-layer-object-up], [data-layer-object-down]");
      const row = target.closest<HTMLElement>("[data-layer-id]");
      if (add) { event.preventDefault(); this.addLayer(); return; }
      if (remove) { event.preventDefault(); this.deleteLayer(); return; }
      if (up || down) {
        event.preventDefault();
        const id = up?.dataset.layerUp ?? down?.dataset.layerDown ?? "";
        this.moveLayer(id, up ? 1 : -1);
        return;
      }
      if (objectMove) {
        event.preventDefault();
        const layerId = objectMove.closest<HTMLElement>("[data-layer-id]")?.dataset.layerId ?? "";
        const direction: LayerObjectMoveDirection = objectMove.dataset.layerObjectUp !== undefined ? "up" : "down";
        const objectId = direction === "up"
          ? objectMove.dataset.layerObjectUp ?? ""
          : objectMove.dataset.layerObjectDown ?? "";
        this.moveLayerObject(layerId, objectId, direction);
        return;
      }
      if (treeToggle) {
        event.preventDefault();
        const id = treeToggle.dataset.layerTreeToggle ?? "";
        if (id) {
          if (this.layerTreeCollapseState().has(id)) this.layerTreeCollapseState().delete(id);
          else this.layerTreeCollapseState().add(id);
          this.renderLayersPanel();
        }
        return;
      }
      if (objectSelect) {
        event.preventDefault();
        this.selectLayerObject(objectSelect);
        return;
      }
      if (select) { this.activeLayerId = select.dataset.layerSelect ?? this.activeLayerId; this.renderLayersPanel(); return; }
      if (row && !target.closest("input, button")) {
        this.activeLayerId = row.dataset.layerId ?? this.activeLayerId;
        this.renderLayersPanel();
        return;
      }
    }, { signal });
    root.addEventListener("dblclick", (event) => {
      const select = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-layer-select]");
      const id = select?.dataset.layerSelect;
      if (!select || !id) return;
      const name = this.host.ownerWindow.prompt("Layer name", select.dataset.layerName ?? select.textContent ?? "");
      if (name?.trim()) this.updateLayer(id, { name: name.trim() });
    }, { signal });
    root.addEventListener("change", (event) => {
      const target = event.target as HTMLInputElement | HTMLSelectElement | null;
      if (!target) return;
      const objectId = target.dataset.layerObjectVisible;
      if (objectId) {
        this.updateLayerObjectVisibility(objectId, (target as HTMLInputElement).checked);
        return;
      }
      const layerId = target.dataset.layerVisible ?? target.dataset.layerLock ?? target.dataset.layerName;
      if (layerId) {
        if (target.dataset.layerVisible) this.updateLayer(layerId, { visible: (target as HTMLInputElement).checked });
        else if (target.dataset.layerLock) this.updateLayer(layerId, { locked: (target as HTMLInputElement).checked });
        else this.updateLayer(layerId, { name: target.value });
        return;
      }
    }, { signal });
  }

  private bindLayerAssignmentEvents() {
    const { signal } = this.lifecycleController;
    const root = this.options.propertyEl;
    if (!root) return;
    root.addEventListener("change", (event) => {
      const target = event.target as HTMLSelectElement | null;
      if (!target?.hasAttribute("data-property-layer")) return;
      const plan = planLayerAssignment(this.document, this.selectedLayerObjectIds(), target.value);
      if (!plan) {
        this.syncLayerAssignment();
        return;
      }
      this.hostFinishActiveEdits();
      applyLayerAssignment(this.document, plan);
      applyNormalizedDocumentWires(this.document);
      this.renderDocument();
      this.commitCurrentContent("assign-layer", "editor");
      this.setStatus(`Moved ${plan.ids.size} object(s) to ${plan.target.name}.`);
    }, { signal });
  }

  private beginLibraryShapeDraw(kind: LibraryShapeType) {
    if (!this.editablePlacementLayer()) return;
    this.transientToolSession.transition("select", "enter-tool");
    this.syncToolUi();
    this.instanceSelector.closePanel();
    this.instanceSelector.closeDropdown();
    this.instanceSelector.closeOptions();
    this.instanceBrowser.close();
    this.libraryShapeDraw = { kind, points: [] };
    this.libraryShapeDragStart = null;
    this.ensureShapeDraftOverlay();
    if (this.shapeDraftOverlay) this.shapeDraftOverlay.removeAttribute("hidden");
    this.options.shellEl.classList.add("is-drawing-shape");
    const layout = this.options.layout;
    if (isVertexLibraryShapeType(kind) && layout?.isNarrow?.()) layout.closePanel("left");
    if (isPathDraft(kind)) {
      const button = this.ensureShapeFinishButton();
      button.className = `schematic-shape-finish schematic-${kind}-finish`;
      button.textContent = kind === "polyline" ? t("polyline.finish", "Finish polyline") : t("polygon.finish", "Finish polygon");
      button.hidden = false;
      button.disabled = true;
    }
    const instructions = {
      rectangle: "Rectangle: click the first grid point, then drag or click the opposite point. Esc cancels.",
      triangle: "Triangle: click three grid points. Esc cancels.",
      polyline: "Polyline: click to add vertices, press Enter or choose Finish polyline. Esc cancels.",
      arc: "Arc: click the left endpoint.",
      circle: "Circle: click a grid point to set the center.",
      polygon: "Polygon: add vertices, then click the first point, press Enter, or choose Finish polygon. Esc cancels."
    };
    this.setStatus(instructions[kind]);
    this.focusCanvas();
  }

  private bindLibraryShapeDrawEvents() {
    const { signal } = this.lifecycleController;
    this.options.paperEl.addEventListener("pointerdown", (event) => {
      const draft = this.libraryShapeDraw;
      if (!draft || event.button !== 0 || event.target === this.shapeFinishButton) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const point = this.libraryShapeSnap(this.localPointFromClient(event.clientX, event.clientY));
      if (draft.kind === "rectangle") {
        if (draft.points.length === 0) {
          draft.points = [point];
          this.libraryShapeDragStart = point;
          this.previewLibraryShapeDraw(point);
        } else {
          this.finishLibraryShapeDraw([draft.points[0], point]);
        }
        return;
      }
      if (isPathDraft(draft.kind)) {
        this.placePathPoint(draft.kind, draft.points, point);
        return;
      }
      if (draft.kind === "circle") {
        if (draft.points.length === 0) {
          draft.points.push(point);
          this.previewLibraryShapeDraw(point);
          this.setStatus("Circle: move to preview and click to set the radius.");
        } else {
          this.finishLibraryShapeDraw([draft.points[0], point]);
        }
        return;
      }
      if (draft.kind === "arc") {
        this.placeArcPoint(draft.points, point);
        return;
      }
      draft.points.push(point);
      if (draft.points.length >= 3) this.finishLibraryShapeDraw(draft.points);
      else this.previewLibraryShapeDraw(point);
    }, { capture: true, signal });
    this.options.paperEl.addEventListener("click", (event) => {
      if (!this.libraryShapeDraw || event.target === this.shapeFinishButton) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    }, { capture: true, signal });
    this.options.paperEl.addEventListener("dblclick", (event) => {
      if (!this.libraryShapeDraw || event.target === this.shapeFinishButton) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      this.finishPathDraw();
    }, { capture: true, signal });
    this.options.paperEl.addEventListener("pointermove", (event) => {
      if (!this.libraryShapeDraw) return;
      this.previewLibraryShapeDraw(
        this.libraryShapeSnap(this.localPointFromClient(event.clientX, event.clientY))
      );
    }, { capture: true, signal });
    this.host.ownerWindow.addEventListener("pointerup", (event) => {
      const draft = this.libraryShapeDraw;
      const start = this.libraryShapeDragStart;
      if (draft?.kind !== "rectangle" || !start || draft.points.length !== 1) return;
      const end = this.libraryShapeSnap(this.localPointFromClient(event.clientX, event.clientY));
      if (Math.abs(end.x - start.x) >= LIBRARY_SHAPE_DRAW_GRID_SIZE || Math.abs(end.y - start.y) >= LIBRARY_SHAPE_DRAW_GRID_SIZE) {
        this.finishLibraryShapeDraw([start, end]);
      }
    }, { signal });
  }

  private placePathPoint(kind: keyof typeof SHAPE_FINISH_MIN_VERTICES, points: Point[], point: Point) {
    const minimum = SHAPE_FINISH_MIN_VERTICES[kind];
    const key = pointKey(point);
    if (kind === "polygon" && points.length >= minimum && pointKey(points[0]) === key) {
      this.finishPathDraw();
      return;
    }
    const from = kind === "polygon" ? 0 : Math.max(0, points.length - 1);
    if (points.length < LIBRARY_PATH_MAX_POINTS && !points.slice(from).some(vertex => pointKey(vertex) === key)) {
      points.push(point);
    }
    if (this.shapeFinishButton) this.shapeFinishButton.disabled = points.length < minimum;
    this.previewLibraryShapeDraw(point);
  }

  private placeArcPoint(points: Point[], point: Point) {
    if (points.length === 2) {
      this.finishLibraryShapeDraw([...points, point]);
      return;
    }
    if (points.length === 1 && pointKey(points[0]) === pointKey(point)) {
      this.setStatus("Choose a different right endpoint.");
      return;
    }
    points.push(point);
    const start = points[0];
    const preview = points.length === 1 ? point : { x: (start.x + point.x) / 2, y: (start.y + point.y) / 2 };
    this.previewLibraryShapeDraw(preview);
    this.setStatus(points.length === 1
      ? "Arc: click the right endpoint."
      : "Arc: click the third point on the curve.");
  }

  private ensureShapeFinishButton() {
    if (this.shapeFinishButton) return this.shapeFinishButton;
    const button = this.host.ownerDocument.createElement("button");
    button.type = "button";
    const { signal } = this.lifecycleController;
    button.addEventListener("pointerdown", event => event.stopPropagation(), { signal });
    button.addEventListener("mousedown", event => event.stopPropagation(), { signal });
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      this.finishPathDraw();
    }, { signal });
    this.options.paperEl.append(button);
    this.shapeFinishButton = button;
    return button;
  }

  private finishPathDraw() {
    const draft = this.libraryShapeDraw;
    if (draft && isPathDraft(draft.kind) && draft.points.length >= SHAPE_FINISH_MIN_VERTICES[draft.kind]) {
      this.finishLibraryShapeDraw(draft.points);
    }
  }

  private libraryShapeSnap(point: Point) {
    const draft = this.libraryShapeDraw;
    const step = draft?.kind === "arc" && draft.points.length === 2 ? ARC_THROUGH_POINT_STEP : LIBRARY_SHAPE_DRAW_GRID_SIZE;
    return snapPoint(point, step);
  }

  private ensureShapeDraftOverlay() {
    if (this.shapeDraftOverlay) return;
    const doc = this.host.ownerDocument;
    const overlay = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
    overlay.setAttribute("class", "schematic-shape-draft");
    overlay.setAttribute("aria-hidden", "true");
    overlay.setAttribute("hidden", "");
    this.options.paperEl.append(overlay);
    this.shapeDraftOverlay = overlay;
  }

  private previewLibraryShapeDraw(current: Point) {
    const overlay = this.shapeDraftOverlay;
    const draft = this.libraryShapeDraw;
    if (!overlay || !draft) return;
    const rect = this.options.paperEl.getBoundingClientRect();
    overlay.setAttribute("viewBox", `0 0 ${Math.max(1, rect.width)} ${Math.max(1, rect.height)}`);
    overlay.replaceChildren();
    const doc = this.host.ownerDocument;
    const snappedCurrent = this.libraryShapeSnap(current);
    const line = (points: Point[]) => {
      const element = doc.createElementNS("http://www.w3.org/2000/svg", "polyline");
      element.setAttribute("points", points.map((point) => {
        const screen = this.worldToScreenPoint(point);
        return `${screen.x},${screen.y}`;
      }).join(" "));
      element.setAttribute("class", "schematic-shape-draft-shape");
      return element;
    };
    if (draft.kind === "rectangle" && draft.points.length > 0) {
      const start = draft.points[0];
      const x1 = Math.min(start.x, snappedCurrent.x);
      const x2 = Math.max(start.x, snappedCurrent.x);
      const y1 = Math.min(start.y, snappedCurrent.y);
      const y2 = Math.max(start.y, snappedCurrent.y);
      const topLeft = this.worldToScreenPoint({ x: x1, y: y1 });
      const bottomRight = this.worldToScreenPoint({ x: x2, y: y2 });
      const preview = doc.createElementNS("http://www.w3.org/2000/svg", "rect");
      preview.setAttribute("x", String(topLeft.x));
      preview.setAttribute("y", String(topLeft.y));
      preview.setAttribute("width", String(Math.max(0, bottomRight.x - topLeft.x)));
      preview.setAttribute("height", String(Math.max(0, bottomRight.y - topLeft.y)));
      preview.setAttribute("class", "schematic-shape-draft-shape");
      overlay.append(preview);
    } else if (draft.kind === "circle" && draft.points.length > 0) {
      const center = this.worldToScreenPoint(draft.points[0]);
      const edge = this.worldToScreenPoint(snappedCurrent);
      const preview = doc.createElementNS("http://www.w3.org/2000/svg", "circle");
      preview.setAttribute("cx", String(center.x));
      preview.setAttribute("cy", String(center.y));
      preview.setAttribute("r", String(Math.hypot(edge.x - center.x, edge.y - center.y)));
      preview.setAttribute("class", "schematic-shape-draft-shape");
      overlay.append(preview);
    } else if (isPathDraft(draft.kind) && draft.points.length > 0) {
      const { points } = draft;
      const first = points[0];
      const last = points.at(-1)!;
      const atFirst = pointKey(first) === pointKey(snappedCurrent);
      const atLast = pointKey(last) === pointKey(snappedCurrent);
      if (points.length > 1) overlay.append(line(points));
      if (draft.kind === "polyline") {
        if (points.length < LIBRARY_PATH_MAX_POINTS && !atLast) overlay.append(line([last, snappedCurrent]));
      } else {
        if (!atLast && !(atFirst && points.length === 2)) overlay.append(line([last, snappedCurrent]));
        if (!atFirst && points.length >= 2 && !(atLast && points.length === 2)) overlay.append(line([snappedCurrent, first]));
      }
    } else if (draft.kind === "arc" && draft.points.length > 0) {
      const arc = [...draft.points, snappedCurrent];
      const path = createArcGeometry(arc)
        ? quadraticArcSymbol(0, 0, arc.map(point => this.worldToScreenPoint(point)))
        : "";
      if (path) {
        const preview = doc.createElementNS("http://www.w3.org/2000/svg", "path");
        preview.setAttribute("d", path);
        preview.setAttribute("class", "schematic-shape-draft-shape");
        overlay.append(preview);
      } else {
        overlay.append(line([draft.points[0], draft.points[1] ?? snappedCurrent]));
      }
    } else if (draft.kind === "triangle" && draft.points.length > 0) {
      const segments: Array<readonly [Point, Point]> = [];
      const appendSegment = (start: Point, end: Point) => {
        if (start.x === end.x && start.y === end.y) return;
        const duplicate = segments.some(([existingStart, existingEnd]) =>
          (existingStart.x === start.x && existingStart.y === start.y && existingEnd.x === end.x && existingEnd.y === end.y)
          || (existingStart.x === end.x && existingStart.y === end.y && existingEnd.x === start.x && existingEnd.y === start.y)
        );
        if (duplicate) return;
        segments.push([start, end]);
        overlay.append(line([start, end]));
      };
      for (let index = 1; index < draft.points.length; index += 1) {
        appendSegment(draft.points[index - 1], draft.points[index]);
      }
      draft.points.forEach(point => appendSegment(point, snappedCurrent));
    }
    const screenSnap = this.worldToScreenPoint(snappedCurrent);
    const snapMarker = doc.createElementNS("http://www.w3.org/2000/svg", "circle");
    snapMarker.setAttribute("class", "schematic-shape-draft-grid-point");
    snapMarker.setAttribute("cx", String(screenSnap.x));
    snapMarker.setAttribute("cy", String(screenSnap.y));
    snapMarker.setAttribute("r", "4");
    overlay.append(snapMarker);
  }

  private clearLibraryShapeDraw() {
    this.libraryShapeDraw = null;
    this.libraryShapeDragStart = null;
    if (this.shapeFinishButton) this.shapeFinishButton.hidden = true;
    if (this.shapeDraftOverlay) {
      this.shapeDraftOverlay.setAttribute("hidden", "");
      this.shapeDraftOverlay.replaceChildren();
    }
    this.options.shellEl.classList.remove("is-drawing-shape");
  }

  private finishLibraryShapeDraw(points: Point[]) {
    const draft = this.libraryShapeDraw;
    const layer = draft && this.editablePlacementLayer();
    if (!draft || !layer) return;
    const kind = draft.kind;
    const geometry = isVertexLibraryShapeType(kind) ? VERTEX_SHAPE_GEOMETRY[kind](points) : null;
    if (isVertexLibraryShapeType(kind) && !geometry) {
      const invalid = {
        arc: "Choose a third point within the supported drawing area.",
        circle: "Choose a different radius point within the supported dimensions.",
        polygon: "Choose at least three non-collinear vertices within the supported dimensions.",
        polyline: "Polyline exceeds the supported dimensions."
      };
      this.setStatus(invalid[kind]);
      return;
    }
    this.clearLibraryShapeDraw();
    const xs = points.map(point => point.x);
    const ys = points.map(point => point.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const width = maxX - minX;
    const height = maxY - minY;
    const center = geometry?.center ?? { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
    if (!geometry && (width < LIBRARY_SHAPE_DRAW_GRID_SIZE || height < LIBRARY_SHAPE_DRAW_GRID_SIZE)) {
      this.setStatus("Shape needs a non-zero grid size.");
      return;
    }
    const def = getComponentDef(kind);
    const values: Record<string, string> = {
      ...(def.defaultValues ?? {}),
      "layer:id": layer.id
    };
    if (kind === "rectangle") {
      values[RECTANGLE_WIDTH_VALUE_KEY] = String(width / SYMBOL_GRID_SIZE);
      values[RECTANGLE_HEIGHT_VALUE_KEY] = String(height / SYMBOL_GRID_SIZE);
    } else if (geometry) {
      Object.assign(values, geometry.values);
    } else {
      const local = points.map(point => ({ x: point.x - center.x, y: point.y - center.y }));
      TRIANGLE_VERTICES.forEach((vertex, index) => {
        values[triangleVertexKey(vertex, "x")] = String(local[index].x);
        values[triangleVertexKey(vertex, "y")] = String(local[index].y);
      });
    }
    const component: ComponentInstance = {
      id: this.host.idFactory(),
      type: kind,
      ref: this.nextComponentRef(kind),
      x: center.x,
      y: center.y,
      rotation: 0,
      mirrored: false,
      values
    };
    this.transact((draftDocument) => { draftDocument.components.push(component); }, {
      origin: "editor",
      reason: `draw-${kind}`
    });
    this.selectionSession.setMixed([component.id], []);
    this.finishSelectionChange();
    this.sidebarLibrary.showProperties();
    this.focusCanvas();
    const created = {
      rectangle: "Rectangle created.",
      triangle: "Triangle created.",
      polyline: "Polyline created.",
      arc: "Arc created.",
      circle: "Circle created. Drag the handles to resize it into an ellipse.",
      polygon: "Polygon created."
    };
    this.setStatus(created[kind]);
  }

  private addLayer() {
    const layers = this.layers();
    const layer: SchematicLayer = {
      id: nextLayerId(layers),
      name: uiFormat("layer.numbered", "Layer {number}", { number: String(layers.length + 1) }),
      visible: true,
      locked: false
    };
    this.transact((draft) => {
      draft.layers = [...(draft.layers ?? []), layer];
    }, { origin: "editor", reason: "add-layer" });
    this.activeLayerId = layer.id;
    this.renderLayersPanel();
  }

  private deleteLayer() {
    const layers = this.layers();
    if (layers.length <= 1) {
      this.setStatus("At least one layer is required.");
      return;
    }
    const id = this.activeLayerId;
    if (buildSchematicLayerObjectTree(this.document).some(group => group.layer.id === id && group.objectCount > 0)) {
      this.setStatus("Move or delete objects on this layer first.");
      return;
    }
    this.transact((draft) => {
      draft.layers = (draft.layers ?? []).filter(layer => layer.id !== id);
    }, { origin: "editor", reason: "delete-layer" });
    this.activeLayerId = defaultSchematicLayer(this.layers()).id;
    this.renderLayersPanel();
  }

  private moveLayer(id: string, direction: number) {
    const layers = this.layers();
    const index = layers.findIndex(layer => layer.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= layers.length) return;
    const reordered = [...layers];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    this.transact((draft) => { draft.layers = reordered; }, { origin: "editor", reason: "reorder-layer" });
    this.renderLayersPanel();
  }

  private moveLayerObject(
    layerId: string,
    objectId: string,
    direction: LayerObjectMoveDirection
  ) {
    const layer = this.layers().find(candidate => candidate.id === layerId);
    if (!layer || layer.locked) return;
    const plan = planLayerObjectMove(this.document, layerId, objectId, direction);
    if (!plan) return;
    this.transact(
      draft => applyLayerObjectMove(draft, plan),
      { origin: "editor", reason: "reorder-layer-object" }
    );
  }

  private updateLayerObjectVisibility(objectId: string, visible: boolean) {
    const groups = buildSchematicLayerObjectTree(this.document);
    const group = groups.find(candidate => candidate.objects.some(object =>
      object.id === objectId || object.children.some(child => child.id === objectId)
    ));
    const node = group?.objects.find(object => object.id === objectId)
      ?? group?.objects.flatMap(object => object.children).find(child => child.id === objectId);
    if (!group || !node || group.layer.locked || !node.visibilityEditable) return;

    if (objectId.startsWith("pin:")) {
      const separator = objectId.indexOf(":", 4);
      if (separator < 0) return;
      const componentId = objectId.slice(4, separator);
      const pinId = objectId.slice(separator + 1);
      this.transact((draft) => {
        const component = draft.components.find(candidate => candidate.id === componentId);
        if (component) setComponentPinVisibility(component, pinId, visible);
      }, { origin: "editor", reason: "layer-pin-visibility" });
      return;
    }

    this.transact(
      draft => { setLayerObjectVisibleState(draft, objectId, visible); },
      { origin: "editor", reason: "layer-object-visibility" }
    );
  }

  private updateLayer(id: string, patch: Partial<SchematicLayer>) {
    this.transact((draft) => {
      const layer = (draft.layers ?? []).find(item => item.id === id);
      if (layer) Object.assign(layer, patch);
    }, { origin: "editor", reason: "update-layer" });
    this.renderLayersPanel();
  }

  private renderLayersPanel() {
    const list = this.options.paletteEl.querySelector<HTMLElement>("[data-layer-list]");
    if (!list) return;
    const layers = this.layers();
    if (!layers.some(layer => layer.id === this.activeLayerId)) this.activeLayerId = defaultSchematicLayer(layers).id;
    const doc = list.ownerDocument;
    const groups = buildSchematicLayerObjectTree(this.document);
    list.replaceChildren();
    groups.forEach((group) => {
      const { layer } = group;
      const displayName = this.layerDisplayName(layer);
      const container = doc.createElement("section");
      container.className = "layer-stack-group";
      container.dataset.layerId = layer.id;
      const row = doc.createElement("div");
      row.className = "layer-stack-row";
      row.classList.toggle("is-active", layer.id === this.activeLayerId);
      row.append(this.createLayerTreeToggle(doc, `layer:${layer.id}`, uiFormat("layer.toggleObjects", "Toggle {name} objects", { name: displayName })));
      const visible = doc.createElement("input");
      visible.type = "checkbox";
      visible.checked = layer.visible;
      visible.dataset.layerVisible = layer.id;
      visible.title = t("layer.visible", "Visible");
      visible.ariaLabel = visible.title;
      const lock = doc.createElement("input");
      lock.type = "checkbox";
      lock.checked = layer.locked;
      lock.dataset.layerLock = layer.id;
      lock.title = t("layer.locked", "Locked");
      lock.ariaLabel = lock.title;
      const select = doc.createElement("button");
      select.type = "button";
      select.className = "layer-select";
      select.dataset.layerSelect = layer.id;
      select.dataset.layerName = layer.name;
      select.textContent = `${displayName} (${group.objectCount})`;
      select.title = displayName;
      const up = doc.createElement("button");
      up.type = "button";
      up.textContent = "↑";
      up.dataset.layerUp = layer.id;
      up.title = t("layer.raise", "Raise layer");
      const down = doc.createElement("button");
      down.type = "button";
      down.textContent = "↓";
      down.dataset.layerDown = layer.id;
      down.title = t("layer.lower", "Lower layer");
      row.append(visible, lock, select, up, down);
      container.append(row);
      if (!this.layerTreeCollapseState().has(`layer:${layer.id}`)) {
        const objects = doc.createElement("div");
        objects.className = "layer-object-tree";
        objects.dataset.layerObjects = layer.id;
        if (group.objects.length === 0) {
          const empty = doc.createElement("div");
          empty.className = "layer-object-empty";
          empty.textContent = localizeSchematicStatus("No objects");
          objects.append(empty);
        } else {
          group.objects.forEach((object, index) => objects.append(
            this.createLayerObjectRow(doc, object, layer, index, group.objects.length)
          ));
        }
        container.append(objects);
      }
      list.append(container);
    });
    this.syncLayerObjectSelection();
  }

  private layerTreeCollapseState() {
    return this.collapsedLayerTreeNodes ?? new Set<string>();
  }

  private createLayerTreeToggle(doc: Document, id: string, label: string) {
    const collapsed = this.layerTreeCollapseState().has(id);
    const toggle = doc.createElement("button");
    toggle.type = "button";
    toggle.className = "layer-tree-toggle";
    toggle.dataset.layerTreeToggle = id;
    toggle.textContent = collapsed ? "▸" : "▾";
    toggle.title = label;
    toggle.setAttribute("aria-label", label);
    toggle.setAttribute("aria-expanded", String(!collapsed));
    return toggle;
  }

  private createLayerObjectRow(
    doc: Document,
    node: SchematicLayerObjectNode,
    layer: SchematicLayer,
    index = 0,
    count = 1,
    parentVisible = true
  ) {
    const container = doc.createElement("div");
    container.className = "layer-object-node";
    const row = doc.createElement("div");
    row.className = "layer-object-row";
    row.dataset.layerObjectKind = node.kind;
    row.dataset.layerObjectId = node.id;
    row.classList.toggle("is-temporarily-deleted", node.temporarilyDeleted);
    row.classList.toggle("is-object-hidden", !parentVisible || !node.visible);
    const label = this.layerObjectLabel(node);
    if (node.children.length > 0) {
      row.append(this.createLayerTreeToggle(doc, node.id, uiFormat("layer.togglePins", "Toggle {name} pins", { name: label })));
    } else {
      const spacer = doc.createElement("span");
      spacer.className = "layer-tree-leaf";
      spacer.setAttribute("aria-hidden", "true");
      row.append(spacer);
    }

    const visible = doc.createElement("input");
    visible.type = "checkbox";
    visible.className = "layer-object-visibility";
    visible.checked = node.visible;
    visible.dataset.layerObjectVisible = node.id;
    visible.disabled = layer.locked || !node.visibilityEditable;
    visible.title = node.visibilityEditable
      ? uiFormat(node.visible ? "layer.hideObject" : "layer.showObject", node.visible ? "Hide {name}" : "Show {name}", { name: label })
      : t("layer.pinFixed", "Pin visibility is fixed");
    visible.setAttribute("aria-label", visible.title);

    const select = doc.createElement("button");
    select.type = "button";
    select.className = "layer-object-select";
    select.dataset.layerObjectSelect = node.id;
    select.dataset.layerObjectTarget = node.targetId;
    select.dataset.layerObjectTargetType = node.targetType;
    select.disabled = layer.locked || !node.displayed || !parentVisible || !node.visible;
    select.title = !layer.visible
      ? t("layer.hiddenHint", "Layer is hidden")
      : layer.locked
        ? t("layer.lockedHint", "Layer is locked")
        : !parentVisible || !node.visible
          ? t("layer.objectHidden", "Object is hidden")
          : label;
    select.textContent = label;

    const up = doc.createElement("button");
    up.type = "button";
    up.textContent = "↑";
    up.dataset.layerObjectUp = node.id;
    up.disabled = layer.locked || !node.reorderable || index <= 0;
    up.title = node.reorderable ? uiFormat("layer.raiseObject", "Raise {name}", { name: label }) : t("layer.pinOrder", "Pins cannot be reordered");
    up.setAttribute("aria-label", up.title);
    const down = doc.createElement("button");
    down.type = "button";
    down.textContent = "↓";
    down.dataset.layerObjectDown = node.id;
    down.disabled = layer.locked || !node.reorderable || index >= count - 1;
    down.title = node.reorderable ? uiFormat("layer.lowerObject", "Lower {name}", { name: label }) : t("layer.pinOrder", "Pins cannot be reordered");
    down.setAttribute("aria-label", down.title);

    row.append(visible, select, up, down);
    container.append(row);
    if (node.children.length > 0 && !this.layerTreeCollapseState().has(node.id)) {
      const children = doc.createElement("div");
      children.className = "layer-object-children";
      node.children.forEach(child => children.append(
        this.createLayerObjectRow(doc, child, layer, 0, 1, parentVisible && node.visible)
      ));
      container.append(children);
    }
    return container;
  }

  private selectLayerObject(button: HTMLElement) {
    const targetId = button.dataset.layerObjectTarget;
    if (!targetId) return;
    const layerId = button.closest<HTMLElement>("[data-layer-id]")?.dataset.layerId;
    if (layerId) this.activeLayerId = layerId;
    const note = button.dataset.layerObjectTargetType === "note";
    this.selectionSession.setMixed(note ? [] : [targetId], note ? [targetId] : []);
    this.finishSelectionChange();
    this.sidebarLibrary.showLayers();
    this.syncLayerObjectSelection();
  }

  private syncLayerObjectSelection() {
    this.options.paletteEl.querySelectorAll<HTMLElement>("[data-layer-object-select]").forEach((button) => {
      const id = button.dataset.layerObjectTarget ?? "";
      const selected = button.dataset.layerObjectTargetType === "note"
        ? this.selectionSession.isNoteSelected(id)
        : this.selectionSession.isCellSelected(id);
      button.closest<HTMLElement>(".layer-object-row")?.classList.toggle("is-selected", selected);
      if (selected) button.setAttribute("aria-current", "true");
      else button.removeAttribute("aria-current");
    });
  }

  private selectedLayerObjectIds() {
    return new Set([...this.selectionSession.selectedIds, ...this.selectionSession.selectedNoteIds]);
  }

  private syncLayerAssignment() {
    const row = this.options.propertyEl.querySelector<HTMLElement>("[data-property-layer-row]");
    const select = this.options.propertyEl.querySelector<HTMLSelectElement>("[data-property-layer]");
    if (!row || !select) return;
    if (this.transientToolSession.mode !== "select" || !this.selectionSession.hasAny()) {
      row.hidden = true;
      return;
    }
    const { groups, objects } = projectLayerAssignment(this.document, this.selectedLayerObjectIds());
    row.hidden = objects.length === 0;
    if (!objects.length) return;
    const first = objects[0].layer.id;
    const mixed = objects.some(object => object.layer.id !== first);
    const createOption = (id: string, label: string, disabled: boolean) => {
      const option = select.ownerDocument.createElement("option");
      option.value = id;
      option.textContent = label;
      option.disabled = disabled;
      return option;
    };
    const options = groups.map(({ layer }) => {
      const suffix = layer.locked ? t("layer.lockedSuffix", " (locked)")
        : layer.visible ? "" : t("layer.hiddenSuffix", " (hidden)");
      return createOption(layer.id, this.layerDisplayName(layer) + suffix, layer.locked);
    });
    if (mixed) options.unshift(createOption("", t("layer.mixed", "Multiple layers"), true));
    select.replaceChildren(...options);
    select.value = mixed ? "" : first;
    select.disabled = objects.some(object => object.layer.locked || !object.displayed)
      || !groups.some(({ layer }) => !layer.locked && (mixed || layer.id !== first));
  }

  private editablePlacementLayer() {
    const layers = this.layers();
    const layer = layers.find(candidate => candidate.id === this.activeLayerId) ?? defaultSchematicLayer(layers);
    if (layer.locked) {
      this.setStatus("The active layer is locked. Unlock it or select another layer.");
      return null;
    }
    this.activeLayerId = layer.id;
    return layer;
  }

  private bindMosParamEvents() {
    const { signal } = this.lifecycleController;
    const root = this.options.propertyEl;
    if (!root) return;
    root.addEventListener("change", (event) => {
      const input = (event.target as HTMLElement | null)?.closest<HTMLInputElement>("[data-property-mos-param]");
      if (input) this.commitMosParam(input);
    }, { signal });
    root.addEventListener("keydown", (event) => {
      const input = (event.target as HTMLElement | null)?.closest<HTMLInputElement>("[data-property-mos-param]");
      if (!input) return;
      if (event.key === "Enter") {
        event.preventDefault();
        this.commitMosParam(input);
        input.blur();
      } else if (event.key === "Escape") {
        event.preventDefault();
        this.syncMosParams(true);
        input.blur();
      }
    }, { signal });
  }

  private commitMosParam(input: HTMLInputElement) {
    const parameter = input.dataset.propertyMosParam;
    const component = this.selectedMosComponent();
    if (!parameter || !component) return;
    const key = `mos:${parameter}`;
    const value = input.value.trim();
    if ((component.values[key] ?? "") === value) return;
    this.transact((draft) => {
      const target = draft.components.find(item => item.id === component.id);
      if (!target) return;
      if (value) target.values[key] = value;
      else delete target.values[key];
    }, { origin: "editor", reason: "mos-param" });
    this.selectionSession.setMixed([component.id], []);
    this.finishSelectionChange();
  }

  private selectedMosComponent() {
    const components = this.selectedTransformObjects().components;
    if (components.length !== 1) return null;
    const component = components[0];
    return component.type === "nmos" || component.type === "pmos" ? component : null;
  }

  private syncMosParams(force = false) {
    const container = this.options.propertyEl?.querySelector<HTMLElement>("[data-property-mos-params]");
    if (!container) return;
    const component = this.selectedMosComponent();
    container.hidden = !component;
    if (!component) return;
    container.querySelectorAll<HTMLInputElement>("[data-property-mos-param]").forEach((input) => {
      const parameter = input.dataset.propertyMosParam;
      if (!parameter) return;
      if (!force && this.host.ownerDocument.activeElement === input) return;
      input.value = component.values[`mos:${parameter}`] ?? "";
    });
  }

  private changeNetlistProcess(process: ProcessId) {
    const previous = this.document.netlistProcess;
    if (process === (previous ?? DEFAULT_NETLIST_PROCESS)) return;
    this.hostFinishActiveEdits();
    this.document.netlistProcess = process === DEFAULT_NETLIST_PROCESS ? undefined : process;
    if (!this.commitCurrentContent("netlist-process")) this.document.netlistProcess = previous;
    this.syncToolUi();
  }

  private bindDeviceModelEvents() {
    const { signal } = this.lifecycleController;
    const root = this.options.propertyEl;
    root.addEventListener("change", event => {
      const control = (event.target as Element | null)?.closest<HTMLInputElement | HTMLSelectElement>(
        "[data-property-model-select], [data-property-model-input]"
      );
      if (control) this.commitDeviceModel(control);
    }, { signal });
    root.addEventListener("keydown", event => {
      const input = (event.target as Element | null)?.closest<HTMLInputElement>("[data-property-model-input]");
      if (!input || (event.key !== "Enter" && event.key !== "Escape")) return;
      event.preventDefault();
      if (event.key === "Enter") this.commitDeviceModel(input);
      else this.syncDeviceModel(true);
      input.blur();
    }, { signal });
  }

  private selectedModelDevice() {
    if (!this.netlistPanel || this.transientToolSession.mode !== "select") return null;
    const component = this.selectedSingleComponent();
    if (!component || !isDeviceKind(component.type) || this.graphAdapter.getCell(component.id)?.get("layerLocked")) return null;
    return { component, kind: component.type };
  }

  private commitDeviceModel(control: HTMLInputElement | HTMLSelectElement) {
    const selected = this.selectedModelDevice();
    if (!selected || control.dataset.componentId !== selected.component.id || control.hidden) return;
    const { component } = selected;
    const key = NETLIST_MODEL_VALUE_KEY;
    const previous = component.values[key] ?? "";
    const model = control.value.trim();
    if (model !== previous && isNetlistModelText(model)) {
      if (model) component.values[key] = model;
      else delete component.values[key];
      if (!this.commitCurrentContent("device-model")) {
        if (previous) component.values[key] = previous;
        else delete component.values[key];
      }
      this.syncToolUi();
    }
    this.syncDeviceModel(true);
  }

  private syncDeviceModel(force = false) {
    const selected = this.selectedModelDevice();
    const profile = processProfile(this.document.netlistProcess ?? DEFAULT_NETLIST_PROCESS);
    const rows = this.options.propertyEl.querySelectorAll<HTMLElement>("[data-property-device-model]");
    for (const row of rows) {
      const section = selected && (["resistor", "capacitor", "inductor"].includes(selected.kind) ? "passive" : "transistor");
      row.hidden = row.dataset.propertyDeviceModel !== section;
      if (!selected || row.hidden) continue;
      const { component, kind } = selected;
      const model = component.values[NETLIST_MODEL_VALUE_KEY] ?? "";
      const defaultModel = profile.defaults[kind];
      const select = row.querySelector<HTMLSelectElement>("[data-property-model-select]")!;
      const input = row.querySelector<HTMLInputElement>("[data-property-model-input]")!;
      const custom = profile.id === "custom";
      select.hidden = custom;
      input.hidden = !custom;
      if (custom) {
        if (force || input.dataset.componentId !== component.id || this.host.ownerDocument.activeElement !== input) input.value = model;
        input.dataset.componentId = component.id;
        input.placeholder = defaultModel;
      } else {
        const caption = uiFormat("parameter.processDefaultModel", "Process default ({name})", { name: defaultModel });
        const choices = [...new Set([...profile.options[kind], ...(model ? [model] : [])])];
        const options = [["", caption], ...choices.map(name => [name, name])];
        if (select.options.length !== options.length || options.some(
          ([value, label], index) => select.options[index].value !== value || select.options[index].text !== label
        )) {
          select.replaceChildren(...options.map(([value, label]) => {
            const option = select.ownerDocument.createElement("option");
            option.value = value;
            option.text = label;
            return option;
          }));
        }
        select.dataset.componentId = component.id;
        select.value = model;
        select.title = model || caption;
      }
    }
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
      if (runtime !== this.activeRenderRuntime) return;
      this.handleLiveCellGeometry(cell);
      this.scheduleWireCrossings();
    });

    paper.on("cell:pointerup", (view: any) => {
      if (runtime !== this.activeRenderRuntime) return;
      this.commitCellGeometry(view.model);
    });

    paper.on("element:pointerdown", (view: any, event: MouseEvent) => {
      if (runtime !== this.activeRenderRuntime) return;
      if (event.button !== 0 || view.model.get("layerLocked")) return;
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
      if (event.button === 0 && this.transientToolSession.mode === "place") {
        const target = event.target as Element | null;
        this.placementPointerStart = {
          x: event.clientX,
          y: event.clientY,
          blank: !target?.closest?.(".joint-cell"),
          maxDistance: 0
        };
      }
    }, { signal });
    this.host.ownerWindow.addEventListener("pointermove", (event) => {
      const start = this.placementPointerStart;
      if (!start) return;
      start.maxDistance = Math.max(start.maxDistance, Math.hypot(event.clientX - start.x, event.clientY - start.y));
    }, { signal });
    // JointJS suppresses `blank:pointerclick` after even one mousemove (its
    // clickThreshold defaults to 0). A normal mouse click often jitters by a
    // pixel or two, so placement needs a pointerup fallback for small moves.
    this.host.ownerWindow.addEventListener("pointerup", (event) => {
      const start = this.placementPointerStart;
      this.placementPointerStart = null;
      if (!start?.blank || this.transientToolSession.mode !== "place" || event.button !== 0) return;
      if (start.maxDistance <= 0.5 || start.maxDistance > 12) return;
      if (!this.options.paperEl.contains(event.target as Node | null)) return;
      this.placeActiveItem(snapPoint(this.localPointFromClient(event.clientX, event.clientY)));
    }, { signal });
    this.host.ownerWindow.addEventListener("pointercancel", () => { this.placementPointerStart = null; }, { signal });
    this.options.paperEl.addEventListener("pointermove", (event) => this.viewportController.handleTouchPointerMove(event), { passive: false, signal });
    this.options.paperEl.addEventListener("pointerup", (event) => this.viewportController.handleTouchPointerEnd(event), { signal });
    this.options.paperEl.addEventListener("pointercancel", (event) => this.viewportController.handleTouchPointerEnd(event), { signal });
    this.options.paperEl.addEventListener("mousedown", (event) => {
      this.focusCanvas();
      if (isViewportPanMouseEvent(event)) this.viewportController.startMousePan(event);
    }, { signal });
    this.options.paperEl.addEventListener("dblclick", (event) => {
      if (event.button !== 0 || this.transientToolSession.mode !== "wire") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      this.finishWire(this.localPointFromClient(event.clientX, event.clientY), this.wireIdAt(event.target));
    }, { capture: true, signal });
    this.options.paperEl.addEventListener("mousemove", this.handleCanvasMouseMove, { signal });
    this.options.paperEl.addEventListener("pointerleave", () => {
      this.routingPointer = null;
      if (this.transientToolSession.mode === "wire" || this.transientToolSession.mode === "label") {
        this.transientToolSession.projectActivePreview(null);
      }
    }, { signal });
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
    if (event.button !== 0 || this.transientToolSession.mode !== "select" || view.model.get("preview") || view.model.get("layerLocked")) return;
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
    if (this.transientToolSession.mode === "wire" && (event.target as Element | null)?.closest?.("[port]")) return;
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
    const { selectable } = resolveLayerObjects(this.document);
    this.applyPointerClickTarget(
      projectLinkPointerClickTarget({
        model: view.model,
        point,
        junctions: this.document.junctions.filter(junction => selectable(junctionId(junction))),
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
    const objectId = target.kind === "pin" ? target.componentId : target.kind === "junction" ? target.selectionId : "id" in target ? target.id : null;
    if (objectId && !resolveLayerObjects(this.document).selectable(objectId)) return;
    if (this.inductorInteractions.pendingSourceId) {
      this.inductorInteractions.applyInductorCouplingPartnerPick(target);
      return;
    }
    if (this.transientToolSession.mode === "label") {
      const attachment = this.routingWireAttachment(
        this.localPointFromClient(event.clientX, event.clientY), this.wireIdAt(event.target)
      );
      if (attachment) {
        this.placeNetLabel(attachment.point, attachment.wireId);
        return;
      }
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
        this.applyWireTarget(this.localPointFromClient(event.clientX, event.clientY), this.wireIdAt(event.target));
        return;
      case "wire-pin-click":
        this.handleWirePinClick(intent.point);
        return;
      case "place-label":
        this.setStatus("Net labels can only be placed on an active wire or junction.");
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
    if (target.closest("[data-schematic-options-dialog][open], [data-hierarchy-dialog][open], [data-schematic-net-label-dialog][open], [data-schematic-agent-dialog][open]")) return;
    const editable = isEditableTarget(target, this.options.shellEl);
    const key = event.key.toLowerCase();
    if (key === "escape" && this.transientToolSession.mode === "label") {
      event.preventDefault();
      event.stopPropagation();
      this.cancelTool();
      return;
    }
    if (key === "escape" && this.hierarchyPlacement) {
      event.preventDefault();
      this.cancelHierarchyPlacement();
      this.setStatus("Tool canceled.");
      return;
    }
    if (key === "enter" && !editable && isPathDraft(this.libraryShapeDraw?.kind)) {
      event.preventDefault();
      event.stopPropagation();
      this.finishPathDraw();
      return;
    }
    if (key === "escape" && this.libraryShapeDraw) {
      event.preventDefault();
      event.stopPropagation();
      this.clearLibraryShapeDraw();
      this.setStatus("Shape drawing canceled.");
      return;
    }
    if (key === "escape" && this.instanceBrowser.isOpen()) {
      event.preventDefault();
      event.stopPropagation();
      this.instanceBrowser.close();
      return;
    }
    if (key === "escape" && this.eventLog.isOpen()) {
      event.preventDefault();
      event.stopPropagation();
      this.eventLog.close();
      return;
    }
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
    if (this.hierarchyPlacement) this.cancelHierarchyPlacement();

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
        this.finishWire(this.routingPointer?.point ?? this.lastPointerPoint, this.routingPointer?.wireId);
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
      case "toggle-log":
        this.eventLog.toggle();
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
    this.cancelHierarchyPlacement();
    this.eventLog.info("command", command);
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
      case "open-library":
        this.openLibraryPanel();
        break;
      case "open-right-view":
        this.openRightView(intent.view);
        break;
      case "toggle-log":
        this.eventLog.toggle();
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
    const projection = resolveLayerObjects(this.document, resolution.connectivity.junctionMembers);
    const { displayed } = projection;
    const visible = <T extends { id: string }>(objects: T[]) => objects.filter(object => displayed(object.id));
    const input = buildSelectionExportInput(
      {
        ...selection,
        junctionPoints: junctionPoints.filter(point => displayed(junctionId(point))),
        components: visible(selection.components),
        wires: visible(selection.wires),
        netLabels: visible(selection.netLabels),
        notes: visible(selection.notes),
        relatedInductorCouplings: visible(selection.relatedInductorCouplings)
      },
      this.presentationMode,
      netLabelStatuses,
      junctionColors,
      this.document.connections,
      this.document.symbolTemplate
    );
    const layerObjectOrder = layerObjectStackIds({ ...this.document, junctions: input.junctionPoints }, projection);
    const display = this.document.display && { ...this.document.display };
    const crossingJunctions = this.document.junctions.map(point => ({ ...point }));
    const wireEndpoints = new Map(input.wires.map(wire => [wire.id, wireEndpointConnections(this.document, wire)]));
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
      display,
      crossingJunctions,
      wireEndpoints,
      busWireIds: resolution.busWireIds,
      layerObjectOrder,
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
    return copySourceCount(source) > 0 ? serializeSchematicDocumentFile({
      ...captureCopyLayers(source, this.document),
      netlistProcess: this.document.netlistProcess
    }) : null;
  }

  private contextTargetFromEvent(event: MouseEvent): SchematicContextTarget | null {
    const noteTarget = projectSchematicContextMenuTarget({
      noteId: this.noteElementFromEvent(event)?.dataset.noteId
    });
    if (noteTarget) return noteTarget;

    const target = event.target;
    if (!(target instanceof this.host.ownerWindow.Element)) return null;
    const view = this.paper.findView?.(target);
    if (view?.model?.get("layerLocked")) return null;
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
    this.applyLayerObjectStackOrder();
    if (clearedDeleteHover) {
      this.syncSelectionStyles({ cellIds: previousHoverIds, resolution: this.netResolutionCache });
      this.syncNoteSelectionStyles();
    }
  }

  private openInstancePalette() {
    this.clearLibraryShapeDraw();
    this.instanceBrowser.open();
  }

  private openLibraryPanel() {
    if (this.options.layout) this.options.layout.openPanel("left");
    else this.options.shellEl.classList.add("is-left-panel-visible");
    this.sidebarLibrary.showLibrary();
  }

  private openRightView(view: RightDockView) {
    const dock = this.rightDock;
    if (!dock) return;
    const layout = this.options.layout;
    const { analysisEl } = this.options;
    const visible = layout
      ? layout.isPanelVisible("right")
      : this.options.shellEl.classList.contains("is-right-panel-visible");
    if (visible && dock.activeView() === view) {
      if (layout) layout.closePanel("right");
      else {
        this.options.shellEl.classList.remove("is-right-panel-visible");
        analysisEl?.setAttribute("aria-hidden", "true");
      }
      return;
    }
    dock.setView(view);
    if (!visible) {
      if (layout) layout.openPanel("right");
      else {
        this.options.shellEl.classList.add("is-right-panel-visible");
        analysisEl?.setAttribute("aria-hidden", "false");
      }
    }
  }

  private handleRightDockChange(state: RightDockState) {
    this.options.layout?.setRightDockState?.(state);
  }

  private toggleInstanceTool() {
    if (this.transientToolSession.mode === "place") {
      this.cancelTool();
      return;
    }
    this.openInstancePalette();
  }

  private beginPlacement(item: InstancePaletteItem, options: { armPaletteKeyboard?: boolean; prefillQuery?: boolean } = {}) {
    if (isLibraryShapeType(item)) {
      this.beginLibraryShapeDraw(item);
      return;
    }
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
    if (isLibraryShapeType(item)) {
      this.beginLibraryShapeDraw(item);
      return;
    }
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
    const selection = this.selectedTransformObjects();
    if (this.hasHierarchyCopyObjects(selection.components)) return;
    const result = this.copyController.prepareSelectionEntry({
      selection,
      junctionAppearances: this.document.junctionAppearances,
      inductorCouplings: this.document.inductorCouplings,
      connections: this.document.connections,
      lastPointerPoint: this.lastPointerPoint,
      document: this.document,
      documentId: this.activeHostedDocumentId
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
    if (this.hasHierarchyCopyObjects(this.document.components.filter(component => ids.includes(component.id)))) return;
    const result = this.copyController.prepareTargetEntry(
      this.document, ids, noteIds, anchor, this.lastPointerPoint ?? anchor, this.activeHostedDocumentId
    );
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
    this.applyPlacementCommitOutcome(this.placementCommitCoordinator.commitCopy(point, this.copyLayerTarget()));
  }

  private copyLayerTarget() {
    return { documentId: this.activeHostedDocumentId, activeLayerId: this.activeLayerId };
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
    this.updateWirePreview(this.routingPointer?.point ?? this.lastPointerPoint);
    return true;
  }

  hostSetWireAngle(angle: WireAngle) {
    this.wireToolController.setRouteMode(angle);
    if (this.transientToolSession.mode === "wire") {
      this.updateWirePreview(this.routingPointer?.point ?? this.lastPointerPoint);
    }
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
    const { draft } = this.netLabelToolController.begin();
    this.setSelection([], false);
    this.syncToolUi();
    this.netLabelDialog.open(draft, name => this.armLabelPlacement(name), () => this.cancelTool());
  }

  private armLabelPlacement(value: string) {
    const result = this.netLabelToolController.arm(value);
    if (result.kind === "invalid") return result.message;
    this.netLabelDialog.close();
    this.focusCanvas();
    this.updateNetLabelPreview(this.routingPointer?.point ?? this.lastPointerPoint);
    this.setStatus(`Label ${result.name}: click a wire or junction to place; Esc cancels.`);
  }

  private placeNetLabel(point: Point, preferredWireId?: string) {
    const layer = this.editablePlacementLayer();
    if (!layer) return;
    this.applyNetLabelCommitOutcome(
      this.netLabelCommitCoordinator.commitPlacement(point, preferredWireId, layer.id)
    );
  }

  private applyNetLabelCommitOutcome(outcome: SchematicNetLabelCommitOutcome) {
    if (outcome.kind === "status") {
      this.setStatus(outcome.status);
      return;
    }
    this.transientToolSession.transition("select", "selection");
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
    const layer = this.editablePlacementLayer();
    if (!layer) return;
    this.transientToolSession.transition("select", "create-note");
    this.instanceSelector.closePanel();
    const anchor = snapPoint(this.lastPointerPoint ?? this.viewportCenterPoint());
    const noteId = this.host.idFactory();
    const result = createPlainSchematicNoteDocumentOp(this.document, noteId, anchor, layer.id);
    this.setNoteSelection(layer.visible ? result.noteIds : []);
    this.renderNotes();
    this.renderLayersPanel();
    this.consumeHistoryIntent(result);
    if (layer.visible) this.beginNoteEditing(noteId);
    this.setStatus(layer.visible ? result.status
      : "Note created on a hidden layer. Show the layer to edit it.");
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
    if (outcome.source === "placement") this.renderLayersPanel();
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
    const layer = this.editablePlacementLayer();
    if (layer) this.applyPlacementCommitOutcome(this.placementCommitCoordinator.commitPlacement(point, layer.id));
  }

  private handlePointerMove(point: Point) {
    this.lastPointerPoint = snapPoint(point);
    if (this.transientToolSession.mode === "copy") this.copyPreviewNeedsPointer = false;
    const mode = this.transientToolSession.mode;
    this.transientToolSession.projectActivePreview(mode === "wire" || mode === "label" ? point : this.lastPointerPoint);
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
    if (!this.editablePlacementLayer()) return;
    this.applyWireCommitOutcome(this.wireCommitCoordinator.applyBlankClick(point));
  }

  private handleWirePinClick(point: Point) {
    if (!this.editablePlacementLayer()) return;
    this.applyWireCommitOutcome(this.wireCommitCoordinator.applyPinClick(point));
  }

  private finishWire(point: Point | null, preferredWireId?: string) {
    if (!this.editablePlacementLayer()) return;
    const target = point && this.wireTargetAt(point, preferredWireId);
    this.applyWireCommitOutcome(this.wireCommitCoordinator.finish(target?.point ?? null));
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
    reconcileDocumentConnectionEdit(this.document, before);
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
    reconcileDocumentConnectionEdit(this.document, before);
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
    if (outcome.targets.wireIds.length > 0) this.scheduleWireCrossings();
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
    this.renderLayersPanel();
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
    this.cancelHierarchyPlacement();
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
      this.hostedActiveLayerIds.set(this.activeHostedDocumentId, this.activeLayerId);
      const selectedIds = new Set(this.selectionSession.selectedIds);
      this.selectionSession.setMixed([], []);
      this.syncSelectionStyles({ cellIds: selectedIds, resolution: this.netResolutionCache });
      this.syncNoteSelectionStyles();
      this.junctionRenderCoordinator.cancelScheduledRefresh();
      this.noteLayer.deactivateDocument(this.activeHostedDocumentId);
      this.noteLayer.discardDocument(this.activeHostedDocumentId);
    }

    this.lastPointerPoint = null;
    this.routingPointer = null;
    this.copyPreviewNeedsPointer = preserveCopy;
    this.activeHostedDocumentId = input.id;
    this.noteLayer.activateDocument(input.id);
    this.activeLayerId = this.hostedActiveLayerIds.get(input.id) ?? defaultSchematicLayer(normalizeLayers(input.document.layers)).id;
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
    if (this.destroyed || this.hasHierarchyCopyObjects(document.components)) return false;
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

  private hasHierarchyCopyObjects(components: ComponentInstance[]) {
    if (!components.some(component => component.type === "sheetPort" || component.type === "sheetBlock")) return false;
    this.setStatus(t("hierarchy.copyUnsupported", "Place sheet instances from the Hierarchy library and create ports with the Pin tool."));
    return true;
  }

  hostFinishActiveEdits() {
    const editingNoteId = this.noteInteractionController.editingNoteId;
    if (editingNoteId) this.finishNoteEditing(editingNoteId);
    this.finishNoteFontSizePropertyEdit();
    this.finishNoteWidthPropertyEdit();
    this.propertyInteractions.flush();
  }

  hostHasActiveEdit() {
    const focus = this.host.ownerDocument.activeElement;
    return this.transientToolSession.mode !== "select" || !!this.libraryShapeDraw || !!this.hierarchyPlacement ||
      this.noteInteractionController.hasActiveEdit() || this.shapeResizeSession.isActive || !!this.wireSegmentMove ||
      (isEditableTarget(focus, this.options.shellEl) && !focus?.closest("[data-schematic-agent-dialog]"));
  }

  hostSetStatus(message: string, log?: Pick<LogEntry, "level" | "source">) {
    this.setStatus(message, undefined, log);
  }

  hostRefreshLanguage() {
    this.renderPalette();
    this.renderLayersPanel();
    this.instanceBrowser.refresh();
    this.analysisController.refreshLanguage?.();
    this.eventLog.refreshLanguage();
    this.netlistPanel?.refreshLanguage();
    this.renderSelectionSummary(this.netResolutionCache);
    if (this.options.statusEl) this.options.statusEl.textContent = localizeSchematicStatus(this.statusMessage);
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
    const resolution = resolveSchematicNets(this.document);
    const projection = resolveLayerObjects(this.document, resolution.connectivity.junctionMembers);
    const { displayed, selectable } = projection;
    const ids = [...this.selectionSession.selectedIds];
    const noteIds = [...this.selectionSession.selectedNoteIds];
    if ([...ids, ...noteIds].some(id => !selectable(id))) {
      this.selectionSession.setMixed(ids.filter(selectable), noteIds.filter(selectable));
    }
    this.graphAdapter.addCells(
      (this.document.inductorCouplings ?? [])
        .filter(coupling => displayed(coupling.id))
        .map((coupling) => this.makeInductorCouplingCell(coupling))
        .filter((cell): cell is NonNullable<typeof cell> => !!cell)
    );
    this.graphAdapter.addCells(this.document.components.filter(component => displayed(component.id))
      .map(component => this.makeComponentCell(component)));
    this.netResolutionCache = resolution;
    this.graphAdapter.addCells(
      this.document.wires
        .filter(wire => displayed(wire.id))
        .map(wire => this.makeWireCell(wire))
    );
    this.analysisController.refreshNetSelectorsFromNames(resolution.nets.keys());
    this.graphAdapter.addCells((this.document.netLabels ?? [])
      .filter(label => displayed(label.id))
      .map(label => makeNetLabelCell(label, {
        selected: this.selectionSession.isCellSelected(label.id),
        documentFont: this.document.display?.textFont,
        status: resolution.labelStates.get(label.id)?.status
      }))
    );
    this.junctionRenderCoordinator.refreshFull(resolution);
    this.applyLayerObjectStackOrder(projection);
    this.syncSelectionStyles({ resolution });
    this.renderNotes();
    this.transientToolSession.projectActivePreview(
      this.lastPointerPoint,
      this.lastPointerPoint ?? this.copyController.anchor
    );
    syncSchematicPaperModeClasses(this.options.paperEl, this.transientToolSession.mode);
    this.renderLayersPanel();
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

    const resolution = resolveSchematicNets(this.document);
    const previousBusWires = this.netResolutionCache?.busWireIds;
    const changedWires = new Set(changedTransformWireIds(renderSnapshot, this.document));
    previousBusWires?.forEach(id => { if (!resolution.busWireIds.has(id)) changedWires.add(id); });
    resolution.busWireIds.forEach(id => { if (!previousBusWires?.has(id)) changedWires.add(id); });
    this.netResolutionCache = resolution;
    this.incrementalRenderer.updateWireCellsFromDocument(changedWires);
    this.analysisController.refreshNetSelectorsFromNames(resolution.nets.keys());
    (this.document.netLabels ?? []).forEach((label) => {
      this.incrementalRenderer.replaceGraphCellPreservingZ(label.id, makeNetLabelCell(label, {
        selected: this.selectionSession.isCellSelected(label.id),
        documentFont: this.document.display?.textFont,
        status: resolution.labelStates.get(label.id)?.status
      }));
    });
    this.junctionRenderCoordinator.refreshFull(resolution);
    this.applyLayerObjectStackOrder();

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

  private applyLayerObjectStackOrder(projection = resolveLayerObjects(this.document)) {
    let z = 1;
    const junctions = this.presentationMode ? presentationJunctions(this.document) : this.document.junctions;
    const groups = buildSchematicLayerObjectTree({ ...this.document, junctions }, projection);
    groups.slice().reverse().forEach((group) => {
      group.objects.slice().reverse().forEach((object) => {
        if (!object.displayed) return;
        const cell = this.graphAdapter.getCell(object.id);
        if (cell) {
          cell.set("z", z);
          cell.set("layerLocked", group.layer.locked);
          if (group.layer.locked) cell.attr({ root: { pointerEvents: "none" } });
        }
        z += 1;
      });
    });
    this.scheduleWireCrossings();
  }

  private scheduleWireCrossings() {
    if (this.document.display?.wireCrossings !== "hop" || this.wireCrossingFramePending) return;
    this.wireCrossingFramePending = true;
    this.requestOwnedFrame(() => {
      this.wireCrossingFramePending = false;
      if (this.document.display?.wireCrossings !== "hop") return;
      const visible = this.document.wires.flatMap(wire => {
        const cell = this.graphAdapter.getCell(wire.id);
        return cell ? [{ wire, cell }] : [];
      }).sort((a, b) => Number(a.cell.get("z")) - Number(b.cell.get("z")));
      const paths = wireHopPaths(visible.map(({ wire }) => wire), this.document.junctions);
      for (const { wire, cell } of visible) {
        const path = paths.get(wire.id) ?? null;
        if ((cell.get("wireHopPath") ?? null) === path) continue;
        cell.set("wireHopPath", path);
        if (path) {
          // Keep the hit area and endpoint decorations on the electrical route.
          cell.removeAttr("line/connection");
          cell.removeAttr("selectionHalo/connection");
          cell.attr({ line: { d: path }, selectionHalo: { d: path } });
        } else {
          cell.removeAttr("line/d");
          cell.removeAttr("selectionHalo/d");
          cell.attr({ line: { connection: true }, selectionHalo: { connection: true } });
        }
      }
    });
  }

  private makeComponentCell(instance: ComponentInstance, options: { preview?: boolean } = {}) {
    return makeComponentCell(instance, {
      ...options,
      symbolTemplate: this.document.symbolTemplate,
      presentationMode: this.presentationMode,
      selected: this.selectionSession.isCellSelected(instance.id),
      flipReferenceLabelSide: inductorCouplingFlipsReferenceLabel(this.document, instance),
      resizeHandles:
        isLibraryShapeType(instance.type)
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
    const { displayed } = resolveLayerObjects(this.document);
    this.graphAdapter.getCells().forEach((cell) => {
      if (cell.get("couplingId")) cell.remove();
    });
    this.graphAdapter.addCells(
      (this.document.inductorCouplings ?? [])
        .filter(coupling => displayed(coupling.id))
        .map((coupling) => this.makeInductorCouplingCell(coupling))
        .filter((cell): cell is NonNullable<typeof cell> => !!cell)
    );
    this.applyLayerObjectStackOrder();
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
      bus: !options.preview && this.netResolutionCache?.busWireIds.has(wire.id),
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
    const attachment = this.transientToolSession.mode === "label" && point
      ? this.routingWireAttachment(point, this.routingPointer?.wireId)
      : null;
    const preview = attachment && this.netLabelToolController.buildPreview(this.document, attachment.point, attachment.wireId);
    this.showRoutingSnap(preview ? preview.attachment.point : null);
    this.previewRenderer.renderLabel(preview
      ? { id: PREVIEW_NET_LABEL_ID, name: preview.name, attachment: preview.attachment }
      : null);
  }

  private wireIdAt(target: EventTarget | null) {
    const id = (target as Element | null)?.closest?.("[model-id]")?.getAttribute("model-id");
    const wireId = id ? this.graphAdapter.getCell(id)?.get("wireId") : undefined;
    return typeof wireId === "string" ? wireId : undefined;
  }

  private routingWireAttachment(point: Point, preferredWireId?: string) {
    const { selectable } = resolveLayerObjects(this.document);
    return nearestWireAttachment(this.document.wires, point, 10 / this.zoom, selectable, preferredWireId);
  }

  private wireTargetAt(point: Point, preferredWireId?: string) {
    const { selectable } = resolveLayerObjects(this.document);
    const radius = 10 / this.zoom;
    let pinPoint: Point | undefined;
    let pinDistance = radius;
    for (const pin of this.netResolutionCache?.connectivity.pins ?? []) {
      if (!selectable(pin.componentId)) continue;
      const distance = Math.hypot(pin.point.x - point.x, pin.point.y - point.y);
      if (distance <= pinDistance) {
        pinPoint = pin.point;
        pinDistance = distance;
      }
    }
    if (pinPoint) return { point: pinPoint, pin: true };
    const attachment = nearestWireAttachment(this.document.wires, point, radius, selectable, preferredWireId);
    return { point: attachment?.point ?? snapPoint(point), pin: false };
  }

  private applyWireTarget(point: Point, preferredWireId?: string) {
    const target = this.wireTargetAt(point, preferredWireId);
    if (target.pin) this.handleWirePinClick(target.point);
    else this.handleWireBlankClick(target.point);
  }

  private showRoutingSnap(point: Point | null) {
    if (!point) {
      this.routingSnapMarker?.parentElement?.setAttribute("hidden", "");
      return;
    }
    if (!this.routingSnapMarker) {
      const ns = "http://www.w3.org/2000/svg";
      const overlay = this.host.ownerDocument.createElementNS(ns, "svg");
      overlay.setAttribute("class", "schematic-shape-draft");
      overlay.setAttribute("aria-hidden", "true");
      this.routingSnapMarker = this.host.ownerDocument.createElementNS(ns, "circle");
      this.routingSnapMarker.setAttribute("class", "schematic-shape-draft-grid-point");
      this.routingSnapMarker.setAttribute("data-routing-snap", "");
      this.routingSnapMarker.setAttribute("r", "4");
      overlay.append(this.routingSnapMarker);
      this.options.paperEl.append(overlay);
    }
    const screen = this.worldToScreenPoint(point);
    this.routingSnapMarker.setAttribute("cx", String(screen.x));
    this.routingSnapMarker.setAttribute("cy", String(screen.y));
    this.routingSnapMarker.parentElement?.removeAttribute("hidden");
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
    const previewInput = this.copyController.preparePreview(point, this.copyInstantiationFactories(), this.document, this.copyLayerTarget());
    if (!previewInput.ok) {
      this.previewRenderer.renderCopy(null);
      return;
    }
    const previewLabels = previewInput.preview.netLabels ?? [];
    bindStandaloneNetLabelsAtPoint(this.document, previewLabels, point);
    this.previewRenderer.renderCopy(previewInput.preview, resolveLayerObjects(previewInput.preview).displayed);
  }

  private updateWirePreview(point: Point | null) {
    if (this.transientToolSession.mode !== "wire") {
      this.removeWirePreview();
      return;
    }
    const snapped = point ? this.wireTargetAt(point, this.routingPointer?.wireId).point : null;
    this.showRoutingSnap(snapped);
    const points = this.wireToolController.previewPath(snapped);
    this.previewRenderer.renderWire(
      points,
      this.wireToolController.appearance(),
      points ? wireRouteModeForPath(points) : undefined
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
    this.showRoutingSnap(null);
  }

  private clearNetLabelTransientState() {
    const draggedLabelId = this.netLabelToolController.snapshot().drag?.id;
    this.netLabelToolController.cancel();
    this.netLabelDialog.close();
    this.previewRenderer.clearLabel();
    this.showRoutingSnap(null);
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
    this.noteLayer.render(this.displayedNotesInStackOrder(), this.noteLayerState());
  }

  private displayedNotesInStackOrder() {
    const projection = resolveLayerObjects(this.document);
    const order = new Map(
      layerObjectStackIds(this.document, projection).map((id, index) => [id, index])
    );
    return (this.document.notes ?? [])
      .filter(note => projection.displayed(note.id))
      .sort((first, second) => (order.get(first.id) ?? -1) - (order.get(second.id) ?? -1));
  }

  private updateNoteLayerTransform() {
    const { displayed } = resolveLayerObjects(this.document);
    this.noteLayer.updateTransform(
      (this.document.notes ?? []).filter(note => displayed(note.id)),
      this.noteLayerState()
    );
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
    const element = this.noteLayer.noteElementFromEvent(event);
    const id = element?.dataset.noteId;
    return id && resolveLayerObjects(this.document).selectable(id) ? element : null;
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
      resolution: options.resolution ?? this.netResolutionCache
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
      && isLibraryShapeType(component.type)
      && !component.temporarilyDeleted
    );
    this.graphAdapter.getCells().forEach((cell) => {
      const componentId = cell.get("componentId");
      if (!componentId) return;
      const selected = componentId === selectedShape?.id && !this.presentationMode;
      const vertexShape = cell.get("vertexShape");
      if (typeof vertexShape === "string" && isVertexLibraryShapeType(vertexShape)) {
        cell.attr(`${vertexShape}Handles/display`, selected ? "inline" : "none");
        return;
      }
      const visible = selected && selectedShape?.type === "rectangle";
      RECTANGLE_RESIZE_HANDLE_SELECTORS.forEach((selector) => {
        cell.attr(`${selector}/opacity`, visible ? 1 : 0);
        cell.attr(`${selector}/pointerEvents`, visible ? "all" : "none");
      });
      ["A", "B", "C"].forEach(vertex => {
        const show = selected && selectedShape?.type === "triangle";
        cell.attr(`triangleResize${vertex}/opacity`, show ? 1 : 0);
        cell.attr(`triangleResize${vertex}/pointerEvents`, show ? "all" : "none");
        cell.attr(`triangleVertex${vertex}/opacity`, 0);
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
    this.scheduleWireCrossings();
    const templateSelect = this.options.shellEl.querySelector<HTMLSelectElement>("[data-symbol-template]");
    if (templateSelect) templateSelect.value = resolveSymbolTemplate(this.document.symbolTemplate).id;
    const wireCrossings = this.options.shellEl.querySelector<HTMLSelectElement>("[data-schematic-wire-crossings]");
    if (wireCrossings) wireCrossings.value = this.document.display?.wireCrossings ?? "plain";
    const textFont = this.options.shellEl.querySelector<HTMLSelectElement>("[data-schematic-text-font]");
    if (textFont) textFont.value = this.document.display?.textFont ?? "sans";
    const process = this.options.shellEl.querySelector<HTMLSelectElement>("[data-netlist-process]");
    if (process) process.value = this.document.netlistProcess ?? DEFAULT_NETLIST_PROCESS;
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
    this.scheduleNetlistRefresh();
  }

  private scheduleNetlistRefresh() {
    if (!this.netlistPanel) return;
    if (this.netlistRefreshTimer !== null) this.host.clearTimeout(this.netlistRefreshTimer);
    this.netlistRefreshTimer = this.host.setTimeout(() => {
      this.netlistRefreshTimer = null;
      this.netlistPanel?.refresh(this.document);
    }, 250);
  }

  private selectNetlistDiagnostic(componentId: string) {
    const component = this.document.components.find(candidate => candidate.id === componentId);
    if (!component || !this.graphAdapter.getCell(componentId)) return;
    this.selectionSession.setMixed([componentId], []);
    this.finishSelectionChange();
    const bounds = componentVisualBounds(component);
    const zoom = this.zoom;
    this.viewAdapter.resetScroll();
    this.setView({
      zoom,
      translate: {
        x: this.options.paperEl.clientWidth / 2 - (bounds.x + bounds.width / 2) * zoom,
        y: this.options.paperEl.clientHeight / 2 - (bounds.y + bounds.height / 2) * zoom
      }
    });
    this.focusCanvas();
  }

  private renderSelectionSummary(resolution?: NetResolution) {
    const projection = this.currentSelectionUiProjection(resolution);
    this.propertyPanelController.sync(projection.propertyPanel);
    const textObject = this.selectedTextObject();
    for (const select of this.options.propertyEl.querySelectorAll<HTMLSelectElement>("[data-property-text-font]")) {
      const row = select.closest<HTMLElement>("[data-property-text-font-row]");
      if (!row) continue;
      row.hidden = textObject === null || textObject.kind !== select.dataset.propertyTextFont;
      select.value = !row.hidden ? textObject?.object.fontFamily ?? "" : "";
    }
    this.syncMosParams();
    this.syncDeviceModel();
    this.hostBridge.onHierarchySelectionChange?.(this.selectedSingleComponent()?.id);
    this.syncLayerAssignment();
    this.syncLayerObjectSelection();
    const hasSelection = this.transientToolSession.mode === "select" && this.selectionSession.hasAny();
    if (hasSelection && !this.lastHadSelection) this.sidebarLibrary.showProperties();
    this.lastHadSelection = hasSelection;
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
    return buildSchematicSelectionUiProjection({
      mode: this.transientToolSession.mode,
      selection: this.currentSelectionContents(),
      propertyPanel: {
        document: this.document,
        targets,
        resolution: propertyResolution,
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

  private setStatus(message: string, resolution?: NetResolution, log?: Pick<LogEntry, "level" | "source">) {
    if (this.destroyed) return;
    this.writeStatus(message, log);
    this.syncToolUi(resolution);
    this.emitStateChange();
  }

  private layerDisplayName(layer: SchematicLayer) {
    if (layer.id === DEFAULT_LAYER_ID && layer.name === "Layer 1") {
      return uiFormat("layer.numbered", "Layer {number}", { number: "1" });
    }
    return layer.name;
  }

  private layerObjectLabel(node: SchematicLayerObjectNode) {
    if (node.componentCaption) {
      const { type, label, ref } = node.componentCaption;
      return `${componentName(type, label)} ${ref}`;
    }
    const prefix = node.kind === "coupling" ? "Inductor coupling" : node.label.split(" ", 1)[0];
    return uiFormat(`layer.object.${node.kind}`, `${prefix} {name}`, { name: node.label.slice(prefix.length + 1) });
  }

  private writeStatus(message: string, log?: Pick<LogEntry, "level" | "source">) {
    this.statusMessage = message;
    if (message && (log || message !== this.lastLoggedStatus)) {
      this.lastLoggedStatus = message;
      this.eventLog?.log(log?.level ?? "info", log?.source ?? "status", message);
    }
    if (this.options.statusEl) this.options.statusEl.textContent = localizeSchematicStatus(message);
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
