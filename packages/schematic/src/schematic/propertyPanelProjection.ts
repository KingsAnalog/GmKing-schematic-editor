import { DEFAULT_NOTE_ANCHOR } from "./notes/noteGeometry";
import { COMPONENT_SCALES, componentScale, supportsComponentScale } from "./componentScaleModel";
import { componentSupportsProperty } from "./componentValueSchema";
import { noteBackgroundColor, noteFillStyle, noteTextColor } from "./notes/noteAppearance";
import { VOLTAGE_SOURCE_TYPES, voltageSourceType, voltageSourceFields, voltageSourceFieldValue, voltageSourcePairCount } from "./voltageSourceModel";
import {
  getComponentDef,
  getComponentVariants,
  PALETTE_ORDER,
  resolveComponentPinOptions,
  resolveComponentDef
} from "./catalog";
import {
  DEFAULT_MOS_VIEW_SETTINGS,
  isMosComponentType,
  mosThickGate,
  parseMosViewVariantId
} from "./mosViewModel";
import {
  noteFontSizePx
} from "./notes/noteSizing";
import {
  aggregateValues,
  type SchematicPropertyPanelComponentInput,
  type SchematicPropertyPanelInput,
  type SchematicPropertyPanelInductorCouplingInput,
  type SchematicPropertyPanelNetworkInput,
  type SchematicPropertyPanelNoteInput,
  type SchematicPropertyPanelPinSetting
} from "./propertyPanelModel";
import type {
  ComponentDef,
  ComponentInstance,
  InductorCoupling,
  NetLabel,
  Point,
  SchematicDocument,
  SchematicNote,
  Wire
} from "./types";
import {
  canChangeComponentCell,
  componentCustomColor,
  componentGainPolarity,
  componentLabelVisible,
  componentValueVisible,
  componentPinMode,
  componentPinSymbolVisible,
  componentPinVisible
} from "./componentPropertyModel";
import {
  junctionCustomColor,
  wireCustomColor
} from "./networkColorModel";
import {
  netNameForJunction,
  type NetResolution
} from "./netResolution";
import { resolvedWireAppearance } from "./wire/wireDecoration";
import { rectangleSettings } from "./rectangleComponentModel";
import {
  isLibraryShapeType,
  isOpenLibraryShapeType,
  libraryShapeStyle,
  supportsLibraryShapeStyle
} from "./libraryShapeStyleModel";
import {
  FILTER_KIND_OPTIONS,
  filterKindForInstance,
  functionBlockTimeDomainForInstance
} from "./functionBlockModel";
import {
  transistorCircleVisible
} from "./transistorCircleModel";
import {
  differentialOutputsSame,
  supportsDifferentialOutputOrder
} from "./differentialOutputModel";
import { dffSettings } from "./dffModel";
import { isLogicGateType } from "./logicGateModel";
import {
  couplingPartnerId,
  findInductorCoupling,
  inductorCouplingCustomColor,
  inductorCouplingRatio,
  inductorCouplingsFor
} from "./inductorCouplingModel";
import { inductorDotTerminal, inductorTap, isPlanarInductor, inductorLayout } from "./inductorModel";
import {
  COMPONENT_CLOCK_OPTIONS,
  componentClockForInstance,
} from "./clockModel";

export interface SchematicPropertySelectionTargets {
  components: readonly ComponentInstance[];
  inductorCouplings?: readonly InductorCoupling[];
  wires: readonly Wire[];
  junctionPoints: readonly Point[];
  netLabels: readonly NetLabel[];
  notes: readonly SchematicNote[];
}

export interface BuildSchematicPropertyPanelInputArgs {
  document: SchematicDocument;
  targets: SchematicPropertySelectionTargets;
  hasSelection: boolean;
  resolution?: NetResolution;
  couplingPickSourceId?: string | null;
}

