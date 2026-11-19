import { paletteItemPreview, type InstancePaletteItem } from "./instanceSelector";
import {
  DEFAULT_DEVICE_ITEM,
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

interface InstanceBrowserEvents {
  symbolTemplate: () => SymbolTemplateId | undefined;
  onPick: (item: InstancePaletteItem) => void;
  onClose?: () => void;
}

function element<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export class InstanceBrowser {
  private layer: HTMLElement | null = null;
  private libraryInput: HTMLInputElement | null = null;
  private cellInput: HTMLInputElement | null = null;
  private libraryList: HTMLElement | null = null;
  private cellList: HTMLElement | null = null;
  private symbolPreview: HTMLElement | null = null;
  private symbolName: HTMLElement | null = null;
  private symbolMeta: HTMLElement | null = null;
  private countLabel: HTMLElement | null = null;
  private placeButton: HTMLButtonElement | null = null;
  private libraryId: DeviceLibraryId = "all";
  private libraryQuery = "";
  private cellQuery = "res";
  private libraryIndex = 0;
  private cellIndex = 0;
  private openState = false;
  private previousFocus: HTMLElement | null = null;
  private readonly lifecycle = new AbortController();
  private mounted = false;

  constructor(
    private readonly root: HTMLElement,
    private readonly events: InstanceBrowserEvents
  ) {}

  mount() {
    if (this.mounted) return;
    this.mounted = true;
    const doc = this.root.ownerDocument;
    const layer = element(doc, "div", "schematic-instance-browser");
    layer.hidden = true;
    layer.dataset.schematicInstanceBrowser = "";
    const backdrop = element(doc, "button", "schematic-instance-browser-backdrop");
    backdrop.type = "button";
    backdrop.setAttribute("aria-label", "Close instance browser");
    backdrop.dataset.instanceBrowserClose = "";
    const dialog = element(doc, "div", "schematic-instance-browser-dialog");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", "schematic-instance-browser-title");

    const header = element(doc, "div", "schematic-instance-browser-header");
    const title = element(doc, "h2", undefined, t("browser.title", "Add Instance"));
    title.id = "schematic-instance-browser-title";
    const close = element(doc, "button", "schematic-instance-browser-close", "×");
    close.type = "button";
    close.setAttribute("aria-label", "Close instance browser");
    close.dataset.instanceBrowserClose = "";
    header.append(title, close);

    const columns = element(doc, "div", "schematic-instance-browser-columns");
    const libraryColumn = element(doc, "section", "instance-browser-column browser-library");
    libraryColumn.append(element(doc, "h3", undefined, t("browser.library", "Library")));
    const libraryInput = element(doc, "input", "browser-search");
    libraryInput.type = "search";
    libraryInput.placeholder = t("browser.searchLibrary", "Search libraries");
    libraryInput.setAttribute("aria-label", t("browser.searchLibrary", "Search libraries"));
    libraryInput.dataset.browserLibrarySearch = "";
    const libraryList = element(doc, "div", "browser-list");
    libraryList.setAttribute("role", "listbox");
    libraryList.setAttribute("aria-label", t("browser.library", "Library"));
    libraryList.dataset.browserLibraries = "";
    libraryColumn.append(libraryInput, libraryList);

    const cellColumn = element(doc, "section", "instance-browser-column browser-cell");
    cellColumn.append(element(doc, "h3", undefined, t("browser.cell", "Cell")));
    const cellInput = element(doc, "input", "browser-search");
    cellInput.type = "search";
    cellInput.placeholder = t("browser.searchCell", "Search cells");
    cellInput.setAttribute("aria-label", t("browser.searchCell", "Search cells"));
    cellInput.dataset.browserCellSearch = "";
    const cellList = element(doc, "div", "browser-list");
    cellList.setAttribute("role", "listbox");
    cellList.setAttribute("aria-label", t("browser.cell", "Cell"));
    cellList.dataset.browserCells = "";
    cellColumn.append(cellInput, cellList);

    const symbolColumn = element(doc, "section", "instance-browser-column browser-symbol");
    symbolColumn.append(element(doc, "h3", undefined, t("browser.symbol", "Symbol")));
    const symbolPreview = element(doc, "div", "browser-symbol-preview");
    symbolPreview.dataset.browserSymbol = "";
    const symbolName = element(doc, "div", "browser-symbol-name");
    const symbolMeta = element(doc, "div", "browser-symbol-meta");
    symbolColumn.append(symbolPreview, symbolName, symbolMeta);

    columns.append(libraryColumn, cellColumn, symbolColumn);

    const footer = element(doc, "div", "schematic-instance-browser-footer");
    const hint = element(doc, "span", "browser-hint", t("browser.hint", "Enter to place · Esc to close"));
    const count = element(doc, "span", "browser-count");
    const place = element(doc, "button", "browser-place", t("browser.place", "Place"));
    place.type = "button";
    footer.append(hint, count, place);

    dialog.append(header, columns, footer);
    layer.append(backdrop, dialog);
    this.root.append(layer);

    this.layer = layer;
    this.libraryInput = libraryInput;
    this.cellInput = cellInput;
    this.libraryList = libraryList;
    this.cellList = cellList;
    this.symbolPreview = symbolPreview;
    this.symbolName = symbolName;
    this.symbolMeta = symbolMeta;
    this.countLabel = count;
    this.placeButton = place;

    const { signal } = this.lifecycle;
    backdrop.addEventListener("click", () => this.close(), { signal });
    close.addEventListener("click", () => this.close(), { signal });
    place.addEventListener("click", () => this.pick(), { signal });
    libraryInput.addEventListener("input", () => {
      this.libraryQuery = libraryInput.value;
      this.libraryIndex = 0;
      this.renderLibraries();
    }, { signal });
    cellInput.addEventListener("input", () => {
      this.cellQuery = cellInput.value;
      this.cellIndex = 0;
      this.renderCells();
    }, { signal });
    libraryList.addEventListener("click", (event) => {
      const button = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-library-id]");
      const id = button?.dataset.libraryId;
      if (id) this.selectLibrary(id as DeviceLibraryId, true);
    }, { signal });
    cellList.addEventListener("click", (event) => {
      const button = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-cell-item]");
      const item = button?.dataset.cellItem as InstancePaletteItem | undefined;
      if (!item) return;
      const index = this.filteredCells().indexOf(item);
      if (index >= 0) this.cellIndex = index;
      this.renderCells();
    }, { signal });
    cellList.addEventListener("dblclick", (event) => {
      if ((event.target as HTMLElement | null)?.closest("[data-cell-item]")) this.pick();
    }, { signal });
    layer.addEventListener("keydown", (event) => this.handleKeydown(event), { signal });
  }

  destroy() {
    this.lifecycle.abort();
    this.layer?.remove();
    this.layer = null;
    this.mounted = false;
  }

  isOpen() {
    return this.openState;
  }

  open() {
    if (!this.layer) return;
    this.previousFocus = this.root.ownerDocument.activeElement as HTMLElement | null;
    this.libraryId = "all";
    this.libraryQuery = "";
    this.cellQuery = "res";
    this.libraryIndex = 0;
    this.cellIndex = 0;
    this.layer.hidden = false;
    this.openState = true;
    if (this.libraryInput) this.libraryInput.value = "";
    if (this.cellInput) this.cellInput.value = this.cellQuery;
    this.renderLibraries();
    const items = this.filteredCells();
    const defaultIndex = items.indexOf(DEFAULT_DEVICE_ITEM);
    if (defaultIndex >= 0) this.cellIndex = defaultIndex;
    this.renderCells();
    if (this.cellInput) {
      this.cellInput.focus({ preventScroll: true });
      this.cellInput.select();
    }
  }

  close() {
    if (!this.layer || !this.openState) return;
    this.openState = false;
    this.layer.hidden = true;
    const focus = this.previousFocus;
    this.previousFocus = null;
    if (focus && focus.isConnected) focus.focus({ preventScroll: true });
    this.events.onClose?.();
  }

  private handleKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      this.close();
      return;
    }
    const target = event.target as HTMLElement | null;
    if (target === this.libraryInput) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        this.moveLibrary(event.key === "ArrowDown" ? 1 : -1);
      } else if (event.key === "Enter") {
        event.preventDefault();
        this.selectLibrary(this.visibleLibraries()[this.libraryIndex]?.id ?? this.libraryId, true);
      }
      return;
    }
    if (target === this.cellInput) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        this.moveCell(event.key === "ArrowDown" ? 1 : -1);
      } else if (event.key === "Enter") {
        event.preventDefault();
        this.pick();
      }
    }
  }

  private moveLibrary(delta: number) {
    const libraries = this.visibleLibraries();
    if (!libraries.length) return;
    this.libraryIndex = (this.libraryIndex + delta + libraries.length) % libraries.length;
    this.renderLibraries();
  }

  private moveCell(delta: number) {
    const items = this.filteredCells();
    if (!items.length) return;
    this.cellIndex = (this.cellIndex + delta + items.length) % items.length;
    this.renderCells();
    this.scrollActiveCell();
  }

  private visibleLibraries() {
    const query = this.libraryQuery.trim().toLowerCase();
    if (!query) return DEVICE_LIBRARIES;
    return DEVICE_LIBRARIES.filter(library =>
      `${t(library.labelKey, library.label)} ${library.label}`.toLowerCase().includes(query)
    );
  }

  private renderLibraries() {
    const list = this.libraryList;
    if (!list) return;
    const doc = list.ownerDocument;
    list.replaceChildren();
    const libraries = this.visibleLibraries();
    if (this.libraryIndex >= libraries.length) this.libraryIndex = Math.max(0, libraries.length - 1);
    libraries.forEach((library, index) => {
      const button = element(doc, "button", "browser-option");
      button.type = "button";
      button.dataset.libraryId = library.id;
      button.setAttribute("role", "option");
      button.setAttribute("aria-selected", String(library.id === this.libraryId));
      button.classList.toggle("is-active", index === this.libraryIndex);
      button.classList.toggle("is-selected", library.id === this.libraryId);
      const name = element(doc, "span", "browser-option-name", t(library.labelKey, library.label));
      const count = element(doc, "span", "browser-option-count", String(library.items.length));
      button.append(name, count);
      list.append(button);
    });
  }

  private filteredCells() {
    return filterDeviceItems(this.libraryId, this.cellQuery);
  }

  private renderCells() {
    const list = this.cellList;
    if (!list) return;
    const doc = list.ownerDocument;
    const items = this.filteredCells();
    if (this.cellIndex >= items.length) this.cellIndex = Math.max(0, items.length - 1);
    list.replaceChildren();
    if (!items.length) {
      list.append(element(doc, "div", "browser-empty", t("browser.empty", "No matching cell")));
    } else {
      items.forEach((item, index) => {
        const button = element(doc, "button", "browser-option browser-cell-option");
        button.type = "button";
        button.dataset.cellItem = item;
        button.setAttribute("role", "option");
        button.setAttribute("aria-selected", String(index === this.cellIndex));
        button.classList.toggle("is-active", index === this.cellIndex);
        const preview = element(doc, "span", "browser-cell-preview");
        preview.innerHTML = paletteItemPreview(item, { symbolTemplate: this.events.symbolTemplate() });
        const copy = element(doc, "span", "browser-cell-copy");
        copy.append(element(doc, "span", "browser-option-name", deviceItemName(item)));
        const badge = element(doc, "span", "browser-cell-badge", deviceItemLabel(item));
        button.append(preview, copy, badge);
        list.append(button);
      });
    }
    if (this.countLabel) {
      const template = items.length === 1
        ? t("browser.countOne", "1 cell")
        : t("browser.count", "{count} cells");
      this.countLabel.textContent = template.replace("{count}", String(items.length));
    }
    this.renderSymbol(items[this.cellIndex]);
    this.scrollActiveCell();
  }

  private renderSymbol(item: InstancePaletteItem | undefined) {
    if (this.symbolPreview) {
      this.symbolPreview.innerHTML = item
        ? paletteItemPreview(item, { symbolTemplate: this.events.symbolTemplate() })
        : "";
    }
    if (this.symbolName) this.symbolName.textContent = item ? deviceItemName(item) : "";
    if (this.symbolMeta) {
      if (!item) {
        this.symbolMeta.textContent = "";
      } else {
        const library = getDeviceLibrary(this.libraryId);
        const aliases = deviceItemAliases(item);
        this.symbolMeta.textContent = [
          deviceItemLabel(item),
          t(library.labelKey, library.label),
          aliases.length ? aliases.join(" · ") : ""
        ].filter(Boolean).join("  ·  ");
      }
    }
    if (this.placeButton) this.placeButton.disabled = !item;
  }

  private selectLibrary(id: DeviceLibraryId, focusCell: boolean) {
    const index = this.visibleLibraries().findIndex(library => library.id === id);
    if (index >= 0) this.libraryIndex = index;
    this.libraryId = id;
    this.cellQuery = "";
    this.cellIndex = 0;
    if (this.cellInput) this.cellInput.value = "";
    this.renderLibraries();
    this.renderCells();
    if (focusCell) this.cellInput?.focus({ preventScroll: true });
  }

  private scrollActiveCell() {
    const active = this.cellList?.querySelector<HTMLElement>(".browser-cell-option.is-active");
    active?.scrollIntoView({ block: "nearest" });
  }

  private pick() {
    const item = this.filteredCells()[this.cellIndex];
    if (!item) return;
    this.close();
    this.events.onPick(item);
  }
}
