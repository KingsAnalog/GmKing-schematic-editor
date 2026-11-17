import { describe, expect, it } from "vitest";
import { resolveComponentDef } from "../../../src/schematic/catalog";
import { makeComponentCell } from "../../../src/schematic/componentRenderer";
import { renderComponentSvg } from "../../../src/schematic/componentSvgRenderer";
import { setComponentValue } from "../../../src/schematic/componentPropertyModel";
import { delayValue, resolveFunctionBlockModel, setFunctionBlockTimeDomain } from "../../../src/schematic/functionBlockModel";
import { componentPinPoint } from "../../../src/schematic/netlist";
import { buildPlacedComponent } from "../../../src/schematic/placementModel";
import { executeSchematicPropertyBatchCommand } from "../../../src/schematic/propertyBatchCommands";
import { buildSchematicPropertyPanelInput } from "../../../src/schematic/propertyPanelProjection";
import { parseSchematicDocumentFile, serializeSchematicDocumentFile } from "../../../src/schematic/schematicDocumentFile";
import { SYMBOL_CONTENT_RUN_SLOT_COUNT } from "../../../src/schematic/symbolContentView";
import { fixtureDocument } from "../support/fixtureDocument";
import { fixtureComponent, fixtureWire } from "../support/fixtures";
import { createSchematicDocumentHistoryAdapter } from "../support/documentHistory";

const text = (component: ReturnType<typeof fixtureComponent>) => resolveFunctionBlockModel(component)!.contentLayout.runs.map(run => run.text).join("");

describe("delay value", () => {
  it("uses CT ΔT and DT 1 without storing a stale default when switching domains", () => {
    const component = buildPlacedComponent("delay", { x: 200, y: 200 }, { id: "delay", ref: "DLY1", rotation: 0, mirrored: false });
    const document = fixtureDocument({ components: [component] });
    for (const [domain, value, formula] of [["continuous", "ΔT", "e−sΔT"], ["discrete", "1", "z−1"], ["continuous", "ΔT", "e−sΔT"]] as const) {
      setFunctionBlockTimeDomain(component, domain);
      expect(delayValue(component)).toBe(value);
      expect(component.values.delay).toBeUndefined();
      expect(text(component)).toBe(formula);
      const projected = buildSchematicPropertyPanelInput({ document, hasSelection: true,
        targets: { components: [component], wires: [], notes: [], netLabels: [], junctionPoints: [] } });
      expect(projected.component?.value?.value).toEqual({ state: "uniform", value });
    }
    setComponentValue(component, "D-1");
    setFunctionBlockTimeDomain(component, "discrete");
    expect(text(component)).toBe("z−(D−1)");
    setComponentValue(component, "");
    expect(text(component)).toBe("z−1");
  });

  it.each([
    ["1", "z−1"], ["2", "z−2"], ["D-1", "z−(D−1)"], ["D", "z−D"],
    ["2.5", "z−2.5"], ["-2", "z−(−2)"], ["D+1", "z−(D+1)"],
    ["a+b+c+d+e+f+g+h+i", "z−(a+b+c+d+e+f+g+h+i)"]
  ])("renders DT %s with a complete superscript in both the editor and SVG", (value, expected) => {
    const component = fixtureComponent("delay", "DLY1", 200, 200);
    setFunctionBlockTimeDomain(component, "discrete");
    setComponentValue(component, value);
    const model = resolveFunctionBlockModel(component)!;
    expect(text(component)).toBe(expected);
    expect(model.contentLayout.runs.length).toBeLessThanOrEqual(SYMBOL_CONTENT_RUN_SLOT_COUNT);
    const [base, ...exponent] = model.contentLayout.runs;
    exponent.forEach(run => {
      expect(run.script).toBe("superscript");
      expect(run.y).toBeLessThan(base.y);
    });
    expect(model.contentLayout.bounds.x).toBeGreaterThanOrEqual(20);
    expect(model.contentLayout.bounds.x + model.contentLayout.bounds.width).toBeLessThanOrEqual(model.size.width - 20);
    const cell = makeComponentCell(component);
    const svg = renderComponentSvg(component);
    model.contentLayout.runs.forEach((run, index) => {
      expect(cell.attr(`symbolContentRun${index}/text`)).toBe(run.text);
      expect(svg).toContain(`>${run.text}</text>`);
    });
  });

  it("shows the selected delay in CT transfer and duration views and preserves it in files", () => {
    const component = fixtureComponent("delay", "DLY1", 200, 200);
    setComponentValue(component, "T-1");
    expect(text(component)).toBe("e−s(T−1)");
    component.variantId = "duration";
    expect(text(component)).toBe("T−1");
    setComponentValue(component, "2");
    component.variantId = "transfer";
    expect(text(component)).toBe("e−s·2");
    const document = fixtureDocument({ components: [component] });
    expect(parseSchematicDocumentFile(serializeSchematicDocumentFile(document)).components).toEqual(document.components);
    component.variantId = "transmission-line";
    const size = resolveComponentDef(component).size;
    setComponentValue(component, "a_very_long_delay");
    expect(resolveComponentDef(component).size).toEqual(size);
  });

  it.each([0, 90, 180, 270])("stretches attached wires when a delay expression widens the block at %s degrees", rotation => {
    const component = fixtureComponent("delay", "DLY1", 200, 200, rotation);
    setFunctionBlockTimeDomain(component, "discrete");
    const before = componentPinPoint(component, "out");
    const end = { x: 200 + 4 * (before.x - 200), y: 200 + 4 * (before.y - 200) };
    const document = fixtureDocument({ components: [component], wires: [fixtureWire("out", [before, end])] });
    const history = createSchematicDocumentHistoryAdapter(document);
    const result = executeSchematicPropertyBatchCommand(document, { selectedIds: [component.id], selectedNoteIds: [] }, { kind: "component-value", value: "D-1" });
    expect(result).toMatchObject({ kind: "changed", renderScope: "document", historyIntent: "push" });
    expect(componentPinPoint(component, "out")).not.toEqual(before);
    expect(document.wires[0].points[0]).toEqual(componentPinPoint(component, "out"));
    expect(document.connections.pins[component.id].out).toBe(document.connections.wires[document.wires[0].id][0]);
    history.push(document);
    expect(text(history.undo()!.components[0])).toBe("z−1");
    expect(history.redo()).toEqual(document);
  });
});
