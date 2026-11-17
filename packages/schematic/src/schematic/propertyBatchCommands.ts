import { setComponentScale, supportsComponentScale, type ComponentScale } from "./componentScaleModel";
import { setVoltageSourceField } from "./voltageSourceModel";
import { SPNT_POSITION_VALUE_KEY, spntPosition } from "./spntSwitchModel";
import { setTrianglePinCount, setTriangleVertex, type TriangleEdge, type TriangleVertex } from "./triangleComponentModel";
import {
  getComponentVariants,
  resolveComponentPinOptions,
  resolveComponentDef
} from "./catalog";
import {
  canChangeComponentCell,
  commitComponentCellChange,
  componentCustomColor,
  componentLabelVisible,
  componentValueVisible,
  componentPinMode,
  prepareComponentVariantChange,
  setComponentColor,
  setComponentGainPolarity,
  setComponentLabelVisibility,
  setComponentValueVisibility,
  setComponentPinMode,
  setComponentPinSymbolVisibility,
  setComponentPinVisibility,
  setComponentRef,
  setComponentValue
} from "./componentPropertyModel";
import { setDifferentialOutputsSame } from "./differentialOutputModel";
import {
  isDffSettingValue,
  setDffSetting,
  type DffSettingProperty,
  type DffSettings
} from "./dffModel";
import { buildVisibleJunctions } from "./connectivity";
import { pinTouchesConnectedWire, reconcileConnectionEdit } from "./connectionGraph";
import { componentPinPoints } from "./document/documentGeometryModel";
import { cloneSchematicDocument } from "./document/documentModel";
import { applyNormalizedDocumentWires } from "./document/documentWires";
import { pointKey, samePoint, snapPoint } from "./geometry";
import { junctionId } from "./junctionIdentity";
import {
  isFunctionBlockType,
  supportsFunctionBlockGain,
  isFunctionBlockTimeDomain,
  isFilterKind,
  setFunctionBlockTimeDomain,
  setFilterKind,
  type FilterKind,
  type FunctionBlockTimeDomain
} from "./functionBlockModel";
import {
  DEFAULT_MOS_VIEW_SETTINGS,
  isMosComponentType,
  setMosThickGate,
  mosViewVariantId,
  normalizeMosViewSettings,
  parseMosViewVariantId,
  type MosViewSettings
} from "./mosViewModel";
import {
  isTransistorComponentType,
  setTransistorCircle
} from "./transistorCircleModel";
import {
  junctionCustomColor,
  pruneJunctionAppearances,
  setJunctionColor,
  setWireColor,
  wireCustomColor
} from "./networkColorModel";
import { remapNetLabelsAfterWirePathChange } from "./netLabelModel";
import { validateNetLabelName } from "./netResolution";
import {
  applyNoteBackgroundColor,
  applyNoteTextColor,
  applyNoteFontSize,
  applyNoteFormat,
  applyNoteWidth,
  normalizeNoteFontSizeInput,
  normalizeNoteWidthInput
} from "./notes/noteProperties";
import { noteBackgroundColor as resolvedNoteBackground } from "./notes/noteAppearance";
import {
  setRectangleProperty,
  type RectangleProperty
} from "./rectangleComponentModel";
import type { SelectionMoveBehavior } from "./selection/selectionMoveTransaction";
import { normalizeHexColor } from "../shared/color";
import type {
  ComponentInstance,
  ComponentType,
  ComponentVariantId,
  GainPolarity,
  NetLabel,
  OperatorPinMode,
  Point,
  SchematicDocument,
  SchematicNote,
  SchematicNoteFormat,
  Wire
} from "./types";
import { normalizeInductorCouplings } from "./inductorCouplingModel";
import { inductorLayout, isInductorLayout, isPlanarInductor, setInductorLayout, type InductorLayout } from "./inductorModel";
import {
  resolvedWireAppearance,
  setWireDecoration,
  type WireDecorationPatch
} from "./wire/wireDecoration";
import { pointOnPath } from "./wire/wireGeometry";
import { componentValueIssue } from "./componentValueSchema";
import {
  applyWireMoveTopology,
  captureWireMoveTopology
} from "./wire/wireMoveTopology";
import {
  isComponentClock,
  setComponentClock,
  supportsOptionalClock,
  type ComponentClock
} from "./clockModel";

export interface SchematicPropertyBatchSelection {
  selectedIds: Iterable<string>;
  selectedNoteIds: Iterable<string>;
}

export type SchematicPropertyBatchCommand =
  | { kind: "component-cell"; type: ComponentType }
  | { kind: "component-ref"; ref: string }
  | { kind: "component-color"; color: string | null }
  | { kind: "component-value"; value: string }
  | { kind: "voltage-source-field"; key: string; value: string }
  | { kind: "component-time-domain"; timeDomain: FunctionBlockTimeDomain }
  | { kind: "component-filter-kind"; filterKind: FilterKind }
  | { kind: "component-scale"; scale: ComponentScale }
  | { kind: "component-inductor-layout"; layout: InductorLayout }
  | { kind: "component-clock"; clock: ComponentClock }
  | { kind: "component-transistor-circle"; visible: boolean }
  | { kind: "component-mos-thick-gate"; thick: boolean }
  | { kind: "rectangle-width"; value: string | number }
  | { kind: "rectangle-height"; value: string | number }
  | { kind: "rectangle-left-pins"; value: string | number }
  | { kind: "rectangle-right-pins"; value: string | number }
  | { kind: "rectangle-top-pins"; value: string | number }
  | { kind: "rectangle-bottom-pins"; value: string | number }
  | { kind: "triangle-pins"; edge: TriangleEdge; value: string | number }
  | { kind: "triangle-vertex"; vertex: TriangleVertex; point: Point }
  | { kind: "component-label-visibility"; visible: boolean }
  | { kind: "component-value-visibility"; visible: boolean }
  | { kind: "component-gain-polarity"; polarity: GainPolarity }
  | { kind: "component-differential-outputs"; same: boolean }
  | {
      kind: "component-dff-setting";
      property: DffSettingProperty;
      value: DffSettings[DffSettingProperty];
    }
  | {
      kind: "component-variant";
      variantId: ComponentVariantId;
      moveBehavior: SelectionMoveBehavior;
    }
  | {
      kind: "component-mos-view";
      patch: Partial<MosViewSettings>;
      moveBehavior: SelectionMoveBehavior;
    }
  | { kind: "component-pin-visibility"; pinId: string; visible: boolean }
  | { kind: "component-pin-mode"; pinId: string; mode: OperatorPinMode }
  | { kind: "component-pin-symbol-visibility"; pinId: string; visible: boolean }
  | { kind: "ink-color"; color: string | null }
  | { kind: "wire-decoration"; patch: WireDecorationPatch }
  | { kind: "net-label-name"; name: string }
  | { kind: "note-background"; color: string | null }
  | { kind: "note-text-color"; color: string | null }
  | { kind: "note-font-size"; value: string | number }
  | { kind: "note-format"; format: SchematicNoteFormat }
  | { kind: "note-width"; value: string | number };

export type SchematicPropertyBatchRenderScope = "none" | "incremental" | "document";

export type SchematicPropertyBatchRejectionReason =
  | "empty-selection"
  | "stale-selection"
  | "unsupported-selection"
  | "incompatible-selection"
  | "invalid-value"
  | "topology-conflict"
  | "apply-failed";

export interface SchematicPropertyBatchRuntimeOverrides {
  applyNormalizedDocumentWires?: typeof applyNormalizedDocumentWires;
  applyWireMoveTopology?: typeof applyWireMoveTopology;
}

