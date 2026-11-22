import { blockGeometry, blockPorts, readSheetPort } from "./hierarchyPins";
import type { SymbolContentLayout, SymbolTextRunLayout } from "./symbolContentModel";
import type { ComponentInstance } from "./types";

export function hierarchyArtwork(instance: ComponentInstance) {
  if (instance.type !== "sheetPort" && instance.type !== "sheetBlock") return null;
  const mirror = (x: number, width: number) => instance.mirrored ? width - x : x;
  const text = (value: string, x: number, y: number, maxWidth: number, angle = 0, anchor: "start" | "middle" = "middle"): SymbolTextRunLayout => {
    const fontSize = Math.min(13, maxWidth / Math.max(1, value.length * 0.65));
    return { text: value, x, y, width: Math.min(maxWidth, value.length * fontSize * 0.65), fontSize,
      fontWeight: 400, fontStyle: "normal", script: "baseline", textAnchor: anchor, counterRotation: angle };
  };
  const layout = (width: number, height: number, runs: SymbolTextRunLayout[]): SymbolContentLayout =>
    ({ bounds: { x: 0, y: 0, width, height }, runs, paths: [] });

  if (instance.type === "sheetPort") {
    const port = readSheetPort(instance);
    const output = port.type === "output";
    const input = port.type === "input";
    const path = output
      ? "M 80 20 H 90 M 90 10 H 108 L 118 20 L 108 30 H 90 Z"
      : input
        ? "M 80 20 H 70 M 42 10 H 60 L 70 20 L 60 30 H 42 Z"
        : "M 80 20 H 70 M 70 20 L 60 10 H 47 L 37 20 L 47 30 H 60 Z";
    return {
      path, fill: "currentColor", content: layout(160, 40, [
        text(port.name, mirror(output ? 139 : 19, 160), 24, 37, instance.rotation)
      ])
    };
  }

  const ports = blockPorts(instance);
  const { size: { width, height }, pins, lead } = blockGeometry(ports);
  const body = `M ${lead} ${lead} H ${width - lead} V ${height - lead} H ${lead} Z`;
  const leads: string[] = [];
  const runs = [text(instance.values["sheet:name"] ?? "Sheet", width / 2, height / 2 + 4, 110, instance.rotation)];
  pins.forEach((pin, index) => {
    const side = ports[index].direction;
    const x = pin.x + width / 2, y = pin.y + height / 2;
    const dx = side === "left" ? lead : side === "right" ? -lead : 0;
    const dy = side === "top" ? lead : side === "bottom" ? -lead : 0;
    leads.push(`M ${x} ${y} l ${dx} ${dy}`);
    const vertical = dy !== 0;
    runs.push(text(pin.label, mirror(x + (vertical ? 4 : dx * 3.7), width),
      y + (vertical ? dy * 3.7 : 4), 48,
      vertical ? (dy > 0 ? -90 : 90) : 0));
  });
  return { path: [body, ...leads].join(" "), fill: "none", content: layout(width, height, runs) };
}
