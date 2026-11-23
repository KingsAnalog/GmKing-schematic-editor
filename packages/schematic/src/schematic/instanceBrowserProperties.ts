import { getComponentDef } from "./catalog";
import { syncDeviceModelFields, syncMosParameterFields } from "./componentNetlistFields";
import { renderComponentSvg } from "./componentSvgRenderer";
import { assignRestoredSchematicDocument, createEmptySchematicDocument, createSchematicDocument } from "./document/documentModel";
import { isLibraryShapeType } from "./libraryShapeStyleModel";
import { isNetlistModelText, NETLIST_MODEL_VALUE_KEY } from "./netlist/profiles";
import { buildPlacedComponent, type PlacementComponentProperties } from "./placementModel";
import { SchematicPropertyInteractionController } from "./propertyInteractionController";
import { SchematicPropertyPanelController } from "./propertyPanelController";
import { buildSchematicPropertyPanelInput } from "./propertyPanelProjection";
import { renderPlacementPropertyEditor } from "./schematicEditorUiProjection";
import { localizeSchematicStatus } from "./schematicUiText";
import type { InstancePaletteItem } from "./instanceSelector";
import type { SymbolTemplateId } from "./symbolTemplateModel";
import { isSchematicTemplateId } from "./templates";
import type { ComponentInstance, SchematicDocument } from "./types";
import { componentVisualBounds } from "./view-geometry";

export class InstanceBrowserProperties {
  private readonly draft = createEmptySchematicDocument();
  private readonly interaction: SchematicPropertyInteractionController;
  private readonly panel: SchematicPropertyPanelController;
  private readonly status: HTMLOutputElement;

  constructor(
    private readonly root: HTMLElement,
    private readonly preview: HTMLElement,
    private readonly process: () => SchematicDocument["netlistProcess"],
    signal: AbortSignal
  ) {
    root.innerHTML = renderPlacementPropertyEditor();
    const panelRoot = root.querySelector<HTMLElement>("[data-browser-property-editor]")!;
    this.status = root.ownerDocument.createElement("output");
    this.status.className = "property-error";
    this.status.hidden = true;
    this.status.setAttribute("role", "status");
    panelRoot.append(this.status);
    const view = root.ownerDocument.defaultView!;
    this.interaction = new SchematicPropertyInteractionController({
      document: this.draft,
      selection: () => ({ selectedIds: this.draft.components.map(component => component.id), selectedNoteIds: [] }),
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
    return this.draft.components[0] ?? null;
  }

  show(item: InstancePaletteItem | undefined, symbolTemplate: SymbolTemplateId | undefined) {
    const type = item && !isSchematicTemplateId(item) && !isLibraryShapeType(item) ? item : undefined;
    if (type !== (this.component?.type ?? undefined)) {
      this.interaction.dispose();
      const components = type ? [buildPlacedComponent(type, { x: 0, y: 0 }, {
        id: "browser-draft",
        ref: getComponentDef(type).hotLabel,
        rotation: 0,
        mirrored: false
      })] : [];
      assignRestoredSchematicDocument(this.draft, createSchematicDocument({ components, symbolTemplate }));
      this.status.hidden = true;
      this.root.scrollTop = 0;
    }
    this.draft.symbolTemplate = symbolTemplate ?? this.draft.symbolTemplate;
    this.root.hidden = !this.component;
    if (this.component) this.sync();
    return !!this.component;
  }

  take(): PlacementComponentProperties | undefined {
    const active = this.root.ownerDocument.activeElement as HTMLElement | null;
    if (active && this.root.contains(active)) active.blur();
    this.interaction.flush();
    const component = this.component;
    if (!component) return undefined;
    const { type, values, variantId, scale, appearance } = component;
    return { type, values: { ...values }, variantId, scale, appearance: appearance && { ...appearance } };
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
    if (input.component) input.component.cellType = undefined;
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
    const component = this.component;
    if (!component) return;
    const { x, y, width, height } = componentVisualBounds(component);
    const padding = 8;
    const viewBox = [x - padding, y - padding, width + 2 * padding, height + 2 * padding].join(" ");
    this.preview.innerHTML = `<svg class="browser-draft-symbol" viewBox="${viewBox}" aria-hidden="true">${renderComponentSvg(component, {
      presentationMode: true, symbolTemplate: this.draft.symbolTemplate
    })}</svg>`;
  }
}
