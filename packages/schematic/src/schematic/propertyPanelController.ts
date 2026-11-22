import { COMPONENT_SCALES, type ComponentScale } from "./componentScaleModel";
import { componentName, messageText, parameterLabel, schematicLanguage, uiFormat } from "./schematicI18n";
import { localizeSchematicStatus } from "./schematicUiText";
import { DEFAULT_NOTE_TEXT_COLOR } from "./notes/noteAppearance";
import {
  type MosArrowView,
  type MosPinView,
  type MosViewSettings
} from "./mosViewModel";
import type {
  ComponentType,
  GainPolarity,
  OperatorPinMode,
  SchematicNoteFormat,
  WireEndpointMarker,
  WireLineWidth
} from "./types";
import { DEFAULT_COMPONENT_COLOR } from "./componentPropertyModel";
import { DEFAULT_NETWORK_COLOR } from "./networkColorModel";
import type { RectangleProperty } from "./rectangleComponentModel";
import {
  isLibraryShapeLineStyle,
  isLibraryShapeArrowType,
  isLibraryShapeArrowSize,
  DEFAULT_LIBRARY_SHAPE_STYLE,
  LIBRARY_SHAPE_ARROW_FIELDS,
  LIBRARY_SHAPE_LINE_STYLE_OPTIONS,
  type LibraryShapeStyleProperty,
  type LibraryShapeStyleValue
} from "./libraryShapeStyleModel";
import type { TriangleEdge } from "./triangleComponentModel";
import {
  isFilterKind,
  isFunctionBlockTimeDomain,
  type FilterKind,
  type FunctionBlockTimeDomain
} from "./functionBlockModel";
import {
  isDffSettingProperty,
  isDffSettingValue,
  type DffSettingProperty,
  type DffSettings
} from "./dffModel";
import {
  isInductorDotTerminal,
  isInductorTap,
  isInductorLayout,
  INDUCTOR_LAYOUT_OPTIONS,
  type InductorDotTerminal,
  type InductorTap,
  type InductorLayout
} from "./inductorModel";
import { isComponentClock, type ComponentClock } from "./clockModel";
import {
  aggregateIsUniform,
  uniformValue,
  type AggregateValue,
  type SchematicPropertyPanelComponentInput,
  type SchematicPropertyPanelInductorCouplingInput,
  type SchematicPropertyPanelInductorInput,
  type SchematicPropertyPanelInput,
  type SchematicPropertyPanelNoteInput,
  type SchematicPropertyPanelPinSetting,
  type SchematicPropertyPanelVariant
} from "./propertyPanelModel";

export type {
  AggregateValue,
  SchematicPropertyPanelCell,
  SchematicPropertyPanelComponentInput,
  SchematicPropertyPanelFilterKindInput,
  SchematicPropertyPanelInput,
  SchematicPropertyPanelMosViewInput,
  SchematicPropertyPanelNetworkInput,
  SchematicPropertyPanelNoteInput,
  SchematicPropertyPanelPinSetting,
  SchematicPropertyPanelValueInput,
  SchematicPropertyPanelVariant,
  SchematicPropertyPanelVariantInput
} from "./propertyPanelModel";

export interface SchematicPropertyPanelControllerCallbacks {
  onComponentCellChange?: (value: ComponentType) => void;
  onComponentColorChange?: (value: string | null) => void;
  onComponentColorEditStart?: () => void;
  onComponentColorInput?: (value: string) => void;
  onComponentColorCommit?: (value: string) => void;
  onComponentColorCancel?: () => void;
  onNetworkColorChange?: (value: string | null) => void;
  onNetworkColorEditStart?: () => void;
  onNetworkColorInput?: (value: string) => void;
  onNetworkColorCommit?: (value: string) => void;
  onNetworkColorCancel?: () => void;
  onWireLineWidthChange?: (value: WireLineWidth) => void;
  onWireStartMarkerChange?: (value: WireEndpointMarker) => void;
  onWireEndMarkerChange?: (value: WireEndpointMarker) => void;
  onWireDigitalSlashChange?: (visible: boolean) => void;
  onWireDigitalLabelChange?: (value: string) => void;
  onWireDigitalLabelEditStart?: () => void;
  onWireDigitalLabelInput?: (value: string) => void;
  onWireDigitalLabelCommit?: (value: string) => void;
  onWireDigitalLabelCancel?: () => void;
  onComponentRefChange?: (value: string) => void;
  onComponentRefEditStart?: () => void;
  onComponentRefInput?: (value: string) => void;
  onComponentRefCommit?: (value: string) => void;
  onComponentRefCancel?: () => void;
  onComponentLabelVisibilityChange?: (visible: boolean) => void;
  onComponentValueVisibilityChange?: (visible: boolean) => void;
  onComponentGainPolarityChange?: (polarity: GainPolarity) => void;
  onComponentDifferentialOutputsChange?: (same: boolean) => void;
  onComponentValueChange?: (value: string) => void;
  onVoltageSourceFieldChange?: (key: string, value: string) => void;
  onVoltageSourceFieldEditStart?: (key: string) => void;
  onVoltageSourceFieldCommit?: (key: string, value: string) => void;
  onVoltageSourceFieldCancel?: (key: string) => void;
  onComponentValueEditStart?: () => void;
  onComponentValueInput?: (value: string) => void;
  onComponentValueCommit?: (value: string) => void;
  onComponentValueCancel?: () => void;
  onLibraryShapeStyleChange?: (property: LibraryShapeStyleProperty, value: LibraryShapeStyleValue) => void;
  onLibraryShapeStyleEditStart?: (property: LibraryShapeStyleProperty) => void;
  onLibraryShapeStyleInput?: (property: LibraryShapeStyleProperty, value: string) => void;
  onLibraryShapeStyleCommit?: (property: LibraryShapeStyleProperty, value: string) => void;
  onLibraryShapeStyleCancel?: (property: LibraryShapeStyleProperty) => void;
  onRectanglePropertyEditStart?: (property: RectangleProperty) => void;
  onRectanglePropertyInput?: (property: RectangleProperty, value: string) => void;
  onRectanglePropertyCommit?: (property: RectangleProperty, value: string) => void;
  onRectanglePropertyCancel?: (property: RectangleProperty) => void;
  onTrianglePinsEditStart?: (edge: TriangleEdge) => void;
  onTrianglePinsInput?: (edge: TriangleEdge, value: string) => void;
  onTrianglePinsCommit?: (edge: TriangleEdge, value: string) => void;
  onTrianglePinsCancel?: (edge: TriangleEdge) => void;
  onComponentVariantChange?: (value: string) => void;
  onComponentScaleChange?: (value: ComponentScale) => void;
  onComponentClockChange?: (value: ComponentClock) => void;
  onComponentDffSettingChange?: (
    property: DffSettingProperty,
    value: DffSettings[DffSettingProperty]
  ) => void;
  onComponentTimeDomainChange?: (value: FunctionBlockTimeDomain) => void;
  onComponentFilterKindChange?: (value: FilterKind) => void;
  onComponentMosViewChange?: (patch: Partial<MosViewSettings>) => void;
  onComponentTransistorCircleChange?: (visible: boolean) => void;
  onComponentMosThickGateChange?: (thick: boolean) => void;
  onComponentInductorTapChange?: (tap: InductorTap) => void;
  onComponentInductorDotChange?: (terminal: InductorDotTerminal) => void;
  onComponentInductorLayoutChange?: (layout: InductorLayout) => void;
  onInductorCouplingAdd?: () => void;
  onInductorCouplingSelect?: (couplingId: string) => void;
  onInductorCouplingCreate?: () => void;
  onInductorCouplingCoefficientChange?: (couplingId: string, value: string) => void;
  onInductorCouplingAutoName?: (couplingId: string) => void;
  onInductorCouplingLabelModeChange?: (couplingId: string, value: "coefficient" | "ratio") => void;
  onInductorCouplingShowLabelChange?: (couplingId: string, visible: boolean) => void;
  onInductorCouplingShowArcChange?: (couplingId: string, visible: boolean) => void;
  onInductorCouplingShowCoreChange?: (couplingId: string, visible: boolean) => void;
  onInductorCouplingFlip?: (couplingId: string) => void;
  onInductorCouplingColorChange?: (couplingId: string, color: string | null) => void;
  onComponentPinVisibilityChange?: (pinId: string, visible: boolean) => void;
  onComponentPinModeChange?: (pinId: string, mode: OperatorPinMode) => void;
  onComponentPinSymbolVisibilityChange?: (pinId: string, visible: boolean) => void;
  onNoteTextColorChange?: (value: string | null) => void;
  onNoteTextColorEditStart?: () => void;
  onNoteTextColorInput?: (value: string) => void;
  onNoteTextColorCommit?: (value: string) => void;
  onNoteTextColorCancel?: () => void;
  onNoteBackgroundChange?: (value: string | null) => void;
  onNoteBackgroundEditStart?: () => void;
  onNoteBackgroundInput?: (value: string) => void;
  onNoteBackgroundCommit?: (value: string) => void;
  onNoteBackgroundCancel?: () => void;
  onNoteFontSizeEditStart?: () => void;
  onNoteFontSizeInput?: (value: string) => void;
  onNoteFontSizeCommit?: (value: string) => void;
  onNoteFormatChange?: (value: SchematicNoteFormat) => void;
  onNoteWidthEditStart?: () => void;
  onNoteWidthInput?: (value: string) => void;
  onNoteWidthCommit?: (value: string) => void;
  onNoteFontSizeCancel?: () => void;
  onNoteWidthCancel?: () => void;
  onNetLabelChange?: (value: string) => void;
  onNetLabelEditStart?: () => void;
  onNetLabelInput?: (value: string) => void;
  onNetLabelCommit?: (value: string) => void;
  onNetLabelCancel?: () => void;
}

type PropertyPanelElements = {
  empty: HTMLElement;
  componentForm: HTMLElement;
  couplingForm: HTMLElement;
  couplingPair: HTMLElement;
  couplingExistingFields: HTMLElement;
  couplingCoefficientInput: HTMLInputElement;
  couplingLabelModeControl: HTMLElement;
  couplingShowLabelInput: HTMLInputElement;
  couplingShowArcInput: HTMLInputElement;
  couplingShowCoreInput: HTMLInputElement;
  couplingColorInput: HTMLInputElement;
  couplingColorSwatches: NodeListOf<HTMLButtonElement>;
  couplingCreateButton: HTMLButtonElement;
  noteForm: HTMLElement;
  netForm: HTMLElement | null;
  netNameRow: HTMLElement | null;
  netNameInput: HTMLInputElement | null;
  netLabelRow: HTMLElement | null;
  netLabelInput: HTMLInputElement | null;
  netMessage: HTMLElement | null;
  networkColorRow: HTMLElement | null;
  networkColorInput: HTMLInputElement | null;
  networkColorSwatches: NodeListOf<HTMLButtonElement>;
  wireLineWidthRow: HTMLElement | null;
  wireLineWidthControl: HTMLElement | null;
  wireStartMarkerRow: HTMLElement | null;
  wireStartMarkerControl: HTMLElement | null;
  wireEndMarkerRow: HTMLElement | null;
  wireEndMarkerControl: HTMLElement | null;
  wireDigitalSlashRow: HTMLElement | null;
  wireDigitalSlashInput: HTMLInputElement | null;
  wireDigitalLabelRow: HTMLElement | null;
  wireDigitalLabelInput: HTMLInputElement | null;
  cellRow: HTMLElement;
  cellSelect: HTMLSelectElement;
  identityFields: HTMLElement | null;
  refInput: HTMLInputElement;
  labelVisibilityInput: HTMLInputElement;
  valueVisibilityRow: HTMLElement | null;
  valueVisibilityInput: HTMLInputElement | null;
  componentColorRow: HTMLElement;
  componentColorInput: HTMLInputElement;
  libraryShapeStrokeFields: HTMLElement | null;
  libraryShapeStrokeWidthInput: HTMLInputElement | null;
  libraryShapeLineStyleSelect: HTMLSelectElement | null;
  libraryShapeCornerRadiusRow: HTMLElement | null;
  libraryShapeCornerRadiusInput: HTMLInputElement | null;
  libraryShapeArrowSelects: NodeListOf<HTMLSelectElement>;
  libraryShapeFillFields: HTMLElement | null;
  libraryShapeFillEnabledInput: HTMLInputElement | null;
  libraryShapeFillColorInput: HTMLInputElement | null;
  libraryShapeFillColorSwatches: NodeListOf<HTMLButtonElement>;
  libraryShapeFillOpacityInput: HTMLInputElement | null;
  gainPolarityRow: HTMLElement;
  gainPolarityControl: HTMLElement;
  gainPolarityButtons: NodeListOf<HTMLButtonElement>;
  differentialOutputsRow: HTMLElement | null;
  differentialOutputsInput: HTMLInputElement | null;
  valueRow: HTMLElement;
  valueLabel: HTMLElement;
  valueInput: HTMLInputElement;
  valueUnit: HTMLElement;
  vsourceFields: HTMLElement | null;
  inductorFields: HTMLElement;
  inductorLayoutRow: HTMLElement | null;
  inductorLayoutSelect: HTMLSelectElement | null;
  inductorTapControl: HTMLElement;
  inductorDotControl: HTMLElement;
  inductorCouplingList: HTMLElement;
  inductorAddCouplingButton: HTMLButtonElement;
  rectangleFields: HTMLElement | null;
  triangleFields: HTMLElement | null;
  triangleInputs: NodeListOf<HTMLInputElement>;
  rectangleInputs: NodeListOf<HTMLInputElement>;
  timeDomainRow: HTMLElement;
  timeDomainControl: HTMLElement;
  timeDomainButtons: NodeListOf<HTMLButtonElement>;
  variantRow: HTMLElement;
  variantLabel: HTMLElement;
  variantSelect: HTMLSelectElement;
  variantSegmented: HTMLElement;
  scaleRow: HTMLElement;
  scaleSegmented: HTMLElement;
  clockRow: HTMLElement;
  clockSelect: HTMLSelectElement;
  clockSegmented: HTMLElement;
  dffRows: NodeListOf<HTMLElement>;
  filterKindRow: HTMLElement;
  filterKindSelect: HTMLSelectElement;
  mosPinsRow: HTMLElement;
  mosPinsSegmented: HTMLElement;
  mosGateStyleRow: HTMLElement;
  mosGateStyleInput: HTMLInputElement;
  mosThickGateRow: HTMLElement;
  mosThickGateInput: HTMLInputElement;
  mosArrowRow: HTMLElement;
  mosArrowSegmented: HTMLElement;
  transistorCircleRow: HTMLElement;
  transistorCircleControl: HTMLElement;
  transistorCircleButtons: NodeListOf<HTMLButtonElement>;
  pinVisibilityRow: HTMLElement;
  noteTextColorRow: HTMLElement | null;
  noteTextColorInput: HTMLInputElement | null;
  noteTextColorSwatches: NodeListOf<HTMLButtonElement>;
  noteBackgroundRow: HTMLElement;
  noteBackgroundInput: HTMLInputElement;
  noteFontSizeRow: HTMLElement;
  noteFontSizeInput: HTMLInputElement;
  noteFormatRow: HTMLElement;
  noteFormatSelect: HTMLSelectElement;
  noteFormatSegmented: HTMLElement;
  noteWidthRow: HTMLElement;
  noteWidthInput: HTMLInputElement;
  noteSwatches: NodeListOf<HTMLButtonElement>;
  componentColorSwatches: NodeListOf<HTMLButtonElement>;
};

