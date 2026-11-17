import { authorFixture } from "../support/fixtureDocument";
import { describe, expect, it } from "vitest";
import { switchStateCycleCommand } from "../../../src/schematic/switchInteractionModel";
import { makeComponentCell } from "../../../src/schematic/componentRenderer";
import { resolveComponentVisualModel } from "../../../src/schematic/componentVisualModel";
import { renderComponentSvg } from "../../../src/schematic/componentSvgRenderer";
import { executeSchematicPropertyBatchCommand } from "../../../src/schematic/propertyBatchCommands";
import { createEmptySchematicDocument } from "../../../src/schematic/document/documentModel";
import { fixtureComponent, fixtureWire } from "../support/fixtures";

describe("switch blade interaction", () => {
  it.each([2, 3, 16])("cycles all %i throws and open without changing wires or geometry", count => {
    const doc = createEmptySchematicDocument();
    const instance = fixtureComponent("spntSwitch", "S1", 100, 100, 90);
    instance.variantId = `${count}-throw`;
    instance.values.switchPosition = "0";
    instance.mirrored = true;
    doc.components.push(instance);
    authorFixture(doc);
    doc.wires.push(fixtureWire("w1", [{ x: 100, y: 60 }, { x: 180, y: 60 }]));
    authorFixture(doc);
    const wires = JSON.stringify(doc.wires);
    for (let i = 1; i <= count + 1; i++) {
      executeSchematicPropertyBatchCommand(doc, { selectedIds: [instance.id], selectedNoteIds: [] }, switchStateCycleCommand(instance)!);
      expect(instance.values.switchPosition).toBe(String(i % (count + 1)));
      expect(instance).toMatchObject({ x: 100, y: 100, rotation: 90, mirrored: true, variantId: `${count}-throw` });
      expect(JSON.stringify(doc.wires)).toBe(wires);
    }
  });

  it("toggles a closed switch back to open and ignores inactive or unrelated components", () => {
    const instance = fixtureComponent("switch", "S1", 0, 0);
    instance.variantId = "closed";
    expect(switchStateCycleCommand(instance)).toMatchObject({ kind: "component-variant", variantId: "open" });
    instance.temporarilyDeleted = true;
    expect(switchStateCycleCommand(instance)).toBeNull();
    expect(switchStateCycleCommand(fixtureComponent("resistor", "R1", 0, 0))).toBeNull();
  });

  it.each(["switch", "spntSwitch"] as const)("limits %s hit geometry to the blade, including mirrored and rotated views", type => {
    const instance = fixtureComponent(type, "S1", 100, 100);
    for (const rotation of [0, 90, 180, 270]) {
      for (const mirrored of [false, true]) {
        Object.assign(instance, { rotation, mirrored });
        const model = resolveComponentVisualModel(instance);
        const cell = makeComponentCell(instance);
        const blade = cell.attr("switchBladeHit/d");
        expect(blade).toMatch(/^M [-\d.]+ [-\d.]+ L [-\d.]+ [-\d.]+$/);
        expect(model.path).toContain(blade);
        expect(cell.attr("switchBladeHit/transform")).toBe(cell.attr("symbolBody/transform"));
        expect(cell.attr("switchBladeHit/pointerEvents")).toBe("stroke");
        expect(renderComponentSvg(instance)).not.toContain("data-switch-blade");
      }
    }
    for (const options of [{ preview: true }, { presentationMode: true }]) {
      expect(makeComponentCell(instance, options).attr("switchBladeHit/pointerEvents")).toBe("none");
    }
  });
});