export interface SchematicPropertyBatchChangedTargets {
  componentIds: string[];
  wireIds: string[];
  junctionPoints: Point[];
  netLabelIds: string[];
  noteIds: string[];
}

interface SchematicPropertyBatchResultBase {
  changed: boolean;
  historyIntent: "push" | "none";
  renderScope: SchematicPropertyBatchRenderScope;
  rebuildCounters: boolean;
  status: string;
  changedIds: string[];
  changedNoteIds: string[];
  changedJunctionPoints: Point[];
  targets: SchematicPropertyBatchChangedTargets;
}

export type SchematicPropertyBatchCommandResult =
  | (SchematicPropertyBatchResultBase & {
      kind: "changed";
      changed: true;
      historyIntent: "push";
    })
  | (SchematicPropertyBatchResultBase & {
      kind: "unchanged";
      changed: false;
      historyIntent: "none";
      renderScope: "none";
    })
  | (SchematicPropertyBatchResultBase & {
      kind: "rejected";
      changed: false;
      historyIntent: "none";
      renderScope: "none";
      rejectionReason: SchematicPropertyBatchRejectionReason;
    });

interface ResolvedBatchTargets {
  components: ComponentInstance[];
  wires: Wire[];
  junctionPoints: Point[];
  netLabels: NetLabel[];
  notes: SchematicNote[];
  count: number;
}

type PreflightResult =
  | { kind: "ready" }
  | { kind: "unchanged" }
  | {
      kind: "rejected";
      reason: SchematicPropertyBatchRejectionReason;
      status: string;
    };

interface VariantBatchPlan {
  variantIds: Map<string, ComponentVariantId>;
  nextPinPoints: Map<string, Map<string, Point>>;
  geometryChanged: boolean;
}

interface SchematicPropertyBatchRuntime {
  applyNormalizedDocumentWires: typeof applyNormalizedDocumentWires;
  applyWireMoveTopology: typeof applyWireMoveTopology;
}

interface DocumentRollbackSnapshot {
  value: SchematicDocument;
  arrays: {
    components: SchematicDocument["components"];
    wires: SchematicDocument["wires"];
    junctions: SchematicDocument["junctions"];
    junctionAppearances: SchematicDocument["junctionAppearances"];
    netLabels: SchematicDocument["netLabels"];
    notes: SchematicDocument["notes"];
  };
  items: {
    components: SchematicDocument["components"];
    wires: SchematicDocument["wires"];
    junctions: SchematicDocument["junctions"];
    junctionAppearances: SchematicDocument["junctionAppearances"];
    netLabels: SchematicDocument["netLabels"];
    notes: SchematicDocument["notes"];
  };
}

const DEFAULT_INK_COLOR = "#111111";

export function executeSchematicPropertyBatchCommand(
  document: SchematicDocument,
  selection: SchematicPropertyBatchSelection,
  command: SchematicPropertyBatchCommand,
  runtimeOverrides: SchematicPropertyBatchRuntimeOverrides = {}
): SchematicPropertyBatchCommandResult {
  const resolved = resolveBatchTargets(document, selection);
  if (resolved.kind === "rejected") {
    return rejectedResult(resolved.reason, resolved.status);
  }

  const targets = resolved.targets;
  const variantPlan = prepareVariantPlan(targets, command);
  const preparedVariantPlan = variantPlan?.kind === "ready" ? variantPlan.plan : undefined;
  const preflight = variantPlan?.kind === "rejected"
    ? variantPlan
    : preflightCommand(document, targets, command, preparedVariantPlan);
  if (preflight.kind === "rejected") {
    return rejectedResult(preflight.reason, preflight.status);
  }
  if (preflight.kind === "unchanged") return unchangedResult();

  const rollback = captureDocumentRollbackSnapshot(document);
  const runtime: SchematicPropertyBatchRuntime = {
    applyNormalizedDocumentWires:
      runtimeOverrides.applyNormalizedDocumentWires ?? applyNormalizedDocumentWires,
    applyWireMoveTopology:
      runtimeOverrides.applyWireMoveTopology ?? applyWireMoveTopology
  };
  try {
    const result = applyCommand(document, targets, command, preparedVariantPlan, runtime);
    for (const component of targets.components) {
      const issue = componentValueIssue(component);
      if (issue) {
        restoreDocumentRollbackSnapshot(document, rollback);
        return rejectedResult("invalid-value", `Invalid ${issue.key}: expected ${issue.expected}.`);
      }
    }
    return result;
  } catch {
    restoreDocumentRollbackSnapshot(document, rollback);
    return rejectedResult(
      "apply-failed",
      "Property update failed; the schematic was left unchanged."
    );
  }
}

function resolveBatchTargets(
  document: SchematicDocument,
  selection: SchematicPropertyBatchSelection
):
  | { kind: "resolved"; targets: ResolvedBatchTargets }
  | {
      kind: "rejected";
      reason: Extract<SchematicPropertyBatchRejectionReason, "empty-selection" | "stale-selection">;
      status: string;
    } {
  const selectedIds = new Set(selection.selectedIds);
  const selectedNoteIds = new Set(selection.selectedNoteIds);
  if (selectedIds.size + selectedNoteIds.size === 0) {
    return {
      kind: "rejected",
      reason: "empty-selection",
      status: "Select one or more editable schematic objects."
    };
  }

  const components = document.components.filter((component) => selectedIds.has(component.id));
  const wires = document.wires.filter((wire) => selectedIds.has(wire.id));
  const junctionPoints = document.junctions.filter((point) => selectedIds.has(junctionId(point)));
  const netLabels = document.netLabels.filter((label) => selectedIds.has(label.id));
  const notes = document.notes.filter((note) => selectedNoteIds.has(note.id));

  const resolvedGraphIds = [
    ...components.map((component) => component.id),
    ...wires.map((wire) => wire.id),
    ...junctionPoints.map(junctionId),
    ...netLabels.map((label) => label.id)
  ];
  const graphIdCounts = new Map<string, number>();
  resolvedGraphIds.forEach((id) => graphIdCounts.set(id, (graphIdCounts.get(id) ?? 0) + 1));
  const ambiguousGraphId = Array.from(graphIdCounts.values()).some((count) => count !== 1);
  const allGraphIdsResolved = selectedIds.size === resolvedGraphIds.length
    && resolvedGraphIds.every((id) => selectedIds.has(id));
  const allNoteIdsResolved = selectedNoteIds.size === notes.length;
  if (ambiguousGraphId || !allGraphIdsResolved || !allNoteIdsResolved) {
    return {
      kind: "rejected",
      reason: "stale-selection",
      status: "The selection changed before the property could be applied."
    };
  }

  return {
    kind: "resolved",
    targets: {
      components,
      wires,
      junctionPoints,
      netLabels,
      notes,
      count: components.length + wires.length + junctionPoints.length + netLabels.length + notes.length
    }
  };
}

