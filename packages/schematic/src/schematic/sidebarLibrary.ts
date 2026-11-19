import { paletteItemPreview, type InstancePaletteItem } from "./instanceSelector";
import {
  DEVICE_LIBRARIES,
  deviceItemAliases,
  deviceItemLabel,
  deviceItemName,
  filterDeviceItems,
  getDeviceLibrary,
  type DeviceLibraryId
} from "./deviceLibrary";
import { t } from "./schematicI18n";
import type { SymbolTemplateId } from "./symbolTemplateModel";

export type SidebarTab = "library" | "properties";

interface SidebarLibraryEvents {
  symbolTemplate: () => SymbolTemplateId | undefined;
  onPick: (item: InstancePaletteItem) => void;
  initialTab?: SidebarTab;
  onTabChange?: (tab: SidebarTab) => void;
}

export class SidebarLibrary {
  private libraryId: DeviceLibraryId = "all";
  private readonly lifecycle = new AbortController();
  private librarySelect: HTMLSelectElement | null = null;
  private cellList: HTMLElement | null = null;
  private currentTab: SidebarTab = "library";
  private bound = false;

  constructor(
    private readonly root: HTMLElement,
    private readonly events: SidebarLibraryEvents
  ) {}

  mount() {
    if (this.bound) return;
    this.librarySelect = this.root.querySelector<HTMLSelectElement>("[data-library-select]");
    this.cellList = this.root.querySelector<HTMLElement>("[data-library-cells]");
    if (!this.librarySelect || !this.cellList) return;
    this.bound = true;
    const { signal } = this.lifecycle;
    this.root.addEventListener("click", (event) => this.handleClick(event), { signal });
    this.librarySelect.addEventListener("change", () => {
      this.libraryId = this.readLibraryId(this.librarySelect?.value);
      this.renderCells();
    }, { signal });
    this.renderLibraries();
    this.renderCells();
    this.setActiveTab(this.events.initialTab ?? "library");
  }

  activeTab(): SidebarTab {
    return this.currentTab;
  }

  destroy() {
    this.lifecycle.abort();
    this.bound = false;
  }

  showLibrary() {
    this.setActiveTab("library");
  }

  showProperties() {
    this.setActiveTab("properties");
  }

  refresh() {
    this.renderLibraries();
    this.renderCells();
  }

  private handleClick(event: Event) {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    const tab = target.closest<HTMLElement>("[data-sidebar-tab]")?.dataset.sidebarTab;
    if (tab === "library" || tab === "properties") {
      this.setActiveTab(tab);
      return;
    }
    const button = target.closest<HTMLElement>("[data-library-item]");
    const item = button?.dataset.libraryItem as InstancePaletteItem | undefined;
    if (!item) return;
    event.preventDefault();
    this.events.onPick(item);
  }

  private setActiveTab(tab: SidebarTab) {
    this.currentTab = tab;
    this.events.onTabChange?.(tab);
    this.root.querySelectorAll<HTMLElement>("[data-sidebar-tab]").forEach((button) => {
      const active = button.dataset.sidebarTab === tab;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
    });
    this.root.querySelectorAll<HTMLElement>("[data-sidebar-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.sidebarPanel !== tab;
    });
  }

  private renderLibraries() {
    const select = this.librarySelect;
    if (!select) return;
    select.replaceChildren();
    for (const library of DEVICE_LIBRARIES) {
      const option = select.ownerDocument.createElement("option");
      option.value = library.id;
      option.textContent = `${t(library.labelKey, library.label)} (${library.items.length})`;
      select.append(option);
    }
    select.value = this.libraryId;
  }

  private renderCells() {
    const list = this.cellList;
    if (!list) return;
    list.replaceChildren();
    if (this.libraryId === "all") {
      for (const library of DEVICE_LIBRARIES) {
        if (library.id === "all") continue;
        this.appendGroup(list, t(library.labelKey, library.label), library.id);
      }
      return;
    }
    this.appendGroup(list, t(getDeviceLibrary(this.libraryId).labelKey, getDeviceLibrary(this.libraryId).label), this.libraryId);
  }

  private appendGroup(list: HTMLElement, label: string, libraryId: DeviceLibraryId) {
    const items = filterDeviceItems(libraryId, "");
    if (!items.length) return;
    const document = list.ownerDocument;
    const heading = document.createElement("div");
    heading.className = "library-group-label";
    heading.textContent = label;
    list.append(heading);
    for (const item of items) {
      list.append(this.buildCell(document, item));
    }
  }

  private buildCell(document: Document, item: InstancePaletteItem) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "library-cell";
    button.dataset.libraryItem = item;
    button.title = [deviceItemName(item), ...deviceItemAliases(item)].filter(Boolean).join(" 路 ");
    const preview = document.createElement("span");
    preview.className = "library-cell-preview";
    preview.innerHTML = paletteItemPreview(item, { symbolTemplate: this.events.symbolTemplate() });
    const copy = document.createElement("span");
    copy.className = "library-cell-copy";
    const name = document.createElement("span");
    name.className = "library-cell-name";
    name.textContent = deviceItemName(item);
    copy.append(name);
    const badge = document.createElement("span");
    badge.className = "library-cell-badge";
    badge.textContent = deviceItemLabel(item);
    button.append(preview, copy, badge);
    return button;
  }

  private readLibraryId(value: string | undefined): DeviceLibraryId {
    return DEVICE_LIBRARIES.some(library => library.id === value)
      ? value as DeviceLibraryId
      : "all";
  }

}
