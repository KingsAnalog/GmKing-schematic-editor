import { getComponentDef } from "./catalog";
import { syncDeviceModelFields, syncMosParameterFields } from "./componentNetlistFields";
import { deviceItemName } from "./deviceLibrary";
import { assignRestoredSchematicDocument, createEmptySchematicDocument, createSchematicDocument } from "./document/documentModel";
import { isLibraryShapeType } from "./libraryShapeStyleModel";
import { isNetlistModelText, NETLIST_MODEL_VALUE_KEY } from "./netlist/profiles";
import { buildPlacedComponent, buildPlacementPreviewFragment, type PlacementComponentProperties, type PlacementProperties } from "./placementModel";
import { SchematicPropertyInteractionController } from "./propertyInteractionController";
import { SchematicPropertyPanelController } from "./propertyPanelController";
import { buildSchematicPropertyPanelInput } from "./propertyPanelProjection";
import { createPlacementPropertyEditor } from "./schematicEditorUiProjection";
import { createSchematicSvgElement } from "./schematicSvgDom";
import { localizeSchematicStatus } from "./schematicUiText";
import { renderSchematicSvgScene } from "./svgRenderer";
import type { InstancePaletteItem } from "./instanceSelector";
import type { SymbolTemplateId } from "./symbolTemplateModel";
import { isSchematicTemplateId } from "./templates";
import type { ComponentInstance, SchematicDocument } from "./types";

export class InstanceBrowserProperties {
  private readonly draft = createEmptySchematicDocument();
  private readonly interaction: SchematicPropertyInteractionController;
  private readonly panel: SchematicPropertyPanelController;
  private readonly status: HTMLOutputElement;
  private readonly componentPicker: HTMLSelectElement;
  private item?: InstancePaletteItem;

  constructor(
    private readonly root: HTMLElement,
    private readonly preview: HTMLElement,
    private readonly process: () => SchematicDocument["netlistProcess"],
    signal: AbortSignal
  ) {
    const panelRoot = createPlacementPropertyEditor(root.ownerDocument);
    root.replaceChildren(panelRoot);
    this.componentPicker = panelRoot.querySelector<HTMLSelectElement>("[data-browser-template-component]")!;
    this.status = root.ownerDocument.createElement("output");
    this.status.className = "property-error";
    this.status.hidden = true;
    this.status.setAttribute("role", "status");
    panelRoot.append(this.status);
    const view = root.ownerDocument.defaultView!;
    this.interaction = new SchematicPropertyInteractionController({
      document: this.draft,
      selection: () => ({ selectedIds: this.component ? [this.component.id] : [], selectedNoteIds: [] }),
      moveBehavior: () => "moveOnly",
      render: () => this.renderPreview(),
      restorePreview: () => this.sync(),
      renderPanel: () => this.sync(),
      rebuildCounters: () => {},
      commit: () => this.sync(),
      status: message => {
        this.status.textContent = localizeSchematicStatus(message);
        this.status.hidden = !message;
      },
      scheduler: {
        request: callback => view.requestAnimationFrame(callback),
        cancel: handle => view.cancelAnimationFrame(handle)
      }
    });
    this.panel = new SchematicPropertyPanelController(panelRoot, this.interaction.callbacks({}));
    this.panel.bind();
    this.componentPicker.addEventListener("change", () => {
      this.interaction.flush();
      this.sync();
    }, { signal });
    root.addEventListener("change", event => this.changeNetlistField(event.target), { signal });
    root.addEventListener("keydown", event => {
      const field = (event.target as Element | null)?.closest("[data-property-mos-param], [data-property-model-input]");
      if (field && event.key === "Enter" && !event.isComposing) {
        event.preventDefault();
        this.changeNetlistField(field);
      }
    }, { signal });
  }

  private get component(): ComponentInstance | null {
    return this.draft.components[this.componentPicker.selectedIndex < 0 ? 0 : this.componentPicker.selectedIndex] ?? null;
  }

