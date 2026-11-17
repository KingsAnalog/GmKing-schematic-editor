import { dia, shapes } from "@joint/core";
import { SchematicGraphAdapter, type SchematicGraphLike } from "./graphAdapter";
import { createSchematicGraph, SCHEMATIC_GRID } from "./renderer";
import { SchematicViewAdapter, type SchematicViewPaper } from "./viewAdapter";
import { GRID_SIZE } from "./types";
import { SymbolElementView } from "./componentRenderer";

type SchematicGeometryEvent = "change:position" | "change:source" | "change:target" | "change:vertices";
type SchematicGeometryHandler = (cell: unknown) => void;

type SchematicSurfaceGraph = SchematicGraphLike<any> & {
  on(eventName: SchematicGeometryEvent, handler: SchematicGeometryHandler): unknown;
};

type SchematicSurfacePaper = SchematicViewPaper & {
  freeze?: () => void;
  unfreeze?: () => void;
  remove?: () => void;
  getLayerView?: (name: string) => { updateGrid?: () => void };
};

type SchematicPaperInteractive = boolean | ((cellView: any) => unknown);

type SchematicPaperOptions<Graph extends SchematicSurfaceGraph> = {
  el: HTMLElement;
  model: Graph;
  width: string;
  height: string;
  gridSize: number;
  drawGrid: typeof SCHEMATIC_GRID;
  background: { color: string };
  cellViewNamespace: typeof shapes;
  elementView: (element: dia.Element) => typeof dia.ElementView;
  validateMagnet: () => boolean;
  interactive: SchematicPaperInteractive;
};

type SchematicPaperFactory<Graph extends SchematicSurfaceGraph, Paper extends SchematicSurfacePaper> = (options: SchematicPaperOptions<Graph>) => Paper;

const GEOMETRY_EVENTS: readonly SchematicGeometryEvent[] = ["change:position", "change:source", "change:target", "change:vertices"];

export type SchematicPaperSurface<Graph extends SchematicSurfaceGraph = SchematicSurfaceGraph, Paper extends SchematicSurfacePaper = SchematicSurfacePaper> = {
  graph: Graph;
  graphAdapter: SchematicGraphAdapter<any>;
  paper: Paper;
  viewAdapter: SchematicViewAdapter;
  onGeometryChange(handler: SchematicGeometryHandler): void;
  destroy(): void;
};

export type SchematicPaperSurfaceOptions<Graph extends SchematicSurfaceGraph = SchematicSurfaceGraph, Paper extends SchematicSurfacePaper = SchematicSurfacePaper> = {
  paperEl: HTMLElement;
  viewportEl?: HTMLElement;
  interactive: SchematicPaperInteractive;
  createGraph?: () => Graph;
  createPaper?: SchematicPaperFactory<Graph, Paper>;
};

export function createSchematicPaperSurface<Graph extends SchematicSurfaceGraph = SchematicSurfaceGraph, Paper extends SchematicSurfacePaper = SchematicSurfacePaper>(
  options: SchematicPaperSurfaceOptions<Graph, Paper>
): SchematicPaperSurface<Graph, Paper> {
  const graph = (options.createGraph ?? (() => createSchematicGraph() as unknown as Graph))();
  const graphAdapter = new SchematicGraphAdapter(graph);
  const createPaper = options.createPaper ?? ((paperOptions: SchematicPaperOptions<Graph>) => new dia.Paper(paperOptions as any) as unknown as Paper);
  const paper = createPaper({
    el: options.paperEl,
    model: graph,
    width: "100%",
    height: "100%",
    gridSize: GRID_SIZE,
    drawGrid: SCHEMATIC_GRID,
    background: { color: "#ffffff" },
    cellViewNamespace: shapes,
    elementView: (element) => element.get("type") === "eda.Symbol" ? SymbolElementView : dia.ElementView,
    // Wire routing is owned by SchematicWireToolController, not JointJS link gestures.
    validateMagnet: () => false,
    interactive: options.interactive
  });
  const viewAdapter = new SchematicViewAdapter(paper, options.viewportEl ?? options.paperEl);
  // A percentage-sized paper may be created while its host is hidden. JointJS
  // only refreshes its grid on paper transforms/resizes, not CSS layout changes.
  const ResizeObserverCtor = options.paperEl.ownerDocument?.defaultView?.ResizeObserver;
  const resizeObserver = ResizeObserverCtor
    ? new ResizeObserverCtor(() => paper.getLayerView?.(dia.Paper.Layers.GRID).updateGrid?.())
    : null;
  resizeObserver?.observe(options.paperEl);

  return {
    graph,
    graphAdapter,
    paper,
    viewAdapter,
    onGeometryChange(handler: SchematicGeometryHandler) {
      GEOMETRY_EVENTS.forEach((eventName) => graph.on(eventName, handler));
    },
    destroy() {
      resizeObserver?.disconnect();
      paper.remove?.();
      graph.clear();
    }
  };
}
