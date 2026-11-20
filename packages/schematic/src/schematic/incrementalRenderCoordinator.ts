import type { SchematicGraphAdapter, SchematicGraphCell } from "./graphAdapter";
import { junctionId } from "./junctionIdentity";
import { resolveLayerObjects } from "./layerObjectStateModel";
import { wireDecorationLabels, wireLineAttrs, wireSelectionHaloAttrs } from "./renderer";
import type { ComponentInstance, Point, SchematicDocument, Wire } from "./types";
import { wireEndpointConnections } from "./wire/wireEndpointConnection";
import { samePoint } from "./geometry";

export interface SchematicIncrementalRenderCell extends SchematicGraphCell {
  get(key: string): unknown;
  set(key: string, value: unknown): unknown;
  source(point: Point): unknown;
  target(point: Point): unknown;
  vertices(points: Point[]): unknown;
  attr(attributes: Record<string, unknown>): unknown;
}

export interface SchematicIncrementalRenderCoordinatorOptions<
  Cell extends SchematicIncrementalRenderCell = SchematicIncrementalRenderCell
> {
  graphAdapter: SchematicGraphAdapter<Cell>;
  document: SchematicDocument;
  makeComponentCell: (component: ComponentInstance) => Cell;
  makeWireCell: (wire: Wire) => Cell;
  makeJunctionCell: (point: Point) => Cell;
  isWireSelected: (wireId: string) => boolean;
}

export class SchematicIncrementalRenderCoordinator<
  Cell extends SchematicIncrementalRenderCell = SchematicIncrementalRenderCell
> {
  private applyingDocumentGeometry = false;

  constructor(private readonly options: SchematicIncrementalRenderCoordinatorOptions<Cell>) {}

  get isApplyingDocumentGeometry() {
    return this.applyingDocumentGeometry;
  }

  runWithDocumentGeometryGuard<T>(operation: () => T): T {
    const wasApplyingDocumentGeometry = this.applyingDocumentGeometry;
    this.applyingDocumentGeometry = true;
    try {
      return operation();
    } finally {
      this.applyingDocumentGeometry = wasApplyingDocumentGeometry;
    }
  }

  replaceGraphCellPreservingZ(id: string, nextCell: Cell) {
    const previousCell = this.options.graphAdapter.getCell(id);
    const z = previousCell?.get("z");
    if (previousCell) this.options.graphAdapter.removeCell(id);
    if (z !== undefined && z !== null) nextCell.set("z", z);
    const projection = resolveLayerObjects(this.options.document);
    if (projection.displayed(id)) {
      this.addLayerCell(id, nextCell, projection);
    }
    return nextCell;
  }

  private addLayerCell(id: string, cell: Cell, projection: ReturnType<typeof resolveLayerObjects>) {
    if (projection.layerOf(id).locked) {
      cell.set("layerLocked", true);
      cell.attr({ root: { pointerEvents: "none" } });
    }
    this.options.graphAdapter.addCell(cell);
  }

  replaceComponent(component: ComponentInstance) {
    return this.runWithDocumentGeometryGuard(() =>
      this.replaceGraphCellPreservingZ(component.id, this.options.makeComponentCell(component))
    );
  }

  replaceWire(wire: Wire) {
    return this.runWithDocumentGeometryGuard(() =>
      this.replaceGraphCellPreservingZ(wire.id, this.options.makeWireCell(wire))
    );
  }

  replaceJunction(point: Point) {
    return this.runWithDocumentGeometryGuard(() =>
      this.replaceGraphCellPreservingZ(junctionId(point), this.options.makeJunctionCell(point))
    );
  }

  updateWireCellsFromDocument(wireIds: ReadonlySet<string>) {
    if (wireIds.size === 0) return;

    const projection = resolveLayerObjects(this.options.document);
    const wiresById = wireIds.size > 1
      ? new Map(this.options.document.wires.map((wire) => [wire.id, wire]))
      : null;
    this.runWithDocumentGeometryGuard(() => {
      wireIds.forEach((wireId) => {
        const wire = wiresById?.get(wireId)
          ?? this.options.document.wires.find((candidate) => candidate.id === wireId);
        const cell = this.options.graphAdapter.getCell(wireId);
        if (!wire) {
          if (cell) this.options.graphAdapter.removeCell(wireId);
          return;
        }
        if (!projection.displayed(wire.id)) {
          if (cell) this.options.graphAdapter.removeCell(wireId);
          return;
        }

        // Collinear vertices can carry electrical contacts. Rendering must not
        // simplify or mutate the document's vertex-to-connection bindings.
        const points = wire.points;
        if (points.length < 2 || points.every(point => samePoint(point, points[0]))) {
          if (cell && points[0]) {
            cell.source({ ...points[0] });
            cell.target({ ...points[0] });
            cell.vertices([]);
            cell.attr({
              line: { ...wireLineAttrs(wire), opacity: 0, pointerEvents: "none" },
              selectionHalo: { ...wireSelectionHaloAttrs(wire), opacity: 0 },
              wrapper: { pointerEvents: "none" }
            });
            cell.set("labels", []);
          }
          return;
        }

        if (!cell) {
          this.addLayerCell(wire.id, this.options.makeWireCell(wire), projection);
          return;
        }

        cell.source({ ...points[0] });
        cell.target({ ...points[points.length - 1] });
        cell.vertices(points.slice(1, -1));
        const line = wireLineAttrs(wire);
        cell.attr({
          line,
          selectionHalo: wireSelectionHaloAttrs(wire, {
            selected: this.options.isWireSelected(wire.id)
          }),
          wrapper: { pointerEvents: "stroke" }
        });
        cell.set(
          "labels",
          wireDecorationLabels(wire, line, wireEndpointConnections(this.options.document, wire))
        );
      });
    });
  }
}
