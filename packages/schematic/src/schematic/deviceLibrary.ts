import { isLibraryShapeType, isOpenLibraryShapeType } from "./libraryShapeStyleModel";
import { componentName, t } from "./schematicI18n";
import { getComponentDef, PALETTE_ORDER } from "./catalog";
import { isSchematicTemplateId, SCHEMATIC_TEMPLATE_ORDER } from "./templates";
import type { InstancePaletteItem } from "./instanceSelector";
import type { ComponentType } from "./types";

export type DeviceLibraryId =
  | "all"
  | "sources"
  | "passives"
  | "transistors"
  | "amplifiers"
  | "digital"
  | "blocks"
  | "shapes"
  | "templates";

interface DeviceLibraryGroup {
  id: Exclude<DeviceLibraryId, "all">;
  label: string;
  labelKey: string;
  types: readonly ComponentType[];
}

const GROUPS: readonly DeviceLibraryGroup[] = [
  {
    id: "sources",
    label: "Sources",
    labelKey: "library.sources",
    types: ["gnd", "vdd", "voltageSource", "currentSource", "battery", "iprobe", "diffProbe"]
  },
  {
    id: "passives",
    label: "Passives",
    labelKey: "library.passives",
    types: ["resistor", "capacitor", "inductor", "diode", "impedance"]
  },
  {
    id: "transistors",
    label: "Transistors",
    labelKey: "library.transistors",
    types: ["nmos", "pmos", "npn", "pnp", "switch", "spntSwitch", "transmissionGate"]
  },
  {
    id: "amplifiers",
    label: "Amplifiers",
    labelKey: "library.amplifiers",
    types: [
      "opAmp",
      "ota",
      "comparator",
      "diffAmp",
      "diffOta",
      "diffComparator",
      "idealGm",
      "amp",
      "gm",
      "analogBuffer"
    ]
  },
  {
    id: "digital",
    label: "Digital",
    labelKey: "library.digital",
    types: [
      "inverter",
      "digitalBuffer",
      "and",
      "nand",
      "or",
      "nor",
      "xor",
      "xnor",
      "dff",
      "adc",
      "dac"
    ]
  },
  {
    id: "blocks",
    label: "Blocks",
    labelKey: "library.blocks",
    types: [
      "plus",
      "multiply",
      "integrator",
      "differentiator",
      "delay",
      "filter",
      "vcvs",
      "vccs",
      "cccs",
      "ccvs",
      "slicer"
    ]
  },
  {
    id: "shapes",
    label: "Shapes",
    labelKey: "library.shapes",
    types: PALETTE_ORDER.filter(isLibraryShapeType)
  }
];

export interface DeviceLibraryDef {
  id: DeviceLibraryId;
  label: string;
  labelKey: string;
  items: readonly InstancePaletteItem[];
}

const ALL_ITEMS: readonly InstancePaletteItem[] = [...PALETTE_ORDER, ...SCHEMATIC_TEMPLATE_ORDER];
const TEMPLATE_ITEMS: readonly InstancePaletteItem[] = [...SCHEMATIC_TEMPLATE_ORDER];
const GROUPED_TYPES = new Set<ComponentType>(GROUPS.flatMap(group => [...group.types]));

export const DEVICE_LIBRARIES: readonly DeviceLibraryDef[] = [
  { id: "all", label: "All", labelKey: "library.all", items: ALL_ITEMS },
  ...GROUPS.map(group => ({
    id: group.id,
    label: group.label,
    labelKey: group.labelKey,
    items: ALL_ITEMS.filter(item => !isSchematicTemplateId(item) && group.types.includes(item))
  })),
  { id: "templates", label: "Templates", labelKey: "library.templates", items: TEMPLATE_ITEMS }
];

export const DEFAULT_DEVICE_ITEM: InstancePaletteItem = "resistor";

export function getDeviceLibrary(id: DeviceLibraryId): DeviceLibraryDef {
  return DEVICE_LIBRARIES.find(library => library.id === id) ?? DEVICE_LIBRARIES[0];
}

export function deviceLibraryForItem(item: InstancePaletteItem): DeviceLibraryId {
  if (isSchematicTemplateId(item)) return "templates";
  return GROUPS.find(group => group.types.includes(item))?.id ?? "all";
}

export function deviceItemName(item: InstancePaletteItem): string {
  return componentName(item, isSchematicTemplateId(item) ? item : getComponentDef(item).hotLabel);
}

export function deviceItemLabel(item: InstancePaletteItem): string {
  if (isSchematicTemplateId(item)) return t("library.template", "Template");
  if (isOpenLibraryShapeType(item)) return t("library.openShape", "Open shape");
  if (isLibraryShapeType(item)) return t("library.closedShape", "Closed shape");
  return getComponentDef(item).label;
}

export function deviceItemAliases(item: InstancePaletteItem): readonly string[] {
  return isSchematicTemplateId(item) ? [] : getComponentDef(item).aliases ?? [];
}

export function deviceItemSearchNames(item: InstancePaletteItem): readonly string[] {
  if (isSchematicTemplateId(item)) return [item, componentName(item, item, "zh")];
  const def = getComponentDef(item);
  const chineseName = componentName(item, def.hotLabel, "zh");
  return [def.hotLabel, def.label, ...(chineseName === def.hotLabel ? [] : [chineseName]), ...(def.aliases ?? [])];
}

export function filterDeviceItems(
  libraryId: DeviceLibraryId,
  query: string
): InstancePaletteItem[] {
  const items = [...getDeviceLibrary(libraryId).items];
  const normalized = query.trim().toLowerCase();
  if (!normalized) return items;
  return items
    .map((item, index) => {
      const names = deviceItemSearchNames(item).map(name => name.toLowerCase());
      const prefix = names.some(name => name.startsWith(normalized));
      const substring = names.some(name => name.includes(normalized));
      return { item, index, score: prefix ? 0 : substring ? 1 : 2 };
    })
    .filter(entry => entry.score < 2)
    .sort((left, right) => left.score - right.score || left.index - right.index)
    .map(entry => entry.item);
}

export function deviceItemCount(libraryId: DeviceLibraryId): number {
  return getDeviceLibrary(libraryId).items.length;
}

/** Every catalog type must belong to exactly one visible group; templates are their own group. */
export function unmappedDeviceTypes(): ComponentType[] {
  return PALETTE_ORDER.filter(type => !GROUPED_TYPES.has(type));
}