  show(item: InstancePaletteItem | undefined, symbolTemplate: SymbolTemplateId | undefined) {
    if (item !== this.item) {
      this.interaction.dispose();
      this.item = item;
      const template = isSchematicTemplateId(item);
      const next = template
        ? buildPlacementPreviewFragment(item, { x: 0, y: 0 }, { rotation: 0, mirrored: false })
        : createSchematicDocument({ components: item ? [buildPlacedComponent(item, { x: 0, y: 0 }, {
          id: "browser-draft",
          ref: getComponentDef(item).hotLabel,
          rotation: 0,
          mirrored: false
        })] : [] });
      assignRestoredSchematicDocument(this.draft, next);
      this.componentPicker.replaceChildren(...(template ? this.draft.components.map((component, index) => {
        const option = this.root.ownerDocument.createElement("option");
        option.textContent = `${index + 1}. ${deviceItemName(component.type)}`;
        return option;
      }) : []));
      this.componentPicker.closest("label")!.hidden = !template;
      this.status.hidden = true;
      this.root.scrollTop = 0;
    }
    this.draft.symbolTemplate = symbolTemplate ?? this.draft.symbolTemplate;
    this.root.hidden = !this.component;
    if (this.component) this.sync();
    else this.preview.replaceChildren();
  }

  take(): PlacementProperties | undefined {
    const active = this.root.ownerDocument.activeElement as HTMLElement | null;
    if (active && this.root.contains(active)) active.blur();
    this.interaction.flush();
    const components = this.draft.components.map(({ type, values, variantId, scale, appearance }): PlacementComponentProperties =>
      ({ type, values: { ...values }, variantId, scale, appearance: appearance && { ...appearance } }));
    return isSchematicTemplateId(this.item) ? { type: this.item, components } : components[0];
  }

  destroy() {
    this.interaction.dispose();
    this.panel.destroy();
  }

  private sync() {
    const component = this.component;
    if (!component) return;
    const input = buildSchematicPropertyPanelInput({
      document: this.draft,
      hasSelection: true,
      targets: { components: [component], wires: [], inductorCouplings: [], junctionPoints: [], netLabels: [], notes: [] }
    });
    if (input.component) {
      input.component.cellType = undefined;
      if (isLibraryShapeType(component.type)) {
        // The drawing points determine the final dimensions of a library shape.
        input.component.rectangle = undefined;
        input.component.scale = undefined;
      }
    }
    this.panel.sync(input);
    syncMosParameterFields(this.root, component, true);
    syncDeviceModelFields(this.root, component, this.process(), true);
    this.renderPreview();
  }

  private changeNetlistField(target: EventTarget | null) {
    const component = this.component;
    const control = (target as Element | null)?.closest<HTMLInputElement | HTMLSelectElement>(
      "[data-property-mos-param], [data-property-model-input], [data-property-model-select]"
    );
    if (!component || !control) return;
    const parameter = control.dataset.propertyMosParam;
    const value = control.value.trim();
    const key = parameter ? `mos:${parameter}` : NETLIST_MODEL_VALUE_KEY;
    if (!parameter && !isNetlistModelText(value)) {
      control.value = component.values[key] ?? "";
      return;
    }
    this.interaction.flush();
    const current = this.component;
    if (!current) return;
    if (value) current.values[key] = value;
    else delete current.values[key];
    this.sync();
  }

  private renderPreview() {
    const image = renderSchematicSvgScene({
      components: this.draft.components,
      wires: this.draft.wires,
      symbolTemplate: this.draft.symbolTemplate,
      junctionPoints: [],
      netLabels: [],
      notes: []
    }, { namespace: "browser-draft", presentationMode: true, padding: 8 });
    if (!image) {
      this.preview.replaceChildren();
      return;
    }
    const svg = createSchematicSvgElement(this.preview.ownerDocument, image.svg);
    svg.classList.add("browser-draft-symbol");
    svg.setAttribute("aria-hidden", "true");
    this.preview.replaceChildren(svg);
  }
}
