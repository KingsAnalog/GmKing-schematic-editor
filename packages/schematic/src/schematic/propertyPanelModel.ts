import type { VoltageSourceField } from "./voltageSourceModel";
import type { MosArrowView, MosPinView } from "./mosViewModel";
import type { RectangleSettings } from "./rectangleComponentModel";
import type { LibraryShapeLineStyle } from "./libraryShapeStyleModel";
import type { FilterKind, FunctionBlockTimeDomain } from "./functionBlockModel";
import type {
  DffActiveLevel,
  DffClockEdge,
  DffControlMode
} from "./dffModel";
import type { InductorDotTerminal, InductorTap, InductorLayout } from "./inductorModel";
import type {
  ComponentType,
  GainPolarity,
  InductorCouplingLabelMode,
  OperatorPinMode,
  SchematicNoteFormat,
  WireEndpointMarker,
  WireLineWidth
} from "./types";

export type AggregateValue<T> =
  | { state: "uniform"; value: T }
  | { state: "mixed" };

export interface SchematicPropertyPanelVariant {
  id: string;
  label: string;
}

export interface SchematicPropertyPanelCell {
  type: ComponentType;
  label: string;
  disabled: boolean;
}

export interface SchematicPropertyPanelValueInput {
  label: string;
  value: AggregateValue<string>;
  placeholder: string;
  unit?: string;
}

export interface SchematicPropertyPanelVariantInput {
  label: string;
  options: readonly SchematicPropertyPanelVariant[];
  value: AggregateValue<string>;
}

export interface SchematicPropertyPanelDffInput {
  clockEdge: AggregateValue<DffClockEdge>;
  setMode: AggregateValue<DffControlMode>;
  setActiveLevel: AggregateValue<DffActiveLevel>;
  resetMode: AggregateValue<DffControlMode>;
  resetActiveLevel: AggregateValue<DffActiveLevel>;
}

export interface SchematicPropertyPanelFilterKindInput {
  options: readonly { value: FilterKind; label: string }[];
  value: AggregateValue<FilterKind>;
}

export interface SchematicPropertyPanelPinSetting {
  id: string;
  label: string;
  visible: AggregateValue<boolean>;
  modeEditable: boolean;
  mode?: AggregateValue<OperatorPinMode>;
  symbolVisible?: AggregateValue<boolean>;
  symbolEditable?: boolean;
}

export interface SchematicPropertyPanelMosViewInput {
  pins: AggregateValue<MosPinView>;
  gateStyle: AggregateValue<boolean>;
  arrow: AggregateValue<MosArrowView>;
  noneAllowed: boolean;
}

export interface SchematicPropertyPanelInductorInput {
  dot: AggregateValue<InductorDotTerminal>;
  tap: AggregateValue<InductorTap>;
  couplings: readonly {
    id: string;
    partnerId: string;
    partnerRef: string;
  }[];
  canAddCoupling: boolean;
  pickingCoupling: boolean;
}

export interface SchematicPropertyPanelInductorCouplingInput {
  id: string | null;
  exists: boolean;
  firstRef: string;
  secondRef: string;
  coefficient?: string;
  coefficientAuto?: boolean;
  labelMode?: InductorCouplingLabelMode;
  showLabel?: boolean;
  ratioAvailable?: boolean;
  showArc?: boolean;
  showCore?: boolean;
  arcFlipped?: boolean;
  color?: AggregateValue<string | null>;
}

export interface SchematicPropertyPanelComponentInput {
  inductorLayout?: AggregateValue<InductorLayout>;
  cellType?: AggregateValue<ComponentType>;
  cells?: readonly SchematicPropertyPanelCell[];
  ref: AggregateValue<string>;
  labelVisible: AggregateValue<boolean>;
  valueVisible?: AggregateValue<boolean>;
  color: AggregateValue<string | null>;
  gainPolarity?: AggregateValue<GainPolarity>;
  differentialOutputsSame?: AggregateValue<boolean>;
  value?: SchematicPropertyPanelValueInput;
  sourceFields?: readonly (VoltageSourceField & { value: AggregateValue<string> })[];
  timeDomain?: AggregateValue<FunctionBlockTimeDomain>;
  variants?: SchematicPropertyPanelVariantInput;
  scale?: SchematicPropertyPanelVariantInput;
  clock?: SchematicPropertyPanelVariantInput;
  dff?: SchematicPropertyPanelDffInput;
  filterKind?: SchematicPropertyPanelFilterKindInput;
  pinSettings?: readonly SchematicPropertyPanelPinSetting[];
  mosView?: SchematicPropertyPanelMosViewInput;
  mosThickGate?: AggregateValue<boolean>;
  transistorCircle?: AggregateValue<boolean>;
  inductor?: SchematicPropertyPanelInductorInput;
  /** Pure library shapes have no name, label, or electrical pin controls. */
  libraryShape?: boolean;
  libraryShapeStyle?: {
    strokeWidth: AggregateValue<number>;
    lineStyle: AggregateValue<LibraryShapeLineStyle>;
    cornerRadius?: AggregateValue<number>;
    fillEnabled: AggregateValue<boolean>;
    fillColor: AggregateValue<string>;
    fillOpacity: AggregateValue<number>;
  };
  rectangle?: {
    [Property in keyof RectangleSettings]: AggregateValue<number>;
  };
}

export interface SchematicPropertyPanelNoteInput {
  backgroundColor: AggregateValue<string | null>;
  textColor?: AggregateValue<string>;
  fontSizePx: AggregateValue<number>;
  format: AggregateValue<SchematicNoteFormat>;
  widthPx?: AggregateValue<number>;
}

export interface SchematicPropertyPanelNetworkInput {
  netName?: AggregateValue<string>;
  label?: {
    name: AggregateValue<string>;
    message?: string;
  };
  color?: AggregateValue<string | null>;
  wire?: {
    lineWidth: AggregateValue<WireLineWidth>;
    startMarker: AggregateValue<WireEndpointMarker>;
    endMarker: AggregateValue<WireEndpointMarker>;
    digitalSlash: AggregateValue<boolean>;
    digitalLabel?: AggregateValue<string>;
  };
}

export interface SchematicPropertyPanelInput {
  hasSelection: boolean;
  component?: SchematicPropertyPanelComponentInput | null;
  inductorCoupling?: SchematicPropertyPanelInductorCouplingInput | null;
  note?: SchematicPropertyPanelNoteInput | null;
  network?: SchematicPropertyPanelNetworkInput | null;
  labelTool?: { value: string; error?: string } | null;
}

export function aggregateValues<T>(
  values: readonly T[],
  equals: (left: T, right: T) => boolean = Object.is
): AggregateValue<T> {
  if (values.length === 0) return { state: "mixed" };
  const first = values[0];
  return values.every((value) => equals(first, value))
    ? { state: "uniform", value: first }
    : { state: "mixed" };
}

export function uniformValue<T>(value: T): AggregateValue<T> {
  return { state: "uniform", value };
}

export function aggregateIsUniform<T>(
  value: AggregateValue<T>
): value is Extract<AggregateValue<T>, { state: "uniform" }> {
  return value.state === "uniform";
}
