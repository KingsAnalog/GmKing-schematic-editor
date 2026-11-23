import { DEFAULT_NETLIST_PROCESS, isDeviceKind, NETLIST_MODEL_VALUE_KEY, processProfile } from "./netlist/profiles";
import { uiFormat } from "./schematicI18n";
import type { ComponentInstance, SchematicDocument } from "./types";

export function syncMosParameterFields(root: HTMLElement, component: ComponentInstance | null, force = false) {
  const container = root.querySelector<HTMLElement>("[data-property-mos-params]");
  if (!container) return;
  const isMos = component?.type === "nmos" || component?.type === "pmos";
  container.hidden = !isMos;
  if (!isMos) return;
  for (const input of container.querySelectorAll<HTMLInputElement>("[data-property-mos-param]")) {
    if (force || root.ownerDocument.activeElement !== input) {
      input.value = component.values[`mos:${input.dataset.propertyMosParam}`] ?? "";
    }
  }
}

export function syncDeviceModelFields(
  root: HTMLElement, component: ComponentInstance | null, process: SchematicDocument["netlistProcess"], force = false
) {
  const kind = component?.type;
  const profile = processProfile(process ?? DEFAULT_NETLIST_PROCESS);
  for (const row of root.querySelectorAll<HTMLElement>("[data-property-device-model]")) {
    if (!component || !kind || !isDeviceKind(kind)) {
      row.hidden = true;
      continue;
    }
    const section = kind === "resistor" || kind === "capacitor" || kind === "inductor" ? "passive" : "transistor";
    row.hidden = row.dataset.propertyDeviceModel !== section;
    if (row.hidden) continue;
    const model = component.values[NETLIST_MODEL_VALUE_KEY] ?? "";
    const defaultModel = profile.defaults[kind];
    const select = row.querySelector<HTMLSelectElement>("[data-property-model-select]")!;
    const input = row.querySelector<HTMLInputElement>("[data-property-model-input]")!;
    const custom = profile.id === "custom";
    select.hidden = custom;
    input.hidden = !custom;
    if (custom) {
      if (force || input.dataset.componentId !== component.id || root.ownerDocument.activeElement !== input) input.value = model;
      input.dataset.componentId = component.id;
      input.placeholder = defaultModel;
      continue;
    }
    const caption = uiFormat("parameter.processDefaultModel", "Process default ({name})", { name: defaultModel });
    const choices = [...new Set([...profile.options[kind], ...(model ? [model] : [])])];
    const options = [["", caption], ...choices.map(name => [name, name])];
    if (select.options.length !== options.length || options.some(
      ([value, label], index) => select.options[index].value !== value || select.options[index].text !== label
    )) {
      select.replaceChildren(...options.map(([value, label]) => {
        const option = select.ownerDocument.createElement("option");
        option.value = value;
        option.text = label;
        return option;
      }));
    }
    select.dataset.componentId = component.id;
    select.value = model;
    select.title = model || caption;
  }
}