function preflightCommand(
  document: SchematicDocument,
  targets: ResolvedBatchTargets,
  command: SchematicPropertyBatchCommand,
  variantPlan?: VariantBatchPlan
): PreflightResult {
  switch (command.kind) {
    case "component-cell":
      return preflightComponentCell(targets, command.type);
    case "component-ref":
      if (typeof command.ref !== "string") return invalidValue();
      return preflightComponentMutation(targets, (component) =>
        setComponentRef(cloneComponent(component), command.ref)
      );
    case "component-color":
      return preflightComponentMutation(targets, (component) =>
        setComponentColor(cloneComponent(component), command.color)
      );
    case "voltage-source-field":
      return preflightComponentMutation(targets, component =>
        setVoltageSourceField(cloneComponent(component), command.key, command.value)
      );
    case "component-value":
      if (typeof command.value !== "string") return invalidValue();
      if (!componentValuesCompatible(targets.components)) return incompatibleSelection();
      return preflightComponentMutation(targets, (component) =>
        setComponentValue(cloneComponent(component), command.value)
      );
    case "component-time-domain":
      if (!isFunctionBlockTimeDomain(command.timeDomain)) return invalidValue();
      if (
        !onlyComponents(targets)
        || targets.components.some((component) => !isFunctionBlockType(component.type))
      ) {
        return incompatibleSelection();
      }
      return preflightComponentGeometryMutation(document, targets, (component) =>
        setFunctionBlockTimeDomain(component, command.timeDomain)
      );
    case "component-filter-kind":
      if (!isFilterKind(command.filterKind)) return invalidValue();
      if (
        !onlyComponents(targets)
        || targets.components.some((component) => component.type !== "filter")
      ) {
        return incompatibleSelection();
      }
      return preflightComponentGeometryMutation(document, targets, (component) =>
        setFilterKind(component, command.filterKind)
      );
    case "component-scale":
      if (!onlyComponents(targets) || targets.components.some(component => !supportsComponentScale(component.type, command.scale))) return incompatibleSelection();
      return preflightComponentGeometryMutation(document, targets, component => setComponentScale(component, command.scale));
    case "component-inductor-layout":
      if (!isInductorLayout(command.layout)) return invalidValue();
      if (!onlyComponents(targets) || !targets.components.every(isPlanarInductor)) return incompatibleSelection();
      return targets.components.some(component => inductorLayout(component) !== command.layout)
        ? { kind: "ready" } : { kind: "unchanged" };
    case "component-clock":
      if (
        !isComponentClock(command.clock)
        || !onlyComponents(targets)
        || targets.components.some((component) => !supportsOptionalClock(component.type))
      ) {
        return incompatibleSelection();
      }
      return preflightComponentGeometryMutation(document, targets, (component) =>
        setComponentClock(component, command.clock)
      );
    case "component-mos-thick-gate":
      if (typeof command.thick !== "boolean") return invalidValue();
      if (!onlyComponents(targets) || targets.components.some(component => !isMosComponentType(component.type))) {
        return incompatibleSelection();
      }
      return preflightComponentMutation(targets, component => setMosThickGate(cloneComponent(component), command.thick));
    case "component-transistor-circle":
      if (typeof command.visible !== "boolean") return invalidValue();
      if (
        !onlyComponents(targets)
        || targets.components.some((component) => !isTransistorComponentType(component.type))
      ) {
        return incompatibleSelection();
      }
      return preflightComponentMutation(targets, (component) =>
        setTransistorCircle(cloneComponent(component), command.visible)
      );
    case "triangle-pins":
    case "triangle-vertex":
      if (!onlyComponents(targets) || targets.components.some(component => component.type !== "triangle")) return incompatibleSelection();
      return preflightComponentGeometryMutation(document, targets, component => command.kind === "triangle-pins"
        ? setTrianglePinCount(component, command.edge, command.value)
        : setTriangleVertex(component, command.vertex, command.point));
    case "rectangle-width":
    case "rectangle-height":
    case "rectangle-left-pins":
    case "rectangle-right-pins":
    case "rectangle-top-pins":
    case "rectangle-bottom-pins":
      if (
        !onlyComponents(targets)
        || targets.components.some((component) => component.type !== "rectangle")
      ) {
        return incompatibleSelection();
      }
      return preflightComponentGeometryMutation(document, targets, (component) =>
        setRectangleProperty(
          component,
          rectanglePropertyForCommand(command.kind),
          command.value
        )
      );
    case "component-label-visibility":
      if (typeof command.visible !== "boolean") return invalidValue();
      return readyIf(
        onlyComponents(targets),
        targets.components.some((component) => componentLabelVisible(component) !== command.visible)
      );
    case "component-value-visibility":
      if (typeof command.visible !== "boolean") return invalidValue();
      if (!componentValueVisibilityCompatible(targets.components)) return incompatibleSelection();
      return readyIf(
        onlyComponents(targets),
        targets.components.some((component) => componentValueVisible(component) !== command.visible)
      );
    case "component-gain-polarity":
      return preflightComponentMutation(targets, (component) =>
        setComponentGainPolarity(cloneComponent(component), command.polarity)
      );
    case "component-differential-outputs":
      if (typeof command.same !== "boolean") return invalidValue();
      return preflightComponentMutation(targets, (component) =>
        setDifferentialOutputsSame(cloneComponent(component), command.same)
      );
    case "component-dff-setting":
      if (!isDffSettingValue(command.property, command.value)) return invalidValue();
      if (
        !onlyComponents(targets)
        || targets.components.some((component) => component.type !== "dff")
      ) {
        return incompatibleSelection();
      }
      return preflightComponentGeometryMutation(document, targets, (component) =>
        setDffSetting(component, command.property, command.value)
      );
    case "component-variant":
    case "component-mos-view":
      if (!onlyComponents(targets) || !variantPlan) return incompatibleSelection();
      if (command.moveBehavior !== "stretch" && command.moveBehavior !== "moveOnly") {
        return invalidValue();
      }
      if (
        variantPlan.geometryChanged
        && effectiveVariantMoveBehavior(command, targets.components) === "stretch"
        && hasProspectivePinTopologyConflict(
          document,
          targets.components,
          variantPlan.nextPinPoints
        )
      ) {
        return topologyConflict();
      }
      return variantPlan.variantIds.size > 0 ? { kind: "ready" } : { kind: "unchanged" };
    case "component-pin-visibility":
      if (typeof command.visible !== "boolean") return invalidValue();
      if (!componentPinsCompatible(targets.components, command.pinId, "visibility")) {
        return incompatibleSelection();
      }
      return preflightComponentMutation(targets, (component) =>
        setComponentPinVisibility(cloneComponent(component), command.pinId, command.visible)
      );
    case "component-pin-mode":
      if (!componentPinsCompatible(targets.components, command.pinId, "mode")) {
        return incompatibleSelection();
      }
      return preflightComponentMutation(targets, (component) =>
        setComponentPinMode(cloneComponent(component), command.pinId, command.mode)
      );
    case "component-pin-symbol-visibility":
      if (typeof command.visible !== "boolean") return invalidValue();
      if (
        !componentPinsCompatible(targets.components, command.pinId, "mode")
        || targets.components.some((component) => componentPinMode(component, command.pinId) === "output")
      ) {
        return incompatibleSelection();
      }
      return preflightComponentMutation(targets, (component) =>
        setComponentPinSymbolVisibility(cloneComponent(component), command.pinId, command.visible)
      );
    case "ink-color":
      return preflightInkColor(document, targets, command.color);
    case "wire-decoration":
      return preflightWireDecoration(targets, command.patch);
    case "net-label-name":
      return preflightNetLabelName(targets, command.name);
    case "note-text-color":
      if (targets.notes.some(note => note.format === "markdown")) return incompatibleSelection();
      return preflightNoteMutation(targets, note => applyNoteTextColor(cloneNote(note), command.color));
    case "note-background":
      return preflightNoteBackground(targets, command.color);
    case "note-font-size": {
      const nextSize = normalizeNoteFontSizeInput(String(command.value));
      if (nextSize === null) return invalidValue();
      return preflightNoteMutation(targets, (note) =>
        applyNoteFontSize(cloneNote(note), nextSize)
      );
    }
    case "note-format":
      if (command.format !== "plain" && command.format !== "markdown") return invalidValue();
      return readyIf(
        onlyNotes(targets),
        targets.notes.some((note) => note.format !== command.format)
      );
    case "note-width": {
      if (!onlyNotes(targets) || targets.notes.some((note) => note.format !== "markdown")) {
        return incompatibleSelection();
      }
      const nextWidth = normalizeNoteWidthInput(String(command.value));
      if (nextWidth === null) return invalidValue();
      return preflightNoteMutation(targets, (note) =>
        applyNoteWidth(cloneNote(note), nextWidth)
      );
    }
  }
}

