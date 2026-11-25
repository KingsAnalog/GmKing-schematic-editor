import { parseEngineeringValue } from "../shared/engineeringUnits";
import { normalizeHexColor } from "../shared/color";
import { DEFAULT_COMPONENT_COLOR } from "./componentPropertyModel";
import {
  INDUCTOR_DOT_VALUE_KEY,
  INDUCTOR_TAP_VALUE_KEY,
  inductorDotTerminal,
  inductorTap,
  isInductor,
  setInductorDotTerminal
} from "./inductorModel";
import type {
  ComponentInstance,
  InductorCoupling,
  InductorCouplingLabelMode,
  SchematicDocument
} from "./types";

export const DEFAULT_INDUCTOR_COUPLING_LABEL_MODE: InductorCouplingLabelMode = "coefficient";

const LABEL_MODES = new Set<InductorCouplingLabelMode>(["coefficient", "ratio"]);

export function inductorCouplingCustomColor(coupling: InductorCoupling): string | null {
  const color = normalizeHexColor(coupling.appearance?.color);
  return color && color !== DEFAULT_COMPONENT_COLOR ? color : null;
}

export function inductorCouplingColor(coupling: InductorCoupling) {
  return inductorCouplingCustomColor(coupling) ?? DEFAULT_COMPONENT_COLOR;
}

export function setInductorCouplingColor(
  document: Pick<SchematicDocument, "inductorCouplings">,
  couplingId: string,
  value: string | null
) {
  const coupling = documentInductorCouplings(document).find((candidate) => candidate.id === couplingId);
  if (!coupling) return false;
  const normalized = value === null ? null : normalizeHexColor(value);
  if (value !== null && !normalized) return false;
  const next = normalized === DEFAULT_COMPONENT_COLOR ? null : normalized;
  if (inductorCouplingCustomColor(coupling) === next) return false;
  if (next) coupling.appearance = { color: next };
  else delete coupling.appearance;
  return true;
}

export function documentInductorCouplings(document: Pick<SchematicDocument, "inductorCouplings">) {
  return document.inductorCouplings ?? [];
}

export function couplingPairKey(inductorAId: string, inductorBId: string) {
  return [inductorAId, inductorBId].sort().join("\u0000");
}

export function findInductorCoupling(
  document: Pick<SchematicDocument, "inductorCouplings">,
  inductorAId: string,
  inductorBId: string
) {
  const key = couplingPairKey(inductorAId, inductorBId);
  return documentInductorCouplings(document).find((coupling) =>
    couplingPairKey(coupling.inductorAId, coupling.inductorBId) === key
  ) ?? null;
}

export function inductorCouplingsFor(
  document: Pick<SchematicDocument, "inductorCouplings">,
  inductorId: string
) {
  return documentInductorCouplings(document).filter((coupling) =>
    coupling.inductorAId === inductorId || coupling.inductorBId === inductorId
  );
}

export function couplingPartnerId(coupling: InductorCoupling, inductorId: string) {
  return coupling.inductorAId === inductorId ? coupling.inductorBId : coupling.inductorAId;
}

export function autoCouplingCoefficient(
  first: Pick<ComponentInstance, "ref">,
  second: Pick<ComponentInstance, "ref">
) {
  const left = coefficientToken(first.ref);
  const right = coefficientToken(second.ref);
  const shared = commonPrefix(left, right);
  const leftTail = left.slice(shared.length) || left;
  const rightTail = right.slice(shared.length) || right;
  return `k${leftTail}${rightTail}`;
}