export function buildSchematicPropertyPanelInput({
  document,
  targets,
  hasSelection,
  resolution,
  couplingPickSourceId
}: BuildSchematicPropertyPanelInputArgs): SchematicPropertyPanelInput {
  const count = targetCount(targets);
  if (count === 0) return { hasSelection };

  const couplingTargets = targets.inductorCouplings ?? [];
  if (couplingTargets.length === count && couplingTargets.length === 1) {
    return {
      hasSelection,
      inductorCoupling: buildInductorCouplingInput(document, couplingTargets[0])
    };
  }
  if (
    targets.components.length === 2
    && targets.components.length === count
    && targets.components.every((component) => component.type === "inductor")
  ) {
    const coupling = findInductorCoupling(
      document,
      targets.components[0].id,
      targets.components[1].id
    );
    return {
      hasSelection,
      component: buildComponentInput(document, targets.components, couplingPickSourceId),
      inductorCoupling: coupling
        ? buildInductorCouplingInput(document, coupling)
        : {
            id: null,
            exists: false,
            firstRef: targets.components[0].ref,
            secondRef: targets.components[1].ref
          }
    };
  }
  if (targets.components.length === count) {
    return {
      hasSelection,
      component: buildComponentInput(document, targets.components, couplingPickSourceId)
    };
  }
  if (targets.notes.length === count) {
    return {
      hasSelection,
      note: buildNoteInput(targets.notes)
    };
  }
  if (targets.wires.length === count) {
    return {
      hasSelection,
      network: buildWireInput(targets.wires, resolution)
    };
  }
  if (targets.junctionPoints.length === count) {
    return {
      hasSelection,
      network: buildJunctionInput(document, targets.junctionPoints, resolution)
    };
  }
  if (targets.netLabels.length === count) {
    return {
      hasSelection,
      network: buildLabelInput(targets.netLabels, resolution)
    };
  }

  const network: SchematicPropertyPanelNetworkInput = {};
  if (onlyInkTargets(targets)) {
    network.color = aggregateValues([
      ...targets.components.map(componentCustomColor),
      ...targets.wires.map(wireCustomColor),
      ...targets.junctionPoints.map((point) => junctionCustomColor(document, point))
    ]);
  }
  if (onlyNetTargets(targets)) {
    network.netName = aggregateValues(netNamesForTargets(targets, resolution));
  }
  return Object.keys(network).length > 0
    ? { hasSelection, network }
    : { hasSelection };
}