interface PropertyInputBinding {
  kind: "text" | "color";
  start?: () => void;
  input?: (value: string) => void;
  commit?: (value: string) => void;
  cancel?: () => void;
}

interface BoundPropertyInput {
  input: HTMLInputElement;
  binding: PropertyInputBinding;
}

const PROPERTY_EDIT_SELECTOR = [
  "[data-property-vsource-field]",
  "[data-property-ref]",
  "[data-property-value]",
  "[data-property-note-font-size]",
  "[data-property-note-width]",
  "[data-property-net-label]",
  "[data-property-wire-digital-label]",
  "[data-property-component-color]",
  "[data-property-network-color]",
  "[data-property-note-background]",
  "[data-property-note-text-color]",
  "[data-property-rectangle]",
  "[data-property-triangle-pins]",
  "[data-property-library-shape-stroke-width]",
  "[data-property-library-shape-corner-radius]",
  "[data-property-library-shape-fill-color]",
  "[data-property-library-shape-fill-opacity]"
].join(", ");

export class SchematicPropertyPanelController {
  private bound = false;
  private readonly dirtyTextInputs = new WeakSet<HTMLInputElement>();
  private readonly dirtyColorInputs = new WeakSet<HTMLInputElement>();
  private componentIdentity: {
    container: HTMLElement;
    refRow: HTMLElement;
    labelRow: HTMLElement;
    refInput: HTMLInputElement;
    labelVisibilityInput: HTMLInputElement;
  } | null = null;

  constructor(
    private readonly root: Element,
    private readonly callbacks: SchematicPropertyPanelControllerCallbacks = {}
  ) {}

  bind() {
    if (this.bound) return;
    this.root.addEventListener("change", this.handleChange);
    this.root.addEventListener("input", this.handleInput);
    this.root.addEventListener("focusin", this.handleFocusIn);
    this.root.addEventListener("focusout", this.handleFocusOut);
    this.root.addEventListener("click", this.handleClick);
    this.root.addEventListener("keydown", this.handleKeydown);
    this.bound = true;
  }

  destroy() {
    if (!this.bound) return;
    this.root.removeEventListener("change", this.handleChange);
    this.root.removeEventListener("input", this.handleInput);
    this.root.removeEventListener("focusin", this.handleFocusIn);
    this.root.removeEventListener("focusout", this.handleFocusOut);
    this.root.removeEventListener("click", this.handleClick);
    this.root.removeEventListener("keydown", this.handleKeydown);
    this.bound = false;
  }

  sync(input: SchematicPropertyPanelInput) {
    const elements = this.elements();
    if (!elements) return;

    this.reset(elements);
    if (input.note) {
      this.syncNote(elements, input.note);
      return;
    }
    if (input.network) {
      this.syncNetwork(elements, input.network);
      return;
    }
    if (input.component || input.inductorCoupling) {
      if (input.component) this.syncComponent(elements, input.component);
      if (input.inductorCoupling) this.syncInductorCoupling(elements, input.inductorCoupling);
      return;
    }
    this.syncEmpty(elements, input.hasSelection);
  }