export function normalizeInductorCouplings(document: SchematicDocument) {
  const inductors = document.components.filter(isInductor);
  const inductorsById = new Map(inductors.map((component) => [component.id, component]));
  const order = new Map(document.components.map((component, index) => [component.id, index]));
  const seenPairs = new Set<string>();
  const seenIds = new Set<string>();
  const normalized: InductorCoupling[] = [];

  documentInductorCouplings(document).forEach((source) => {
    if (!source || typeof source !== "object") return;
    const first = inductorsById.get(String(source.inductorAId));
    const second = inductorsById.get(String(source.inductorBId));
    if (!first || !second || first.id === second.id) return;
    const pairKey = couplingPairKey(first.id, second.id);
    if (seenPairs.has(pairKey)) return;
    seenPairs.add(pairKey);

    const ordered = (order.get(first.id) ?? 0) <= (order.get(second.id) ?? 0)
      ? [first, second] as const
      : [second, first] as const;
    let id = String(source.id || `coupling-${ordered[0].id}-${ordered[1].id}`);
    if (seenIds.has(id)) id = `${id}-${normalized.length + 1}`;
    seenIds.add(id);
    const coefficientAuto = source.coefficientAuto !== false;
    const coefficient = coefficientAuto
      ? autoCouplingCoefficient(ordered[0], ordered[1])
      : String(source.coefficient ?? "").trim() || autoCouplingCoefficient(ordered[0], ordered[1]);
    const labelMode = source.labelMode;
    const showLabel = source.showLabel;
    const customColor = inductorCouplingCustomColor(source);
    normalized.push({
      id,
      inductorAId: ordered[0].id,
      inductorBId: ordered[1].id,
      coefficient,
      coefficientAuto,
      labelMode,
      showLabel,
      showArc: source.showArc !== false,
      showCore: source.showCore === true,
      arcFlipped: source.arcFlipped === true,
      ...(source.layerId === undefined ? {} : { layerId: source.layerId }),
      ...(customColor ? { appearance: { color: customColor } } : {})
    });
  });

  if (normalized.length > 0) document.inductorCouplings = normalized;
  else delete document.inductorCouplings;
  return normalized;
}

export function addInductorCoupling(
  document: SchematicDocument,
  inductorAId: string,
  inductorBId: string,
  id: string
) {
  const first = document.components.find((component) => component.id === inductorAId && isInductor(component));
  const second = document.components.find((component) => component.id === inductorBId && isInductor(component));
  if (!first || !second || first.id === second.id) return null;
  const existing = findInductorCoupling(document, first.id, second.id);
  if (existing) return existing;
  const coupling: InductorCoupling = {
    id,
    inductorAId: first.id,
    inductorBId: second.id,
    coefficient: autoCouplingCoefficient(first, second),
    coefficientAuto: true,
    labelMode: DEFAULT_INDUCTOR_COUPLING_LABEL_MODE,
    showLabel: false,
    showArc: true,
    showCore: false,
    arcFlipped: false
  };
  document.inductorCouplings = [...documentInductorCouplings(document), coupling];
  if (inductorDotTerminal(first) === "none") setInductorDotTerminal(first, "p");
  if (inductorDotTerminal(second) === "none") setInductorDotTerminal(second, "p");
  normalizeInductorCouplings(document);
  return findInductorCoupling(document, first.id, second.id);
}

export function removeInductorCoupling(document: SchematicDocument, couplingId: string) {
  const previous = documentInductorCouplings(document);
  const next = previous.filter((coupling) => coupling.id !== couplingId);
  if (next.length === previous.length) return false;
  if (next.length > 0) document.inductorCouplings = next;
  else delete document.inductorCouplings;
  return true;
}

export function removeInductorCouplingsForIds(document: SchematicDocument, componentIds: ReadonlySet<string>) {
  const previous = documentInductorCouplings(document);
  const next = previous.filter((coupling) =>
    !componentIds.has(coupling.inductorAId) && !componentIds.has(coupling.inductorBId)
  );
  if (next.length === previous.length) return 0;
  if (next.length > 0) document.inductorCouplings = next;
  else delete document.inductorCouplings;
  return previous.length - next.length;
}

