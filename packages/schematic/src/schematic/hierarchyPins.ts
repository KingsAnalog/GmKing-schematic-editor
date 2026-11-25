import { GRID_SIZE, type ComponentInstance, type PinDef } from "./types";
import { isPortName, SCALAR_IDENTIFIER } from "./busName";

export const PORT_TYPES = ["supply", "ground", "input", "output", "inout", "passive"] as const;
export const PORT_SIDES = ["left", "right", "top", "bottom"] as const;
export type PortType = typeof PORT_TYPES[number];
export type PortSide = typeof PORT_SIDES[number];
export const PORT_IDENTIFIER = SCALAR_IDENTIFIER;
export const PORT_TERMINAL = "terminal";

export interface SheetPort {
  id: string;
  name: string;
  type: PortType;
  direction: PortSide;
  order: number;
  slot: number;
}

export function readSheetPort(component: ComponentInstance): SheetPort {
  const { values } = component;
  return {
    id: component.id,
    name: component.ref,
    type: values["port:type"] as PortType,
    direction: values["port:side"] as PortSide,
    order: Number(values["port:order"]),
    slot: Number(values["port:slot"])
  };
}

export function validSheetPort(port: SheetPort) {
  return typeof port.id === "string" && !!port.id && typeof port.name === "string" && isPortName(port.name)
    && PORT_TYPES.includes(port.type) && PORT_SIDES.includes(port.direction)
    && Number.isSafeInteger(port.order) && port.order >= 0
    && Number.isInteger(port.slot) && port.slot >= 0 && port.slot < 256;
}

export function sheetPorts(components: readonly ComponentInstance[]) {
  return components.filter(component => component.type === "sheetPort" && !component.temporarilyDeleted)
    .map(readSheetPort).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

export function blockPorts(component: ComponentInstance): SheetPort[] {
  try {
    const ports: unknown = JSON.parse(component.values["sheet:ports"] ?? "[]");
    return Array.isArray(ports) && ports.every(port => port && validSheetPort(port)) ? ports : [];
  } catch {
    return [];
  }
}

export function roleForPort(type: PortType): PinDef["role"] {
  if (type === "input") return "in";
  if (type === "output") return "out";
  // The project, rather than the role of a formal port, declares global nets.
  return "io";
}

export function blockGeometry(ports: readonly SheetPort[]) {
  const lead = GRID_SIZE;
  const slotPitch = GRID_SIZE * 3;
  const across = Math.max(0, ...ports.filter(port => port.direction === "top" || port.direction === "bottom").map(port => port.slot));
  const down = Math.max(0, ...ports.filter(port => port.direction === "left" || port.direction === "right").map(port => port.slot));
  const width = 280 + 2 * slotPitch * Math.max(0, across - 5);
  const height = 160 + 2 * slotPitch * Math.max(0, down - 3);
  const pins = ports.map((port): PinDef => {
    const offset = (port.slot % 2 === 0 ? 1 : -1) * Math.ceil(port.slot / 2) * slotPitch;
    const side = port.direction;
    return {
      id: port.id, label: port.name, role: roleForPort(port.type),
      x: side === "left" ? -width / 2 : side === "right" ? width / 2 : offset,
      y: side === "top" ? -height / 2 : side === "bottom" ? height / 2 : offset
    };
  });
  return { size: { width, height }, pins, lead };
}

export function nextPortSlot(ports: readonly SheetPort[], side: PortSide) {
  const used = new Set(ports.filter(port => port.direction === side).map(port => port.slot));
  for (let slot = 0; slot < 256; slot++) if (!used.has(slot)) return slot;
  throw new Error("This side already has 256 pins.");
}
