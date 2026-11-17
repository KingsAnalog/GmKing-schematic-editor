import { describe, expect, it } from "vitest";
import { resolveComponentDef } from "../../../src/schematic/catalog";
import { makeComponentCell } from "../../../src/schematic/componentRenderer";
import { setComponentRef, setComponentValue } from "../../../src/schematic/componentPropertyModel";
import { splitComponentName } from "../../../src/schematic/componentNameFormat";
import { resolveFunctionBlockModel } from "../../../src/schematic/functionBlockModel";
import { componentPinPoint } from "../../../src/schematic/netlist";
import { buildPlacedComponent } from "../../../src/schematic/placementModel";
import { executeSchematicPropertyBatchCommand } from "../../../src/schematic/propertyBatchCommands";
import { buildSchematicSelectionSvg } from "../../../src/schematic/selection/selectionExport";
import { parseSchematicDocumentFile, serializeSchematicDocumentFile } from "../../../src/schematic/schematicDocumentFile";
import { buildCopySource, instantiateCopyAt } from "../../../src/schematic/copyModel";
import { fixtureDocument } from "../support/fixtureDocument";
import { fixtureComponent, fixtureWire } from "../support/fixtures";
import { createSchematicDocumentHistoryAdapter } from "../support/documentHistory";

describe("function-block gain", () => {
  it.each(["integrator", "differentiator"] as const)("defaults %s gain to unity independently of its name", type => {
    const component = buildPlacedComponent(type, { x: 0, y: 0 }, {
      id: "calculus", ref: "X3", rotation: 0, mirrored: false
    });
    expect(component.values.gain).toBe("1");
    setComponentRef(component, "X4");
    expect(component.values.gain).toBe("1");
    component.variantId = "transfer";
    const original = resolveFunctionBlockModel(component);
    delete component.values.gain;
    expect(resolveFunctionBlockModel(component)).toEqual(original);
    setComponentValue(component, "k1");
    expect(component.values.gain).toBe("k1");
    setComponentValue(component, "");
    expect(resolveFunctionBlockModel(component)).toEqual(original);
  });

  it.each([
    ["integrator", "continuous", "k1s"],
    ["integrator", "discrete", "k1·z−11−z−1"],
    ["differentiator", "continuous", "k1·s"],
    ["differentiator", "discrete", "k1·(1−z−1)"]
  ] as const)("renders %s %s gain in the transfer function", (type, timeDomain, text) => {
    const component = fixtureComponent(type, "X1", 0, 0);
    component.variantId = "transfer";
    component.values = { gain: "k1", timeDomain };
    const model = resolveFunctionBlockModel(component)!;
    expect(model.contentLayout.runs.map(run => run.text).join("")).toBe(text);
    const [head, tail] = model.contentLayout.runs;
    expect(head).toMatchObject({ text: "k", fontStyle: "italic", script: "baseline" });
    expect(tail).toMatchObject({ text: "1", fontStyle: "normal", script: "subscript" });
    expect(tail.y).toBeGreaterThan(head.y);
    expect(tail.fontSize).toBeLessThan(head.fontSize);
    expect(model.contentLayout.bounds.x).toBeGreaterThanOrEqual(20);
    expect(model.contentLayout.bounds.x + model.contentLayout.bounds.width).toBeLessThanOrEqual(model.size.width - 20);
    expect(model.contentLayout.bounds.height).toBeLessThanOrEqual(40);
  });

  it.each(["k1", "gm2", "2A12", "10", "-2.5", "1e3"])("formats %s using name subscripts while keeping numbers literal", gain => {
    const component = fixtureComponent("integrator", "INT1", 0, 0);
    component.variantId = "transfer";
    component.values.gain = gain;
    const content = resolveFunctionBlockModel(component)!.content;
    expect(content.kind).toBe("fraction");
    if (content.kind !== "fraction") return;
    const runs = content.numerator.runs;
    expect(runs.map(run => run.text).join("")).toBe(gain);
    expect(runs.find(run => run.script === "subscript")?.text)
      .toBe(Number.isFinite(Number(gain)) ? undefined : splitComponentName(gain).tail);
  });

  it("groups a gain expression before multiplication", () => {
    const component = fixtureComponent("differentiator", "DIF1", 0, 0);
    component.variantId = "transfer";
    component.values.gain = "a+b";
    expect(resolveFunctionBlockModel(component)!.contentLayout.runs.map(run => run.text).join(""))
      .toBe("(a+b)·s");
  });

  it.each(["symbol", "transfer", "text"])("renders a subscripted external value in the %s view and SVG export", variantId => {
    const component = fixtureComponent("integrator", "INT1", 0, 0);
    component.variantId = variantId;
    component.values = { gain: "k1", valueVisible: "true", labelVisible: "true" };
    const cell = makeComponentCell(component);
    expect(cell.attr("refLabelValueHead/text")).toBe("k");
    expect(cell.attr("refLabelValueTail/text")).toBe("1");
    expect(cell.attr("refLabelValueTail/y")).toBeGreaterThan(cell.attr("refLabelValueHead/y") as number);
    const svg = buildSchematicSelectionSvg(fixtureDocument({ components: [component], junctionPoints: [] }))!.svg;
    expect(svg).toMatch(/data-selector="refLabelValueHead"[^>]*font-style="italic"[^>]*>k<\/text>/);
    expect(svg).toMatch(/data-selector="refLabelValueTail"[^>]*font-size="8"[^>]*>1<\/text>/);
    if (variantId === "transfer") {
      expect(cell.attr("symbolContentRun1/text")).toBe("1");
      expect(svg).toMatch(/data-selector="symbolContentRun1"[^>]*font-size="8"[^>]*>1<\/text>/);
    }
  });

  it.each(["integrator", "differentiator"] as const)("preserves %s gain through copy and document round trips", type => {
    const component = fixtureComponent(type, "X1", 0, 0);
    component.variantId = "transfer";
    component.values.gain = "k1";
    const document = fixtureDocument({ components: [component] });
    expect(parseSchematicDocumentFile(serializeSchematicDocumentFile(document)).components[0].values.gain).toBe("k1");
    const copy = instantiateCopyAt({ source: buildCopySource({ ...document, junctionPoints: [], junctionKeys: new Set() }), anchor: { x: 0, y: 0 } }, { x: 200, y: 0 }, {
      preview: false, nextComponentRef: () => "X2", createId: () => "copy"
    });
    expect(copy.components[0].values.gain).toBe("k1");
  });

  it.each([0, 90, 180, 270])("keeps connected wires attached when a gain widens the block at %s degrees, including undo/redo", rotation => {
    const component = fixtureComponent("integrator", "INT1", 200, 200, rotation);
    component.variantId = "transfer";
    const previousIn = componentPinPoint(component, "in");
    const previousOut = componentPinPoint(component, "out");
    const dx = (previousOut.x - previousIn.x) / 80 * 200;
    const dy = (previousOut.y - previousIn.y) / 80 * 200;
    const document = fixtureDocument({
      components: [component],
      wires: [
        fixtureWire("input", [{ x: previousIn.x - dx, y: previousIn.y - dy }, previousIn]),
        fixtureWire("output", [previousOut, { x: previousOut.x + dx, y: previousOut.y + dy }])
      ],
      netLabels: [{ id: "label", name: "OUT", attachment: { wireId: "output", point: previousOut } }]
    });
    const history = createSchematicDocumentHistoryAdapter(document);
    const result = executeSchematicPropertyBatchCommand(document, { selectedIds: [component.id], selectedNoteIds: [] }, {
      kind: "component-value", value: "k12345678901234567890"
    });
    expect(result).toMatchObject({ kind: "changed", renderScope: "document", historyIntent: "push" });
    expect(resolveComponentDef(component).size.width).toBeGreaterThan(80);
    expect(document.wires.find(wire => wire.id === "input")!.points.at(-1)).toEqual(componentPinPoint(component, "in"));
    expect(document.wires.find(wire => wire.id === "output")!.points[0]).toEqual(componentPinPoint(component, "out"));
    expect(document.netLabels[0].attachment.point).toEqual(componentPinPoint(component, "out"));
    expect(history.push(document)).toBe(true);
    const undone = history.undo()!;
    expect(undone.components[0].values.gain).toBe("1");
    expect(undone.wires[0].points.at(-1)).toEqual(previousIn);
    expect(history.redo()).toEqual(document);
  });
});
