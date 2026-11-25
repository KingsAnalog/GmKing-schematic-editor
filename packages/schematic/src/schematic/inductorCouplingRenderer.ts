import { inductorCouplingGeometry } from "./inductorCouplingGeometry";
import { inductorCouplingColor } from "./inductorCouplingModel";
import { SYMBOL_STROKE_WIDTH } from "./symbols/symbolPrimitives";
import { escapeAttribute, escapeHtml } from "./uiUtils";
import type { ComponentInstance, InductorCoupling } from "./types";
import { SCHEMATIC_FONT_STACK } from "./schematicFont";

export const INDUCTOR_COUPLING_COLOR = "#111111";
export const INDUCTOR_COUPLING_SELECTED_COLOR = "#005f9e";
export const INDUCTOR_COUPLING_LABEL_FONT_SIZE = 12;

export function inductorCouplingCellAttrs(
  document: { components: readonly ComponentInstance[] },
  coupling: InductorCoupling,
  selected = false
) {
  const geometry = inductorCouplingGeometry(document, coupling);
  if (!geometry) return {};
  const color = inductorCouplingColor(coupling);
  return {
    selectionHalo: {
      d: geometry.hitPath,
      stroke: selected ? INDUCTOR_COUPLING_SELECTED_COLOR : "none",
      strokeWidth: 8,
      opacity: selected ? 0.28 : 0,
      strokeLinecap: "round",
      strokeLinejoin: "round"
    },
    core: {
      d: geometry.corePath,
      stroke: geometry.corePath ? color : "none",
      strokeWidth: 2 * SYMBOL_STROKE_WIDTH,
      strokeLinecap: "square"
    },
    arc: {
      d: geometry.arcPath,
      stroke: geometry.arcPath ? color : "none",
      strokeWidth: SYMBOL_STROKE_WIDTH,
      strokeLinecap: "round"
    },
    arrows: {
      d: geometry.arrowPath,
      fill: geometry.arrowPath ? color : "none"
    },
    hit: {
      d: geometry.hitPath,
      strokeWidth: 14
    },
    label: {
      text: geometry.label,
      fill: color,
      opacity: geometry.label ? 1 : 0
    }
  };
}

export function renderInductorCouplingSvg(
  document: { components: readonly ComponentInstance[] },
  coupling: InductorCoupling
) {
  const geometry = inductorCouplingGeometry(document, coupling);
  if (!geometry || !geometry.hitPath) return "";
  const color = inductorCouplingColor(coupling);
  const core = geometry.corePath
    ? `<path data-coupling-core d="${escapeAttribute(geometry.corePath)}" fill="none" stroke="${color}" stroke-width="${2 * SYMBOL_STROKE_WIDTH}" stroke-linecap="square" />`
    : "";
  const arc = geometry.arcPath
    ? `<path data-coupling-arc d="${escapeAttribute(geometry.arcPath)}" fill="none" stroke="${color}" stroke-width="${SYMBOL_STROKE_WIDTH}" stroke-linecap="round" />`
    : "";
  const arrows = geometry.arrowPath
    ? `<path data-coupling-arrows d="${escapeAttribute(geometry.arrowPath)}" fill="${color}" stroke="none" />`
    : "";
  const label = geometry.label
    ? `<text data-coupling-label x="${geometry.labelPosition.x}" y="${geometry.labelPosition.y}" fill="${color}" stroke="none" font-family="${escapeAttribute(SCHEMATIC_FONT_STACK)}" font-size="${INDUCTOR_COUPLING_LABEL_FONT_SIZE}" font-weight="700" text-anchor="middle" dominant-baseline="central">${escapeHtml(geometry.label)}</text>`
    : "";
  return `<g data-inductor-coupling-id="${escapeAttribute(coupling.id)}">${core}${arc}${arrows}${label}</g>`;
}
