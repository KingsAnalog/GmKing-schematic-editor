import { authorFixture } from "../support/fixtureDocument";
import { describe, expect, it } from "vitest";
import { COMPONENT_CATALOG, getComponentVariants, resolveComponentPinOptions } from "../../../src/schematic/catalog";
import { componentSupportsProperty, componentValueIssue } from "../../../src/schematic/componentValueSchema";
import { DFF_SETTING_OPTIONS, DFF_VALUE_KEYS, type DffSettingProperty } from "../../../src/schematic/dffModel";
import { createEmptySchematicDocument } from "../../../src/schematic/document/documentModel";
import { executeSchematicPropertyBatchCommand } from "../../../src/schematic/propertyBatchCommands";
import { parseSchematicDocumentFile, serializeSchematicDocumentFile } from "../../../src/schematic/schematicDocumentCodec";
import type { ComponentType } from "../../../src/schematic/types";
import { fixtureComponent } from "../support/fixtures";

describe("shared component setting contracts", () => {
  it("accepts catalog defaults in every declared view", () => {
    for (const type of Object.keys(COMPONENT_CATALOG) as ComponentType[]) {
      const component = fixtureComponent(type, "X1", 0, 0);
      for (const view of getComponentVariants(type)) {
        component.variantId = view.id;
        expect(componentValueIssue(component), `${type}/${view.id}`).toBeNull();
      }
    }
  });

  it("uses the same DFF choices for capability, editing and file decoding", () => {
    const document = createEmptySchematicDocument();
    const component = fixtureComponent("dff", "X1", 0, 0);
    document.components.push(component);
    authorFixture(document);
    const resistor = fixtureComponent("resistor", "R1", 0, 0);
    for (const property of Object.keys(DFF_SETTING_OPTIONS) as DffSettingProperty[]) {
      const key = DFF_VALUE_KEYS[property];
      expect(componentSupportsProperty(component, key)).toBe(true);
      expect(componentSupportsProperty(resistor, key)).toBe(false);
      for (const { value } of DFF_SETTING_OPTIONS[property]) {
        const result = executeSchematicPropertyBatchCommand(document, { selectedIds: [component.id], selectedNoteIds: [] }, {
          kind: "component-dff-setting", property, value
        });
        expect(result.kind).not.toBe("rejected");
        expect(componentValueIssue(component)).toBeNull();
        expect(parseSchematicDocumentFile(serializeSchematicDocumentFile(document)).components[0].values).toEqual(component.values);
      }
    }
  });

  it("retains disabled pin settings while rejecting unknown and invalid settings", () => {
    const document = createEmptySchematicDocument();
    const component = fixtureComponent("plus", "X1", 0, 0);
    const pin = resolveComponentPinOptions(component)[0];
    component.values[`pinVisible:${pin.id}`] = "false";
    document.components.push(component);
    authorFixture(document);
    expect(componentValueIssue(component)).toBeNull();
    expect(parseSchematicDocumentFile(serializeSchematicDocumentFile(document)).components[0].values).toEqual(component.values);
    component.values["extension:custom"] = "arbitrary parameter";
    expect(componentValueIssue(component)?.key).toBe("extension:custom");
    expect(() => serializeSchematicDocumentFile(document)).toThrow(/extension:custom/);
    delete component.values["extension:custom"];
    component.values[`pinMode:${pin.id}`] = "invalid";
    expect(componentValueIssue(component)?.key).toBe(`pinMode:${pin.id}`);
    expect(() => serializeSchematicDocumentFile(document)).toThrow(/pinMode/);
  });

  it("accepts rectangle dimensions and rejects legacy pin commands", () => {
    const document = createEmptySchematicDocument();
    const component = fixtureComponent("rectangle", "X1", 210, 230);
    document.components.push(component);
    authorFixture(document);
    const selection = { selectedIds: [component.id], selectedNoteIds: [] };
    for (const command of [
      { kind: "rectangle-width", value: 5 },
      { kind: "rectangle-height", value: 3 }
    ] as const) {
      expect(executeSchematicPropertyBatchCommand(document, selection, command).kind).toBe("changed");
      expect(componentValueIssue(component)).toBeNull();
      expect(parseSchematicDocumentFile(serializeSchematicDocumentFile(document)).components[0]).toEqual(component);
    }
    expect(component.values.rectangleWidthGrid).toBe("5");
    expect(component.values.rectangleHeightGrid).toBe("3");

    const before = structuredClone(document);
    expect(executeSchematicPropertyBatchCommand(document, selection, {
      kind: "rectangle-left-pins", value: 2
    })).toMatchObject({ kind: "rejected", rejectionReason: "invalid-value" });
    expect(document).toEqual(before);
  });
});