function prepareVariantPlan(
  targets: ResolvedBatchTargets,
  command: SchematicPropertyBatchCommand
):
  | { kind: "ready"; plan: VariantBatchPlan }
  | Extract<PreflightResult, { kind: "rejected" }>
  | undefined {
  if (command.kind !== "component-variant" && command.kind !== "component-mos-view") {
    return undefined;
  }
  if (!onlyComponents(targets)) return incompatibleSelection();

  if (command.kind === "component-variant") {
    if (!componentVariantsCompatible(targets.components)) return incompatibleSelection();
    const variantIds = new Map<string, ComponentVariantId>();
    for (const component of targets.components) {
      const result = prepareComponentVariantChange(component, command.variantId);
      if (result.kind === "noop" && result.reason !== "unchanged") return invalidValue();
      if (result.kind === "changed") variantIds.set(component.id, result.variantId);
    }
    const nextPinPoints = prepareVariantPinPoints(targets.components, variantIds);
    return {
      kind: "ready",
      plan: {
        variantIds,
        nextPinPoints,
        geometryChanged: prospectivePinGeometryChanged(targets.components, nextPinPoints)
      }
    };
  }

  if (!validMosPatch(command.patch) || !targets.components.every((component) => isMosComponentType(component.type))) {
    return command.patch && !validMosPatch(command.patch)
      ? invalidValue()
      : incompatibleSelection();
  }
  const variantIds = new Map<string, ComponentVariantId>();
  for (const component of targets.components) {
    const current = parseMosViewVariantId(
      component.variantId ?? resolveComponentDef(component).defaultVariantId
    ) ?? { ...DEFAULT_MOS_VIEW_SETTINGS };
    const variantId = mosViewVariantId(normalizeMosViewSettings({ ...current, ...command.patch }));
    const result = prepareComponentVariantChange(component, variantId);
    if (result.kind === "noop" && result.reason !== "unchanged") return invalidValue();
    if (result.kind === "changed") variantIds.set(component.id, result.variantId);
  }
  const nextPinPoints = prepareVariantPinPoints(targets.components, variantIds);
  return {
    kind: "ready",
    plan: {
      variantIds,
      nextPinPoints,
      geometryChanged: prospectivePinGeometryChanged(targets.components, nextPinPoints)
    }
  };
}

function applyCommand(
  document: SchematicDocument,
  targets: ResolvedBatchTargets,
  command: SchematicPropertyBatchCommand,
  variantPlan: VariantBatchPlan | undefined,
  runtime: SchematicPropertyBatchRuntime
): SchematicPropertyBatchCommandResult {
  const changed = emptyChangedTargets();
  let renderScope: Exclude<SchematicPropertyBatchRenderScope, "none"> = "incremental";
  let rebuildCounters = false;
  let statusOverride: string | undefined;
  const couplingSnapshot = JSON.stringify(document.inductorCouplings ?? []);

  switch (command.kind) {
    case "component-cell": {
      const messages: string[] = [];
      targets.components.forEach((component) => {
        const result = commitComponentCellChange(document, component, command.type);
        if (result.kind === "changed") {
          changed.componentIds.push(component.id);
          messages.push(result.message);
        }
      });
      if (messages.length === 1) statusOverride = messages[0];
      renderScope = "document";
      rebuildCounters = true;
      break;
    }
    case "component-ref":
      applyComponents(targets, changed, (component) => setComponentRef(component, command.ref));
      rebuildCounters = true;
      break;
    case "component-color":
      applyComponents(targets, changed, (component) => setComponentColor(component, command.color));
      break;
    case "voltage-source-field":
      applyComponents(targets, changed, component => setVoltageSourceField(component, command.key, command.value));
      break;
    case "component-value":
      if (targets.components.some(component => supportsFunctionBlockGain(component.type) || component.type === "delay")) {
        renderScope = applyComponentGeometryMutation(
          document, targets, component => setComponentValue(component, command.value), changed, runtime
        ) ? "document" : "incremental";
      } else {
        applyComponents(targets, changed, (component) => setComponentValue(component, command.value));
      }
      break;
    case "component-time-domain":
      renderScope = applyComponentGeometryMutation(
        document,
        targets,
        (component) => setFunctionBlockTimeDomain(component, command.timeDomain),
        changed,
        runtime
      ) ? "document" : "incremental";
      break;
    case "component-filter-kind":
      renderScope = applyComponentGeometryMutation(
        document,
        targets,
        (component) => setFilterKind(component, command.filterKind),
        changed,
        runtime
      ) ? "document" : "incremental";
      break;
    case "component-mos-thick-gate":
      applyComponents(targets, changed, component => setMosThickGate(component, command.thick));
      break;
    case "component-inductor-layout":
      targets.components.forEach(component => {
        if (setInductorLayout(component, command.layout)) changed.componentIds.push(component.id);
      });
      break;
    case "component-transistor-circle":
      applyComponents(targets, changed, (component) =>
        setTransistorCircle(component, command.visible)
      );
      break;
    case "rectangle-width":
    case "rectangle-height":
    case "rectangle-left-pins":
    case "rectangle-right-pins":
    case "rectangle-top-pins":
    case "rectangle-bottom-pins":
      applyRectangleGeometryChange(
        document,
        targets,
        rectanglePropertyForCommand(command.kind),
        command.value,
        changed,
        runtime
      );
      renderScope = "document";
      break;
    case "triangle-pins":
    case "triangle-vertex":
      applyComponentGeometryMutation(document, targets, component => command.kind === "triangle-pins"
        ? setTrianglePinCount(component, command.edge, command.value)
        : setTriangleVertex(component, command.vertex, command.point), changed, runtime);
      renderScope = "document";
      break;
    case "component-label-visibility":
      applyComponents(targets, changed, (component) =>
        setComponentLabelVisibility(component, command.visible)
      );
      break;
    case "component-value-visibility":
      applyComponents(targets, changed, (component) =>
        setComponentValueVisibility(component, command.visible)
      );
      break;
    case "component-gain-polarity":
      applyComponents(targets, changed, (component) =>
        setComponentGainPolarity(component, command.polarity)
      );
      break;
    case "component-differential-outputs":
      applyComponents(targets, changed, (component) =>
        setDifferentialOutputsSame(component, command.same)
      );
      break;
    case "component-dff-setting":
      renderScope = applyComponentGeometryMutation(
        document,
        targets,
        (component) => setDffSetting(component, command.property, command.value),
        changed,
        runtime
      ) ? "document" : "incremental";
      break;
    case "component-scale":
      applyComponentGeometryMutation(document, targets, component => setComponentScale(component, command.scale), changed, runtime);
      renderScope = "document";
      break;
    case "component-clock":
      renderScope = applyComponentGeometryMutation(
        document,
        targets,
        (component) => setComponentClock(component, command.clock),
        changed,
        runtime
      ) ? "document" : "incremental";
      break;
    case "component-variant":
    case "component-mos-view":
      if (!variantPlan) return rejectedResult("invalid-value", "The requested component view is invalid.");
      applyVariantPlan(
        document,
        targets.components,
        variantPlan,
        effectiveVariantMoveBehavior(command, targets.components),
        changed,
        runtime
      );
      renderScope = variantPlan.geometryChanged ? "document" : "incremental";
      break;
    case "component-pin-visibility":
      applyComponentGeometryMutation(document, targets,
        component => setComponentPinVisibility(component, command.pinId, command.visible),
        changed, runtime);
      renderScope = changed.wireIds.length || changed.junctionPoints.length ? "document" : "incremental";
      break;
    case "component-pin-mode":
      applyComponents(targets, changed, (component) =>
        setComponentPinMode(component, command.pinId, command.mode)
      );
      break;
    case "component-pin-symbol-visibility":
      applyComponents(targets, changed, (component) =>
        setComponentPinSymbolVisibility(component, command.pinId, command.visible)
      );
      break;
    case "ink-color":
      applyInkColor(document, targets, command.color, changed);
      break;
    case "wire-decoration":
      targets.wires.forEach((wire) => {
        if (setWireDecoration(wire, command.patch).kind === "changed") changed.wireIds.push(wire.id);
      });
      break;
    case "net-label-name": {
      const name = validateNetLabelName(command.name).name;
      targets.netLabels.forEach((label) => {
        if (label.name === name) return;
        label.name = name;
        changed.netLabelIds.push(label.id);
      });
      renderScope = "document";
      break;
    }
    case "note-text-color":
      targets.notes.forEach(note => {
        if (applyNoteTextColor(note, command.color).status === "changed") changed.noteIds.push(note.id);
      });
      break;
    case "note-background":
      targets.notes.forEach((note) => {
        if (resolvedNoteBackground(note) === canonicalNoteBackground(command.color)) return;
        if (applyNoteBackgroundColor(note, command.color).status === "changed") {
          changed.noteIds.push(note.id);
        }
      });
      break;
    case "note-font-size": {
      const nextSize = normalizeNoteFontSizeInput(String(command.value))!;
      targets.notes.forEach((note) => {
        if (applyNoteFontSize(note, nextSize).status === "changed") changed.noteIds.push(note.id);
      });
      break;
    }
    case "note-format":
      targets.notes.forEach((note) => {
        if (applyNoteFormat(note, command.format)) changed.noteIds.push(note.id);
      });
      break;
    case "note-width": {
      const nextWidth = normalizeNoteWidthInput(String(command.value))!;
      targets.notes.forEach((note) => {
        if (applyNoteWidth(note, nextWidth).status === "changed") changed.noteIds.push(note.id);
      });
      break;
    }
  }

  normalizeInductorCouplings(document);
  if (JSON.stringify(document.inductorCouplings ?? []) !== couplingSnapshot) {
    renderScope = "document";
  }

  return changedResult(
    changed,
    renderScope,
    rebuildCounters,
    statusOverride ?? successStatus(command, primaryChangedTargetCount(command, changed))
  );
}

