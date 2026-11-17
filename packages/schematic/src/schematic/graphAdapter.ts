export interface SchematicGraphCell {
  remove(): void;
}

export interface SchematicGraphLike<Cell extends SchematicGraphCell = SchematicGraphCell> {
  clear(): void;
  addCell(cell: Cell): void;
  getCell(id: string): Cell | null | undefined;
  getCells(): Cell[];
}

export class SchematicGraphAdapter<Cell extends SchematicGraphCell = SchematicGraphCell> {
  constructor(private graph: SchematicGraphLike<Cell>) {}

  setGraph(graph: SchematicGraphLike<Cell>) {
    this.graph = graph;
  }

  clear() {
    this.graph.clear();
  }

  addCell(cell: Cell) {
    this.graph.addCell(cell);
  }

  addCells(cells: readonly Cell[]) {
    cells.forEach((cell) => this.addCell(cell));
  }

  getCell(id: string) {
    return this.graph.getCell(id) ?? null;
  }

  getCells() {
    return this.graph.getCells();
  }

  removeCell(id: string) {
    this.getCell(id)?.remove();
  }
}
