import { renderSchematicSvgScene, schematicSvgSceneBounds, type SchematicSvgScene } from "../svgRenderer";
import { svgIdFragment } from "../svgId";
import type { Rect } from "../view-geometry";
import type { ComponentInstance, InductorCoupling, NetLabel, Point, SchematicConnections, SchematicNote, Wire } from "../types";
import type { NetLabelStatus } from "../netResolution";
import type { SymbolTemplateContext } from "../symbolTemplateModel";

const EXPORT_PADDING = 24;

export interface SchematicSelectionExportInput extends SymbolTemplateContext {
  display?: SchematicSvgScene["display"];
  crossingJunctions?: SchematicSvgScene["crossingJunctions"];
  connections?: SchematicConnections;
  components: ComponentInstance[];
  inductorCouplings?: InductorCoupling[];
  wires: Wire[];
  wireEndpoints?: SchematicSvgScene["wireEndpoints"];
  busWireIds?: SchematicSvgScene["busWireIds"];
  junctionPoints: Point[];
  junctionColors?: Readonly<Record<string, string>>;
  netLabels: NetLabel[];
  netLabelStatuses?: Readonly<Record<string, NetLabelStatus>>;
  notes: SchematicNote[];
  layerObjectOrder?: readonly string[];
  noteGraphics?: SchematicSvgScene["noteGraphics"];
  presentationMode?: boolean;
  padding?: number;
  namespace?: string;
  showGrid?: boolean;
  backgroundColor?: string | null;
}

export interface SchematicSelectionSvgExport {
  svg: string;
  clipboardSvg?: string;
  bounds: Rect;
  viewBox: Rect;
  width: number;
  height: number;
}

export function schematicSelectionExportBounds(input: SchematicSelectionExportInput) {
  return schematicSvgSceneBounds(input, input);
}

export function buildSchematicSelectionSvg(input: SchematicSelectionExportInput): SchematicSelectionSvgExport | null {
  const namespace = svgIdFragment(input.namespace ?? "schematic-selection");
  const options = {
    namespace,
    padding: input.padding ?? EXPORT_PADDING,
    presentationMode: input.presentationMode,
    showGrid: input.showGrid,
    backgroundColor: input.backgroundColor
  };
  const rendered = renderSchematicSvgScene(input, options);
  if (!rendered) return null;
  return {
    ...rendered,
    clipboardSvg: rendered.svg
  };
}
