// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEmptySchematicDocument } from "../../../src/schematic/document/documentModel";
import { SchematicPropertyPanelController } from "../../../src/schematic/propertyPanelController";
import { buildSchematicPropertyPanelInput } from "../../../src/schematic/propertyPanelProjection";
import { renderSchematicEditorSidebarProjection } from "../../../src/schematic/schematicEditorUiProjection";
import type { ComponentInstance } from "../../../src/schematic/types";
import { fixtureComponent } from "../support/fixtures";

afterEach(() => document.body.replaceChildren());

function fixture() {
  const root = document.createElement("div");
  root.className = "schematic-editor-root";
  root.innerHTML = renderSchematicEditorSidebarProjection();
  document.body.append(root);
  const doc = createEmptySchematicDocument();
  const rectangle = fixtureComponent("rectangle", "X1", 100, 100);
  const triangle = fixtureComponent("triangle", "X2", 300, 100);
  const resistor = fixtureComponent("resistor", "R1", 500, 100);
  doc.components.push(rectangle, triangle, resistor);
  const callbacks = {
    onLibraryShapeStyleChange: vi.fn(),
    onLibraryShapeStyleInput: vi.fn(),
    onLibraryShapeStyleCommit: vi.fn(),
    onLibraryShapeStyleCancel: vi.fn()
  };
  const controller = new SchematicPropertyPanelController(
    root.querySelector("[data-schematic-property-editor]")!,
    callbacks
  );
  controller.bind();
  const sync = (...components: ComponentInstance[]) => controller.sync(buildSchematicPropertyPanelInput({
    document: doc,
    hasSelection: true,
    targets: {
      components,
      wires: [],
      junctionPoints: [],
      netLabels: [],
      notes: []
    }
  }));
  sync(rectangle);
  return { root, controller, callbacks, sync, rectangle, triangle, resistor };
}

describe("library shape property panel", () => {
  it("shows only supported fields in the requested order with a separate fill section", () => {
    const f = fixture();
    const form = f.root.querySelector("[data-property-component-form]")!;
    const visibleRows = [...form.querySelectorAll<HTMLElement>(".property-row")]
      .filter(row => {
        let current: HTMLElement | null = row;
        while (current && current !== form) {
          if (current.hidden) return false;
          current = current.parentElement;
        }
        return true;
      })
      .map(row => row.querySelector("span")?.textContent);
    expect(visibleRows).toEqual([
      "Cell", "Color", "Line width", "Line style", "Corner radius",
      "Width (grid)", "Height (grid)", "Size", "Fill", "Fill color", "Fill opacity"
    ]);
    expect(form.querySelector("[data-property-ref]")).toBeNull();
    expect(form.querySelector("[data-property-label-visible]")).toBeNull();
    expect(form.querySelector("[data-property-component-identity-fields]")?.childElementCount).toBe(0);
    expect(f.root.querySelector("[data-property-library-shape-fill-fields]")?.className)
      .toBe("property-library-shape-fill-fields");

    const size = f.root.querySelector("[data-property-scale-row]")!;
    const fill = f.root.querySelector("[data-property-library-shape-fill-fields]")!;
    expect(size.nextElementSibling).toBe(fill);
    expect((f.root.querySelector("[data-property-library-shape-fill-color]") as HTMLInputElement).value).toBe("#ffffff");
    expect((f.root.querySelector("[data-property-library-shape-fill-opacity]") as HTMLInputElement).value).toBe("1");
    expect((f.root.querySelector("[data-property-library-shape-fill-color]") as HTMLInputElement).disabled).toBe(true);
    expect((f.root.querySelector("[data-property-library-shape-fill-opacity]") as HTMLInputElement).disabled).toBe(true);
    f.controller.destroy();
  });

  it("restores identity fields for ordinary components and hides corner radius on triangles", () => {
    const f = fixture();
    f.sync(f.triangle);
    expect(f.root.querySelector<HTMLElement>("[data-property-library-shape-corner-radius-row]")?.hidden).toBe(true);
    expect(f.root.querySelector("[data-property-ref]")).toBeNull();
    f.sync(f.resistor);
    expect(f.root.querySelector("[data-property-ref]")).not.toBeNull();
    expect(f.root.querySelector("[data-property-label-visible]")).not.toBeNull();
    expect(f.root.querySelector<HTMLElement>("[data-property-library-shape-stroke-fields]")?.hidden).toBe(true);
    f.sync(f.rectangle);
    expect(f.root.querySelector("[data-property-ref]")).toBeNull();
    expect(f.root.querySelector<HTMLElement>("[data-property-library-shape-corner-radius-row]")?.hidden).toBe(false);
    f.controller.destroy();
  });

  it("maps direct, preview, commit and cancel events to the shared style commands", () => {
    const f = fixture();
    const fill = f.root.querySelector<HTMLInputElement>("[data-property-library-shape-fill-enabled]")!;
    fill.checked = true;
    fill.dispatchEvent(new Event("change", { bubbles: true }));
    expect(f.callbacks.onLibraryShapeStyleChange).toHaveBeenCalledWith("fillEnabled", true);

    const lineStyle = f.root.querySelector<HTMLSelectElement>("[data-property-library-shape-line-style]")!;
    lineStyle.value = "dashed";
    lineStyle.dispatchEvent(new Event("change", { bubbles: true }));
    expect(f.callbacks.onLibraryShapeStyleChange).toHaveBeenCalledWith("lineStyle", "dashed");

    const width = f.root.querySelector<HTMLInputElement>("[data-property-library-shape-stroke-width]")!;
    width.focus();
    width.value = "6";
    width.dispatchEvent(new Event("input", { bubbles: true }));
    width.dispatchEvent(new Event("change", { bubbles: true }));
    expect(f.callbacks.onLibraryShapeStyleInput).toHaveBeenCalledWith("strokeWidth", "6");
    expect(f.callbacks.onLibraryShapeStyleCommit).toHaveBeenCalledWith("strokeWidth", "6");

    width.value = "8";
    width.dispatchEvent(new Event("input", { bubbles: true }));
    width.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(f.callbacks.onLibraryShapeStyleCancel).toHaveBeenCalledWith("strokeWidth");
    f.controller.destroy();
  });
});