function buildComponentInput(
  document: SchematicDocument,
  components: readonly ComponentInstance[],
  couplingPickSourceId?: string | null
): SchematicPropertyPanelComponentInput {
  const definitions = components.map(resolveComponentDef);
  const first = components[0];
  const input: SchematicPropertyPanelComponentInput = {
    ref: aggregateValues(components.map((component) => component.ref)),
    labelVisible: aggregateValues(components.map(componentLabelVisible)),
    libraryShape: components.every(component => isLibraryShapeType(component.type)),
    color: aggregateValues(components.map(componentCustomColor)),
    scale: {
      label: "Size",
      options: COMPONENT_SCALES.filter(scale => components.every(component => supportsComponentScale(component.type, scale))).map(scale => ({ id: String(scale), label: `×${scale}` })),
      value: aggregateValues(components.map(component => String(componentScale(component))))
    }
  };

  const hasFill = components.every(component => supportsLibraryShapeStyle(component.type, "fillEnabled"));
  if (input.libraryShape || hasFill) {
    const styles = components.map(libraryShapeStyle);
    input.libraryShapeStyle = {
      ...(input.libraryShape ? {
        strokeWidth: aggregateValues(styles.map(style => style.strokeWidth)),
        lineStyle: aggregateValues(styles.map(style => style.lineStyle))
      } : {}),
      ...(components.every(component => component.type === "rectangle")
        ? { cornerRadius: aggregateValues(styles.map(style => style.cornerRadius)) }
        : {}),
      ...(components.every(component => isOpenLibraryShapeType(component.type)) ? {
        startArrow: aggregateValues(styles.map(style => style.startArrow)),
        endArrow: aggregateValues(styles.map(style => style.endArrow)),
        startArrowSize: aggregateValues(styles.map(style => style.startArrowSize)),
        endArrowSize: aggregateValues(styles.map(style => style.endArrowSize))
      } : {}),
      ...(hasFill ? {
        fillEnabled: aggregateValues(styles.map(style => style.fillEnabled)),
        fillColor: aggregateValues(styles.map(style => style.fillColor)),
        fillOpacity: aggregateValues(styles.map(style => style.fillOpacity))
      } : {})
    };
  }

  if (components.every((component) => component.type === first.type)) {
    const cellTypes = PALETTE_ORDER.includes(first.type)
      ? PALETTE_ORDER
      : [first.type, ...PALETTE_ORDER];
    input.cellType = aggregateValues(components.map((component) => component.type));
    input.cells = cellTypes.map((type) => ({
      type,
      label: getComponentDef(type).hotLabel,
      disabled: components.some((component) => !canChangeComponentCell(component, type))
    }));
  }

  if (definitions.every((definition) => definition.editableGainPolarity)) {
    input.gainPolarity = aggregateValues(components.map(componentGainPolarity));
  }
  if (components.every((component) => supportsDifferentialOutputOrder(component.type))) {
    input.differentialOutputsSame = aggregateValues(components.map(differentialOutputsSame));
  }


  if (components.every((component) => componentSupportsProperty(component, "rectangleWidthGrid"))) {
    const settings = components.map(rectangleSettings);
    input.rectangle = {
      widthGrid: aggregateValues(settings.map((value) => value.widthGrid)),
      heightGrid: aggregateValues(settings.map((value) => value.heightGrid))
    };
  }

  if (components.every((component) => componentSupportsProperty(component, "filterKind"))) {
    input.filterKind = {
      options: FILTER_KIND_OPTIONS,
      value: aggregateValues(components.map(filterKindForInstance))
    };
  }

  if (components.every((component) => componentSupportsProperty(component, "dffClockEdge"))) {
    const settings = components.map(dffSettings);
    input.dff = {
      clockEdge: aggregateValues(settings.map((value) => value.clockEdge)),
      setMode: aggregateValues(settings.map((value) => value.setMode)),
      setActiveLevel: aggregateValues(settings.map((value) => value.setActiveLevel)),
      resetMode: aggregateValues(settings.map((value) => value.resetMode)),
      resetActiveLevel: aggregateValues(settings.map((value) => value.resetActiveLevel))
    };
  }

  if (components.every((component) => componentSupportsProperty(component, "timeDomain"))) {
    input.timeDomain = aggregateValues(components.map(functionBlockTimeDomainForInstance));
  }

  if (components.every((component) => componentSupportsProperty(component, "clock"))) {
    input.clock = {
      label: "Clock",
      options: COMPONENT_CLOCK_OPTIONS.map((option) => ({ ...option })),
      value: aggregateValues(components.map(componentClockForInstance))
    };
  }

  const valueFingerprint = componentValueFingerprint(definitions[0]);
  if (definitions.every((definition) => !!definition.valueKey)) {
    input.valueVisible = aggregateValues(components.map(componentValueVisible));
  }
  if (
    valueFingerprint
    && definitions.every((definition) => componentValueFingerprint(definition) === valueFingerprint)
  ) {
    const definition = definitions[0];
    input.value = {
      label: definition.valueLabel ?? "Value",
      value: aggregateValues(components.map((component, index) => {
        const currentDefinition = definitions[index];
        const key = currentDefinition.valueKey!;
        return component.values[key] ?? currentDefinition.defaultValues?.[key] ?? "";
      })),
      placeholder: definition.valuePlaceholder ?? "",
      ...(definition.valueUnit ? { unit: definition.valueUnit } : {})
    };
  }

  if (components.every((component) => isMosComponentType(component.type))) {
    input.mosThickGate = aggregateValues(components.map(mosThickGate));
    const settings = components.map((component, index) =>
      parseMosViewVariantId(component.variantId ?? definitions[index].defaultVariantId)
      ?? { ...DEFAULT_MOS_VIEW_SETTINGS }
    );
    input.mosView = {
      pins: aggregateValues(settings.map((setting) => setting.pins)),
      gateStyle: aggregateValues(settings.map((setting) => setting.gateStyle)),
      arrow: aggregateValues(settings.map((setting) => setting.arrow)),
      noneAllowed: settings.every((setting) => setting.gateStyle)
    };
  } else {
    const variantGroups = components.map((component) => getComponentVariants(component.type));
    const fingerprint = variantFingerprint(variantGroups[0]);
    if (
      fingerprint
      && variantGroups.every((variants) => variantFingerprint(variants) === fingerprint)
    ) {
      input.variants = {
        label: components.every((component) => isLogicGateType(component.type))
          ? "Inputs"
          : components.every((component) => component.type === "spntSwitch") ? "Throws"
          : "View",
        options: variantGroups[0].map((variant) => ({ id: variant.id, label: variant.label })),
        value: aggregateValues(components.map((component, index) => {
          const definition = definitions[index];
          return definition.variantId
            ?? component.variantId
            ?? variantGroups[index][0]?.id
            ?? "";
        }))
      };
    }
  }

  if (components.every((component) => componentSupportsProperty(component, "transistorCircle"))) {
    input.transistorCircle = aggregateValues(components.map(transistorCircleVisible));
  }

  if (components.every(isPlanarInductor)) {
    input.inductorLayout = aggregateValues(components.map(inductorLayout));
  }

  if (components.length === 1 && first.type === "inductor") {
    const couplings = inductorCouplingsFor(document, first.id);
    const coupledPartnerIds = new Set(couplings.map((coupling) =>
      couplingPartnerId(coupling, first.id)
    ));
    input.inductor = {
      dot: aggregateValues([inductorDotTerminal(first)]),
      tap: aggregateValues([inductorTap(first)]),
      couplings: couplings.map((coupling) => {
        const partnerId = couplingPartnerId(coupling, first.id);
        const partner = document.components.find((component) => component.id === partnerId);
        return {
          id: coupling.id,
          partnerId,
          partnerRef: partner?.ref ?? partnerId
        };
      }),
      canAddCoupling: document.components
        .some((component) =>
          component.type === "inductor"
          && component.id !== first.id
          && !component.temporarilyDeleted
          && !coupledPartnerIds.has(component.id)
        ),
      pickingCoupling: couplingPickSourceId === first.id
    };
  }

  if (components.every(component => component.type === "voltageSource")) {
    const sourceTypes = aggregateValues(components.map(voltageSourceType));
    const variants = getComponentVariants("voltageSource");
    input.variants = {
      label: "Source type",
      options: variants.filter(variant => (VOLTAGE_SOURCE_TYPES as readonly string[]).includes(variant.id)
        || components.some(component => component.variantId === variant.id))
        .map(variant => ({ id: variant.id, label: variant.label })),
      value: sourceTypes
    };
    delete input.value;
    if (sourceTypes.state === "uniform") {
      const pairs = aggregateValues(components.map(voltageSourcePairCount));
      input.sourceFields = voltageSourceFields(sourceTypes.value, pairs.state === "uniform" ? pairs.value : 0)
        .map(field => ({ ...field, value: aggregateValues(components.map(component => voltageSourceFieldValue(component, field.key))) }));
    }
  }

  const pinSettings = commonPinSettings(components, definitions);
  if (pinSettings.length > 0) input.pinSettings = pinSettings;
  return input;
}

