import { renderSchematicSvgScene, schematicSvgSceneBounds, type SchematicSvgScene } from "../svgRenderer";
import { svgIdFragment } from "../svgId";
import type { Rect } from "../view-geometry";
import type { ComponentInstance, InductorCoupling, NetLabel, Point, SchematicConnections, SchematicNote, Wire } from "../types";
import type { NetLabelStatus } from "../netResolution";
import type { SymbolTemplateContext } from "../symbolTemplateModel";

const EXPORT_PADDING = 24;

export interface SchematicSelectionExportInput extends SymbolTemplateContext {
  connections?: SchematicConnections;
  components: ComponentInstance[];
  inductorCouplings?: InductorCoupling[];
  wires: Wire[];
  wireEndpoints?: SchematicSvgScene["wireEndpoints"];
  junctionPoints: Point[];
  junctionColors?: Readonly<Record<string, string>>;
  netLabels: NetLabel[];
  netLabelStatuses?: Readonly<Record<string, NetLabelStatus>>;
  notes: SchematicNote[];
  layerObjectOrder?: readonly string[];
  presentationMode?: boolean;
  padding?: number;
  renderedNoteHtml?: Readonly<Record<string, string>>;
  renderedNoteText?: Readonly<Record<string, string>>;
  renderedNoteTextStyles?: Readonly<Record<string, RenderedNoteTextStyle>>;
  namespace?: string;
  showGrid?: boolean;
  backgroundColor?: string | null;
}

export interface RenderedNoteTextStyle {
  fontWeight?: number;
  fontStyle?: "italic";
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
  const rendered = renderSchematicSvgScene(input, { ...options, portableNotes: false });
  if (!rendered) return null;
  const clipboard = renderSchematicSvgScene(input, { ...options, portableNotes: true });
  return {
    ...rendered,
    clipboardSvg: clipboard?.svg
  };
}
