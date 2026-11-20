import { buildConnectivity, type ConnectivityResult } from "./connectivity";
import { pointKey } from "./geometry";
import type { SchematicGraphAdapter, SchematicGraphCell } from "./graphAdapter";
import { junctionId } from "./junctionIdentity";
import { resolveLayerObjects } from "./layerObjectStateModel";
import { resolveSchematicNets, type NetResolution } from "./netResolution";
import { pruneJunctionAppearances } from "./networkColorModel";
import type { Point, SchematicDocument } from "./types";

export interface SchematicJunctionRenderCell extends SchematicGraphCell {
  readonly id: string | number;
  get(key: string): unknown;
  toFront(): unknown;
}

export type JunctionRequestAnimationFrame = (
  callback: (timestamp: number) => void
) => number;

export type JunctionCancelAnimationFrame = (handle: number) => void;

export interface SchematicJunctionRenderCoordinatorOptions<
  Cell extends SchematicJunctionRenderCell = SchematicJunctionRenderCell
> {
  document: SchematicDocument;
  graphAdapter: SchematicGraphAdapter<Cell>;
  makeJunctionCell: (point: Point) => Cell;
  getPresentationMode: () => boolean;
  onLiveRefresh?: () => void;
  requestAnimationFrame?: JunctionRequestAnimationFrame;
  cancelAnimationFrame?: JunctionCancelAnimationFrame;
}

export class SchematicJunctionRenderCoordinator<
  Cell extends SchematicJunctionRenderCell = SchematicJunctionRenderCell
> {
  private readonly junctionCellIds = new Set<string>();
  private liveRefreshFrame: number | null = null;

  constructor(private readonly options: SchematicJunctionRenderCoordinatorOptions<Cell>) {}

  scheduleLiveRefresh() {
    if (this.liveRefreshFrame !== null) return;
    this.liveRefreshFrame = this.requestFrame(() => {
      this.liveRefreshFrame = null;
      this.refreshLive();
    });
  }

  cancelScheduledRefresh() {
    if (this.liveRefreshFrame === null) return;
    this.cancelFrame(this.liveRefreshFrame);
    this.liveRefreshFrame = null;
  }

  prepareForGraphClear() {
    this.cancelScheduledRefresh();
    this.junctionCellIds.clear();
  }

  adoptCurrentGraph() {
    this.cancelScheduledRefresh();
    this.junctionCellIds.clear();
    this.options.graphAdapter.getCells().forEach((cell) => {
      if (cell.get("junction")) this.junctionCellIds.add(String(cell.id));
    });
  }

  refreshFull(resolution?: NetResolution) {
    this.cancelScheduledRefresh();
    const currentResolution = resolution ?? resolveSchematicNets(this.options.document);
    this.options.document.junctions = currentResolution.connectivity.junctions.map((point) => ({ ...point }));
    pruneJunctionAppearances(this.options.document);
    this.refreshViews(currentResolution.connectivity);
    return currentResolution;
  }

  refreshViews(connectivity?: ConnectivityResult) {
    const { document } = this.options;
    if (this.options.getPresentationMode()) connectivity ??= buildConnectivity(document);
    const { displayed } = resolveLayerObjects(document, connectivity?.junctionMembers);
    const junctions = (this.options.getPresentationMode() ? connectivity!.presentationJunctions : document.junctions)
      .filter(point => displayed(junctionId(point)));
    const retainedKeys = new Set(junctions.map((point) => pointKey(point)));

    Array.from(this.junctionCellIds).forEach((id) => {
      const cell = this.options.graphAdapter.getCell(id);
      const key = String(cell?.get("junctionKey") ?? "");
      if (cell && retainedKeys.has(key)) return;
      this.options.graphAdapter.removeCell(id);
      this.junctionCellIds.delete(id);
    });

    junctions.forEach((point) => {
      const id = junctionId(point);
      if (this.junctionCellIds.has(id) && this.options.graphAdapter.getCell(id)) return;
      this.junctionCellIds.delete(id);
      const cell = this.options.makeJunctionCell(point);
      this.junctionCellIds.add(String(cell.id));
      this.options.graphAdapter.addCell(cell);
      cell.toFront();
    });
  }

  private refreshLive() {
    const connectivity = buildConnectivity(this.options.document);
    this.options.document.junctions = connectivity.junctions;
    pruneJunctionAppearances(this.options.document);
    this.refreshViews(connectivity);
    this.options.onLiveRefresh?.();
  }

  private requestFrame(callback: (timestamp: number) => void) {
    return this.options.requestAnimationFrame
      ? this.options.requestAnimationFrame(callback)
      : window.requestAnimationFrame(callback);
  }

  private cancelFrame(handle: number) {
    if (this.options.cancelAnimationFrame) {
      this.options.cancelAnimationFrame(handle);
      return;
    }
    window.cancelAnimationFrame(handle);
  }
}
