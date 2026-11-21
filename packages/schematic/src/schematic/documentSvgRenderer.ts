import {
  contentFromDocument,
  normalizeSchematicContent
} from "./document/documentModel";
import { pointKey } from "./geometry";
import { junctionId } from "./junctionIdentity";
import { resolveLayerObjects } from "./layerObjectStateModel";
import { layerObjectStackIds } from "./layerObjectTreeModel";
import { renderSchematicSvgScene } from "./svgRenderer";
import { deriveSchematicTopology, type SchematicDerivedTopology } from "./topology";
import { escapeAttribute } from "./uiUtils";
import { svgIdFragment } from "./svgId";
import { wireEndpointConnections } from "./wire/wireEndpointConnection";
import type { Rect } from "./view-geometry";
import type { SchematicContent, SchematicDocument } from "./types";
import { GRID_SIZE } from "./types";

const EMPTY_VIEW_BOX: Rect = { x: -100, y: -80, width: 200, height: 160 };

export interface SchematicDocumentSvgOptions {
  namespace: string;
  padding?: number;
  presentationMode?: boolean;
  includeHidden?: boolean;
  showGrid?: boolean;
  backgroundColor?: string | null;
}

export interface SchematicDocumentSvgRender {
  svg: string;
  bounds: Rect | null;
  viewBox: Rect;
  width: number;
  height: number;
  topology: SchematicDerivedTopology;
}

/** Renders a complete schematic without DOM, JointJS, storage, or Analysis. */
export function renderSchematicDocumentSvg(
  source: SchematicContent | SchematicDocument,
  options: SchematicDocumentSvgOptions
): SchematicDocumentSvgRender {
  const content = "junctions" in source
    ? normalizeSchematicContent(contentFromDocument(source))
    : normalizeSchematicContent(source);
  const topology = deriveSchematicTopology(content);
  const document: SchematicDocument = {
    ...structuredClone(content),
    junctions: topology.junctions.map((point) => ({ ...point }))
  };
  const presentationMode = options.presentationMode ?? true;
  const junctionPoints = presentationMode
    ? topology.presentationJunctions
    : topology.junctions;
  const junctionColors = Object.fromEntries(
    document.junctionAppearances.map((appearance) => [pointKey(appearance.point), appearance.color])
  );
  const netLabelStatuses = Object.fromEntries(
    Array.from(topology.netResolution.labelStates, ([id, state]) => [id, state.status])
  );
  const projection = resolveLayerObjects(document, topology.connectivity.junctionMembers, {
    includeHidden: options.includeHidden
  });
  const { displayed } = projection;
  const layerObjectOrder = layerObjectStackIds({ ...document, junctions: junctionPoints }, projection);
  const wires = document.wires.filter(wire => displayed(wire.id));
  const wireEndpoints = new Map(wires.map(wire => [wire.id, wireEndpointConnections(document, wire)]));
  const rendered = renderSchematicSvgScene(
    {
      symbolTemplate: document.symbolTemplate,
      components: document.components.filter(component => displayed(component.id)),
      inductorCouplings: (document.inductorCouplings ?? []).filter(coupling => displayed(coupling.id)),
      wires,
      wireEndpoints,
      junctionPoints: junctionPoints.filter(point => displayed(junctionId(point))),
      junctionColors,
      netLabels: document.netLabels.filter(label => displayed(label.id)),
      netLabelStatuses,
      notes: document.notes.filter(note => displayed(note.id)),
      layerObjectOrder
    },
    {
      presentationMode,
      portableNotes: true,
      padding: options.padding,
      namespace: options.namespace,
      showGrid: options.showGrid,
      backgroundColor: options.backgroundColor === undefined ? "#ffffff" : options.backgroundColor
    }
  );

  if (!rendered) {
    return {
      svg: renderEmptySvg(options),
      bounds: null,
      viewBox: EMPTY_VIEW_BOX,
      width: EMPTY_VIEW_BOX.width,
      height: EMPTY_VIEW_BOX.height,
      topology
    };
  }

  return {
    svg: rendered.svg,
    bounds: rendered.bounds,
    viewBox: rendered.viewBox,
    width: rendered.width,
    height: rendered.height,
    topology
  };
}

function renderEmptySvg(options: SchematicDocumentSvgOptions) {
  const namespace = svgIdFragment(options.namespace);
  const patternId = `${namespace}-grid`;
  const backgroundColor = options.backgroundColor === undefined ? "#ffffff" : options.backgroundColor;
  const background = backgroundColor
    ? `<rect x="${EMPTY_VIEW_BOX.x}" y="${EMPTY_VIEW_BOX.y}" width="${EMPTY_VIEW_BOX.width}" height="${EMPTY_VIEW_BOX.height}" fill="${escapeAttribute(backgroundColor)}" />`
    : "";
  const grid = options.showGrid
    ? `<defs><pattern id="${escapeAttribute(patternId)}" width="${GRID_SIZE}" height="${GRID_SIZE}" patternUnits="userSpaceOnUse"><path d="M ${GRID_SIZE} 0 L 0 0 0 ${GRID_SIZE}" fill="none" stroke="#d8dee8" stroke-width="0.6" /></pattern></defs><rect x="${EMPTY_VIEW_BOX.x}" y="${EMPTY_VIEW_BOX.y}" width="${EMPTY_VIEW_BOX.width}" height="${EMPTY_VIEW_BOX.height}" fill="url(#${escapeAttribute(patternId)})" />`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${EMPTY_VIEW_BOX.width}" height="${EMPTY_VIEW_BOX.height}" viewBox="${EMPTY_VIEW_BOX.x} ${EMPTY_VIEW_BOX.y} ${EMPTY_VIEW_BOX.width} ${EMPTY_VIEW_BOX.height}">${background}${grid}</svg>`;
}