  private elements(): PropertyPanelElements | null {
    const empty = this.root.querySelector<HTMLElement>("[data-property-empty]");
    const componentForm = this.root.querySelector<HTMLElement>("[data-property-component-form]");
    const couplingForm = this.root.querySelector<HTMLElement>("[data-property-coupling-form]");
    const couplingPair = this.root.querySelector<HTMLElement>("[data-property-coupling-pair]");
    const couplingExistingFields = this.root.querySelector<HTMLElement>("[data-property-coupling-existing-fields]");
    const couplingCoefficientInput = this.root.querySelector<HTMLInputElement>("[data-property-coupling-coefficient]");
    const couplingLabelModeControl = this.root.querySelector<HTMLElement>("[data-property-coupling-label-mode]");
    const couplingShowLabelInput = this.root.querySelector<HTMLInputElement>("[data-property-coupling-show-label]");
    const couplingShowArcInput = this.root.querySelector<HTMLInputElement>("[data-property-coupling-show-arc]");
    const couplingShowCoreInput = this.root.querySelector<HTMLInputElement>("[data-property-coupling-show-core]");
    const couplingColorInput = this.root.querySelector<HTMLInputElement>("[data-property-coupling-color]");
    const couplingColorSwatches = this.root.querySelectorAll<HTMLButtonElement>("[data-coupling-color-swatch]");
    const couplingCreateButton = this.root.querySelector<HTMLButtonElement>("[data-property-coupling-create]");
    const noteForm = this.root.querySelector<HTMLElement>("[data-property-note-form]");
    const netForm = this.root.querySelector<HTMLElement>("[data-property-net-form]");
    const netNameRow = this.root.querySelector<HTMLElement>("[data-property-net-name-row]");
    const netNameInput = this.root.querySelector<HTMLInputElement>("[data-property-net-name]");
    const netLabelRow = this.root.querySelector<HTMLElement>("[data-property-label-row]");
    const netLabelInput = this.root.querySelector<HTMLInputElement>("[data-property-net-label]");
    const netMessage = this.root.querySelector<HTMLElement>("[data-property-net-message]");
    const networkColorRow = this.root.querySelector<HTMLElement>("[data-property-network-color-row]");
    const networkColorInput = this.root.querySelector<HTMLInputElement>("[data-property-network-color]");
    const networkColorSwatches = this.root.querySelectorAll<HTMLButtonElement>("[data-network-color-swatch]");
    const wireLineWidthRow = this.root.querySelector<HTMLElement>("[data-property-wire-line-width-row]");
    const wireLineWidthControl = this.root.querySelector<HTMLElement>("[data-property-wire-line-width]");
    const wireStartMarkerRow = this.root.querySelector<HTMLElement>("[data-property-wire-start-marker-row]");
    const wireStartMarkerControl = this.root.querySelector<HTMLElement>("[data-property-wire-start-marker]");
    const wireEndMarkerRow = this.root.querySelector<HTMLElement>("[data-property-wire-end-marker-row]");
    const wireEndMarkerControl = this.root.querySelector<HTMLElement>("[data-property-wire-end-marker]");
    const wireDigitalSlashRow = this.root.querySelector<HTMLElement>("[data-property-wire-digital-slash-row]");
    const wireDigitalSlashInput = this.root.querySelector<HTMLInputElement>("[data-property-wire-digital-slash]");
    const wireDigitalLabelRow = this.root.querySelector<HTMLElement>("[data-property-wire-digital-label-row]");
    const wireDigitalLabelInput = this.root.querySelector<HTMLInputElement>("[data-property-wire-digital-label]");
    const cellRow = this.root.querySelector<HTMLElement>("[data-property-cell-row]");
    const cellSelect = this.root.querySelector<HTMLSelectElement>("[data-property-cell]");
    const identityFields = this.root.querySelector<HTMLElement>("[data-property-component-identity-fields]");
    const cachedIdentity = this.componentIdentity?.container === identityFields
      ? this.componentIdentity
      : null;
    const refInput = this.root.querySelector<HTMLInputElement>("[data-property-ref]")
      ?? cachedIdentity?.refInput ?? null;
    const labelVisibilityInput = this.root.querySelector<HTMLInputElement>("[data-property-label-visible]")
      ?? cachedIdentity?.labelVisibilityInput ?? null;
    const valueVisibilityRow = this.root.querySelector<HTMLElement>("[data-property-value-visibility-row]");
    const valueVisibilityInput = this.root.querySelector<HTMLInputElement>("[data-property-value-visible]");
    const componentColorRow = this.root.querySelector<HTMLElement>("[data-property-component-color-row]");
    const componentColorInput = this.root.querySelector<HTMLInputElement>("[data-property-component-color]");
    const libraryShapeStrokeFields = this.root.querySelector<HTMLElement>("[data-property-library-shape-stroke-fields]");
    const libraryShapeStrokeWidthInput = this.root.querySelector<HTMLInputElement>("[data-property-library-shape-stroke-width]");
    const libraryShapeLineStyleSelect = this.root.querySelector<HTMLSelectElement>("[data-property-library-shape-line-style]");
    const libraryShapeCornerRadiusRow = this.root.querySelector<HTMLElement>("[data-property-library-shape-corner-radius-row]");
    const libraryShapeCornerRadiusInput = this.root.querySelector<HTMLInputElement>("[data-property-library-shape-corner-radius]");
    const libraryShapeArrowSelects = this.root.querySelectorAll<HTMLSelectElement>("[data-property-library-shape-arrow]");
    const libraryShapeFillFields = this.root.querySelector<HTMLElement>("[data-property-library-shape-fill-fields]");
    const libraryShapeFillEnabledInput = this.root.querySelector<HTMLInputElement>("[data-property-library-shape-fill-enabled]");
    const libraryShapeFillColorInput = this.root.querySelector<HTMLInputElement>("[data-property-library-shape-fill-color]");
    const libraryShapeFillColorSwatches = this.root.querySelectorAll<HTMLButtonElement>("[data-library-shape-fill-color-swatch]");
    const libraryShapeFillOpacityInput = this.root.querySelector<HTMLInputElement>("[data-property-library-shape-fill-opacity]");
    const gainPolarityRow = this.root.querySelector<HTMLElement>("[data-property-gain-polarity-row]");
    const gainPolarityControl = this.root.querySelector<HTMLElement>("[data-property-gain-polarity]");
    const gainPolarityButtons = this.root.querySelectorAll<HTMLButtonElement>("[data-property-gain-polarity-value]");
    const differentialOutputsRow = this.root.querySelector<HTMLElement>("[data-property-differential-outputs-row]");
    const differentialOutputsInput = this.root.querySelector<HTMLInputElement>("[data-property-differential-outputs-same]");
    const valueRow = this.root.querySelector<HTMLElement>("[data-property-value-row]");
    const valueLabel = this.root.querySelector<HTMLElement>("[data-property-value-label]");
    const valueInput = this.root.querySelector<HTMLInputElement>("[data-property-value]");
    const valueUnit = this.root.querySelector<HTMLElement>("[data-property-value-unit]");
    const vsourceFields = this.root.querySelector<HTMLElement>("[data-property-vsource-fields]");
    const inductorFields = this.root.querySelector<HTMLElement>("[data-property-inductor-fields]");
    const inductorLayoutRow = this.root.querySelector<HTMLElement>("[data-property-inductor-layout-row]");
    const inductorLayoutSelect = this.root.querySelector<HTMLSelectElement>("[data-property-inductor-layout]");
    const inductorTapControl = this.root.querySelector<HTMLElement>("[data-property-inductor-tap]");
    const inductorDotControl = this.root.querySelector<HTMLElement>("[data-property-inductor-dot]");
    const inductorCouplingList = this.root.querySelector<HTMLElement>("[data-property-inductor-coupling-list]");
    const inductorAddCouplingButton = this.root.querySelector<HTMLButtonElement>("[data-property-inductor-add-coupling]");
    const rectangleFields = this.root.querySelector<HTMLElement>("[data-property-rectangle-fields]");
    const triangleFields = this.root.querySelector<HTMLElement>("[data-property-triangle-fields]");
    const triangleInputs = this.root.querySelectorAll<HTMLInputElement>("[data-property-triangle-pins]");
    const rectangleInputs = this.root.querySelectorAll<HTMLInputElement>("[data-property-rectangle]");
    const timeDomainRow = this.root.querySelector<HTMLElement>("[data-property-time-domain-row]");
    const timeDomainControl = this.root.querySelector<HTMLElement>("[data-property-time-domain]");
    const timeDomainButtons = this.root.querySelectorAll<HTMLButtonElement>("[data-property-time-domain-value]");
    const variantRow = this.root.querySelector<HTMLElement>("[data-property-variant-row]");
    const variantLabel = this.root.querySelector<HTMLElement>("[data-property-variant-label]");
    const variantSelect = this.root.querySelector<HTMLSelectElement>("[data-property-variant]");
    const variantSegmented = this.root.querySelector<HTMLElement>("[data-property-variant-segmented]");
    const scaleRow = this.root.querySelector<HTMLElement>("[data-property-scale-row]");
    const scaleSegmented = this.root.querySelector<HTMLElement>("[data-property-scale-segmented]");
    if (!scaleRow || !scaleSegmented) return null;
    const clockRow = this.root.querySelector<HTMLElement>("[data-property-clock-row]");
    const clockSelect = this.root.querySelector<HTMLSelectElement>("[data-property-clock]");
    const clockSegmented = this.root.querySelector<HTMLElement>("[data-property-clock-segmented]");
    const dffRows = this.root.querySelectorAll<HTMLElement>("[data-property-dff-row]");
    const filterKindRow = this.root.querySelector<HTMLElement>("[data-property-filter-kind-row]");
    const filterKindSelect = this.root.querySelector<HTMLSelectElement>("[data-property-filter-kind]");
    const mosPinsRow = this.root.querySelector<HTMLElement>("[data-property-mos-pins-row]");
    const mosPinsSegmented = this.root.querySelector<HTMLElement>("[data-property-mos-pins-segmented]");
    const mosGateStyleRow = this.root.querySelector<HTMLElement>("[data-property-mos-gate-style-row]");
    const mosGateStyleInput = this.root.querySelector<HTMLInputElement>("[data-property-mos-gate-style]");
    const mosThickGateRow = this.root.querySelector<HTMLElement>("[data-property-mos-thick-gate-row]");
    const mosThickGateInput = this.root.querySelector<HTMLInputElement>("[data-property-mos-thick-gate]");
    const mosArrowRow = this.root.querySelector<HTMLElement>("[data-property-mos-arrow-row]");
    const mosArrowSegmented = this.root.querySelector<HTMLElement>("[data-property-mos-arrow-segmented]");
    const transistorCircleRow = this.root.querySelector<HTMLElement>("[data-property-transistor-circle-row]");
    const transistorCircleControl = this.root.querySelector<HTMLElement>("[data-property-transistor-circle]");
    const transistorCircleButtons = this.root.querySelectorAll<HTMLButtonElement>("[data-property-transistor-circle-value]");
    const pinVisibilityRow = this.root.querySelector<HTMLElement>("[data-property-pin-visibility-row]");
    const noteTextColorRow = this.root.querySelector<HTMLElement>("[data-property-note-text-color-row]");
    const noteTextColorInput = this.root.querySelector<HTMLInputElement>("[data-property-note-text-color]");
    const noteTextColorSwatches = this.root.querySelectorAll<HTMLButtonElement>("[data-note-text-color-swatch]");
    const noteBackgroundRow = this.root.querySelector<HTMLElement>("[data-property-note-background-row]");
    const noteBackgroundInput = this.root.querySelector<HTMLInputElement>("[data-property-note-background]");
    const noteFontSizeRow = this.root.querySelector<HTMLElement>("[data-property-note-font-size-row]");
    const noteFontSizeInput = this.root.querySelector<HTMLInputElement>("[data-property-note-font-size]");
    const noteFormatRow = this.root.querySelector<HTMLElement>("[data-property-note-format-row]");
    const noteFormatSelect = this.root.querySelector<HTMLSelectElement>("[data-property-note-format]");
    const noteFormatSegmented = this.root.querySelector<HTMLElement>("[data-property-note-format-segmented]");
    const noteWidthRow = this.root.querySelector<HTMLElement>("[data-property-note-width-row]");
    const noteWidthInput = this.root.querySelector<HTMLInputElement>("[data-property-note-width]");
    const noteSwatches = this.root.querySelectorAll<HTMLButtonElement>("[data-note-background-swatch]");
    const componentColorSwatches = this.root.querySelectorAll<HTMLButtonElement>("[data-component-color-swatch]");
    if (!mosThickGateRow || !mosThickGateInput) return null;
    if (!empty || !componentForm || !couplingForm || !couplingPair || !couplingExistingFields || !couplingCoefficientInput || !couplingLabelModeControl || !couplingShowLabelInput || !couplingShowArcInput || !couplingShowCoreInput || !couplingColorInput || !couplingCreateButton || !noteForm || !cellRow || !cellSelect || !refInput || !labelVisibilityInput || !componentColorRow || !componentColorInput || !gainPolarityRow || !gainPolarityControl || gainPolarityButtons.length !== 3 || !valueRow || !valueLabel || !valueInput || !valueUnit || !inductorFields || !inductorTapControl || !inductorDotControl || !inductorCouplingList || !inductorAddCouplingButton || !timeDomainRow || !timeDomainControl || timeDomainButtons.length !== 2 || !variantRow || !variantLabel || !variantSelect || !variantSegmented || !clockRow || !clockSelect || !clockSegmented || dffRows.length !== 5 || !filterKindRow || !filterKindSelect || !mosPinsRow || !mosPinsSegmented || !mosGateStyleRow || !mosGateStyleInput || !mosArrowRow || !mosArrowSegmented || !transistorCircleRow || !transistorCircleControl || transistorCircleButtons.length !== 2 || !pinVisibilityRow || !noteBackgroundRow || !noteBackgroundInput || !noteFontSizeRow || !noteFontSizeInput || !noteFormatRow || !noteFormatSelect || !noteFormatSegmented || !noteWidthRow || !noteWidthInput) {
      return null;
    }
    const refRow = refInput.closest<HTMLElement>(".property-row");
    const labelRow = labelVisibilityInput.closest<HTMLElement>(".property-row");
    if (identityFields && refRow && labelRow) {
      this.componentIdentity = { container: identityFields, refRow, labelRow, refInput, labelVisibilityInput };
    }
    return {
      empty,
      componentForm,
      couplingForm,
      couplingPair,
      couplingExistingFields,
      couplingCoefficientInput,
      couplingLabelModeControl,
      couplingShowLabelInput,
      couplingShowArcInput,
      couplingShowCoreInput,
      couplingColorInput,
      couplingColorSwatches,
      couplingCreateButton,
      noteForm,
      netForm,
      netNameRow,
      netNameInput,
      netLabelRow,
      netLabelInput,
      netMessage,
      networkColorRow,
      networkColorInput,
      networkColorSwatches,
      wireLineWidthRow,
      wireLineWidthControl,
      wireStartMarkerRow,
      wireStartMarkerControl,
      wireEndMarkerRow,
      wireEndMarkerControl,
      wireDigitalSlashRow,
      wireDigitalSlashInput,
      wireDigitalLabelRow,
      wireDigitalLabelInput,
      cellRow,
      cellSelect,
      identityFields,
      refInput,
      labelVisibilityInput,
      valueVisibilityRow,
      valueVisibilityInput,
      componentColorRow,
      componentColorInput,
      libraryShapeStrokeFields,
      libraryShapeStrokeWidthInput,
      libraryShapeLineStyleSelect,
      libraryShapeCornerRadiusRow,
      libraryShapeCornerRadiusInput,
      libraryShapeArrowSelects,
      libraryShapeFillFields,
      libraryShapeFillEnabledInput,
      libraryShapeFillColorInput,
      libraryShapeFillColorSwatches,
      libraryShapeFillOpacityInput,
      gainPolarityRow,
      gainPolarityControl,
      gainPolarityButtons,
      differentialOutputsRow,
      differentialOutputsInput,
      valueRow,
      valueLabel,
      valueInput,
      valueUnit,
      vsourceFields,
      inductorFields,
      inductorLayoutRow,
      inductorLayoutSelect,
      inductorTapControl,
      inductorDotControl,
      inductorCouplingList,
      inductorAddCouplingButton,
      rectangleFields,
      triangleFields,
      triangleInputs,
      rectangleInputs,
      timeDomainRow,
      timeDomainControl,
      timeDomainButtons,
      variantRow,
      variantLabel,
      variantSelect,
      variantSegmented,
      scaleRow,
      scaleSegmented,
      clockRow,
      clockSelect,
      clockSegmented,
      dffRows,
      filterKindRow,
      filterKindSelect,
      mosPinsRow,
      mosPinsSegmented,
      mosGateStyleRow,
      mosGateStyleInput,
      mosThickGateRow,
      mosThickGateInput,
      mosArrowRow,
      mosArrowSegmented,
      transistorCircleRow,
      transistorCircleControl,
      transistorCircleButtons,
      pinVisibilityRow,
      noteTextColorRow,
      noteTextColorInput,
      noteTextColorSwatches,
      noteBackgroundRow,
      noteBackgroundInput,
      noteFontSizeRow,
      noteFontSizeInput,
      noteFormatRow,
      noteFormatSelect,
      noteFormatSegmented,
      noteWidthRow,
      noteWidthInput,
      noteSwatches,
      componentColorSwatches
    };
  }

  private reset(elements: PropertyPanelElements) {
    elements.empty.hidden = true;
    elements.componentForm.hidden = true;
    elements.couplingForm.hidden = true;
    elements.couplingForm.dataset.couplingId = "";
    elements.couplingExistingFields.hidden = true;
    elements.couplingCreateButton.hidden = true;
    elements.noteForm.hidden = true;
    if (elements.netForm) elements.netForm.hidden = true;
    if (elements.netNameRow) elements.netNameRow.hidden = true;
    if (elements.networkColorRow) elements.networkColorRow.hidden = true;
    if (elements.wireLineWidthRow) elements.wireLineWidthRow.hidden = true;
    if (elements.wireStartMarkerRow) elements.wireStartMarkerRow.hidden = true;
    if (elements.wireEndMarkerRow) elements.wireEndMarkerRow.hidden = true;
    if (elements.wireDigitalSlashRow) elements.wireDigitalSlashRow.hidden = true;
    if (elements.wireDigitalLabelRow) elements.wireDigitalLabelRow.hidden = true;
    elements.cellRow.hidden = true;
    if (elements.valueVisibilityRow) elements.valueVisibilityRow.hidden = true;
    elements.valueRow.hidden = true;
    if (elements.vsourceFields) elements.vsourceFields.hidden = true;
    elements.inductorFields.hidden = true;
    if (elements.inductorLayoutRow) elements.inductorLayoutRow.hidden = true;
    elements.inductorCouplingList.replaceChildren();
    if (elements.rectangleFields) elements.rectangleFields.hidden = true;
    if (elements.triangleFields) elements.triangleFields.hidden = true;
    elements.timeDomainRow.hidden = true;
    elements.valueUnit.hidden = true;
    elements.valueUnit.textContent = "";
    elements.gainPolarityRow.hidden = true;
    if (elements.differentialOutputsRow) elements.differentialOutputsRow.hidden = true;
    elements.variantRow.hidden = true;
    elements.scaleRow.hidden = true;
    elements.clockRow.hidden = true;
    elements.dffRows.forEach((row) => {
      row.hidden = true;
      row.querySelectorAll<HTMLButtonElement>("[data-property-dff-setting]").forEach((button) => {
        button.classList.remove("is-selected");
        button.ariaPressed = "false";
      });
    });
    elements.filterKindRow.hidden = true;
    elements.mosPinsRow.hidden = true;
    elements.mosGateStyleRow.hidden = true;
    elements.mosThickGateRow.hidden = true;
    elements.mosArrowRow.hidden = true;
    elements.transistorCircleRow.hidden = true;
    elements.pinVisibilityRow.hidden = true;
    elements.componentColorRow.hidden = true;
    if (elements.libraryShapeStrokeFields) elements.libraryShapeStrokeFields.hidden = true;
    if (elements.libraryShapeCornerRadiusRow) elements.libraryShapeCornerRadiusRow.hidden = true;
    if (elements.libraryShapeFillFields) elements.libraryShapeFillFields.hidden = true;
    elements.noteBackgroundRow.hidden = true;
    if (elements.noteTextColorRow) elements.noteTextColorRow.hidden = true;
    elements.noteFontSizeRow.hidden = true;
    elements.noteFormatRow.hidden = true;
    elements.noteWidthRow.hidden = true;
    elements.cellSelect.replaceChildren();
    elements.variantSelect.replaceChildren();
    elements.variantSelect.hidden = false;
    elements.variantSegmented.replaceChildren();
    elements.variantSegmented.hidden = true;
    elements.clockSelect.replaceChildren();
    elements.clockSelect.hidden = false;
    elements.clockSegmented.replaceChildren();
    elements.clockSegmented.hidden = true;
    elements.filterKindSelect.replaceChildren();
    elements.timeDomainControl.classList.remove("is-mixed");
    elements.timeDomainControl.dataset.propertyMixed = "false";
    this.syncMixedAriaLabel(elements.timeDomainControl, false);
    elements.timeDomainButtons.forEach((button) => {
      button.classList.remove("is-selected");
      button.ariaPressed = "false";
    });
    elements.gainPolarityButtons.forEach((button) => {
      button.classList.remove("is-selected");
      button.ariaPressed = "false";
    });
    elements.mosPinsSegmented.replaceChildren();
    elements.mosArrowSegmented.replaceChildren();
    elements.pinVisibilityRow.replaceChildren();
    elements.mosGateStyleInput.checked = false;
    elements.mosThickGateInput.checked = false;
    elements.mosThickGateInput.indeterminate = false;
    elements.transistorCircleControl.classList.remove("is-mixed");
    elements.transistorCircleControl.dataset.propertyMixed = "false";
    this.syncMixedAriaLabel(elements.transistorCircleControl, false);
    elements.transistorCircleButtons.forEach((button) => {
      button.classList.remove("is-selected");
      button.ariaPressed = "false";
    });
    [...elements.noteTextColorSwatches, ...elements.noteSwatches, ...elements.componentColorSwatches, ...elements.networkColorSwatches, ...elements.couplingColorSwatches, ...elements.libraryShapeFillColorSwatches].forEach((swatch) => {
      swatch.classList.remove("is-selected");
      swatch.ariaPressed = "false";
    });
  }

