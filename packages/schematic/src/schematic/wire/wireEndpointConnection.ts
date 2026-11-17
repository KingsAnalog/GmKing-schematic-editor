import { resolveComponentDef } from "../catalog";
import type { ComponentInstance, SchematicConnections, Wire } from "../types";
import type { WireEndpointConnections } from "./wireDecoration";

export interface WireEndpointConnectionContext {
  components: readonly ComponentInstance[];
  wires: readonly Wire[];
  connections?: SchematicConnections;
}

export function wireEndpointConnections(
  context: WireEndpointConnectionContext,
  wire: Wire
): WireEndpointConnections {
  if (context.connections) {
    const graph = context.connections;
    const connected = (index: number) => {
      const node = graph.wires[wire.id]?.[index];
      if (!node) return false;
      return context.wires.some(other => other.id !== wire.id && !other.temporarilyDeleted && graph.wires[other.id]?.includes(node))
        || context.components.some(component => !component.temporarilyDeleted && resolveComponentDef(component).pins.some(pin => graph.pins[component.id]?.[pin.id] === node));
    };
    return { start: connected(0), end: connected(wire.points.length - 1) };
  }
  return { start: false, end: false };
}
