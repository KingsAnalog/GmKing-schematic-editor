import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { createEmptySchematicDocument } from "../packages/schematic/dist/schematic/document/documentModel.js";
import { componentPinPoint } from "../packages/schematic/dist/schematic/connectivity.js";
import { buildStructuralNetlist, printNetlist } from "../packages/schematic/dist/schematic/netlist/index.js";

const count = 1000;
const document = createEmptySchematicDocument();
for (let i = 0; i < count; i++) {
  const ref = `R${i + 1}`;
  document.components.push({ id: ref, ref, type: "resistor", x: i * 100, y: 0, rotation: 0, mirrored: false, values: { main: "1k" } });
  document.connections.pins[ref] = { p: `node-${i}`, n: `node-${i + 1}` };
}
for (let i = 1; i < count; i++) {
  const id = `wire-${i}`;
  document.wires.push({ id, routeMode: "orthogonal", points: [
    componentPinPoint(document.components[i - 1], "n"),
    componentPinPoint(document.components[i], "p")
  ] });
  document.connections.wires[id] = [`node-${i}`, `node-${i}`];
}

const samples = [];
for (let run = 0; run < 5; run++) {
  const start = performance.now();
  const design = buildStructuralNetlist(document);
  const spice = printNetlist(design, "spice");
  const spectre = printNetlist(design, "spectre");
  samples.push(performance.now() - start);
  assert.equal(design.instances.length, count);
  assert.match(spice, /R1000 /);
  assert.match(spectre, /R1000 \(/);
  assert.equal(new Set(design.instances.flatMap(instance => instance.nodes)).size, count + 1);
}
console.log(JSON.stringify({ devices: count, formats: ["spice", "spectre"], milliseconds: samples.map(value => Math.round(value * 10) / 10) }));
assert(Math.max(...samples) < 500, "1000-device netlist generation exceeded 500 ms");