  private syncNetwork(elements: PropertyPanelElements, network: NonNullable<SchematicPropertyPanelInput["network"]>) {
    if (!elements.netForm || !elements.netNameInput || !elements.netLabelRow || !elements.netLabelInput || !elements.netMessage) {
      this.syncEmpty(elements, true);
      return;
    }
    elements.netForm.hidden = false;
    if (elements.netNameRow) elements.netNameRow.hidden = !network.netName;
    if (network.netName) this.syncReadonlyAggregate(elements.netNameInput, network.netName);
    elements.netLabelRow.hidden = !network.label;
    if (network.label) this.syncTextAggregate(elements.netLabelInput, network.label.name);
    elements.netMessage.textContent = localizeSchematicStatus(network.label?.message ?? "");
    elements.netMessage.hidden = !network.label?.message;
    if (network.color && elements.networkColorRow && elements.networkColorInput) {
      elements.networkColorRow.hidden = false;
      elements.networkColorInput.ariaLabel = parameterLabel("Ink color");
      this.syncColorAggregate(
        elements.networkColorInput,
        elements.networkColorSwatches,
        network.color,
        DEFAULT_NETWORK_COLOR,
        "networkColorSwatch",
        "default"
      );
    }
    if (network.wire) {
      if (elements.wireLineWidthRow && elements.wireLineWidthControl) {
        elements.wireLineWidthRow.hidden = false;
        this.syncSegmentedButtons(
          elements.wireLineWidthControl,
          WIRE_LINE_WIDTH_OPTIONS,
          network.wire.lineWidth,
          "propertyWireLineWidthValue"
        );
      }
      if (elements.wireStartMarkerRow && elements.wireStartMarkerControl) {
        elements.wireStartMarkerRow.hidden = false;
        this.syncSegmentedButtons(
          elements.wireStartMarkerControl,
          WIRE_ENDPOINT_MARKER_OPTIONS,
          network.wire.startMarker,
          "propertyWireStartMarkerValue"
        );
      }
      if (elements.wireEndMarkerRow && elements.wireEndMarkerControl) {
        elements.wireEndMarkerRow.hidden = false;
        this.syncSegmentedButtons(
          elements.wireEndMarkerControl,
          WIRE_ENDPOINT_MARKER_OPTIONS,
          network.wire.endMarker,
          "propertyWireEndMarkerValue"
        );
      }
      if (elements.wireDigitalSlashRow && elements.wireDigitalSlashInput) {
        elements.wireDigitalSlashRow.hidden = false;
        this.syncCheckboxAggregate(elements.wireDigitalSlashInput, network.wire.digitalSlash);
      }
      if (elements.wireDigitalLabelRow && elements.wireDigitalLabelInput) {
        elements.wireDigitalLabelRow.hidden = !network.wire.digitalLabel;
        elements.wireDigitalLabelInput.disabled = false;
        if (network.wire.digitalLabel) {
          this.syncTextAggregate(elements.wireDigitalLabelInput, network.wire.digitalLabel);
        }
      }
    }
  }

  private syncEmpty(elements: PropertyPanelElements, hasSelection: boolean) {
    elements.empty.textContent = parameterLabel(hasSelection ? "No common editable properties." : "No object selected.");
    elements.empty.hidden = false;
  }

  private syncNote(elements: PropertyPanelElements, note: SchematicPropertyPanelNoteInput) {
    elements.noteForm.hidden = false;
    if (elements.noteTextColorRow) elements.noteTextColorRow.hidden = !note.textColor;
    if (elements.noteTextColorInput && note.textColor) this.syncColorAggregate(
      elements.noteTextColorInput, elements.noteTextColorSwatches, note.textColor,
      DEFAULT_NOTE_TEXT_COLOR, "noteTextColorSwatch", "default"
    );
    elements.noteBackgroundRow.hidden = false;
    this.syncColorAggregate(
      elements.noteBackgroundInput,
      elements.noteSwatches,
      note.backgroundColor,
      "#ffffe8",
      "noteBackgroundSwatch",
      "none"
    );
    elements.noteFontSizeRow.hidden = false;
    this.syncTextAggregate(elements.noteFontSizeInput, note.fontSizePx, String);
    elements.noteFormatRow.hidden = false;
    elements.noteFormatSelect.hidden = true;
    this.syncSegmentedButtons(
      elements.noteFormatSegmented,
      [
        { value: "plain", label: "Plain" },
        { value: "markdown", label: "Markdown" }
      ],
      note.format,
      "propertyNoteFormatValue"
    );
    elements.noteWidthRow.hidden = !note.widthPx;
    if (note.widthPx) this.syncTextAggregate(elements.noteWidthInput, note.widthPx, String);
  }

  private syncVoltageSourceFields(container: HTMLElement | null, fields: SchematicPropertyPanelComponentInput["sourceFields"]) {
    if (!container) return;
    container.hidden = !fields;
    if (!fields) return;
    const signature = JSON.stringify(fields.map(field => [field.key, field.type, field.options]));
    if (container.dataset.fields !== signature) {
      container.replaceChildren(...fields.map(field => {
        const row = this.root.ownerDocument.createElement("label");
        row.className = "property-row";
        const label = this.root.ownerDocument.createElement("span");
        const input = this.root.ownerDocument.createElement(field.options ? "select" : "input");
        if (field.options) {
          input.dataset.propertyVsourceOption = field.key;
        } else {
          const text = input as HTMLInputElement;
          text.type = field.type ?? "text";
          text.spellcheck = false;
          text.autocomplete = "off";
          if (field.min !== undefined) text.min = String(field.min);
          if (field.max !== undefined) text.max = String(field.max);
          if (field.type === "number") text.step = "1";
          text.dataset.propertyVsourceField = field.key;
        }
        row.append(label, input);
        return row;
      }));
      container.dataset.fields = signature;
    }
    const inputs = container.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select");
    fields.forEach((field, index) => {
      const input = inputs[index];
      const caption = parameterLabel(field.label);
      input.setAttribute("aria-label", caption);
      input.previousElementSibling!.textContent = caption;
      if (field.options) {
        const select = input as HTMLSelectElement;
        select.replaceChildren(...field.options.map(value => this.createOption(value, value || "Default")));
        this.syncSelectAggregate(select, field.value);
      } else {
        this.syncTextAggregate(input as HTMLInputElement, field.value);
      }
    });
  }