function buildInductorCouplingInput(
  document: SchematicDocument,
  coupling: InductorCoupling
): SchematicPropertyPanelInductorCouplingInput {
  const first = document.components.find((component) => component.id === coupling.inductorAId);
  const second = document.components.find((component) => component.id === coupling.inductorBId);
  return {
    id: coupling.id,
    exists: true,
    firstRef: first?.ref ?? coupling.inductorAId,
    secondRef: second?.ref ?? coupling.inductorBId,
    coefficient: coupling.coefficient,
    coefficientAuto: coupling.coefficientAuto,
    labelMode: coupling.labelMode,
    showLabel: coupling.showLabel,
    ratioAvailable: inductorCouplingRatio(document, coupling) !== null,
    showArc: coupling.showArc,
    showCore: coupling.showCore,
    arcFlipped: coupling.arcFlipped,
    color: aggregateValues([inductorCouplingCustomColor(coupling)])
  };
}

function buildNoteInput(notes: readonly SchematicNote[]): SchematicPropertyPanelNoteInput {
  const fills = notes.map(noteFillStyle);
  return {
    backgroundColor: aggregateValues(notes.map(noteBackgroundColor)),
    backgroundEnabled: aggregateValues(fills.map(fill => fill.fillEnabled)),
    backgroundOpacity: aggregateValues(fills.map(fill => fill.fillOpacity)),
    textColor: aggregateValues(notes.map(noteTextColor)),
    fontSizePx: aggregateValues(notes.map(noteFontSizePx)),
    anchor: aggregateValues(notes.map(note => note.anchor ?? DEFAULT_NOTE_ANCHOR)),
    ...(notes.length === 1 ? { text: notes[0].text } : {})
  };
}

function buildWireInput(
  wires: readonly Wire[],
  resolution?: NetResolution
): SchematicPropertyPanelNetworkInput {
  const appearances = wires.map(resolvedWireAppearance);
  return {
    netName: aggregateValues(wires.map((wire) => resolution?.wireNetNames.get(wire.id) ?? "")),
    color: aggregateValues(wires.map(wireCustomColor)),
    wire: {
      lineWidth: aggregateValues(appearances.map((appearance) => appearance.lineWidth)),
      startMarker: aggregateValues(appearances.map((appearance) => appearance.startMarker)),
      endMarker: aggregateValues(appearances.map((appearance) => appearance.endMarker)),
      digitalSlash: aggregateValues(appearances.map((appearance) => appearance.digitalSlash)),
      ...(appearances.every((appearance) => appearance.digitalSlash)
        ? { digitalLabel: aggregateValues(appearances.map((appearance) => appearance.digitalLabel)) }
        : {})
    }
  };
}

