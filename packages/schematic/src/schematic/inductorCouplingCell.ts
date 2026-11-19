import { dia } from "@joint/core";
import { inductorCouplingGeometry } from "./inductorCouplingGeometry";
import {
  INDUCTOR_COUPLING_COLOR,
  INDUCTOR_COUPLING_LABEL_FONT_SIZE,
  inductorCouplingCellAttrs
} from "./inductorCouplingRenderer";
import type { InductorCoupling, SchematicDocument } from "./types";
import { SCHEMATIC_FONT_STACK } from "./schematicFont";

export const InductorCouplingElement = (dia.Element as any).define(
  "eda.InductorCoupling",
  {
    attrs: {
      frame: { fill: "transparent", stroke: "none", pointerEvents: "none" },
      selectionHalo: { fill: "none", stroke: "none", pointerEvents: "none" },
      core: { fill: "none", stroke: INDUCTOR_COUPLING_COLOR, pointerEvents: "none" },
      arc: { fill: "none", stroke: INDUCTOR_COUPLING_COLOR, pointerEvents: "none" },
      arrows: { fill: INDUCTOR_COUPLING_COLOR, stroke: "none", pointerEvents: "none" },
      hit: { fill: "none", stroke: "transparent", pointerEvents: "stroke", cursor: "pointer" },
      label: {
        fill: INDUCTOR_COUPLING_COLOR,
        stroke: "none",
        fontFamily: SCHEMATIC_FONT_STACK,
        fontSize: INDUCTOR_COUPLING_LABEL_FONT_SIZE,
        fontWeight: 700,
        textAnchor: "middle",
        dominantBaseline: "central",
        pointerEvents: "none"
      }
    }
  },
  {
    markup: [
      { tagName: "rect", selector: "frame" },
      { tagName: "path", selector: "selectionHalo" },
      { tagName: "path", selector: "core" },
      { tagName: "path", selector: "arc" },
      { tagName: "path", selector: "arrows" },
      { tagName: "path", selector: "hit" },
      { tagName: "text", selector: "label" }
    ]
  }
);

export function makeInductorCouplingCell(
  document: SchematicDocument,
  coupling: InductorCoupling,
  selected = false
) {
  const geometry = inductorCouplingGeometry(document, coupling);
  if (!geometry || !geometry.hitPath) return null;
  const { bounds } = geometry;
  const transform = `translate(${-bounds.x} ${-bounds.y})`;
  const element = new InductorCouplingElement({
    id: coupling.id,
    position: { x: bounds.x, y: bounds.y },
    size: { width: bounds.width, height: bounds.height },
    attrs: {
      frame: { x: 0, y: 0, width: bounds.width, height: bounds.height },
      ...inductorCouplingCellAttrs(document, coupling, selected)
    }
  });
  ["selectionHalo", "core", "arc", "arrows", "hit"].forEach((selector) => {
    element.attr(`${selector}/transform`, transform);
  });
  element.attr({
    label: {
      x: geometry.labelPosition.x - bounds.x,
      y: geometry.labelPosition.y - bounds.y
    }
  });
  element.set("couplingId", coupling.id);
  return element;
}