  private syncComponent(elements: PropertyPanelElements, component: SchematicPropertyPanelComponentInput) {
    elements.componentForm.hidden = false;
    elements.cellRow.hidden = !component.cellType || !component.cells;
    if (component.cellType && component.cells) {
      elements.cellSelect.replaceChildren(
        ...component.cells.map((cell) => this.createOption(cell.type, componentName(cell.type, cell.label), cell.disabled))
      );
      this.syncSelectAggregate(elements.cellSelect, component.cellType);
    }
    const identity = this.componentIdentity?.container === elements.identityFields
      ? this.componentIdentity
      : null;
    if (identity) {
      if (component.libraryShape) identity.container.replaceChildren();
      else if (!identity.container.contains(identity.refRow)) {
        identity.container.replaceChildren(identity.refRow, identity.labelRow);
      }
    } else {
      const refRow = elements.refInput.closest<HTMLElement>(".property-row");
      const labelVisibilityRow = elements.labelVisibilityInput.closest<HTMLElement>(".property-row");
      if (refRow) refRow.hidden = !!component.libraryShape;
      if (labelVisibilityRow) labelVisibilityRow.hidden = !!component.libraryShape;
    }
    this.syncTextAggregate(elements.refInput, component.ref);
    this.syncCheckboxAggregate(elements.labelVisibilityInput, component.labelVisible);
    if (elements.valueVisibilityRow) {
      elements.valueVisibilityRow.hidden = component.valueVisible === undefined;
    }
    if (component.valueVisible && elements.valueVisibilityInput) {
      this.syncCheckboxAggregate(elements.valueVisibilityInput, component.valueVisible);
    }
    elements.componentColorRow.hidden = false;
    this.syncColorAggregate(
      elements.componentColorInput,
      elements.componentColorSwatches,
      component.color,
      DEFAULT_COMPONENT_COLOR,
      "componentColorSwatch",
      "default"
    );
    this.syncLibraryShapeStyle(elements, component.libraryShapeStyle);
    elements.gainPolarityRow.hidden = component.gainPolarity === undefined;
    const gainPolarity = component.gainPolarity;
    elements.gainPolarityControl.classList.toggle("is-mixed", gainPolarity?.state === "mixed");
    elements.gainPolarityControl.dataset.propertyMixed = String(gainPolarity?.state === "mixed");
    this.syncMixedAriaLabel(elements.gainPolarityControl, gainPolarity?.state === "mixed");
    elements.gainPolarityButtons.forEach((button) => {
      const selected = !!gainPolarity
        && aggregateIsUniform(gainPolarity)
        && button.dataset.propertyGainPolarityValue === gainPolarity.value;
      button.classList.toggle("is-selected", selected);
      button.ariaPressed = String(selected);
    });

    if (elements.differentialOutputsRow) {
      elements.differentialOutputsRow.hidden = component.differentialOutputsSame === undefined;
    }
    if (elements.differentialOutputsInput && component.differentialOutputsSame) {
      this.syncCheckboxAggregate(elements.differentialOutputsInput, component.differentialOutputsSame);
    }

    elements.valueRow.hidden = !component.value;
    if (component.value) {
      elements.valueLabel.textContent = parameterLabel(component.value.label);
      this.syncTextAggregate(elements.valueInput, component.value.value);
      if (component.value.value.state === "uniform") {
        elements.valueInput.placeholder = component.value.placeholder;
      }
      elements.valueUnit.textContent = component.value.unit ?? "";
      elements.valueUnit.hidden = !component.value.unit;
    }
    this.syncVoltageSourceFields(elements.vsourceFields, component.sourceFields);
    if (elements.inductorLayoutRow) elements.inductorLayoutRow.hidden = !component.inductorLayout;
    if (component.inductorLayout && elements.inductorLayoutSelect) {
      elements.inductorLayoutSelect.replaceChildren(...INDUCTOR_LAYOUT_OPTIONS.map(option => this.createOption(option.id, option.label)));
      this.syncSelectAggregate(elements.inductorLayoutSelect, component.inductorLayout);
    }
    this.syncInductor(elements, component.inductor);
    if (elements.rectangleFields) elements.rectangleFields.hidden = !component.rectangle;
    if (elements.triangleFields) elements.triangleFields.hidden = true;
    if (component.rectangle && elements.rectangleInputs.length === 2) {
      elements.rectangleInputs.forEach((input) => {
        const property = input.dataset.propertyRectangle as RectangleProperty;
        this.syncTextAggregate(
          input,
          component.rectangle![property === "width" ? "widthGrid" : "heightGrid"],
          String
        );
      });
    }

    elements.timeDomainRow.hidden = component.timeDomain === undefined;
    const timeDomain = component.timeDomain;
    const mixedTimeDomain = timeDomain?.state === "mixed";
    elements.timeDomainControl.classList.toggle("is-mixed", mixedTimeDomain);
    elements.timeDomainControl.dataset.propertyMixed = String(mixedTimeDomain);
    this.syncMixedAriaLabel(elements.timeDomainControl, mixedTimeDomain);
    elements.timeDomainButtons.forEach((button) => {
      const selected = !!timeDomain
        && aggregateIsUniform(timeDomain)
        && button.dataset.propertyTimeDomainValue === timeDomain.value;
      button.classList.toggle("is-selected", selected);
      button.ariaPressed = String(selected);
    });

    elements.variantRow.hidden = !!component.mosView || !component.variants;
    if (component.variants) {
      const variantLabel = component.variants.label ?? "View";
      elements.variantRow.classList.toggle("is-source-type", variantLabel === "Source type");
      elements.variantLabel.textContent = parameterLabel(variantLabel);
      elements.variantSegmented.ariaLabel = uiFormat("parameter.componentCaption", "Component {label}", {
        label: schematicLanguage() === "zh" ? parameterLabel(variantLabel) : variantLabel.toLowerCase()
      });
      elements.variantSegmented.dataset.propertyBaseAriaLabel = elements.variantSegmented.ariaLabel ?? "";
      elements.variantSelect.replaceChildren(
        ...component.variants.options.map((variant) => this.createVariantOption(variant))
      );
      const useSegmented = component.variants.options.length <= 3;
      elements.variantSelect.hidden = useSegmented;
      elements.variantSegmented.hidden = !useSegmented;
      this.syncSelectAggregate(elements.variantSelect, component.variants.value);
      this.syncSegmentedButtons(
        elements.variantSegmented,
        component.variants.options.map((variant) => ({ value: variant.id, label: variant.label })),
        component.variants.value,
        "propertyVariantValue"
      );
    }
    elements.scaleRow.hidden = !component.scale;
    if (component.scale) this.syncSegmentedButtons(elements.scaleSegmented,
      component.scale.options.map(option => ({ value: option.id, label: option.label })), component.scale.value, "propertyScaleValue");
    elements.clockRow.hidden = !component.clock;
    if (component.clock) {
      elements.clockSelect.replaceChildren(
        ...component.clock.options.map((option) => this.createVariantOption(option))
      );
      const useSegmented = component.clock.options.length <= 3;
      elements.clockSelect.hidden = useSegmented;
      elements.clockSegmented.hidden = !useSegmented;
      this.syncSelectAggregate(elements.clockSelect, component.clock.value);
      this.syncSegmentedButtons(
        elements.clockSegmented,
        component.clock.options.map((option) => ({ value: option.id, label: option.label })),
        component.clock.value,
        "propertyClockValue"
      );
    }
    this.syncDff(elements, component.dff);
    elements.filterKindRow.hidden = !component.filterKind;
    if (component.filterKind) {
      elements.filterKindSelect.replaceChildren(
        ...component.filterKind.options.map((option) => this.createOption(option.value, option.label))
      );
      this.syncSelectAggregate(elements.filterKindSelect, component.filterKind.value);
    }
    if (component.mosView) this.syncMosView(elements, component.mosView);
    elements.mosThickGateRow.hidden = !component.mosThickGate;
    if (component.mosThickGate) this.syncCheckboxAggregate(elements.mosThickGateInput, component.mosThickGate);
    elements.transistorCircleRow.hidden = !component.transistorCircle;
    if (component.transistorCircle) {
      const mixed = component.transistorCircle.state === "mixed";
      elements.transistorCircleControl.classList.toggle("is-mixed", mixed);
      elements.transistorCircleControl.dataset.propertyMixed = String(mixed);
      this.syncMixedAriaLabel(elements.transistorCircleControl, mixed);
      elements.transistorCircleButtons.forEach((button) => {
        const selected = aggregateIsUniform(component.transistorCircle!)
          && button.dataset.propertyTransistorCircleValue === String(component.transistorCircle.value);
        button.classList.toggle("is-selected", selected);
        button.ariaPressed = String(selected);
      });
    }
    const pinSettings = component.pinSettings ?? [];
    elements.pinVisibilityRow.hidden = pinSettings.length === 0;
    const showPinModes = pinSettings.some((pin) => pin.modeEditable);
    elements.pinVisibilityRow.replaceChildren(
      ...(pinSettings.length > 0 ? [this.createPinSettingsHeader(showPinModes)] : []),
      ...pinSettings.map((pin) => this.createPinSettingControl(pin))
    );
  }

  private syncLibraryShapeStyle(
    elements: PropertyPanelElements,
    style: SchematicPropertyPanelComponentInput["libraryShapeStyle"]
  ) {
    const strokeFields = elements.libraryShapeStrokeFields;
    const strokeWidth = elements.libraryShapeStrokeWidthInput;
    const lineStyle = elements.libraryShapeLineStyleSelect;
    const fillFields = elements.libraryShapeFillFields;
    const fillEnabled = elements.libraryShapeFillEnabledInput;
    const fillColor = elements.libraryShapeFillColorInput;
    const fillOpacity = elements.libraryShapeFillOpacityInput;
    if (!strokeFields || !strokeWidth || !lineStyle || !fillFields || !fillEnabled || !fillColor || !fillOpacity) return;
    strokeFields.hidden = !style;
    fillFields.hidden = !style?.fillEnabled;
    elements.libraryShapeArrowSelects.forEach(select => {
      const field = select.dataset.propertyLibraryShapeArrow;
      const fields = LIBRARY_SHAPE_ARROW_FIELDS.find(pair => pair.some(property => property === field));
      if (!fields) return;
      const [typeField, sizeField] = fields;
      const isSize = field === sizeField;
      const option = style?.[isSize ? sizeField : typeField];
      const type = style?.[typeField];
      const row = select.closest("label");
      if (row) row.hidden = !option;
      select.disabled = !option || (isSize && type?.state === "uniform" && type.value === "none");
      if (option) {
        select.querySelector('option[value=""][disabled]')?.remove();
        this.syncSelectAggregate(select, option);
      }
    });
    if (!style) return;

    this.syncTextAggregate(strokeWidth, style.strokeWidth, String);
    lineStyle.replaceChildren(...LIBRARY_SHAPE_LINE_STYLE_OPTIONS.map(option =>
      this.createOption(option.value, option.label)
    ));
    this.syncSelectAggregate(lineStyle, style.lineStyle);
    if (elements.libraryShapeCornerRadiusRow) {
      elements.libraryShapeCornerRadiusRow.hidden = !style.cornerRadius;
    }
    if (style.cornerRadius && elements.libraryShapeCornerRadiusInput) {
      this.syncTextAggregate(elements.libraryShapeCornerRadiusInput, style.cornerRadius, String);
    }
    if (!style.fillEnabled || !style.fillColor || !style.fillOpacity) return;
    this.syncCheckboxAggregate(fillEnabled, style.fillEnabled);
    this.syncColorAggregate(
      fillColor,
      elements.libraryShapeFillColorSwatches,
      style.fillColor.state === "uniform" && style.fillColor.value === DEFAULT_LIBRARY_SHAPE_STYLE.fillColor
        ? { state: "uniform", value: null } : style.fillColor,
      DEFAULT_LIBRARY_SHAPE_STYLE.fillColor,
      "libraryShapeFillColorSwatch",
      "default"
    );
    this.syncTextAggregate(fillOpacity, style.fillOpacity, String);
    const fillDisabled = style.fillEnabled.state === "uniform" && !style.fillEnabled.value;
    fillColor.disabled = fillDisabled;
    elements.libraryShapeFillColorSwatches.forEach(swatch => { swatch.disabled = fillDisabled; });
    fillOpacity.disabled = fillDisabled;
  }

  private syncInductor(
    elements: PropertyPanelElements,
    inductor: SchematicPropertyPanelInductorInput | undefined
  ) {
    elements.inductorFields.hidden = !inductor;
    if (!inductor) return;
    this.syncSegmentedButtons(
      elements.inductorTapControl,
      [
        { value: "none", label: "None" },
        { value: "top", label: "Top" },
        { value: "bottom", label: "Bot" }
      ],
      inductor.tap,
      "propertyInductorTapValue"
    );
    this.syncSegmentedButtons(
      elements.inductorDotControl,
      [
        { value: "none", label: "None" },
        { value: "p", label: "P" },
        { value: "n", label: "N" }
      ],
      inductor.dot,
      "propertyInductorDotValue"
    );
    elements.inductorCouplingList.replaceChildren(...inductor.couplings.map((coupling) => {
      const row = this.root.ownerDocument.createElement("div");
      row.className = "property-coupling-list-row";
      const label = this.root.ownerDocument.createElement("span");
      label.textContent = parameterLabel("Coupled");
      const partner = this.root.ownerDocument.createElement("span");
      partner.textContent = coupling.partnerRef;
      const button = this.root.ownerDocument.createElement("button");
      button.type = "button";
      button.textContent = parameterLabel("Edit");
      button.dataset.propertyInductorCouplingId = coupling.id;
      row.append(label, partner, button);
      return row;
    }));
    elements.inductorAddCouplingButton.disabled = !inductor.canAddCoupling;
    elements.inductorAddCouplingButton.ariaPressed = String(inductor.pickingCoupling);
    elements.inductorAddCouplingButton.classList.toggle("is-active", inductor.pickingCoupling);
  }

  private syncInductorCoupling(
    elements: PropertyPanelElements,
    coupling: SchematicPropertyPanelInductorCouplingInput
  ) {
    elements.couplingForm.hidden = false;
    elements.couplingForm.dataset.couplingId = coupling.id ?? "";
    elements.couplingPair.textContent = `${coupling.firstRef} - ${coupling.secondRef}`;
    elements.couplingExistingFields.hidden = !coupling.exists;
    elements.couplingCreateButton.hidden = coupling.exists;
    if (!coupling.exists || !coupling.id) return;
    elements.couplingCoefficientInput.dataset.couplingId = coupling.id;
    this.syncTextAggregate(
      elements.couplingCoefficientInput,
      uniformValue(coupling.coefficient ?? "")
    );
    this.syncSegmentedButtons(
      elements.couplingLabelModeControl,
      [
        { value: "coefficient", label: "k" },
        { value: "ratio", label: "Ratio", disabled: !coupling.ratioAvailable }
      ],
      uniformValue(coupling.labelMode ?? "coefficient"),
      "propertyCouplingLabelModeValue"
    );
    elements.couplingShowLabelInput.checked = coupling.showLabel === true;
    elements.couplingShowLabelInput.dataset.couplingId = coupling.id;
    elements.couplingShowArcInput.checked = coupling.showArc !== false;
    elements.couplingShowArcInput.dataset.couplingId = coupling.id;
    elements.couplingShowCoreInput.checked = coupling.showCore === true;
    elements.couplingShowCoreInput.dataset.couplingId = coupling.id;
    this.syncColorAggregate(
      elements.couplingColorInput,
      elements.couplingColorSwatches,
      coupling.color ?? uniformValue(null),
      DEFAULT_COMPONENT_COLOR,
      "couplingColorSwatch",
      "default"
    );
  }

  private createPinSettingsHeader(showModes: boolean) {
    const header = this.root.ownerDocument.createElement("div");
    header.className = `property-pin-header${showModes ? "" : " is-visibility-only"}`;
    (showModes ? ["Pin", "Show", "Role", "Sign"] : ["Pin", "Show"]).forEach((text) => {
      const label = this.root.ownerDocument.createElement("span");
    label.textContent = parameterLabel(text);
      header.append(label);
    });
    return header;
  }

  private syncDff(
    elements: PropertyPanelElements,
    dff: SchematicPropertyPanelComponentInput["dff"]
  ) {
    elements.dffRows.forEach((row) => {
      const property = row.dataset.propertyDffRow;
      if (!dff || !isDffSettingProperty(property)) {
        row.hidden = true;
        return;
      }
      const mode = property === "setActiveLevel" ? dff.setMode
        : property === "resetActiveLevel" ? dff.resetMode
          : null;
      row.hidden = !!mode && aggregateIsUniform(mode) && mode.value === "none";
      const aggregate = dff[property];
      const control = row.querySelector<HTMLElement>("[data-property-dff-control]");
      const mixed = aggregate.state === "mixed";
      control?.classList.toggle("is-mixed", mixed);
      if (control) {
        control.dataset.propertyMixed = String(mixed);
        this.syncMixedAriaLabel(control, mixed);
      }
      row.querySelectorAll<HTMLButtonElement>("[data-property-dff-setting]").forEach((button) => {
        const selected = aggregateIsUniform(aggregate)
          && button.dataset.propertyDffValue === aggregate.value;
        button.classList.toggle("is-selected", selected);
        button.ariaPressed = String(selected);
      });
    });
  }

