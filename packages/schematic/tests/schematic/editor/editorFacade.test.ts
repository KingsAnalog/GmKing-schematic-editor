import { describe, expect, it } from "vitest";
import ts from "typescript";
import editorSource from "../../../src/schematic/editor.ts?raw";
import propertySource from "../../../src/schematic/propertyInteractionController.ts?raw";
import webEntrySource from "../../../src/schematic/schematicWebEntry.ts?raw";
import webDocumentHostSource from "../../../src/schematic/schematicWebDocumentHost.ts?raw";
import webEditorHostSource from "../../../src/schematic/schematicWebEditorHostController.ts?raw";
import deleteCommitSource from "../../../src/schematic/deleteCommitCoordinator.ts?raw";
import placementCommitSource from "../../../src/schematic/placementCommitCoordinator.ts?raw";
import netLabelCommitSource from "../../../src/schematic/netLabelCommitCoordinator.ts?raw";
import wireCommitSource from "../../../src/schematic/wire/wireCommitCoordinator.ts?raw";
import { mountSchematicEditorFacade, type SchematicEditorLifecycle } from "../../../src/schematic/schematicEditorFacade";

const MOUNT_SELECTORS = [
  "[data-schematic-shell]",
  "[data-schematic-document-tabs]",
  "[data-schematic-paper]",
  "[data-schematic-palette]",
  "[data-schematic-property-editor]",
  "[data-schematic-status]",
  "[data-schematic-analysis-panel]"
] as const;