function preflightComponentCell(
  targets: ResolvedBatchTargets,
  type: ComponentType
): PreflightResult {
  if (!onlyComponents(targets)) return incompatibleSelection();
  const firstType = targets.components[0]?.type;
  if (!firstType || targets.components.some((component) => component.type !== firstType)) {
    return incompatibleSelection();
  }
  if (!targets.components.every((component) => canChangeComponentCell(component, type))) {
    return incompatibleSelection();
  }
  return targets.components.some((component) => component.type !== type)
    ? { kind: "ready" }
    : { kind: "unchanged" };
}

function preflightComponentMutation(
  targets: ResolvedBatchTargets,
  mutate: (component: ComponentInstance) => { kind?: string; reason?: string }
): PreflightResult {
  if (!onlyComponents(targets)) return incompatibleSelection();
  return mutationPreflight(targets.components.map(mutate));
}

function preflightComponentGeometryMutation(
  document: SchematicDocument,
  targets: ResolvedBatchTargets,
  mutate: (component: ComponentInstance) => { kind?: string; reason?: string }
): PreflightResult {
  if (!onlyComponents(targets)) return incompatibleSelection();
  const results: Array<{ kind?: string; reason?: string }> = [];
  const nextPinPoints = new Map<string, Map<string, Point>>();
  targets.components.forEach((component) => {
    const prospective = cloneComponent(component);
    const result = mutate(prospective);
    results.push(result);
    if (result.kind === "changed") {
      nextPinPoints.set(component.id, componentPinPoints(prospective));
    }
  });
  const preflight = mutationPreflight(results);
  if (preflight.kind !== "ready") return preflight;
  return hasProspectivePinTopologyConflict(document, targets.components, nextPinPoints)
    ? topologyConflict()
    : preflight;
}

function preflightWireDecoration(
  targets: ResolvedBatchTargets,
  patch: WireDecorationPatch
): PreflightResult {
  if (!onlyWires(targets)) return incompatibleSelection();
  if (
    patch.digitalLabel !== undefined
    && targets.wires.some((wire) => !(patch.digitalSlash ?? resolvedWireAppearance(wire).digitalSlash))
  ) {
    return incompatibleSelection();
  }
  return mutationPreflight(targets.wires.map((wire) =>
    setWireDecoration(cloneWire(wire), patch)
  ));
}

function preflightNetLabelName(
  targets: ResolvedBatchTargets,
  value: string
): PreflightResult {
  if (!onlyNetLabels(targets)) return incompatibleSelection();
  if (typeof value !== "string") return invalidValue();
  const validation = validateNetLabelName(value);
  if (!validation.valid) {
    return { kind: "rejected", reason: "invalid-value", status: validation.message };
  }
  return targets.netLabels.some((label) => label.name !== validation.name)
    ? { kind: "ready" }
    : { kind: "unchanged" };
}

function preflightNoteMutation(
  targets: ResolvedBatchTargets,
  mutate: (note: SchematicNote) => { status: string }
): PreflightResult {
  if (!onlyNotes(targets)) return incompatibleSelection();
  const outcomes = targets.notes.map(mutate);
  if (outcomes.some((outcome) => outcome.status === "invalid")) return invalidValue();
  return outcomes.some((outcome) => outcome.status === "changed")
    ? { kind: "ready" }
    : { kind: "unchanged" };
}

function preflightNoteBackground(
  targets: ResolvedBatchTargets,
  value: string | null
): PreflightResult {
  if (!onlyNotes(targets)) return incompatibleSelection();
  const color = canonicalNoteBackground(value);
  if (color === undefined) return invalidValue();
  return targets.notes.some((note) => resolvedNoteBackground(note) !== color)
    ? { kind: "ready" }
    : { kind: "unchanged" };
}

function preflightInkColor(
  document: SchematicDocument,
  targets: ResolvedBatchTargets,
  color: string | null
): PreflightResult {
  if (!onlyInkTargets(targets)) return incompatibleSelection();
  const canonical = canonicalInkColor(color);
  if (canonical === undefined) return invalidValue();
  const changed = targets.components.some((component) => componentCustomColor(component) !== canonical)
    || targets.wires.some((wire) => wireCustomColor(wire) !== canonical)
    || targets.junctionPoints.some((point) => junctionCustomColor(document, point) !== canonical);
  return changed ? { kind: "ready" } : { kind: "unchanged" };
}

function mutationPreflight(
  results: Array<{ kind?: string; reason?: string }>
): PreflightResult {
  const invalid = results.some((result) => result.kind === "noop" && result.reason !== "unchanged");
  if (invalid) return invalidValue();
  return results.some((result) => result.kind === "changed")
    ? { kind: "ready" }
    : { kind: "unchanged" };
}

function prepareVariantGeometry(
  component: ComponentInstance,
  variantId: ComponentVariantId
) {
  return componentPinPoints({ ...component, variantId });
}

function prepareVariantPinPoints(
  components: readonly ComponentInstance[],
  variantIds: ReadonlyMap<string, ComponentVariantId>
) {
  const nextPinPoints = new Map<string, Map<string, Point>>();
  components.forEach((component) => {
    const variantId = variantIds.get(component.id);
    if (variantId) nextPinPoints.set(component.id, prepareVariantGeometry(component, variantId));
  });
  return nextPinPoints;
}

