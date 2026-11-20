import { cloneSchematicDocument } from "./document/documentModel";
import { executeSchematicPropertyBatchCommand } from "./propertyBatchCommands";
import { RectangleResizeSession, type RectangleResizeHandle } from "./rectangleResizeSession";
import { isTriangleVertex, type TriangleVertex } from "./triangleComponentModel";
import type { Point, SchematicDocument } from "./types";

export type ShapeResizeHandle = RectangleResizeHandle | TriangleVertex;

/** Shares the editor's pointer lifecycle while retaining each shape's geometry rules. */
export class ShapeResizeSession {
  private readonly rectangle: RectangleResizeSession;
  private triangle: { componentId: string; vertex: TriangleVertex; baseline: SchematicDocument } | null = null;
  constructor(private readonly document: SchematicDocument) {
    this.rectangle = new RectangleResizeSession(document);
  }
  get isActive() { return !!this.triangle || this.rectangle.isActive; }
  begin(componentId: string, handle: ShapeResizeHandle) {
    if (this.isActive) return false;
    const component = this.document.components.find(item => item.id === componentId);
    if (!component || component.temporarilyDeleted) return false;
    if (component.type === "triangle" && isTriangleVertex(handle)) {
      this.triangle = { componentId, vertex: handle, baseline: cloneSchematicDocument(this.document) };
      return true;
    }
    return component.type === "rectangle" && !isTriangleVertex(handle) && this.rectangle.begin(componentId, handle);
  }
  move(pointer: Point) {
    const active = this.triangle;
    if (!active) return this.rectangle.move(pointer);
    const next = cloneSchematicDocument(active.baseline);
    const result = executeSchematicPropertyBatchCommand(next,
      { selectedIds: [active.componentId], selectedNoteIds: [] },
      { kind: "triangle-vertex", vertex: active.vertex, point: pointer });
    if (result.kind === "rejected") return { active: true, changed: false, componentId: active.componentId };
    const changed = JSON.stringify(next) !== JSON.stringify(this.document);
    Object.assign(this.document, next);
    return { active: true, changed, componentId: active.componentId };
  }
  commit() {
    const active = this.triangle;
    if (!active) return this.rectangle.commit();
    this.triangle = null;
    const changed = JSON.stringify(this.document) !== JSON.stringify(active.baseline);
    return { kind: "committed" as const, changed, status: changed ? "Triangle reshaped." : "" };
  }
  cancel() {
    const active = this.triangle;
    if (!active) return this.rectangle.cancel();
    this.triangle = null;
    Object.assign(this.document, cloneSchematicDocument(active.baseline));
    return true;
  }
}