  private createPinSettingControl(pin: SchematicPropertyPanelPinSetting) {
    const row = this.root.ownerDocument.createElement("div");
    row.className = `property-pin-row${pin.modeEditable ? "" : " is-visibility-only"}`;
    const label = this.root.ownerDocument.createElement("span");
    label.textContent = parameterLabel(pin.label);
    const visibilityInput = this.root.ownerDocument.createElement("input");
    visibilityInput.type = "checkbox";
    visibilityInput.className = "property-toggle";
    visibilityInput.ariaLabel = uiFormat("parameter.pinVisibility", "Show {pin} pin", { pin: parameterLabel(pin.label.toLowerCase()) });
    visibilityInput.dataset.propertyPinVisibilityId = pin.id;
    this.syncCheckboxAggregate(visibilityInput, pin.visible);
    if (!pin.modeEditable) {
      row.append(label, visibilityInput);
      return row;
    }
    const modeControl = this.root.ownerDocument.createElement("div");
    modeControl.className = "property-segmented property-segmented-compact";
    modeControl.ariaLabel = uiFormat("parameter.pinRole", "{pin} pin role", { pin: parameterLabel(pin.label) });
    this.syncSegmentedButtons(
      modeControl,
      [
        { value: "positive", label: "+" },
        { value: "negative", label: "−" },
        { value: "output", label: "Out" }
      ],
      pin.mode ?? { state: "mixed" },
      "propertyPinModeValue"
    );
    modeControl.querySelectorAll<HTMLButtonElement>("[data-property-pin-mode-value]").forEach((button) => {
      button.dataset.propertyPinModeId = pin.id;
    });
    const symbolInput = this.root.ownerDocument.createElement("input");
    symbolInput.type = "checkbox";
    symbolInput.className = "property-toggle";
    symbolInput.ariaLabel = uiFormat("parameter.pinSymbol", "Show {pin} pin role symbol", { pin: parameterLabel(pin.label.toLowerCase()) });
    symbolInput.dataset.propertyPinSymbolVisibilityId = pin.id;
    this.syncCheckboxAggregate(symbolInput, pin.symbolVisible ?? { state: "mixed" });
    symbolInput.disabled = pin.symbolEditable === false;
    row.append(label, visibilityInput, modeControl, symbolInput);
    return row;
  }

  private syncMosView(
    elements: PropertyPanelElements,
    settings: NonNullable<SchematicPropertyPanelComponentInput["mosView"]>
  ) {
    elements.mosPinsRow.hidden = false;
    elements.mosGateStyleRow.hidden = false;
    elements.mosArrowRow.hidden = false;
    this.syncSegmentedButtons(
      elements.mosPinsSegmented,
      [
        { value: "3pin", label: "3-pin" },
        { value: "4pin", label: "4-pin" }
      ],
      settings.pins,
      "propertyMosPinsValue"
    );
    this.syncCheckboxAggregate(elements.mosGateStyleInput, settings.gateStyle);
    this.syncSegmentedButtons(
      elements.mosArrowSegmented,
      [
        { value: "none", label: "None", disabled: !settings.noneAllowed },
        { value: "current", label: "Source" },
        { value: "bulk", label: "Bulk" }
      ],
      settings.arrow,
      "propertyMosArrowValue"
    );
  }

  private syncSegmentedButtons(
    container: HTMLElement,
    options: readonly { value: string; label: string; disabled?: boolean }[],
    selectedValue: AggregateValue<string>,
    datasetKey: string
  ) {
    const mixed = selectedValue.state === "mixed";
    container.classList.toggle("is-mixed", mixed);
    container.dataset.propertyMixed = String(mixed);
    this.syncMixedAriaLabel(container, mixed);
    container.replaceChildren(...options.map((option) => {
      const button = this.root.ownerDocument.createElement("button");
      button.type = "button";
      button.textContent = parameterLabel(option.label);
      button.dataset[datasetKey] = option.value;
      button.disabled = !!option.disabled;
      const selected = aggregateIsUniform(selectedValue) && option.value === selectedValue.value;
      button.classList.toggle("is-selected", selected);
      button.ariaPressed = String(selected);
      return button;
    }));
  }

  private createVariantOption(variant: SchematicPropertyPanelVariant) {
    return this.createOption(variant.id, variant.label);
  }

  private syncColorSwatches(
    swatches: NodeListOf<HTMLButtonElement>,
    selectedColor: AggregateValue<string | null>,
    datasetKey: "noteTextColorSwatch" | "noteBackgroundSwatch" | "componentColorSwatch" | "networkColorSwatch" | "couplingColorSwatch" | "libraryShapeFillColorSwatch",
    nullValue: "none" | "default"
  ) {
    swatches.forEach((swatch) => {
      const value = swatch.dataset[datasetKey];
      const selected = aggregateIsUniform(selectedColor)
        && (value === nullValue
          ? selectedColor.value === null
          : selectedColor.value !== null && value === selectedColor.value);
      swatch.classList.toggle("is-selected", selected);
      swatch.ariaPressed = String(selected);
    });
  }

  private createOption(value: string, label: string, disabled = false) {
    const option = this.root.ownerDocument.createElement("option");
    option.value = value;
    option.textContent = parameterLabel(label);
    option.disabled = disabled;
    return option;
  }

  private changeMosView(patch: Partial<MosViewSettings>) {
    this.callbacks.onComponentMosViewChange?.(patch);
  }

  private syncReadonlyAggregate(input: HTMLInputElement, value: AggregateValue<string>) {
    input.value = aggregateIsUniform(value) ? value.value : "Multiple values";
    input.dataset.propertyMixed = String(value.state === "mixed");
  }

  private syncTextAggregate<T>(
    input: HTMLInputElement,
    value: AggregateValue<T>,
    format: (value: T) => string = String
  ) {
    const syncedValue = aggregateIsUniform(value) ? format(value.value) : "";
    input.value = syncedValue;
    input.placeholder = value.state === "mixed" ? parameterLabel("Multiple values") : "";
    input.dataset.propertyMixed = String(value.state === "mixed");
    input.dataset.propertySyncedValue = syncedValue;
    input.dataset.propertySyncedPlaceholder = input.placeholder;
    this.dirtyTextInputs.delete(input);
  }

  private syncCheckboxAggregate(input: HTMLInputElement, value: AggregateValue<boolean>) {
    const mixed = value.state === "mixed";
    input.indeterminate = mixed;
    input.checked = aggregateIsUniform(value) ? value.value : false;
    input.dataset.propertyMixed = String(mixed);
    input.ariaChecked = mixed ? "mixed" : String(input.checked);
  }

  private syncSelectAggregate(input: HTMLSelectElement, value: AggregateValue<string>) {
    if (aggregateIsUniform(value)) {
      input.value = value.value;
      input.dataset.propertyMixed = "false";
      this.syncMixedAriaLabel(input, false);
      return;
    }
    const mixedOption = this.createOption("", "Multiple values", true);
    input.append(mixedOption);
    input.value = "";
    input.dataset.propertyMixed = "true";
    this.syncMixedAriaLabel(input, true);
  }

  private syncColorAggregate(
    input: HTMLInputElement,
    swatches: NodeListOf<HTMLButtonElement>,
    value: AggregateValue<string | null>,
    defaultColor: string,
    datasetKey: "noteTextColorSwatch" | "noteBackgroundSwatch" | "componentColorSwatch" | "networkColorSwatch" | "couplingColorSwatch" | "libraryShapeFillColorSwatch",
    nullValue: "none" | "default"
  ) {
    const mixed = value.state === "mixed";
    const syncedValue = aggregateIsUniform(value) ? value.value ?? defaultColor : DEFAULT_COMPONENT_COLOR;
    input.value = syncedValue;
    input.dataset.propertyMixed = String(mixed);
    input.dataset.propertySyncedValue = syncedValue;
    this.dirtyColorInputs.delete(input);
    input.parentElement?.classList.toggle("is-mixed", mixed);
    this.syncMixedAriaLabel(input, mixed);
    this.syncColorSwatches(swatches, value, datasetKey, nullValue);
  }

  private checkboxValue(input: HTMLInputElement) {
    const wasMixed = input.dataset.propertyMixed === "true";
    input.indeterminate = false;
    if (wasMixed) input.checked = true;
    input.dataset.propertyMixed = "false";
    input.ariaChecked = String(input.checked);
    return input.checked;
  }

  private commitTextInput(
    input: HTMLInputElement,
    callback: ((value: string) => void) | undefined
  ) {
    const dirty = this.dirtyTextInputs.has(input);
    if (input.dataset.propertyMixed === "true" && !dirty) return false;
    const changedFromProjection = input.value !== (input.dataset.propertySyncedValue ?? "");
    if (!dirty && !changedFromProjection) return false;
    this.dirtyTextInputs.delete(input);
    input.dataset.propertySyncedValue = input.value;
    input.dataset.propertyMixed = "false";
    input.placeholder = "";
    callback?.(input.value);
    return true;
  }

  private restoreTextInput(input: HTMLInputElement) {
    this.dirtyTextInputs.delete(input);
    input.value = input.dataset.propertySyncedValue ?? "";
    input.placeholder = input.dataset.propertySyncedPlaceholder ?? "";
  }

  private commitCouplingCoefficientInput(input: HTMLInputElement) {
    const couplingId = input.dataset.couplingId ?? "";
    if (!couplingId || !input.value.trim()) {
      this.restoreTextInput(input);
      return false;
    }
    return this.commitTextInput(input, (value) => {
      this.callbacks.onInductorCouplingCoefficientChange?.(couplingId, value);
    });
  }

  private commitColorInput(
    input: HTMLInputElement,
    commit: ((value: string) => void) | undefined,
    fallback: ((value: string | null) => void) | undefined
  ) {
    const dirty = this.dirtyColorInputs.has(input);
    const changedFromProjection = input.value !== (input.dataset.propertySyncedValue ?? "");
    if (!dirty && !changedFromProjection) return false;
    this.dirtyColorInputs.delete(input);
    input.dataset.propertySyncedValue = input.value;
    input.dataset.propertyMixed = "false";
    if (commit) commit(input.value);
    else fallback?.(input.value);
    return true;
  }

  private restoreColorInput(input: HTMLInputElement) {
    this.dirtyColorInputs.delete(input);
    const syncedValue = input.dataset.propertySyncedValue;
    if (syncedValue) input.value = syncedValue;
  }

  private syncMixedAriaLabel(element: HTMLElement, mixed: boolean) {
    const message = element.dataset.schematicMessageAriaLabel;
    const baseLabel = message ? messageText(JSON.parse(message)) : element.dataset.propertyBaseAriaLabel ?? element.ariaLabel ?? "";
    element.dataset.propertyBaseAriaLabel = baseLabel;
    element.ariaLabel = mixed
      ? `${baseLabel ? `${baseLabel}: ` : ""}${parameterLabel("Multiple values")}`
      : baseLabel;
  }