function prospectivePinGeometryChanged(
  components: readonly ComponentInstance[],
  nextPinPoints: ReadonlyMap<string, ReadonlyMap<string, Point>>
) {
  return components.some((component) => {
    const next = nextPinPoints.get(component.id);
    return next
      ? !samePinMaps(componentPinPoints(component), next)
      : false;
  });
}

function hasProspectivePinTopologyConflict(
  document: SchematicDocument,
  components: readonly ComponentInstance[],
  nextPinPoints: ReadonlyMap<string, ReadonlyMap<string, Point>>
) {
  const demands = new Map<string, string>();
  for (const component of components) {
    const next = nextPinPoints.get(component.id);
    if (!next || component.temporarilyDeleted) continue;
    const previous = componentPinPoints(component);
    for (const [pinId, previousPoint] of previous) {
      const nextPoint = next.get(pinId);
      if (!nextPoint) continue;
      for (const wire of document.wires) {
        if (wire.temporarilyDeleted || !pointOnPath(previousPoint, wire.points)) continue;
        if (!pinTouchesConnectedWire(document, component.id, pinId, wire.id)) continue;
        const anchorKey = `${wire.id}@${pointKey(snapPoint(previousPoint))}`;
        const demand = pointKey(snapPoint(nextPoint));
        const existing = demands.get(anchorKey);
        if (existing !== undefined && existing !== demand) return true;
        demands.set(anchorKey, demand);
      }
    }
  }
  return false;
}

function topologyConflict(): PreflightResult {
  return {
    kind: "rejected",
    reason: "topology-conflict",
    status: "The selected geometry changes require conflicting moves for the same wire anchor."
  };
}

function captureComponentGeometryChange(document: SchematicDocument, changedComponents: readonly ComponentInstance[]) {
  const previousPinPoints = new Map(changedComponents.map((component) => [
    component.id,
    componentPinPoints(component)
  ]));
  const movingIds = new Set(changedComponents.map((component) => component.id));
  const topology = captureWireMoveTopology(document, movingIds, new Set());
  const previousWires = document.wires.map(cloneWire);
  const previousWireSignatures = new Map(previousWires.map((wire) => [wire.id, wireSignature(wire)]));
  const previousLabels = new Map(document.netLabels.map((label) => [
    label.id,
    `${label.attachment.wireId}@${pointKey(label.attachment.point)}`
  ]));
  const previousJunctions = new Map(document.junctions.map((point) => [pointKey(point), point]));

  return { previousPinPoints, topology, previousWires, previousWireSignatures, previousLabels, previousJunctions,
    connectionSnapshot: cloneSchematicDocument(document) };
}

function finishComponentGeometryChange(
  document: SchematicDocument,
  before: ReturnType<typeof captureComponentGeometryChange>,
  nextPinPoints: Map<string, Map<string, Point>>,
  moveBehavior: SelectionMoveBehavior,
  changed: SchematicPropertyBatchChangedTargets,
  runtime: SchematicPropertyBatchRuntime
) {
  const { previousPinPoints, topology, previousWires, previousWireSignatures, previousLabels, previousJunctions } = before;
  if (moveBehavior === "stretch") {
    runtime.applyWireMoveTopology(document, topology, previousPinPoints, nextPinPoints);
    remapNetLabelsAfterWirePathChange(document, previousWires);
  }
  reconcileConnectionEdit(document, before.connectionSnapshot);
  runtime.applyNormalizedDocumentWires(document);
  document.junctions = buildVisibleJunctions(document);
  pruneJunctionAppearances(document);

  const nextWireSignatures = new Map(document.wires.map((wire) => [wire.id, wireSignature(wire)]));
  const allWireIds = new Set([...previousWireSignatures.keys(), ...nextWireSignatures.keys()]);
  allWireIds.forEach((id) => {
    if (previousWireSignatures.get(id) !== nextWireSignatures.get(id)) changed.wireIds.push(id);
  });
  document.netLabels.forEach((label) => {
    const signature = `${label.attachment.wireId}@${pointKey(label.attachment.point)}`;
    if (previousLabels.get(label.id) !== signature) changed.netLabelIds.push(label.id);
  });
  const nextJunctionKeys = new Set(document.junctions.map(pointKey));
  previousJunctions.forEach((point, key) => {
    if (!nextJunctionKeys.has(key)) changed.junctionPoints.push(point);
  });
  document.junctions.forEach((point) => {
    if (!previousJunctions.has(pointKey(point))) changed.junctionPoints.push(point);
  });

}

function applyVariantPlan(
  document: SchematicDocument,
  components: readonly ComponentInstance[],
  plan: VariantBatchPlan,
  moveBehavior: SelectionMoveBehavior,
  changed: SchematicPropertyBatchChangedTargets,
  runtime: SchematicPropertyBatchRuntime
) {
  const changedComponents = components.filter((component) => plan.variantIds.has(component.id));
  const before = captureComponentGeometryChange(document, changedComponents);

  changedComponents.forEach((component) => {
    component.variantId = plan.variantIds.get(component.id)!;
    if (component.type === "spntSwitch") {
      component.values[SPNT_POSITION_VALUE_KEY] = String(spntPosition(component));
    }
    changed.componentIds.push(component.id);
  });
  if (!plan.geometryChanged) return;

  const nextPinPoints = new Map(changedComponents.map((component) => [
    component.id,
    componentPinPoints(component)
  ]));
  finishComponentGeometryChange(document, before, nextPinPoints, moveBehavior, changed, runtime);
}

function effectiveVariantMoveBehavior(
  command: Extract<SchematicPropertyBatchCommand, { kind: "component-variant" | "component-mos-view" }>,
  components: readonly ComponentInstance[]
): SelectionMoveBehavior {
  return command.kind === "component-variant"
    && components.length > 0
    && components.every((component) => isFunctionBlockType(component.type))
    ? "stretch"
    : command.moveBehavior;
}

function applyComponents(
  targets: ResolvedBatchTargets,
  changed: SchematicPropertyBatchChangedTargets,
  mutate: (component: ComponentInstance) => { kind?: string }
) {
  targets.components.forEach((component) => {
    if (mutate(component).kind === "changed") changed.componentIds.push(component.id);
  });
}

function applyRectangleGeometryChange(
  document: SchematicDocument,
  targets: ResolvedBatchTargets,
  property: RectangleProperty,
  value: string | number,
  changed: SchematicPropertyBatchChangedTargets,
  runtime: SchematicPropertyBatchRuntime
) {
  const changedComponents = targets.components.filter((component) =>
    setRectangleProperty(cloneComponent(component), property, value).kind === "changed"
  );
  const before = captureComponentGeometryChange(document, changedComponents);

  changedComponents.forEach((component) => {
    setRectangleProperty(component, property, value);
    changed.componentIds.push(component.id);
  });
  const nextPinPoints = new Map(changedComponents.map((component) => [
    component.id,
    componentPinPoints(component)
  ]));
  finishComponentGeometryChange(document, before, nextPinPoints, "stretch", changed, runtime);
}

function applyComponentGeometryMutation(
  document: SchematicDocument,
  targets: ResolvedBatchTargets,
  mutate: (component: ComponentInstance) => { kind: string },
  changed: SchematicPropertyBatchChangedTargets,
  runtime: SchematicPropertyBatchRuntime
) {
  const changedComponents = targets.components.filter((component) =>
    mutate(cloneComponent(component)).kind === "changed"
  );
  const before = captureComponentGeometryChange(document, changedComponents);

  changedComponents.forEach((component) => {
    mutate(component);
    changed.componentIds.push(component.id);
  });
  const nextPinPoints = new Map(changedComponents.map((component) => [
    component.id,
    componentPinPoints(component)
  ]));
  const geometryChanged = changedComponents.some((component) =>
    !samePinMaps(before.previousPinPoints.get(component.id)!, nextPinPoints.get(component.id)!)
  );
  if (!geometryChanged) return false;

  finishComponentGeometryChange(document, before, nextPinPoints, "stretch", changed, runtime);
  return true;
}

