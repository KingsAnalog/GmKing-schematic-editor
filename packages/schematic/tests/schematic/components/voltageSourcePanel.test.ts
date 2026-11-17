// @vitest-environment jsdom
import { fixtureDocument, authorFixture } from "../support/fixtureDocument";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SchematicPropertyPanelController } from "../../../src/schematic/propertyPanelController";
import { renderSchematicEditorSidebarProjection } from "../../../src/schematic/schematicEditorUiProjection";
import { buildSchematicPropertyPanelInput } from "../../../src/schematic/propertyPanelProjection";
import { executeSchematicPropertyBatchCommand } from "../../../src/schematic/propertyBatchCommands";
import { createEmptySchematicDocument } from "../../../src/schematic/document/documentModel";
import { fixtureComponent } from "../support/fixtures";

afterEach(() => document.body.replaceChildren());

function fixture(type: string) {
  const root = document.createElement("div");
  root.className = "schematic-editor-root";
  root.innerHTML = renderSchematicEditorSidebarProjection();
  document.body.append(root);
  const doc = createEmptySchematicDocument();
  const source = fixtureComponent("voltageSource", "V1", 100, 100);
  source.variantId = type;
  doc.components.push(source);
    authorFixture(doc);
  const selection = { selectedIds: ["V1"], selectedNoteIds: [] };
  const commit = vi.fn((key: string, value: string) => {
    const result = executeSchematicPropertyBatchCommand(doc, selection, { kind: "voltage-source-field", key, value });
    sync();
    return result;
  });
  const controller = new SchematicPropertyPanelController(root.querySelector("[data-schematic-property-editor]")!, {
    onVoltageSourceFieldCommit: commit,
    onVoltageSourceFieldChange: commit,
    onComponentVariantChange: variantId => {
      executeSchematicPropertyBatchCommand(doc, selection, { kind: "component-variant", variantId, moveBehavior: "stretch" });
      sync();
    }
  });
  function sync() {
    controller.sync(buildSchematicPropertyPanelInput({ document: doc, hasSelection: true, targets: fixtureDocument({
      components: [source], notes: [], wires: [], netLabels: [], junctionPoints: []
    }) }));
  }
  controller.bind();
  sync();
  const input = (key: string) => root.querySelector<HTMLInputElement>('[data-property-vsource-field="' + key + '"]')!;
  return { root, source, commit, controller, sync, input };
}

describe("shared voltage-source property controls", () => {
  it("offers lowercase views and a ramp direction selector", () => {
    const f = fixture("ramp");
    const type = f.root.querySelector<HTMLSelectElement>("[data-property-variant]")!;
    expect([...type.options].map(option => option.textContent)).toEqual(["dc", "sine", "pulse", "exp", "bit", "pwl", "ramp", "noise"]);
    const direction = f.root.querySelector<HTMLSelectElement>("[data-property-vsource-option]")!;
    expect(direction.value).toBe("up");
    expect([...direction.options].map(option => option.value)).toEqual(["up", "down"]);
    direction.value = "down";
    direction.dispatchEvent(new Event("change", { bubbles: true }));
    expect(f.source.values["vsource:ramp:direction"]).toBe("down");
    expect(f.input("vsource:ramp:duration")).not.toBeNull();
    f.controller.destroy();
  });

  it("renders the source type and all sine fields without a duplicate Value input", () => {
    const f = fixture("sine");
    expect(f.root.querySelector("[data-property-variant-label]")?.textContent).toBe("Source type");
    expect((f.root.querySelector("[data-property-value-row]") as HTMLElement).hidden).toBe(true);
    expect(f.root.querySelectorAll("[data-property-vsource-field]")).toHaveLength(6);
    expect(f.input("vsource:sine:amplitude").getAttribute("aria-label")).toBe("Amplitude 1 (Vpk)");
    f.controller.destroy();
  });

  it("commits a text field once on Enter and restores its previous text on Escape", () => {
    const f = fixture("sine");
    const input = f.input("vsource:sine:frequency");
    input.focus();
    input.value = "100Meg";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(f.commit).toHaveBeenCalledTimes(1);
    expect(f.source.values["vsource:sine:frequency"]).toBe("100Meg");
    const sameInput = f.input("vsource:sine:frequency");
    expect(sameInput).toBe(input);
    sameInput.focus();
    sameInput.value = "wrong";
    sameInput.dispatchEvent(new Event("input", { bubbles: true }));
    sameInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(sameInput.value).toBe("100Meg");
    expect(f.commit).toHaveBeenCalledTimes(1);
    f.controller.destroy();
  });

  it("updates PWL time/voltage rows from the editable count", () => {
    const f = fixture("pwl");
    const count = f.input("vsource:pwl:pairs");
    expect(count.value).toBe("2");
    count.value = "4";
    count.dispatchEvent(new Event("input", { bubbles: true }));
    count.dispatchEvent(new Event("change", { bubbles: true }));
    expect(f.input("vsource:pwl:time4")).not.toBeNull();
    expect(f.input("vsource:pwl:voltage4")).not.toBeNull();
    expect(f.root.querySelectorAll("[data-property-vsource-field]")).toHaveLength(11);
    f.controller.destroy();
  });

  it("uses a dropdown for pulse edge type and replaces the field group on source changes", () => {
    const f = fixture("pulse");
    const edge = f.root.querySelector<HTMLSelectElement>("[data-property-vsource-option]")!;
    expect([...edge.options].map(option => option.value)).toEqual(["", "linear", "halfsine"]);
    edge.value = "halfsine";
    edge.dispatchEvent(new Event("change", { bubbles: true }));
    expect(f.source.values["vsource:pulse:edgeType"]).toBe("halfsine");
    const type = f.root.querySelector<HTMLSelectElement>("[data-property-variant]")!;
    type.value = "exp";
    type.dispatchEvent(new Event("change", { bubbles: true }));
    expect(f.input("vsource:exp:riseConstant")).not.toBeNull();
    expect(f.input("vsource:pulse:period")).toBeNull();
    expect(f.root.querySelectorAll("[data-property-vsource-field]")).toHaveLength(7);
    f.controller.destroy();
  });
});