  private propertyEditFromEvent(event: Event): BoundPropertyInput | null {
    const input = this.closestInRoot<HTMLInputElement>(event, PROPERTY_EDIT_SELECTOR);
    if (!input) return null;
    const callbacks = this.callbacks;
    const sourceKey = input.dataset.propertyVsourceField;
    if (sourceKey) return {
      input,
      binding: {
        kind: "text",
        start: () => callbacks.onVoltageSourceFieldEditStart?.(sourceKey),
        commit: value => (callbacks.onVoltageSourceFieldCommit ?? callbacks.onVoltageSourceFieldChange)?.(sourceKey, value),
        cancel: () => callbacks.onVoltageSourceFieldCancel?.(sourceKey)
      }
    };
    const rectangleProperty = input.dataset.propertyRectangle as RectangleProperty;
    const triangleEdge = input.dataset.propertyTrianglePins as TriangleEdge;
    const shapeStyleBinding = (
      property: LibraryShapeStyleProperty,
      kind: PropertyInputBinding["kind"] = "text"
    ): PropertyInputBinding => ({
      kind,
      start: () => callbacks.onLibraryShapeStyleEditStart?.(property),
      input: value => callbacks.onLibraryShapeStyleInput?.(property, value),
      commit: value => callbacks.onLibraryShapeStyleCommit?.(property, value),
      cancel: () => callbacks.onLibraryShapeStyleCancel?.(property)
    });
    const bindings: Record<string, PropertyInputBinding> = {
      "data-property-ref": {
        kind: "text",
        start: callbacks.onComponentRefEditStart,
        input: callbacks.onComponentRefInput,
        commit: callbacks.onComponentRefCommit ?? callbacks.onComponentRefChange,
        cancel: callbacks.onComponentRefCancel
      },
      "data-property-value": {
        kind: "text",
        start: callbacks.onComponentValueEditStart,
        input: callbacks.onComponentValueInput,
        commit: callbacks.onComponentValueCommit ?? callbacks.onComponentValueChange,
        cancel: callbacks.onComponentValueCancel
      },
      "data-property-note-font-size": {
        kind: "text",
        start: callbacks.onNoteFontSizeEditStart,
        input: callbacks.onNoteFontSizeInput,
        commit: callbacks.onNoteFontSizeCommit,
        cancel: callbacks.onNoteFontSizeCancel
      },
      "data-property-note-width": {
        kind: "text",
        start: callbacks.onNoteWidthEditStart,
        input: callbacks.onNoteWidthInput,
        commit: callbacks.onNoteWidthCommit,
        cancel: callbacks.onNoteWidthCancel
      },
      "data-property-net-label": {
        kind: "text",
        start: callbacks.onNetLabelEditStart,
        input: callbacks.onNetLabelInput,
        commit: callbacks.onNetLabelCommit ?? callbacks.onNetLabelChange,
        cancel: callbacks.onNetLabelCancel
      },
      "data-property-wire-digital-label": {
        kind: "text",
        start: callbacks.onWireDigitalLabelEditStart,
        input: callbacks.onWireDigitalLabelInput,
        commit: callbacks.onWireDigitalLabelCommit ?? callbacks.onWireDigitalLabelChange,
        cancel: callbacks.onWireDigitalLabelCancel
      },
      "data-property-component-color": {
        kind: "color",
        start: callbacks.onComponentColorEditStart,
        input: callbacks.onComponentColorInput,
        commit: callbacks.onComponentColorCommit ?? callbacks.onComponentColorChange,
        cancel: callbacks.onComponentColorCancel
      },
      "data-property-network-color": {
        kind: "color",
        start: callbacks.onNetworkColorEditStart,
        input: callbacks.onNetworkColorInput,
        commit: callbacks.onNetworkColorCommit ?? callbacks.onNetworkColorChange,
        cancel: callbacks.onNetworkColorCancel
      },
      "data-property-note-text-color": {
        kind: "color",
        start: callbacks.onNoteTextColorEditStart,
        input: callbacks.onNoteTextColorInput,
        commit: callbacks.onNoteTextColorCommit ?? callbacks.onNoteTextColorChange,
        cancel: callbacks.onNoteTextColorCancel
      },
      "data-property-note-background": {
        kind: "color",
        start: callbacks.onNoteBackgroundEditStart,
        input: callbacks.onNoteBackgroundInput,
        commit: callbacks.onNoteBackgroundCommit ?? callbacks.onNoteBackgroundChange,
        cancel: callbacks.onNoteBackgroundCancel
      },
      "data-property-triangle-pins": {
        kind: "text",
        start: () => callbacks.onTrianglePinsEditStart?.(triangleEdge),
        input: value => callbacks.onTrianglePinsInput?.(triangleEdge, value),
        commit: value => callbacks.onTrianglePinsCommit?.(triangleEdge, value),
        cancel: () => callbacks.onTrianglePinsCancel?.(triangleEdge)
      },
      "data-property-rectangle": {
        kind: "text",
        start: () => callbacks.onRectanglePropertyEditStart?.(rectangleProperty),
        input: (value) => callbacks.onRectanglePropertyInput?.(rectangleProperty, value),
        commit: (value) => callbacks.onRectanglePropertyCommit?.(rectangleProperty, value),
        cancel: () => callbacks.onRectanglePropertyCancel?.(rectangleProperty)
      },
      "data-property-library-shape-stroke-width": shapeStyleBinding("strokeWidth"),
      "data-property-library-shape-corner-radius": shapeStyleBinding("cornerRadius"),
      "data-property-library-shape-fill-color": shapeStyleBinding("fillColor", "color"),
      "data-property-library-shape-fill-opacity": shapeStyleBinding("fillOpacity")
    };
    for (const [attribute, binding] of Object.entries(bindings)) {
      if (input.matches("[" + attribute + "]")) return { input, binding };
    }
    return null;
  }

  private commitBoundPropertyInput({ input, binding }: BoundPropertyInput) {
    if (binding.kind === "color") this.commitColorInput(input, binding.commit, undefined);
    else this.commitTextInput(input, binding.commit);
  }

  private readonly handleChange = (event: Event) => {
    const inductorLayoutSelect = this.closestInRoot<HTMLSelectElement>(event, "[data-property-inductor-layout]");
    if (inductorLayoutSelect) {
      if (isInductorLayout(inductorLayoutSelect.value)) this.callbacks.onComponentInductorLayoutChange?.(inductorLayoutSelect.value);
      return;
    }
    const sourceOption = this.closestInRoot<HTMLSelectElement>(event, "[data-property-vsource-option]");
    if (sourceOption) {
      this.callbacks.onVoltageSourceFieldChange?.(sourceOption.dataset.propertyVsourceOption!, sourceOption.value);
      return;
    }
    const edit = this.propertyEditFromEvent(event);
    if (edit) {
      this.commitBoundPropertyInput(edit);
      return;
    }
    const cellSelect = this.closestInRoot<HTMLSelectElement>(event, "[data-property-cell]");
    const libraryShapeLineStyle = this.closestInRoot<HTMLSelectElement>(event, "[data-property-library-shape-line-style]");
    const arrow = this.closestInRoot<HTMLSelectElement>(event, "[data-property-library-shape-arrow]");
    const libraryShapeFillEnabled = this.closestInRoot<HTMLInputElement>(event, "[data-property-library-shape-fill-enabled]");
    const labelVisibilityInput = this.closestInRoot<HTMLInputElement>(event, "[data-property-label-visible]");
    const valueVisibilityInput = this.closestInRoot<HTMLInputElement>(event, "[data-property-value-visible]");
    const differentialOutputsInput = this.closestInRoot<HTMLInputElement>(event, "[data-property-differential-outputs-same]");
    const wireDigitalSlashInput = this.closestInRoot<HTMLInputElement>(event, "[data-property-wire-digital-slash]");
    const variantSelect = this.closestInRoot<HTMLSelectElement>(event, "[data-property-variant]");
    const clockSelect = this.closestInRoot<HTMLSelectElement>(event, "[data-property-clock]");
    const filterKindSelect = this.closestInRoot<HTMLSelectElement>(event, "[data-property-filter-kind]");
    const mosGateStyleInput = this.closestInRoot<HTMLInputElement>(event, "[data-property-mos-gate-style]");
    const mosThickGateInput = this.closestInRoot<HTMLInputElement>(event, "[data-property-mos-thick-gate]");
    const pinVisibilityInput = this.closestInRoot<HTMLInputElement>(event, "[data-property-pin-visibility-id]");
    const pinModeSelect = this.closestInRoot<HTMLSelectElement>(event, "[data-property-pin-mode-id]");
    const pinSymbolVisibilityInput = this.closestInRoot<HTMLInputElement>(event, "[data-property-pin-symbol-visibility-id]");
    const noteFormatSelect = this.closestInRoot<HTMLSelectElement>(event, "[data-property-note-format]");
    const couplingCoefficientInput = this.closestInRoot<HTMLInputElement>(event, "[data-property-coupling-coefficient]");
    const couplingShowLabelInput = this.closestInRoot<HTMLInputElement>(event, "[data-property-coupling-show-label]");
    const couplingShowArcInput = this.closestInRoot<HTMLInputElement>(event, "[data-property-coupling-show-arc]");
    const couplingShowCoreInput = this.closestInRoot<HTMLInputElement>(event, "[data-property-coupling-show-core]");
    const couplingColorInput = this.closestInRoot<HTMLInputElement>(event, "[data-property-coupling-color]");
    if (libraryShapeLineStyle && isLibraryShapeLineStyle(libraryShapeLineStyle.value)) {
      this.callbacks.onLibraryShapeStyleChange?.("lineStyle", libraryShapeLineStyle.value);
    }
    const endpoint = arrow?.dataset.propertyLibraryShapeArrow;
    if (arrow && !arrow.disabled) {
      if ((endpoint === "startArrow" || endpoint === "endArrow") && isLibraryShapeArrowType(arrow.value)) {
        this.callbacks.onLibraryShapeStyleChange?.(endpoint, arrow.value);
      } else if ((endpoint === "startArrowSize" || endpoint === "endArrowSize") && isLibraryShapeArrowSize(arrow.value)) {
        this.callbacks.onLibraryShapeStyleChange?.(endpoint, arrow.value);
      }
    }
    if (libraryShapeFillEnabled) {
      this.callbacks.onLibraryShapeStyleChange?.("fillEnabled", this.checkboxValue(libraryShapeFillEnabled));
    }
    if (cellSelect && cellSelect.value) this.callbacks.onComponentCellChange?.(cellSelect.value as ComponentType);
    if (labelVisibilityInput) this.callbacks.onComponentLabelVisibilityChange?.(this.checkboxValue(labelVisibilityInput));
    if (valueVisibilityInput) this.callbacks.onComponentValueVisibilityChange?.(this.checkboxValue(valueVisibilityInput));
    if (differentialOutputsInput) {
      this.callbacks.onComponentDifferentialOutputsChange?.(this.checkboxValue(differentialOutputsInput));
    }
    if (couplingColorInput) {
      const couplingId = this.couplingIdFromPanel();
      if (couplingId) this.commitColorInput(
        couplingColorInput,
        undefined,
        (value) => this.callbacks.onInductorCouplingColorChange?.(couplingId, value)
      );
    }
    if (wireDigitalSlashInput) this.callbacks.onWireDigitalSlashChange?.(this.checkboxValue(wireDigitalSlashInput));
    if (variantSelect && variantSelect.value) this.callbacks.onComponentVariantChange?.(variantSelect.value);
    if (clockSelect && isComponentClock(clockSelect.value)) {
      this.callbacks.onComponentClockChange?.(clockSelect.value);
    }
    if (filterKindSelect && isFilterKind(filterKindSelect.value)) {
      this.callbacks.onComponentFilterKindChange?.(filterKindSelect.value);
    }
    if (mosGateStyleInput) this.changeMosView({ gateStyle: this.checkboxValue(mosGateStyleInput) });
    if (mosThickGateInput) this.callbacks.onComponentMosThickGateChange?.(this.checkboxValue(mosThickGateInput));
    if (pinVisibilityInput) this.callbacks.onComponentPinVisibilityChange?.(
      pinVisibilityInput.dataset.propertyPinVisibilityId ?? "",
      this.checkboxValue(pinVisibilityInput)
    );
    if (pinModeSelect) this.callbacks.onComponentPinModeChange?.(pinModeSelect.dataset.propertyPinModeId ?? "", pinModeSelect.value as OperatorPinMode);
    if (pinSymbolVisibilityInput) this.callbacks.onComponentPinSymbolVisibilityChange?.(
      pinSymbolVisibilityInput.dataset.propertyPinSymbolVisibilityId ?? "",
      this.checkboxValue(pinSymbolVisibilityInput)
    );
    if (noteFormatSelect) this.callbacks.onNoteFormatChange?.(noteFormatSelect.value as SchematicNoteFormat);
    if (couplingCoefficientInput) {
      this.commitCouplingCoefficientInput(couplingCoefficientInput);
    }
    if (couplingShowLabelInput) {
      const couplingId = couplingShowLabelInput.dataset.couplingId ?? "";
      if (couplingId) this.callbacks.onInductorCouplingShowLabelChange?.(
        couplingId,
        this.checkboxValue(couplingShowLabelInput)
      );
    }
    if (couplingShowArcInput) {
      const couplingId = couplingShowArcInput.dataset.couplingId ?? "";
      if (couplingId) this.callbacks.onInductorCouplingShowArcChange?.(
        couplingId,
        this.checkboxValue(couplingShowArcInput)
      );
    }
    if (couplingShowCoreInput) {
      const couplingId = couplingShowCoreInput.dataset.couplingId ?? "";
      if (couplingId) this.callbacks.onInductorCouplingShowCoreChange?.(
        couplingId,
        this.checkboxValue(couplingShowCoreInput)
      );
    }
  };

  private readonly handleInput = (event: Event) => {
    const edit = this.propertyEditFromEvent(event);
    if (edit) {
      const dirty = edit.binding.kind === "color" ? this.dirtyColorInputs : this.dirtyTextInputs;
      dirty.add(edit.input);
      edit.binding.input?.(edit.input.value);
      return;
    }
    const coefficient = this.closestInRoot<HTMLInputElement>(event, "[data-property-coupling-coefficient]");
    if (coefficient) this.dirtyTextInputs.add(coefficient);
  };

  private readonly handleFocusIn = (event: Event) => {
    this.propertyEditFromEvent(event)?.binding.start?.();
  };

  private readonly handleFocusOut = (event: Event) => {
    const edit = this.propertyEditFromEvent(event);
    if (edit) this.commitBoundPropertyInput(edit);
  };