function rectanglePropertyForCommand(
  kind: Extract<SchematicPropertyBatchCommand["kind"], `rectangle-${string}`>
): RectangleProperty {
  switch (kind) {
    case "rectangle-width": return "width";
    case "rectangle-height": return "height";
    case "rectangle-left-pins": return "leftPins";
    case "rectangle-right-pins": return "rightPins";
    case "rectangle-top-pins": return "topPins";
    case "rectangle-bottom-pins": return "bottomPins";
  }
}

function applyInkColor(
  document: SchematicDocument,
  targets: ResolvedBatchTargets,
  color: string | null,
  changed: SchematicPropertyBatchChangedTargets
) {
  targets.components.forEach((component) => {
    if (setComponentColor(component, color).kind === "changed") changed.componentIds.push(component.id);
  });
  targets.wires.forEach((wire) => {
    if (setWireColor(wire, color).kind === "changed") changed.wireIds.push(wire.id);
  });
  targets.junctionPoints.forEach((point) => {
    if (setJunctionColor(document, point, color).kind === "changed") {
      changed.junctionPoints.push({ ...point });
    }
  });
}

function componentValuesCompatible(components: readonly ComponentInstance[]) {
  if (components.length === 0) return false;
  const fingerprint = componentValueFingerprint(resolveComponentDef(components[0]));
  return !!fingerprint && components.every((component) =>
    componentValueFingerprint(resolveComponentDef(component)) === fingerprint
  );
}

function componentValueVisibilityCompatible(components: readonly ComponentInstance[]) {
  return components.length > 0
    && components.every((component) => !!resolveComponentDef(component).valueKey);
}

function componentValueFingerprint(definition: ReturnType<typeof resolveComponentDef>) {
  if (!definition.valueKey) return "";
  return JSON.stringify([
    definition.valueLabel ?? "Value",
    definition.valueUnit ?? "",
    definition.valuePlaceholder ?? ""
  ]);
}

function componentVariantsCompatible(components: readonly ComponentInstance[]) {
  if (components.length === 0 || components.some((component) => isMosComponentType(component.type))) {
    return false;
  }
  const fingerprint = variantFingerprint(components[0].type);
  return !!fingerprint && components.every((component) =>
    variantFingerprint(component.type) === fingerprint
  );
}

function variantFingerprint(type: ComponentType) {
  const variants = getComponentVariants(type);
  return variants.length > 0
    ? JSON.stringify(variants.map((variant) => [variant.id, variant.label]))
    : "";
}

function componentPinsCompatible(
  components: readonly ComponentInstance[],
  pinId: string,
  capability: "visibility" | "mode"
) {
  if (components.length === 0) return false;
  const firstDefinition = resolveComponentDef(components[0]);
  const firstPin = resolveComponentPinOptions(components[0]).find((pin) => pin.id === pinId);
  if (!firstPin) return false;
  return components.every((component) => {
    const definition = resolveComponentDef(component);
    const pin = resolveComponentPinOptions(component).find((candidate) => candidate.id === pinId);
    if (!pin || pin.label !== firstPin.label) return false;
    const editable = definition.editablePinVisibility
      && (!definition.editablePinVisibilityIds || definition.editablePinVisibilityIds.includes(pinId));
    const firstEditable = firstDefinition.editablePinVisibility
      && (!firstDefinition.editablePinVisibilityIds || firstDefinition.editablePinVisibilityIds.includes(pinId));
    if (!editable || !firstEditable) return false;
    return capability === "visibility"
      || (!!definition.editablePinMode && !!firstDefinition.editablePinMode);
  });
}

function validMosPatch(patch: Partial<MosViewSettings>) {
  const keys = Object.keys(patch);
  if (keys.length === 0 || keys.some((key) => key !== "pins" && key !== "gateStyle" && key !== "arrow")) {
    return false;
  }
  if ("pins" in patch && patch.pins !== "3pin" && patch.pins !== "4pin") return false;
  if ("gateStyle" in patch && typeof patch.gateStyle !== "boolean") return false;
  if (
    "arrow" in patch
    && patch.arrow !== "none"
    && patch.arrow !== "current"
    && patch.arrow !== "bulk"
  ) {
    return false;
  }
  return true;
}

function onlyComponents(targets: ResolvedBatchTargets) {
  return targets.components.length > 0 && targets.components.length === targets.count;
}

function onlyWires(targets: ResolvedBatchTargets) {
  return targets.wires.length > 0 && targets.wires.length === targets.count;
}

function onlyNetLabels(targets: ResolvedBatchTargets) {
  return targets.netLabels.length > 0 && targets.netLabels.length === targets.count;
}

function onlyNotes(targets: ResolvedBatchTargets) {
  return targets.notes.length > 0 && targets.notes.length === targets.count;
}

function onlyInkTargets(targets: ResolvedBatchTargets) {
  return targets.components.length + targets.wires.length + targets.junctionPoints.length > 0
    && targets.components.length + targets.wires.length + targets.junctionPoints.length === targets.count;
}

function readyIf(selectionCompatible: boolean, changed: boolean): PreflightResult {
  if (!selectionCompatible) return incompatibleSelection();
  return changed ? { kind: "ready" } : { kind: "unchanged" };
}

function invalidValue(): Extract<PreflightResult, { kind: "rejected" }> {
  return {
    kind: "rejected",
    reason: "invalid-value",
    status: "The property value is invalid."
  };
}

function incompatibleSelection(): Extract<PreflightResult, { kind: "rejected" }> {
  return {
    kind: "rejected",
    reason: "incompatible-selection",
    status: "The selected objects do not all support this property."
  };
}

function canonicalInkColor(value: string | null) {
  if (value === null) return null;
  const normalized = normalizeHexColor(value);
  if (!normalized) return undefined;
  return normalized === DEFAULT_INK_COLOR ? null : normalized;
}

function canonicalNoteBackground(value: string | null) {
  return value === null ? null : normalizeHexColor(value) ?? undefined;
}


function cloneComponent(component: ComponentInstance): ComponentInstance {
  return {
    ...component,
    values: { ...component.values },
    ...(component.appearance ? { appearance: { ...component.appearance } } : {})
  };
}

function cloneWire(wire: Wire): Wire {
  return {
    ...wire,
    points: wire.points.map((point) => ({ ...point })),
    ...(wire.appearance ? { appearance: { ...wire.appearance } } : {})
  };
}

function cloneNote(note: SchematicNote): SchematicNote {
  return { ...note };
}

function samePinMaps(
  first: ReadonlyMap<string, Point>,
  second: ReadonlyMap<string, Point>
) {
  if (first.size !== second.size) return false;
  for (const [pinId, point] of first) {
    const next = second.get(pinId);
    if (!next || !samePoint(point, next)) return false;
  }
  return true;
}

function wireSignature(wire: Wire) {
  return JSON.stringify(wire);
}

function captureDocumentRollbackSnapshot(
  document: SchematicDocument
): DocumentRollbackSnapshot {
  return {
    value: cloneSchematicDocument(document),
    arrays: {
      components: document.components,
      wires: document.wires,
      junctions: document.junctions,
      junctionAppearances: document.junctionAppearances,
      netLabels: document.netLabels,
      notes: document.notes
    },
    items: {
      components: [...document.components],
      wires: [...document.wires],
      junctions: [...document.junctions],
      junctionAppearances: [...document.junctionAppearances],
      netLabels: [...document.netLabels],
      notes: [...document.notes]
    }
  };
}