function buildJunctionInput(
  document: SchematicDocument,
  points: readonly Point[],
  resolution?: NetResolution
): SchematicPropertyPanelNetworkInput {
  return {
    netName: aggregateValues(points.map((point) =>
      resolution ? netNameForJunction(resolution, point) : ""
    )),
    color: aggregateValues(points.map((point) => junctionCustomColor(document, point)))
  };
}

function buildLabelInput(
  labels: readonly NetLabel[],
  resolution?: NetResolution
): SchematicPropertyPanelNetworkInput {
  const messages = labels
    .map((label) => resolution?.labelStates.get(label.id)?.message)
    .filter((message): message is string => !!message);
  return {
    netName: aggregateValues(labels.map((label) =>
      resolution?.labelStates.get(label.id)?.netName ?? ""
    )),
    label: {
      name: aggregateValues(labels.map((label) => label.name)),
      ...(messages.length > 0
        ? {
            message: messages.every((message) => message === messages[0])
              ? messages[0]
              : "Multiple label states."
          }
        : {})
    }
  };
}

function commonPinSettings(
  components: readonly ComponentInstance[],
  definitions: readonly ComponentDef[]
): SchematicPropertyPanelPinSetting[] {
  const firstPins = editablePins(components[0], definitions[0]);
  return firstPins.flatMap((firstPin) => {
    const matchingPins = definitions.map((definition, index) =>
      editablePins(components[index], definition).find((pin) =>
        pin.id === firstPin.id
        && pin.label === firstPin.label
        && !!definition.editablePinMode === !!definitions[0].editablePinMode
      )
    );
    if (matchingPins.some((pin) => !pin)) return [];
    const modeEditable = !!definitions[0].editablePinMode;
    const modes = components.map((component) => componentPinMode(component, firstPin.id));
    return [{
      id: firstPin.id,
      label: firstPin.label,
      visible: aggregateValues(components.map((component) => componentPinVisible(component, firstPin.id))),
      modeEditable,
      ...(modeEditable
        ? {
            mode: aggregateValues(modes),
            symbolVisible: aggregateValues(components.map((component) =>
              componentPinSymbolVisible(component, firstPin.id)
            )),
            symbolEditable: modes.every((mode) => mode !== "output")
          }
        : {})
    }];
  });
}

function editablePins(component: ComponentInstance, definition: ComponentDef) {
  if (!definition.editablePinVisibility) return [];
  return resolveComponentPinOptions(component).filter((pin) =>
    !definition.editablePinVisibilityIds
    || definition.editablePinVisibilityIds.includes(pin.id)
  );
}

function componentValueFingerprint(definition: ComponentDef) {
  if (!definition.valueKey) return "";
  return JSON.stringify([
    definition.valueLabel ?? "Value",
    definition.valueUnit ?? "",
    definition.valuePlaceholder ?? ""
  ]);
}

function variantFingerprint(variants: ReturnType<typeof getComponentVariants>) {
  return variants.length > 0
    ? JSON.stringify(variants.map((variant) => [variant.id, variant.label]))
    : "";
}

function targetCount(targets: SchematicPropertySelectionTargets) {
  return targets.components.length
    + (targets.inductorCouplings?.length ?? 0)
    + targets.wires.length
    + targets.junctionPoints.length
    + targets.netLabels.length
    + targets.notes.length;
}

function onlyInkTargets(targets: SchematicPropertySelectionTargets) {
  return targets.notes.length === 0
    && targets.netLabels.length === 0
    && targets.components.length + targets.wires.length + targets.junctionPoints.length > 0;
}

function onlyNetTargets(targets: SchematicPropertySelectionTargets) {
  return targets.components.length === 0
    && targets.notes.length === 0
    && targets.wires.length + targets.junctionPoints.length + targets.netLabels.length > 0;
}

function netNamesForTargets(
  targets: SchematicPropertySelectionTargets,
  resolution?: NetResolution
) {
  return [
    ...targets.wires.map((wire) => resolution?.wireNetNames.get(wire.id) ?? ""),
    ...targets.junctionPoints.map((point) => resolution ? netNameForJunction(resolution, point) : ""),
    ...targets.netLabels.map((label) => resolution?.labelStates.get(label.id)?.netName ?? "")
  ];
}
