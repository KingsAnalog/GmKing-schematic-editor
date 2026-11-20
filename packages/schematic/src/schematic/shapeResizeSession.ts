import { arcPoints, setArcVertex } from "./arcComponentModel";
import { setPolylineVertex, polylinePoints } from "./polylineComponentModel";
import { snapPoint } from "./geometry";
import { t } from "./schematicI18n";
import { cloneSchematicDocument } from "./document/documentModel";
import { executeSchematicPropertyBatchCommand } from "./propertyBatchCommands";
import { RectangleResizeSession, type RectangleResizeHandle } from "./rectangleResizeSession";
import { isTriangleVertex, type TriangleVertex } from "./triangleComponentModel";
import type { Point, SchematicDocument } from "./types";

export type ShapeResizeHandle = RectangleResizeHandle | TriangleVertex | number;

type VertexResize = { componentId: string; baseline: SchematicDocument } & (
  { kind: "triangle"; vertex: TriangleVertex } | { kind: "polyline" | "arc"; vertex: number }
);

/** Shares the editor's pointer lifecycle while retaining each shape's geometry rules. */
export class ShapeResizeSession {
  private readonly rectangle: RectangleResizeSession;
  private vertexResize: VertexResize | null = null;
  constructor(private readonly document: SchematicDocument) {
    this.rectangle = new RectangleResizeSession(document);
  }
  get isActive() { return !!this.vertexResize || this.rectangle.isActive; }
  begin(componentId: string, handle: ShapeResizeHandle) {
    if (this.isActive) return false;
    const component = this.document.components.find(item => item.id === componentId);
    if (!component || component.temporarilyDeleted) return false;
    if (component.type === "triangle" && isTriangleVertex(handle)) {
      this.vertexResize = { kind: "triangle", componentId, vertex: handle, baseline: cloneSchematicDocument(this.document) };
      return true;
    }
    if (typeof handle === "number" && (component.type === "polyline" || component.type === "arc")) {
      const points = component.type === "arc" ? arcPoints(component) : polylinePoints(component);
      if (!points[handle]) return false;
      this.vertexResize = { kind: component.type, componentId, vertex: handle, baseline: cloneSchematicDocument(this.document) };
      return true;
    }
    return component.type === "rectangle" && typeof handle === "string" && !isTriangleVertex(handle)
      && this.rectangle.begin(componentId, handle);
  }
  move(pointer: Point) {
    const active = this.vertexResize;
    if (!active) return this.rectangle.move(snapPoint(pointer));
    const next = cloneSchematicDocument(active.baseline);
    if (active.kind === "triangle") {
      const result = executeSchematicPropertyBatchCommand(next,
        { selectedIds: [active.componentId], selectedNoteIds: [] },
        { kind: "triangle-vertex", vertex: active.vertex, point: pointer });
      if (result.kind === "rejected") return { active: true, changed: false, componentId: active.componentId };
    } else {
      const component = next.components.find(item => item.id === active.componentId);
      const setVertex = active.kind === "arc" ? setArcVertex : setPolylineVertex;
      if (!component || !setVertex(component, active.vertex, pointer)) {
        return { active: true, changed: false, componentId: active.componentId };
      }
    }
    const changed = JSON.stringify(next) !== JSON.stringify(this.document);
    Object.assign(this.document, next);
    return { active: true, changed, componentId: active.componentId };
  }
  commit() {
    const active = this.vertexResize;
    if (!active) return this.rectangle.commit();
    this.vertexResize = null;
    const changed = JSON.stringify(this.document) !== JSON.stringify(active.baseline);
    const status = active.kind === "triangle" ? "Triangle reshaped."
      : active.kind === "arc" ? t("arc.reshaped", "Arc reshaped.") : t("polyline.reshaped", "Polyline reshaped.");
    return { kind: "committed" as const, changed, status: changed ? status : "" };
  }
  cancel() {
    const active = this.vertexResize;
    if (!active) return this.rectangle.cancel();
    this.vertexResize = null;
    Object.assign(this.document, cloneSchematicDocument(active.baseline));
    return true;
  }
}