function restoreDocumentRollbackSnapshot(
  document: SchematicDocument,
  snapshot: DocumentRollbackSnapshot
) {
  restoreObjectCollection(
    snapshot.arrays.components,
    snapshot.items.components,
    snapshot.value.components
  );
  restoreObjectCollection(
    snapshot.arrays.wires,
    snapshot.items.wires,
    snapshot.value.wires
  );
  restoreObjectCollection(
    snapshot.arrays.junctions,
    snapshot.items.junctions,
    snapshot.value.junctions
  );
  restoreObjectCollection(
    snapshot.arrays.junctionAppearances,
    snapshot.items.junctionAppearances,
    snapshot.value.junctionAppearances
  );
  restoreObjectCollection(
    snapshot.arrays.netLabels,
    snapshot.items.netLabels,
    snapshot.value.netLabels
  );
  restoreObjectCollection(
    snapshot.arrays.notes,
    snapshot.items.notes,
    snapshot.value.notes
  );

  document.components = snapshot.arrays.components;
  document.wires = snapshot.arrays.wires;
  document.connections = snapshot.value.connections;
  document.junctions = snapshot.arrays.junctions;
  document.junctionAppearances = snapshot.arrays.junctionAppearances;
  document.netLabels = snapshot.arrays.netLabels;
  document.notes = snapshot.arrays.notes;
}

function restoreObjectCollection<T extends object>(
  target: T[],
  originalItems: readonly T[],
  values: readonly T[]
) {
  originalItems.forEach((item, index) => overwriteObject(item, values[index]));
  target.splice(0, target.length, ...originalItems);
}

function overwriteObject<T extends object>(target: T, source: T | undefined) {
  if (!source) return;
  Object.keys(target).forEach((key) => {
    delete (target as Record<string, unknown>)[key];
  });
  Object.assign(target, source);
}

function emptyChangedTargets(): SchematicPropertyBatchChangedTargets {
  return {
    componentIds: [],
    wireIds: [],
    junctionPoints: [],
    netLabelIds: [],
    noteIds: []
  };
}

function primaryChangedTargetCount(
  command: SchematicPropertyBatchCommand,
  targets: SchematicPropertyBatchChangedTargets
) {
  switch (command.kind) {
    case "ink-color":
      return targets.componentIds.length + targets.wireIds.length + targets.junctionPoints.length;
    case "wire-decoration":
      return targets.wireIds.length;
    case "net-label-name":
      return targets.netLabelIds.length;
    case "note-text-color":
    case "note-background":
    case "note-font-size":
    case "note-format":
    case "note-width":
      return targets.noteIds.length;
    default:
      return targets.componentIds.length;
  }
}

function changedResult(
  targets: SchematicPropertyBatchChangedTargets,
  renderScope: Exclude<SchematicPropertyBatchRenderScope, "none">,
  rebuildCounters: boolean,
  status: string
): SchematicPropertyBatchCommandResult {
  const changedIds = [
    ...targets.componentIds,
    ...targets.wireIds,
    ...targets.junctionPoints.map(junctionId),
    ...targets.netLabelIds
  ];
  return {
    kind: "changed",
    changed: true,
    historyIntent: "push",
    renderScope,
    rebuildCounters,
    status,
    changedIds,
    changedNoteIds: [...targets.noteIds],
    changedJunctionPoints: targets.junctionPoints.map((point) => ({ ...point })),
    targets
  };
}

function unchangedResult(): SchematicPropertyBatchCommandResult {
  const targets = emptyChangedTargets();
  return {
    kind: "unchanged",
    changed: false,
    historyIntent: "none",
    renderScope: "none",
    rebuildCounters: false,
    status: "",
    changedIds: [],
    changedNoteIds: [],
    changedJunctionPoints: [],
    targets
  };
}

function rejectedResult(
  rejectionReason: SchematicPropertyBatchRejectionReason,
  status: string
): SchematicPropertyBatchCommandResult {
  const targets = emptyChangedTargets();
  return {
    kind: "rejected",
    changed: false,
    historyIntent: "none",
    renderScope: "none",
    rebuildCounters: false,
    status,
    rejectionReason,
    changedIds: [],
    changedNoteIds: [],
    changedJunctionPoints: [],
    targets
  };
}

function successStatus(command: SchematicPropertyBatchCommand, count: number) {
  switch (command.kind) {
    case "triangle-pins": return "Triangle pins updated.";
    case "triangle-vertex": return "Triangle reshaped.";
    case "component-cell":
      return `${count} component${count === 1 ? "" : "s"} changed cell.`;
    case "component-ref":
      return `${count} component name${count === 1 ? "" : "s"} updated.`;
    case "component-color":
    case "ink-color":
      return `Ink color updated for ${count} object${count === 1 ? "" : "s"}.`;
    case "voltage-source-field":
      return "Voltage source setting updated.";
    case "component-value":
      return `${count} component value${count === 1 ? "" : "s"} updated.`;
    case "component-time-domain":
      return `${count} component domain${count === 1 ? "" : "s"} updated.`;
    case "component-filter-kind":
      return `${count} filter kind${count === 1 ? "" : "s"} updated.`;
    case "component-scale": return "Component size updated.";
    case "component-inductor-layout": return `${count} inductor${count === 1 ? "" : "s"} changed to ${command.layout} turn.`;
    case "component-clock":
      return `${count} component clock setting${count === 1 ? "" : "s"} updated.`;
    case "component-transistor-circle":
      return `${count} transistor circle${count === 1 ? "" : "s"} updated.`;
    case "component-mos-thick-gate":
      return `${count} MOS gate thickness setting${count === 1 ? "" : "s"} updated.`;
    case "rectangle-width":
    case "rectangle-height":
    case "rectangle-left-pins":
    case "rectangle-right-pins":
    case "rectangle-top-pins":
    case "rectangle-bottom-pins":
      return `${count} rectangle${count === 1 ? "" : "s"} resized.`;
    case "component-label-visibility":
      return `${count} component label${count === 1 ? "" : "s"} updated.`;
    case "component-value-visibility":
      return `${count} component value label${count === 1 ? "" : "s"} updated.`;
    case "component-gain-polarity":
      return `${count} component polarit${count === 1 ? "y" : "ies"} updated.`;
    case "component-differential-outputs":
      return `${count} differential output order${count === 1 ? "" : "s"} updated.`;
    case "component-dff-setting":
      return `${count} DFF setting${count === 1 ? "" : "s"} updated.`;
    case "component-variant":
    case "component-mos-view":
      return `${count} component view${count === 1 ? "" : "s"} updated.`;
    case "component-pin-visibility":
    case "component-pin-mode":
    case "component-pin-symbol-visibility":
      return `${count} component pin setting${count === 1 ? "" : "s"} updated.`;
    case "wire-decoration":
      return `${count} wire appearance${count === 1 ? "" : "s"} updated.`;
    case "net-label-name":
      return `${count} net label${count === 1 ? "" : "s"} renamed; matching names may merge networks.`;
    case "note-text-color":
      return "Note text color updated.";
    case "note-background":
      return `${count} note fill${count === 1 ? "" : "s"} updated.`;
    case "note-font-size":
      return `${count} note size${count === 1 ? "" : "s"} updated.`;
    case "note-format":
      return `${count} note format${count === 1 ? "" : "s"} updated.`;
    case "note-width":
      return `${count} note width${count === 1 ? "" : "s"} updated.`;
  }
}