  private readonly handleClick = (event: Event) => {
    const tapButton = this.closestInRoot<HTMLButtonElement>(event, "[data-property-inductor-tap-value]");
    if (tapButton && !tapButton.disabled) {
      event.preventDefault();
      const tap = tapButton.dataset.propertyInductorTapValue;
      if (isInductorTap(tap)) this.callbacks.onComponentInductorTapChange?.(tap);
      return;
    }
    const dotButton = this.closestInRoot<HTMLButtonElement>(event, "[data-property-inductor-dot-value]");
    if (dotButton && !dotButton.disabled) {
      event.preventDefault();
      const terminal = dotButton.dataset.propertyInductorDotValue;
      if (isInductorDotTerminal(terminal)) this.callbacks.onComponentInductorDotChange?.(terminal);
      return;
    }
    const couplingListButton = this.closestInRoot<HTMLButtonElement>(event, "[data-property-inductor-coupling-id]");
    if (couplingListButton && !couplingListButton.disabled) {
      event.preventDefault();
      const couplingId = couplingListButton.dataset.propertyInductorCouplingId;
      if (couplingId) this.callbacks.onInductorCouplingSelect?.(couplingId);
      return;
    }
    const addCouplingButton = this.closestInRoot<HTMLButtonElement>(event, "[data-property-inductor-add-coupling]");
    if (addCouplingButton && !addCouplingButton.disabled) {
      event.preventDefault();
      this.callbacks.onInductorCouplingAdd?.();
      return;
    }
    const createCouplingButton = this.closestInRoot<HTMLButtonElement>(event, "[data-property-coupling-create]");
    if (createCouplingButton && !createCouplingButton.disabled) {
      event.preventDefault();
      this.callbacks.onInductorCouplingCreate?.();
      return;
    }
    const couplingAutoButton = this.closestInRoot<HTMLButtonElement>(event, "[data-property-coupling-auto]");
    if (couplingAutoButton && !couplingAutoButton.disabled) {
      event.preventDefault();
      const couplingId = this.couplingIdFromPanel();
      if (couplingId) this.callbacks.onInductorCouplingAutoName?.(couplingId);
      return;
    }
    const couplingLabelButton = this.closestInRoot<HTMLButtonElement>(event, "[data-property-coupling-label-mode-value]");
    if (couplingLabelButton && !couplingLabelButton.disabled) {
      event.preventDefault();
      const couplingId = this.couplingIdFromPanel();
      const mode = couplingLabelButton.dataset.propertyCouplingLabelModeValue;
      if (couplingId && (mode === "coefficient" || mode === "ratio")) {
        this.callbacks.onInductorCouplingLabelModeChange?.(couplingId, mode);
      }
      return;
    }
    const couplingFlipButton = this.closestInRoot<HTMLButtonElement>(event, "[data-property-coupling-flip]");
    if (couplingFlipButton && !couplingFlipButton.disabled) {
      event.preventDefault();
      const couplingId = this.couplingIdFromPanel();
      if (couplingId) this.callbacks.onInductorCouplingFlip?.(couplingId);
      return;
    }
    const dffButton = this.closestInRoot<HTMLButtonElement>(event, "[data-property-dff-setting]");
    if (dffButton && !dffButton.disabled) {
      event.preventDefault();
      const property = dffButton.dataset.propertyDffSetting;
      const value = dffButton.dataset.propertyDffValue;
      if (isDffSettingProperty(property) && isDffSettingValue(property, value)) {
        this.callbacks.onComponentDffSettingChange?.(property, value);
      }
      return;
    }
    const wireLineWidthButton = this.closestInRoot<HTMLButtonElement>(event, "[data-property-wire-line-width-value]");
    if (wireLineWidthButton && !wireLineWidthButton.disabled) {
      event.preventDefault();
      const lineWidth = wireLineWidthButton.dataset.propertyWireLineWidthValue;
      if (isWireLineWidth(lineWidth)) this.callbacks.onWireLineWidthChange?.(lineWidth);
      return;
    }
    const wireStartMarkerButton = this.closestInRoot<HTMLButtonElement>(event, "[data-property-wire-start-marker-value]");
    if (wireStartMarkerButton && !wireStartMarkerButton.disabled) {
      event.preventDefault();
      const marker = wireStartMarkerButton.dataset.propertyWireStartMarkerValue;
      if (isWireEndpointMarker(marker)) this.callbacks.onWireStartMarkerChange?.(marker);
      return;
    }
    const wireEndMarkerButton = this.closestInRoot<HTMLButtonElement>(event, "[data-property-wire-end-marker-value]");
    if (wireEndMarkerButton && !wireEndMarkerButton.disabled) {
      event.preventDefault();
      const marker = wireEndMarkerButton.dataset.propertyWireEndMarkerValue;
      if (isWireEndpointMarker(marker)) this.callbacks.onWireEndMarkerChange?.(marker);
      return;
    }
    const timeDomainButton = this.closestInRoot<HTMLButtonElement>(event, "[data-property-time-domain-value]");
    if (timeDomainButton && !timeDomainButton.disabled) {
      event.preventDefault();
      const timeDomain = timeDomainButton.dataset.propertyTimeDomainValue;
      if (isFunctionBlockTimeDomain(timeDomain)) {
        this.callbacks.onComponentTimeDomainChange?.(timeDomain);
      }
      return;
    }
    const transistorCircleButton = this.closestInRoot<HTMLButtonElement>(event, "[data-property-transistor-circle-value]");
    if (transistorCircleButton && !transistorCircleButton.disabled) {
      event.preventDefault();
      this.callbacks.onComponentTransistorCircleChange?.(
        transistorCircleButton.dataset.propertyTransistorCircleValue === "true"
      );
      return;
    }
    const variantButton = this.closestInRoot<HTMLButtonElement>(event, "[data-property-variant-value]");
    if (variantButton && !variantButton.disabled) {
      event.preventDefault();
      this.callbacks.onComponentVariantChange?.(variantButton.dataset.propertyVariantValue ?? "");
      return;
    }
    const mosPinsButton = this.closestInRoot<HTMLButtonElement>(event, "[data-property-mos-pins-value]");
    if (mosPinsButton && !mosPinsButton.disabled) {
      event.preventDefault();
      this.changeMosView({ pins: mosPinsButton.dataset.propertyMosPinsValue as MosPinView });
      return;
    }
    const mosArrowButton = this.closestInRoot<HTMLButtonElement>(event, "[data-property-mos-arrow-value]");
    if (mosArrowButton && !mosArrowButton.disabled) {
      event.preventDefault();
      this.changeMosView({ arrow: mosArrowButton.dataset.propertyMosArrowValue as MosArrowView });
      return;
    }
    const pinModeButton = this.closestInRoot<HTMLButtonElement>(event, "[data-property-pin-mode-value]");
    if (pinModeButton && !pinModeButton.disabled) {
      event.preventDefault();
      const mode = pinModeButton.dataset.propertyPinModeValue;
      if (isOperatorPinMode(mode)) {
        this.callbacks.onComponentPinModeChange?.(pinModeButton.dataset.propertyPinModeId ?? "", mode);
      }
      return;
    }
    const noteFormatButton = this.closestInRoot<HTMLButtonElement>(event, "[data-property-note-format-value]");
    if (noteFormatButton && !noteFormatButton.disabled) {
      event.preventDefault();
      const format = noteFormatButton.dataset.propertyNoteFormatValue;
      if (format === "plain" || format === "markdown") this.callbacks.onNoteFormatChange?.(format);
      return;
    }
    const gainPolarityButton = this.closestInRoot<HTMLButtonElement>(event, "[data-property-gain-polarity-value]");
    if (gainPolarityButton) {
      event.preventDefault();
      const polarity = gainPolarityButton.dataset.propertyGainPolarityValue;
      if (isGainPolarity(polarity)) this.callbacks.onComponentGainPolarityChange?.(polarity);
      return;
    }
    const textColor = this.closestInRoot<HTMLButtonElement>(event, "[data-note-text-color-swatch]");
    if (textColor) {
      event.preventDefault();
      this.callbacks.onNoteTextColorChange?.(textColor.dataset.noteTextColorSwatch ?? DEFAULT_NOTE_TEXT_COLOR);
      return;
    }
    const swatch = this.closestInRoot<HTMLButtonElement>(event, "[data-note-background-swatch]");
    if (swatch) {
      event.preventDefault();
      const value = swatch.dataset.noteBackgroundSwatch;
      this.callbacks.onNoteBackgroundChange?.(value === "none" ? null : value ?? "");
      return;
    }
    const fillSwatch = this.closestInRoot<HTMLButtonElement>(event, "[data-library-shape-fill-color-swatch]");
    if (fillSwatch) {
      event.preventDefault();
      if (!fillSwatch.disabled) {
        const value = fillSwatch.dataset.libraryShapeFillColorSwatch;
        this.callbacks.onLibraryShapeStyleChange?.("fillColor", value === "default" ? DEFAULT_LIBRARY_SHAPE_STYLE.fillColor : value ?? "");
      }
      return;
    }
    const componentColorSwatch = this.closestInRoot<HTMLButtonElement>(event, "[data-component-color-swatch]");
    if (componentColorSwatch) {
      event.preventDefault();
      const value = componentColorSwatch.dataset.componentColorSwatch;
      this.callbacks.onComponentColorChange?.(value === "default" ? null : value ?? "");
      return;
    }
    const scaleButton = this.closestInRoot<HTMLButtonElement>(event, "[data-property-scale-value]");
    if (scaleButton && !scaleButton.disabled) {
      event.preventDefault();
      const scale = Number(scaleButton.dataset.propertyScaleValue);
      if (COMPONENT_SCALES.some(value => value === scale)) this.callbacks.onComponentScaleChange?.(scale as ComponentScale);
      return;
    }
    const clockButton = this.closestInRoot<HTMLButtonElement>(event, "[data-property-clock-value]");
    if (clockButton && !clockButton.disabled) {
      event.preventDefault();
      const clock = clockButton.dataset.propertyClockValue;
      if (isComponentClock(clock)) this.callbacks.onComponentClockChange?.(clock);
      return;
    }
    const couplingColorSwatch = this.closestInRoot<HTMLButtonElement>(event, "[data-coupling-color-swatch]");
    if (couplingColorSwatch) {
      event.preventDefault();
      const couplingId = this.couplingIdFromPanel();
      const value = couplingColorSwatch.dataset.couplingColorSwatch;
      if (couplingId) this.callbacks.onInductorCouplingColorChange?.(
        couplingId,
        value === "default" ? null : value ?? ""
      );
      return;
    }
    const networkColorSwatch = this.closestInRoot<HTMLButtonElement>(event, "[data-network-color-swatch]");
    if (!networkColorSwatch) return;
    event.preventDefault();
    const value = networkColorSwatch.dataset.networkColorSwatch;
    this.callbacks.onNetworkColorChange?.(value === "default" ? null : value ?? "");
  };

  private readonly handleKeydown = (event: Event) => {
    const key = (event as KeyboardEvent).key;
    const edit = this.propertyEditFromEvent(event);
    const coefficient = this.closestInRoot<HTMLInputElement>(event, "[data-property-coupling-coefficient]");
    const input = edit?.input ?? coefficient;
    if (!input) return;
    if (key === "Escape") {
      event.preventDefault();
      edit?.binding.cancel?.();
      if (input.type === "color") this.restoreColorInput(input);
      else this.restoreTextInput(input);
      input.blur();
      return;
    }
    if (key !== "Enter") return;
    event.preventDefault();
    if (edit?.binding.kind === "text") this.commitBoundPropertyInput(edit);
    else if (coefficient) this.commitCouplingCoefficientInput(coefficient);
    input.blur();
  };

  private closestInRoot<T extends Element>(event: Event, selector: string): T | null {
    const target = event.target as (Element & { closest?: Element["closest"] }) | null;
    const element = target?.closest?.<T>(selector);
    if (!element || !this.root.contains(element)) return null;
    return element;
  }

  private couplingIdFromPanel() {
    return this.root.querySelector<HTMLElement>("[data-property-coupling-form]")?.dataset.couplingId ?? "";
  }
}

function isGainPolarity(value: string | undefined): value is GainPolarity {
  return value === "default" || value === "positive" || value === "negative";
}

function isOperatorPinMode(value: string | undefined): value is OperatorPinMode {
  return value === "positive" || value === "negative" || value === "output";
}

const WIRE_ENDPOINT_MARKER_OPTIONS = [
  { value: "default", label: "Default" },
  { value: "arrow", label: "Arrow" },
  { value: "circle", label: "Circle" }
] as const;

const WIRE_LINE_WIDTH_OPTIONS = [
  { value: "a", label: "a" },
  { value: "2a", label: "2a" }
] as const;

function isWireEndpointMarker(value: string | undefined): value is WireEndpointMarker {
  return value === "default" || value === "arrow" || value === "circle";
}

function isWireLineWidth(value: string | undefined): value is WireLineWidth {
  return value === "a" || value === "2a";
}