export function updateInductorCoupling(
  document: SchematicDocument,
  couplingId: string,
  patch: Partial<Pick<
    InductorCoupling,
    "coefficient" | "coefficientAuto" | "labelMode" | "showLabel" | "showArc" | "showCore" | "arcFlipped"
  >>
) {
  const coupling = documentInductorCouplings(document).find((candidate) => candidate.id === couplingId);
  if (!coupling) return false;
  const previous = JSON.stringify(coupling);
  if (patch.coefficientAuto === true) coupling.coefficientAuto = true;
  if (patch.coefficient !== undefined) {
    const value = patch.coefficient.trim();
    if (value) {
      coupling.coefficient = value;
      coupling.coefficientAuto = patch.coefficientAuto ?? false;
    }
  }
  if (patch.labelMode && LABEL_MODES.has(patch.labelMode)) coupling.labelMode = patch.labelMode;
  if (patch.showLabel !== undefined) coupling.showLabel = patch.showLabel;
  if (patch.showArc !== undefined) coupling.showArc = patch.showArc;
  if (patch.showCore !== undefined) coupling.showCore = patch.showCore;
  if (patch.arcFlipped !== undefined) coupling.arcFlipped = patch.arcFlipped;
  normalizeInductorCouplings(document);
  return JSON.stringify(findCouplingById(document, couplingId)) !== previous;
}

export function resetInductorCouplingCoefficient(document: SchematicDocument, couplingId: string) {
  return updateInductorCoupling(document, couplingId, { coefficientAuto: true });
}

export function inductorCouplingRatio(
  document: { components: readonly ComponentInstance[] },
  coupling: InductorCoupling
) {
  const first = document.components.find((component) => component.id === coupling.inductorAId);
  const second = document.components.find((component) => component.id === coupling.inductorBId);
  if (!first || !second) return null;
  const firstValue = parseEngineeringValue(first.values.main, { baseUnit: "H" });
  const secondValue = parseEngineeringValue(second.values.main, { baseUnit: "H" });
  if (firstValue === null || secondValue === null || firstValue <= 0 || secondValue <= 0) return null;
  return Math.sqrt(firstValue / secondValue);
}

export function inductorCouplingLabel(
  document: { components: readonly ComponentInstance[] },
  coupling: InductorCoupling
) {
  if (!coupling.showLabel) return "";
  if (coupling.labelMode === "coefficient") return coupling.coefficient;
  const ratio = inductorCouplingRatio(document, coupling);
  if (ratio === null) return "";
  return ratio >= 1
    ? `${formatRatio(ratio)}:1`
    : `1:${formatRatio(1 / ratio)}`;
}

export function activeInductorCouplings(document: SchematicDocument) {
  const activeIds = new Set(
    document.components
      .filter((component) => component.type === "inductor" && !component.temporarilyDeleted)
      .map((component) => component.id)
  );
  return documentInductorCouplings(document).filter((coupling) =>
    activeIds.has(coupling.inductorAId) && activeIds.has(coupling.inductorBId)
  );
}

function findCouplingById(document: Pick<SchematicDocument, "inductorCouplings">, couplingId: string) {
  return documentInductorCouplings(document).find((candidate) => candidate.id === couplingId) ?? null;
}

function coefficientToken(ref: string) {
  return ref.replace(/[^A-Za-z0-9]+/g, "") || "L";
}

function commonPrefix(left: string, right: string) {
  let length = 0;
  while (length < left.length && length < right.length && left[length].toLowerCase() === right[length].toLowerCase()) {
    length += 1;
  }
  return left.slice(0, length);
}

function formatRatio(value: number) {
  return String(Number(value.toPrecision(4)));
}

export function normalizeInductorValues(instance: ComponentInstance) {
  if (!isInductor(instance)) {
    delete instance.values[INDUCTOR_DOT_VALUE_KEY];
    delete instance.values[INDUCTOR_TAP_VALUE_KEY];
    return;
  }
  const dot = inductorDotTerminal(instance);
  if (dot === "none") delete instance.values[INDUCTOR_DOT_VALUE_KEY];
  else instance.values[INDUCTOR_DOT_VALUE_KEY] = dot;
  const tap = inductorTap(instance);
  if (tap === "none") delete instance.values[INDUCTOR_TAP_VALUE_KEY];
  else instance.values[INDUCTOR_TAP_VALUE_KEY] = tap;
}