const editorAst = ts.createSourceFile("editor.ts", editorSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

class FakeRoot {
  constructor(private readonly elements: Map<string, HTMLElement>) {}

  querySelector<T extends HTMLElement>(selector: string): T | null {
    return (this.elements.get(selector) as T | undefined) ?? null;
  }
}

class FakeEditor implements SchematicEditorLifecycle {
  initCount = 0;

  init() {
    this.initCount += 1;
  }

  destroy() {}
}

function mountElements() {
  return new Map<string, HTMLElement>(MOUNT_SELECTORS.map((selector) => [selector, { selector } as unknown as HTMLElement]));
}

describe("mountSchematicEditorFacade", () => {
  it("returns null without creating an editor if a mount anchor is missing", () => {
    MOUNT_SELECTORS.forEach((missingSelector) => {
      const elements = mountElements();
      elements.delete(missingSelector);
      let createCount = 0;

      const result = mountSchematicEditorFacade(new FakeRoot(elements) as unknown as HTMLElement, () => {
        createCount += 1;
        return new FakeEditor();
      });

      expect(result).toBeNull();
      expect(createCount).toBe(0);
    });
  });

  it("creates, initializes, and returns the mounted editor", () => {
    const elements = mountElements();
    const editor = new FakeEditor();
    const result = mountSchematicEditorFacade(new FakeRoot(elements) as unknown as HTMLElement, (mount) => {
      expect(mount).toEqual({
        shellEl: elements.get("[data-schematic-shell]"),
        documentTabsEl: elements.get("[data-schematic-document-tabs]"),
        paperEl: elements.get("[data-schematic-paper]"),
        paletteEl: elements.get("[data-schematic-palette]"),
        propertyEl: elements.get("[data-schematic-property-editor]"),
        statusEl: elements.get("[data-schematic-status]"),
        analysisEl: elements.get("[data-schematic-analysis-panel]"),
        selectionSummaryEl: undefined
      });
      return editor;
    });

    expect(result).toBe(editor);
    expect(editor.initCount).toBe(1);
  });

  it("preserves one awaitable cleanup result across repeated destroy calls", async () => {
    const elements = mountElements();
    const cleanup = Promise.resolve();
    let destroyCount = 0;
    const editor = {
      init() {},
      destroy() {
        destroyCount += 1;
        return cleanup;
      }
    } satisfies SchematicEditorLifecycle;
    const mounted = mountSchematicEditorFacade(
      new FakeRoot(elements) as unknown as HTMLElement,
      () => editor
    );

    const first = mounted?.destroy();
    const second = mounted?.destroy();
    expect(first).toBe(cleanup);
    expect(second).toBe(cleanup);
    expect(destroyCount).toBe(1);
    await first;
  });

  it("destroys an editor whose initialization fails", () => {
    const elements = mountElements();
    let destroyCount = 0;
    const editor = {
      init() {
        throw new Error("init failed");
      },
      destroy() {
        destroyCount += 1;
      }
    } satisfies SchematicEditorLifecycle;

    expect(() => mountSchematicEditorFacade(
      new FakeRoot(elements) as unknown as HTMLElement,
      () => editor
    )).toThrow("init failed");
    expect(destroyCount).toBe(1);
  });
});

describe("schematic editor public facade", () => {
  it("keeps the public init entrypoint delegated through the Web host boundary", () => {
    expect(webEntrySource).toContain("export function initSchematicEditor(root: HTMLElement, options: SchematicWebHostOptions = {})");
    expect(webEntrySource).toContain("return mountSchematicWebHost(");
    expect(webEntrySource).toContain("new SchematicWebEditorHostController(mounts, services)");
    expect(webEditorHostSource).toContain('session.storageStatus = storedState ? "loaded" : "missing";');
    expect(webEditorHostSource).toContain("const state = storedState ?? blankState();");
    expect(editorSource).not.toContain('from "./schematicWebHost"');
    expect(editorSource).not.toContain('from "./schematicTabShell"');
  });

  it("opens the Note dialog and commits only after canvas placement", () => {
    expect(editorMethodSource("openNotePlacement")).toContain("this.noteDialog.open");
    expect(editorMethodSource("placeNote")).toContain("createSchematicNoteDocumentOp");
    expect(editorMethodSource("bindNoteLayerInteractions")).not.toContain("dblclick");
  });

  it("uses canonical-document commit coordinators without the retired runtime store bridge", () => {
    expect(editorSource).not.toContain('from "./schematicStore"');
    expect(editorSource).not.toContain("currentRuntimeState");
    expect(editorSource).toContain("this.placementCommitCoordinator.commitPlacement(point, layer.id)");
    expect(editorSource).toContain("this.placementCommitCoordinator.commitCopy(point, this.copyLayerTarget())");
    expect(placementCommitSource).toContain("applyPlacementCommitDocumentOp(this.document, commit)");
    expect(placementCommitSource).toContain("applyCopyPlacementDocumentOp(this.document, placement.copied)");
    expect(placementCommitSource).not.toContain("restoreSchematicDocumentOp");
    expect(editorSource).toContain("this.wireCommitCoordinator.applyBlankClick(point)");
    expect(wireCommitSource).toContain("applyWireCommitDocumentOp(");
    expect(wireCommitSource).not.toContain("restoreSchematicDocumentOp");
    expect(editorSource).toContain("this.netLabelCommitCoordinator.commitPlacement(point, preferredWireId, layer.id)");
    expect(netLabelCommitSource).toContain("applyNetLabelPlacementDocumentOp(this.document,");
    expect(netLabelCommitSource).not.toContain("restoreSchematicDocumentOp");
    expect(editorSource).toContain("this.deleteCommitCoordinator.deleteSelection(selection)");
    expect(editorSource).toContain(
      "this.deleteCommitCoordinator.toggleTemporary(this.selectionSession.selectedIds)"
    );
    expect(deleteCommitSource).toContain(
      "deleteSchematicDocumentSelection(this.document, selection)"
    );
    expect(deleteCommitSource).toContain(
      "toggleTemporaryDeletedSchematicIds(this.document, ids)"
    );
    expect(deleteCommitSource).not.toContain("restoreSchematicDocumentOp");
  });

  it("keeps no-op wire commits from mutating live editor state", () => {
    const applyWireCommitOutcome = editorSource.slice(
      editorSource.indexOf("private applyWireCommitOutcome"),
      editorSource.indexOf("private rotateSelectedOrPreview")
    );

    expect(wireCommitSource).toContain(
      "const commit = applyWireCommitDocumentOp("
    );
    const changedGuard = wireCommitSource.indexOf('if (!commit.changed) return { kind: "none" };');
    expect(changedGuard).toBeGreaterThan(-1);
    expect(changedGuard).toBeLessThan(wireCommitSource.indexOf("this.wireTool.reset();"));
    expect(applyWireCommitOutcome).toContain('if (outcome.kind === "none") return;');
    expect(applyWireCommitOutcome).toContain(
      "this.setMixedSelection(outcome.result.selectedIds, outcome.result.noteIds, false);"
    );
    expect(applyWireCommitOutcome).toContain("this.removeWirePreview();");
    expect(applyWireCommitOutcome).toContain(
      "this.commitChangedRenderedDocumentTail(outcome.result, outcome.result.status);"
    );
  });

  it("keeps the rendered document commit helper narrow", () => {
    const helper = editorSource.slice(
      editorSource.indexOf("private commitChangedRenderedDocumentTail"),
      editorSource.indexOf("private undo")
    );

    expect(helper).toContain("applyNormalizedDocumentWires(this.document);");
    expect(helper).toContain("this.renderDocument();");
    expect(helper).toContain("this.consumeHistoryIntent(result);");
    expect(helper).toContain("this.setStatus(status);");
    expect(helper.indexOf("applyNormalizedDocumentWires(this.document);")).toBeLessThan(helper.indexOf("this.renderDocument();"));
    expect(helper.indexOf("this.renderDocument();")).toBeLessThan(helper.indexOf("this.consumeHistoryIntent(result);"));
    expect(helper.indexOf("this.consumeHistoryIntent(result);")).toBeLessThan(helper.indexOf("this.setStatus(status);"));
    expect(helper).not.toContain("restoreSchematicDocumentOp");
    expect(helper).not.toContain("setMixedSelection");
    expect(helper).not.toContain("applySelectionState");
    expect(helper).not.toContain("rebuildCounters");
  });

  it("keeps committed selection transforms on the incremental render path", () => {
    const rotate = editorMethodSource("rotateSelectedOrPreview");
    const mirror = editorMethodSource("mirrorSelectedOrPreview");
    const transformSelection = editorMethodSource("transformSelectedObjects");
    const renderTransform = editorMethodSource("renderTransformedDocument");

    expect(rotate).toContain('const result = transformSingleComponentOrientationDocumentOp([instance], "rotate");');
    expect(rotate).toContain("this.commitChangedTransformedDocument(result, renderSnapshot);");
    expect(mirror).toContain("const result = transformSingleComponentOrientationDocumentOp(");
    expect(mirror).toContain("this.commitChangedTransformedDocument(result, renderSnapshot);");
    expect(transformSelection).toContain(
      "const result = transformSelectionDocumentGeometryOp(this.document, selection, kind);"
    );
    expect(transformSelection).toContain("this.selectionSession.apply(remapSelectionAfterGeometryTransform({");
    expect(transformSelection).toContain(
      "this.commitChangedTransformedDocumentTail(result, result.status, renderSnapshot);"
    );
    expect(renderTransform).toContain("this.incrementalRenderer.runWithDocumentGeometryGuard(() => {");
    expect(renderTransform).toContain(
      "this.incrementalRenderer.updateWireCellsFromDocument(changedWires);"
    );
    expect(renderTransform).toContain("this.junctionRenderCoordinator.refreshFull(resolution);");
    expect(renderTransform).not.toContain("this.graphAdapter.clear()");
    expect(renderTransform).not.toContain("this.renderDocument()");
  });

  it("delegates junction graph and frame lifecycle to the junction render coordinator", () => {
    const renderDocument = editorMethodSource("renderDocument");

    expect(editorSource).toContain(
      "private readonly junctionRenderCoordinator: SchematicJunctionRenderCoordinator<any>;"
    );
    expect(editorSource).not.toContain("private readonly junctionCellIds");
    expect(editorSource).not.toContain("private liveJunctionFrame");
    [
      "scheduleLiveJunctionRefresh",
      "cancelScheduledLiveJunctionRefresh",
      "refreshLiveJunctionCells",
      "refreshJunctionCells",
      "refreshJunctionCellViews",
      "clearJunctionCells"
    ].forEach((methodName) => {
      expect(editorSource).not.toContain(`private ${methodName}`);
    });

    const prepareForClear = renderDocument.indexOf(
      "this.junctionRenderCoordinator.prepareForGraphClear();"
    );
    const graphClear = renderDocument.indexOf("this.graphAdapter.clear();");
    const fullRefresh = renderDocument.indexOf(
      "this.junctionRenderCoordinator.refreshFull(resolution);"
    );
    expect(prepareForClear).toBeGreaterThan(-1);
    expect(prepareForClear).toBeLessThan(graphClear);
    expect(graphClear).toBeLessThan(fullRefresh);
    expect(renderDocument).not.toContain("buildVisibleJunctions(");
    expect(renderDocument).not.toContain("pruneJunctionAppearances(");
    expect(renderDocument).not.toContain("extractNetlist(");
  });

  it("keeps Note font size previews in one group session with one commit history intent", () => {
    const constructor = findClassConstructor(findClassDeclaration(editorAst, "SchematicEditor"));
    const begin = editorMethodSource("beginSelectedNotePropertyBatch");
    const setFontSize = editorMethodSource("setSelectedNoteFontSize");
    const cancelFontSize = editorMethodSource("cancelNoteFontSizePropertyEdit");
    const commitResult = editorMethodSource("commitNotePropertyResult");
    const commitDocument = editorMethodSource("commitChangedNoteDocument");

    [
      "onNoteFontSizeEditStart: () => this.beginNoteFontSizePropertyEdit()",
      "onNoteFontSizeInput: (value) => this.setSelectedNoteFontSize(value, { commit: false })",
      "onNoteFontSizeCommit: (value) => this.setSelectedNoteFontSize(value, { commit: true })",
      "onNoteFontSizeCancel: () => this.cancelNoteFontSizePropertyEdit()",
    ].forEach((callback) => expect(constructor.getText(editorAst)).toContain(callback));

    expect(begin).toContain("if (this.selectionSession.selectedIds.size !== 0) return false;");
    expect(begin).toContain("Array.from(this.selectionSession.selectedNoteIds)");

    [setFontSize].forEach((setter) => {
      expect(setter).toContain("this.notePropertyBatchSession.input(value);");
      expect(setter).toContain(
        "this.commitNotePropertyResult(this.notePropertyBatchSession.commit(value));"
      );
      expect(setter.split("this.notePropertyBatchSession.commit(value)").length - 1).toBe(1);
      expect(setter).not.toContain("this.consumeHistoryIntent");
      expect(setter).not.toContain("this.persistWorkspaceState");
    });

    [cancelFontSize].forEach((cancel) => {
      expect(cancel).toContain("this.notePropertyBatchSession.cancel();");
      expect(cancel).not.toContain("this.commitNotePropertyResult");
      expect(cancel).not.toContain("this.consumeHistoryIntent");
      expect(cancel).not.toContain("this.persistWorkspaceState");
    });

    expect(commitResult.split("this.commitChangedNoteDocument(result);").length - 1).toBe(1);
    expect(commitDocument.split("this.consumeHistoryIntent(result);").length - 1).toBe(1);
  });

  it("delegates cell geometry lifecycle while keeping only selection and Note projection in the Editor", () => {
    const liveGeometry = editorMethodSource("handleLiveCellGeometry");
    const commitGeometry = editorMethodSource("commitCellGeometry");
    const projection = editorMethodSource("projectCellGeometryInteraction");

    expect(editorSource).toContain(
      "private readonly cellGeometryInteractionCoordinator: SchematicCellGeometryInteractionCoordinator<any>;"
    );
    expect(liveGeometry).toContain("const result = this.cellGeometryInteractionCoordinator.syncLive(");
    expect(liveGeometry).toContain("this.transientToolSession.moveBehavior");
    expect(liveGeometry).toContain("this.projectCellGeometryInteraction(result);");
    expect(liveGeometry).toContain("this.junctionRenderCoordinator.scheduleLiveRefresh();");
    expect(commitGeometry).toContain("const result = this.cellGeometryInteractionCoordinator.finalize(");
    expect(commitGeometry).toContain("this.transientToolSession.moveBehavior");
    expect(commitGeometry).toContain("this.projectCellGeometryInteraction(result);");
    expect(projection).toContain(
      "this.selectionSession.remapJunctions(selectionMove.transformedJunctionIds);"
    );
    expect(projection).toContain("selectionMove.movedNoteIds.forEach((noteId) => {");
    expect(projection).toContain("this.noteLayer.positionNoteElement(note, this.noteLayerState());");
    expect(projection).not.toContain("this.incrementalRenderer");
    expect(projection).not.toContain("this.graphAdapter");
    expect(projection).not.toContain("updatedWireIds");
    expect(projection).not.toContain("changedLabelIds");
  });

  it("passes component View edits to the batch planner with the active move behavior", () => {
    const variant = sliceSourceBetween(propertySource, "  private setSelectedComponentVariant(", "  private setSelectedComponentClock(");
    expect(variant).toContain("this.run({");
    expect(variant).toContain('kind: "component-variant"');
    expect(variant).toContain("moveBehavior: this.options.moveBehavior()");
  });

  it("keeps single-cell selection styling incremental and avoids duplicate UI sync", () => {
    const selectCell = editorMethodSource("selectCell");
    const finishSelection = editorMethodSource("finishSelectionChange");
    const selectionProjection = editorMethodSource("currentSelectionUiProjection");

    expect(selectCell).toContain(
      "const delta = this.selectionSession.selectCell(id, selectionGestureFromEvent(event));"
    );
    expect(selectCell).toContain("styleCellIds: delta.changedCellIds");
    expect(finishSelection).toContain("this.syncSelectionStyles({ cellIds: options.styleCellIds, resolution });");
    expect(finishSelection).toContain("this.syncToolUi(resolution);");
    expect(finishSelection).not.toContain("this.syncSelectionUi()");
    expect(finishSelection).not.toContain("this.setStatus(");
    expect(selectionProjection).toContain(
      "this.transientToolSession.mode"
    );
  });

  it("delegates transient tool state, transitions, and active previews to the session coordinator", () => {
    const placementEntry = editorMethodSource("applyPlacementToolEntryIntent");
    const copyEntry = editorMethodSource("applyCopyToolEntryIntent");
    const labelEntry = editorMethodSource("beginLabelTool");
    const wireEntry = editorMethodSource("applyWireToolEntryIntent");
    const deleteEntry = editorMethodSource("applyDeleteToolEntryIntent");
    const moveBehaviorEntry = editorMethodSource("applyMoveBehaviorToolEntryIntent");
    const cancelTool = editorMethodSource("cancelTool");
    const pointerMove = editorMethodSource("handlePointerMove");
    const restoreHistoryContent = editorMethodSource("restoreHistoryContent");
    const restoreDocumentState = editorMethodSource("restoreDocumentState");
    const activateHostedDocument = editorMethodSource("hostActivateDocument");
    const closeDocumentSession = sliceSourceBetween(
      webDocumentHostSource,
      "  private async close(id: string)",
      "  private async restoreRecentlyClosed()"
    );
    const reset = editorMethodSource("resetToEmptySchematic");
    const clearCellGeometry = editorMethodSource("clearCellGeometryInteraction");

    expect(editorSource).toContain(
      "private readonly transientToolSession: SchematicTransientToolSessionCoordinator;"
    );
    expect(editorSource).not.toMatch(/private\s+(?:readonly\s+)?mode\s*:/);
    expect(editorSource).not.toMatch(/private\s+(?:readonly\s+)?moveBehavior\s*:/);
    expect(placementEntry).toContain('this.transientToolSession.transition(intent.nextMode, "enter-tool");');
    expect(copyEntry).toContain('this.transientToolSession.transition(intent.nextMode, "enter-tool");');
    expect(labelEntry).toContain('this.transientToolSession.transition("label", "enter-tool");');
    expect(wireEntry).toContain('this.transientToolSession.transition(intent.nextMode, "enter-tool");');
    expect(deleteEntry).toContain('this.transientToolSession.transition(intent.nextMode, "enter-tool");');
    expect(moveBehaviorEntry).toContain("this.transientToolSession.setMoveBehavior(intent.moveBehavior);");
    expect(moveBehaviorEntry).toContain(
      'this.transientToolSession.transition(intent.nextMode, "move-behavior");'
    );
    expect(cancelTool).toContain('this.transientToolSession.transition(intent.nextMode, "cancel");');
    expect(restoreHistoryContent.indexOf("this.transientToolSession.prepareHistoryRestore();")).toBeLessThan(
      restoreHistoryContent.indexOf("this.restoreDocumentState(documentFromContent(content));")
    );
    expect(activateHostedDocument.indexOf("this.transientToolSession.prepareDocumentSwitch(preserveCopy);")).toBeLessThan(
      activateHostedDocument.indexOf("this.restoreDocumentState(input.document);")
    );
    expect(activateHostedDocument).toContain("&& this.copyController.hasSource;");
    expect(activateHostedDocument).not.toContain("this.copyController.awaitingReference");
    expect(activateHostedDocument).toContain(
      "input.analysisSelection ?? { inputP: \"\", inputN: \"\", outputP: \"\", outputN: \"\" }"
    );
    expect(restoreDocumentState).not.toContain("this.transientToolSession");
    expect(restoreDocumentState).toContain("restoreSchematicDocumentOp(this.document, parsed);");
    expect(closeDocumentSession.indexOf("this.persistManifestSnapshot(")).toBeLessThan(
      closeDocumentSession.indexOf("this.options.workspace.removeDocument(closed.id);")
    );
    expect(closeDocumentSession.indexOf("this.sessions = nextSessions;")).toBeLessThan(
      closeDocumentSession.indexOf("this.activate(nextActiveId,")
    );
    expect(editorSource).not.toContain("documentSessions");
    expect(editorSource).not.toContain("activeDocumentId");
    expect(closeDocumentSession).toContain("const closedDocumentIsEmpty = isEmptySchematicDocument(");
    expect(closeDocumentSession.indexOf("if (closedDocumentIsEmpty)")).toBeLessThan(
      closeDocumentSession.indexOf("this.recentlyClosed.replace(")
    );
    expect(closeDocumentSession).toContain("const displaced = this.recentlyClosed.take();");
    expect(closeDocumentSession).toContain(
      "if (displaced) this.options.bridge.destroySession(displaced.value);"
    );
    expect(closeDocumentSession).toContain("this.tabs.hideCloseSnackbar();");
    expect(reset.indexOf('this.transientToolSession.transition("select", "reset");')).toBeLessThan(
      reset.indexOf("const result = resetSchematicDocument(this.document);")
    );
    expect(clearCellGeometry).toContain("this.cellGeometryInteractionCoordinator.invalidateAgainstDocument();");
    expect(clearCellGeometry).toContain("this.cellGeometryInteractionCoordinator.cancelActiveInteraction();");
    expect(clearCellGeometry).toContain("this.selectionSession.remapJunctions(canceled.restoredJunctionIds);");
    expect(clearCellGeometry).toContain("this.renderDocument();");
    expect(pointerMove).toContain("this.transientToolSession.projectActivePreview(");
    expect(pointerMove).not.toContain("this.updatePlacementPreview(");
    expect(pointerMove).not.toContain("this.updateWirePreview(");
    expect(pointerMove).not.toContain("this.updateCopyPreview(");
    expect(pointerMove).not.toContain("this.updateNetLabelPreview(");
  });

  it("toggles presentation mode without rebuilding the graph or resolving networks", () => {
    const toggle = editorMethodSource("togglePresentationMode");
    const syncGraph = editorMethodSource("syncPresentationModeGraph");

    expect(toggle).toContain("this.syncPresentationModeGraph();");
    expect(toggle).toContain("this.syncToolUi(this.netResolutionCache);");
    expect(toggle.match(/this\.syncToolUi\(/g)).toHaveLength(1);
    expect(toggle).not.toContain("this.renderDocument()");
    expect(toggle).not.toContain("this.setStatus(");
    expect(toggle).not.toContain("resolveSchematicNets");

    expect(syncGraph).toContain("const attrs = componentCellAttrs(component");
    expect(syncGraph).toContain("cell.attr(attrs);");
    expect(syncGraph).toContain('cell.prop("ports/groups/pin/attrs/portBody", attrs.portBody);');
    expect(syncGraph).toContain("this.junctionRenderCoordinator.cancelScheduledRefresh();");
    expect(syncGraph).toContain("this.junctionRenderCoordinator.refreshViews();");
    expect(syncGraph.indexOf("this.junctionRenderCoordinator.cancelScheduledRefresh();")).toBeLessThan(
      syncGraph.indexOf("this.junctionRenderCoordinator.refreshViews();")
    );
    expect(syncGraph).toContain("resolution: this.netResolutionCache");
    expect(syncGraph).not.toContain("this.graphAdapter.clear()");
    expect(syncGraph).not.toContain("this.renderDocument()");
    expect(syncGraph).not.toContain("this.junctionRenderCoordinator.refreshFull(");
    expect(syncGraph).not.toContain("resolveSchematicNets");
  });

  it("routes history intents through the host-owned content commit boundary", () => {
    const intentConsumer = editorMethodSource("consumeHistoryIntent");
    const contentCommit = editorMethodSource("commitCurrentContent");

    expect(intentConsumer).toContain('this.commitCurrentContent("edit", "editor");');
    expect(contentCommit).toContain("this.hostBridge.commit(this.getContent(), metadata);");
    expect(editorSource).not.toContain("this.history");
    expect(editorSource).not.toContain("createSchematicDocumentHistoryAdapter");
  });

  it("keeps editor construction and lifecycle owned by the composite Web host", () => {
    expect(webEditorHostSource).toContain("editor = new SchematicEditor(mounts, services, bridge);");
    expect(webEditorHostSource).toContain("this.documentHost.init();");
    expect(webEditorHostSource).toContain("this.analysis.destroy();");
    expect(webEditorHostSource).toContain("this.contextMenu.destroy();");
    expect(editorSource).not.toContain("mountLegacySchematicEditor");
  });

  it("keeps schematic interaction binding groups ordered before JointJS pointer glue", () => {
    const bindEvents = sliceSourceBetween(editorSource, "private bindEvents()", "private bindControllerEvents()");

    const controllerEvents = indexOfRequired(bindEvents, "this.bindControllerEvents();");
    const globalDocumentWindowInteractions = indexOfRequired(bindEvents, "this.bindGlobalDocumentWindowInteractions();");
    const noteLayerInteractions = indexOfRequired(bindEvents, "this.bindNoteLayerInteractions();");
    const geometrySelectionMoveHooks = indexOfRequired(bindEvents, "this.bindCellGeometrySelectionMovePaperHooks();");
    const viewportCanvasDomInteractions = indexOfRequired(bindEvents, "this.bindPaperElementViewportCanvasDomInteractions();");
    const jointJsPointerGlue = indexOfRequired(bindEvents, "this.bindPaperPointerMoveDownClickJointJsInteractions();");

    expect(controllerEvents).toBeLessThan(globalDocumentWindowInteractions);
    expect(globalDocumentWindowInteractions).toBeLessThan(noteLayerInteractions);
    expect(noteLayerInteractions).toBeLessThan(geometrySelectionMoveHooks);
    expect(geometrySelectionMoveHooks).toBeLessThan(viewportCanvasDomInteractions);
    expect(viewportCanvasDomInteractions).toBeLessThan(jointJsPointerGlue);
  });

  it("lets the host narrow keyboard ownership while defaulting to the active editor root", () => {
    const keydown = editorMethodSource("handleKeydown");
    expect(keydown).toContain("this.hostBridge.ownsKeyboardTarget?.(target)");
    expect(keydown).toContain("?? this.options.shellEl.contains(target)");
    expect(keydown).toContain("if (!ownsKeyboardTarget) return;");
    expect(keydown.indexOf("if (!ownsKeyboardTarget) return;")).toBeLessThan(
      keydown.indexOf("projectSchematicKeyboardShortcut(")
    );
  });

  it("keeps JointJS pointer handler registration ordered", () => {
    const bindings = editorMethodSource("bindPaperPointerMoveDownClickJointJsInteractions");

    const blankPointerDown = indexOfRequired(bindings, 'paper.on("blank:pointerdown"');
    const blankPointerMove = indexOfRequired(bindings, 'paper.on("blank:pointermove"');
    const elementPointerMove = indexOfRequired(bindings, 'paper.on("element:pointermove"');
    const linkPointerMove = indexOfRequired(bindings, 'paper.on("link:pointermove"');
    const blankPointerClick = indexOfRequired(bindings, 'paper.on("blank:pointerclick"');
    const elementPointerClick = indexOfRequired(bindings, 'paper.on("element:pointerclick"');
    const linkPointerClick = indexOfRequired(bindings, 'paper.on("link:pointerclick"');
    const magnetPointerClick = indexOfRequired(bindings, 'paper.on("element:magnet:pointerclick"');

    expect(blankPointerDown).toBeLessThan(blankPointerMove);
    expect(blankPointerMove).toBeLessThan(elementPointerMove);
    expect(elementPointerMove).toBeLessThan(linkPointerMove);
    expect(linkPointerMove).toBeLessThan(blankPointerClick);
    expect(blankPointerClick).toBeLessThan(elementPointerClick);
    expect(elementPointerClick).toBeLessThan(linkPointerClick);
    expect(linkPointerClick).toBeLessThan(magnetPointerClick);
  });

  it("keeps JointJS pointer handler guards and projections ordered", () => {
    const bindings = editorMethodSource("bindPaperPointerMoveDownClickJointJsInteractions");
    const blankPointerDownRegistration = sliceSourceBetween(bindings, 'paper.on("blank:pointerdown"', 'paper.on("blank:pointermove"');
    const blankPointerMoveRegistration = sliceSourceBetween(bindings, 'paper.on("blank:pointermove"', 'paper.on("element:pointermove"');
    const elementPointerMoveRegistration = sliceSourceBetween(bindings, 'paper.on("element:pointermove"', 'paper.on("link:pointermove"');
    const linkPointerMoveRegistration = sliceSourceBetween(bindings, 'paper.on("link:pointermove"', 'paper.on("blank:pointerclick"');
    const blankPointerClickRegistration = sliceSourceBetween(bindings, 'paper.on("blank:pointerclick"', 'paper.on("element:pointerclick"');
    const elementPointerClickRegistration = sliceSourceBetween(bindings, 'paper.on("element:pointerclick"', 'paper.on("link:pointerclick"');
    const linkPointerClickRegistration = sliceSourceBetween(bindings, 'paper.on("link:pointerclick"', 'paper.on("element:magnet:pointerclick"');
    const magnetPointerClickRegistration = bindings.slice(indexOfRequired(bindings, 'paper.on("element:magnet:pointerclick"'));

    expect(blankPointerDownRegistration).toContain("this.handleBlankPointerDown(event, x, y);");
    expect(blankPointerMoveRegistration).toContain("this.handleBlankPointerMove(x, y);");
    expect(elementPointerMoveRegistration).toContain("this.handleElementPointerMove(view, x, y);");
    expect(linkPointerMoveRegistration).toContain("this.handleLinkPointerMove(view, x, y);");
    expect(blankPointerClickRegistration).toContain("this.handleBlankPointerClick(event, x, y);");
    expect(elementPointerClickRegistration).toContain("this.handleElementPointerClick(view, event);");
    expect(linkPointerClickRegistration).toContain("this.handleLinkPointerClick(view, event, x, y);");
    expect(magnetPointerClickRegistration).toContain("this.handleMagnetPointerClick(view, event, magnet);");

    const blankPointerDown = editorMethodSource("handleBlankPointerDown");
    const blankPointerMove = editorMethodSource("handleBlankPointerMove");
    const elementPointerMove = editorMethodSource("handleElementPointerMove");
    const linkPointerMove = editorMethodSource("handleLinkPointerMove");
    const blankPointerClick = editorMethodSource("handleBlankPointerClick");
    const elementPointerClick = editorMethodSource("handleElementPointerClick");
    const linkPointerClick = editorMethodSource("handleLinkPointerClick");
    const magnetPointerClick = editorMethodSource("handleMagnetPointerClick");

    const blankPointerDownModeButtonGuard = indexOfRequired(
      blankPointerDown,
      'if ((this.transientToolSession.mode !== "select" && !this.isDeleteToolMode()) || event.button !== 0) return;'
    );
    const blankPointerDownSelection = indexOfRequired(blankPointerDown, "this.startDragSelection(event, snapPoint({ x, y }));");
    expect(blankPointerDownModeButtonGuard).toBeLessThan(blankPointerDownSelection);

    const blankMoveDeleteHover = indexOfRequired(blankPointerMove, "if (this.isDeleteToolMode()) this.setDeleteHover([]);");
    const blankMovePointerMove = indexOfRequired(blankPointerMove, "this.handlePointerMove(snapPoint({ x, y }));");
    expect(blankMoveDeleteHover).toBeLessThan(blankMovePointerMove);

    const elementMoveDeleteHover = indexOfRequired(
      elementPointerMove,
      "if (this.isDeleteToolMode()) this.setDeleteHover(this.deleteHoverIdsForElement(view));"
    );
    const elementMovePointerMove = indexOfRequired(elementPointerMove, "this.handlePointerMove(snapPoint({ x, y }));");
    expect(elementMoveDeleteHover).toBeLessThan(elementMovePointerMove);

    const linkMoveDeleteHover = indexOfRequired(
      linkPointerMove,
      "if (this.isDeleteToolMode()) this.setDeleteHover(this.deleteHoverIdsForLink(view, snapPoint({ x, y })));"
    );
    const linkMovePointerMove = indexOfRequired(linkPointerMove, "this.handlePointerMove(snapPoint({ x, y }));");
    expect(linkMoveDeleteHover).toBeLessThan(linkMovePointerMove);

    const suppressedBlankClick = indexOfRequired(blankPointerClick, "if (this.viewportController.consumeSuppressedBlankClick()) {");
    const blankClickPoint = indexOfRequired(blankPointerClick, "const point = snapPoint({ x, y });");
    const blankClickApplication = indexOfRequired(blankPointerClick, "this.applyPointerClickTarget(projectBlankPointerClickTarget(point), event);");
    const blankClickProjection = indexOfRequired(blankPointerClick, "projectBlankPointerClickTarget(point)", blankClickApplication);
    expect(suppressedBlankClick).toBeLessThan(blankClickPoint);
    expect(suppressedBlankClick).toBeLessThan(blankClickProjection);
    expect(blankClickPoint).toBeLessThan(blankClickApplication);

    const elementClickStop = indexOfRequired(elementPointerClick, "event.stopPropagation();");
    const elementClickProjection = indexOfRequired(elementPointerClick, "const target = projectElementPointerClickTarget({");
    const elementClickApplication = indexOfRequired(elementPointerClick, "this.applyPointerClickTarget(target, event);");
    expect(elementClickStop).toBeLessThan(elementClickProjection);
    expect(elementClickProjection).toBeLessThan(elementClickApplication);

    const linkClickStop = indexOfRequired(linkPointerClick, "event.stopPropagation();");
    const linkClickPoint = indexOfRequired(linkPointerClick, "const point = snapPoint({ x, y });");
    const linkClickApplication = indexOfRequired(linkPointerClick, "this.applyPointerClickTarget(");
    const linkClickProjection = indexOfRequired(linkPointerClick, "projectLinkPointerClickTarget({");
    expect(linkClickStop).toBeLessThan(linkClickPoint);
    expect(linkClickPoint).toBeLessThan(linkClickApplication);
    expect(linkClickApplication).toBeLessThan(linkClickProjection);

    const magnetClickStop = indexOfRequired(magnetPointerClick, "event.stopPropagation();");
    const magnetClickProjection = indexOfRequired(magnetPointerClick, "const target = projectPinPointerClickTarget({");
    const magnetClickApplication = indexOfRequired(magnetPointerClick, "this.applyPointerClickTarget(target, event);");
    expect(magnetClickStop).toBeLessThan(magnetClickProjection);
    expect(magnetClickProjection).toBeLessThan(magnetClickApplication);
  });

  it("keeps note pointer down mode gates ordered before drag setup", () => {
    const handler = sliceSourceBetween(
      editorSource,
      "private handleNotePointerDown(event: PointerEvent)",
      "private handleNotePointerMove"
    );

    const elementLookup = indexOfRequired(handler, "const element = this.noteElementFromEvent(event);");
    const elementGuard = indexOfRequired(handler, "if (!element) return;");
    const noteIdLookup = indexOfRequired(handler, "const noteId = element.dataset.noteId;");
    const noteIdGuard = indexOfRequired(handler, "if (!noteId || this.noteDraft) return;");
    const stopPropagation = indexOfRequired(handler, "event.stopPropagation();");
    expect(elementLookup).toBeLessThan(elementGuard);
    expect(elementGuard).toBeLessThan(noteIdLookup);
    expect(noteIdLookup).toBeLessThan(noteIdGuard);
    expect(noteIdGuard).toBeLessThan(stopPropagation);

    const deleteMode = indexOfRequired(handler, "if (this.isDeleteToolMode()) {");
    const clickPlacementMode = indexOfRequired(handler, 'if (mode === "copy" || isMoveOrRotateMode(mode)) {');
    const defaultPreventDefault = indexOfRequired(handler, "event.preventDefault();", clickPlacementMode);
    const defaultFocusCanvas = indexOfRequired(handler, "this.focusCanvas();", defaultPreventDefault);
    const noteLookup = indexOfRequired(handler, "const note = this.noteById(noteId);", defaultFocusCanvas);
    expect(stopPropagation).toBeLessThan(deleteMode);
    expect(stopPropagation).toBeLessThan(clickPlacementMode);
    expect(stopPropagation).toBeLessThan(defaultPreventDefault);
    expect(deleteMode).toBeLessThan(clickPlacementMode);
    expect(defaultPreventDefault).toBeLessThan(defaultFocusCanvas);
    expect(defaultFocusCanvas).toBeLessThan(noteLookup);

    const noteSelection = indexOfRequired(handler, "this.setNoteSelectionFromEvent(noteId, event);");
    const nonLeftButtonReturn = indexOfRequired(handler, "if (event.button !== 0) return;", noteSelection);
    const dragCall = indexOfRequired(handler, "this.beginNoteDrag(event, element, noteId);", nonLeftButtonReturn);
    const dragBegin = indexOfRequired(handler, "this.noteInteractionController.beginDrag", dragCall);
    expect(noteSelection).toBeLessThan(nonLeftButtonReturn);
    expect(nonLeftButtonReturn).toBeLessThan(dragCall);
    expect(dragCall).toBeLessThan(dragBegin);

    const pointerCapture = indexOfRequired(handler, "element.setPointerCapture?.(event.pointerId);");
    const pointerMoveListener = indexOfRequired(
      handler,
      'this.host.ownerWindow.addEventListener("pointermove", this.handleGlobalNotePointerMove, true);'
    );
    const pointerUpListener = indexOfRequired(
      handler,
      'this.host.ownerWindow.addEventListener("pointerup", this.handleGlobalNotePointerUp, true);'
    );
    expect(pointerCapture).toBeLessThan(pointerMoveListener);
    expect(pointerCapture).toBeLessThan(pointerUpListener);
    expect(pointerMoveListener).toBeLessThan(pointerUpListener);
  });

});

function sliceSourceBetween(source: string, startSentinel: string, endSentinel: string) {
  const startIndex = indexOfRequired(source, startSentinel);
  const endIndex = indexOfRequired(source, endSentinel, startIndex + startSentinel.length);
  return source.slice(startIndex, endIndex);
}

function indexOfRequired(source: string, sentinel: string, fromIndex = 0) {
  const index = source.indexOf(sentinel, fromIndex);
  expect(index).toBeGreaterThanOrEqual(0);
  return index;
}

function editorMethodSource(name: string) {
  const editorClass = findClassDeclaration(editorAst, "SchematicEditor");
  const method = findMethodDeclaration(editorClass, name);
  return editorSource.slice(method.getStart(editorAst), method.end);
}

function findClassDeclaration(sourceFile: ts.SourceFile, name: string) {
  let found: ts.ClassDeclaration | undefined;
  sourceFile.forEachChild(function visit(node) {
    if (ts.isClassDeclaration(node) && node.name?.text === name) {
      found = node;
      return;
    }
    ts.forEachChild(node, visit);
  });
  expect(found).toBeDefined();
  return found as ts.ClassDeclaration;
}

function findMethodDeclaration(classDeclaration: ts.ClassDeclaration, name: string) {
  const method = classDeclaration.members.find(
    (member): member is ts.MethodDeclaration => ts.isMethodDeclaration(member) && ts.isIdentifier(member.name) && member.name.text === name
  );
  expect(method).toBeDefined();
  return method as ts.MethodDeclaration;
}

function findClassConstructor(classDeclaration: ts.ClassDeclaration) {
  const constructor = classDeclaration.members.find(ts.isConstructorDeclaration);
  expect(constructor).toBeDefined();
  return constructor as ts.ConstructorDeclaration;
}
