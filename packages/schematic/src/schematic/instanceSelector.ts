import { getComponentDef, PALETTE_ORDER } from "./catalog";
import { getSchematicTemplateDef, isSchematicTemplateId, SCHEMATIC_TEMPLATE_ORDER, schematicTemplateBounds, type SchematicTemplateId } from "./templates";
import { resolveComponentVisualModel } from "./componentVisualModel";
import { renderComponentSvg } from "./componentSvgRenderer";
import type { SymbolTemplateId, SymbolTemplateContext } from "./symbolTemplateModel";
import { SYMBOL_STROKE_WIDTH } from "./symbols/symbolPrimitives";
import { renderSymbolContentSvg } from "./symbolContentView";
import { clamp, escapeAttribute, escapeHtml } from "./uiUtils";
import type { ComponentType } from "./types";

export type InstancePaletteItem = ComponentType | SchematicTemplateId;

type InstanceSelectorEvents = {
  symbolTemplate?: () => SymbolTemplateId | undefined;
  currentItem: () => InstancePaletteItem;
  activeItem: () => InstancePaletteItem | null;
  isPlacementMode: () => boolean;
  shouldIgnoreFocusOut?: () => boolean;
  activateItem: (item: InstancePaletteItem, options?: { selectAll?: boolean }) => void;
  previewItem: (item: InstancePaletteItem | null) => void;
  onStatusChange: () => void;
  focusCanvas?: () => void;
  closeAfterActivation?: boolean;
  onPanelVisibilityChange?: (open: boolean) => void;
};

type KeyboardMode = "idle" | "input-editing" | "captured-selected" | "captured-editing" | "captured-armed";
type PanelMode = "closed" | "matches" | "catalog";

const INSTANCE_PALETTE_ORDER: InstancePaletteItem[] = [...PALETTE_ORDER, ...SCHEMATIC_TEMPLATE_ORDER];
let nextInstanceSelectorId = 1;

export class InstanceSelector {
  private readonly idNamespace = `schematic-instance-${nextInstanceSelectorId++}`;
  private query = "";
  private panel: PanelMode = "closed";
  private activeIndex = 0;
  private dropdownIndex = 0;
  private keyboard: KeyboardMode = "idle";
  private bound = false;
  private bindingController: AbortController | null = null;
  private focusOutTimer: number | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly events: InstanceSelectorEvents
  ) {}

  private get ownerDocument() {
    return this.root.ownerDocument;
  }

  private get ownerWindow() {
    return this.ownerDocument.defaultView;
  }

  private requestFrame(callback: FrameRequestCallback) {
    const request = this.ownerWindow?.requestAnimationFrame ?? globalThis.requestAnimationFrame;
    return request ? request.call(this.ownerWindow ?? globalThis, callback) : 0;
  }

  render() {
    const target = this.root.querySelector<HTMLElement>("[data-palette-items]");
    if (!target) return;
    const selectedItem = this.events.currentItem();
    const selectedLabel = paletteDisplayName(selectedItem);
    this.query = "";
    this.panel = "closed";
    this.activeIndex = 0;
    this.dropdownIndex = 0;
    this.keyboard = "idle";
    target.innerHTML = `
      <div class="instance-combobox" data-instance-combobox>
        <div class="instance-selector" data-instance-selector>
          <div class="instance-current-symbol" data-instance-current-symbol>${paletteItemPreview(selectedItem, { symbolTemplate: this.events.symbolTemplate?.() })}</div>
          <div class="instance-query-wrap">
            <input
              id="${this.idNamespace}-query"
              type="text"
              spellcheck="false"
              autocomplete="off"
              role="combobox"
              aria-label="Add instance"
              aria-autocomplete="list"
              aria-expanded="false"
              aria-controls="${this.idNamespace}-options"
              data-instance-query
              value="${escapeAttribute(selectedLabel)}"
            />
            <div class="instance-query-overlay" aria-hidden="true" data-instance-query-overlay>
              <span data-instance-query-mirror></span><span data-instance-query-caret></span><span data-instance-query-selection></span><span data-instance-query-after></span><span data-instance-query-ghost></span>
            </div>
            <button
              type="button"
              class="instance-dropdown-button"
              aria-label="Show all components"
              aria-expanded="false"
              aria-controls="${this.idNamespace}-dropdown"
              data-instance-dropdown-button
            >
              <span aria-hidden="true"></span>
            </button>
          </div>
        </div>
        <div id="${this.idNamespace}-dropdown" class="instance-dropdown" role="listbox" data-instance-dropdown hidden></div>
        <div id="${this.idNamespace}-options" class="instance-options" role="listbox" data-instance-options hidden></div>
      </div>
    `;
    this.update();
  }

  bind() {
    if (this.bound) return;
    this.bound = true;
    const realm = this.root.ownerDocument.defaultView as (Window & typeof globalThis) | null;
    const AbortControllerCtor = realm?.AbortController ?? AbortController;
    this.bindingController = new AbortControllerCtor();
    const { signal } = this.bindingController;
    this.root.addEventListener("pointerdown", (event) => {
      const target = event.target as HTMLElement;
      if (target.closest("[data-instance-dropdown-button], [data-dropdown-palette-item]")) {
        event.preventDefault();
        return;
      }
      const overlay = target.closest<HTMLElement>("[data-instance-query-overlay]");
      if (!overlay) return;
      const input = this.queryInput();
      const completion = this.completion();
      if (!input || !completion) return;
      event.preventDefault();
      event.stopPropagation();
      const caret = this.caretIndexFromOverlayEvent(event, completion);
      this.acceptCompletion({ caret });
    }, { signal });

    this.root.addEventListener("pointermove", (event) => {
      if (event.buttons !== 1) return;
      const target = event.target as HTMLElement;
      const ghost = target.closest<HTMLElement>("[data-instance-query-ghost]");
      if (!ghost || !this.completion()) return;
      event.preventDefault();
      this.acceptCompletion();
    }, { signal });

    this.root.addEventListener("click", (event) => {
      const target = event.target as HTMLElement;
      const dropdownButton = target.closest<HTMLButtonElement>("[data-instance-dropdown-button]");
      if (dropdownButton) {
        event.preventDefault();
        event.stopPropagation();
        this.toggleDropdown();
        return;
      }

      const dropdownOption = target.closest<HTMLButtonElement>("[data-dropdown-palette-item]");
      if (dropdownOption) {
        const item = paletteItemId(dropdownOption.dataset.dropdownPaletteItem);
        if (!item) return;
        event.preventDefault();
        event.stopPropagation();
        this.acceptDropdownItem(item);
        return;
      }

      const button = target.closest<HTMLButtonElement>("[data-palette-item]");
      if (button) {
        const item = paletteItemId(button.dataset.paletteItem);
        if (!item) return;
        event.preventDefault();
        event.stopPropagation();
        this.acceptCandidate(item);
        this.panel = "matches";
        this.update();
        return;
      }

      const selector = target.closest<HTMLElement>("[data-instance-selector]");
      if (!selector) return;
      const input = this.queryInput();
      if (!input) return;
      const captured = this.capturesKeyboard();
      this.query = paletteDisplayName(this.events.currentItem());
      this.panel = "closed";
      this.keyboard = captured ? "captured-armed" : "idle";
      input.focus();
      input.value = this.query;
      input.select();
      this.renderCompletion();
      this.events.previewItem(this.events.currentItem());
    }, { signal });

    this.root.addEventListener("input", (event) => {
      const input = (event.target as HTMLElement).closest<HTMLInputElement>("[data-instance-query]");
      if (!input) return;
      if (this.hasDropdownOpen()) this.closeDropdown();
      this.applyQueryEdit(input.value);
    }, { signal });

    ["click", "keyup", "mouseup", "select"].forEach((type) => {
      this.root.addEventListener(
        type,
        (event) => {
          if (!(event.target as HTMLElement).closest("[data-instance-query]")) return;
          this.renderCompletion();
        },
        { capture: true, signal }
      );
    });

    this.root.addEventListener("keydown", (event) => this.handleInputKeydown(event), { signal });

    this.root.addEventListener("focusout", () => {
      if (this.focusOutTimer !== null) (this.ownerWindow ?? globalThis).clearTimeout(this.focusOutTimer);
      this.focusOutTimer = (this.ownerWindow ?? globalThis).setTimeout(() => {
        this.focusOutTimer = null;
        if (signal.aborted) return;
        if (this.events.shouldIgnoreFocusOut?.()) return;
        if (!this.contains(this.ownerDocument.activeElement)) {
          this.acceptCompletion({ focus: false });
          this.closeDropdown();
          this.closeOptions();
        }
      }, 0) as unknown as number;
    }, { signal });
  }

  destroy() {
    this.bindingController?.abort();
    this.bindingController = null;
    if (this.focusOutTimer !== null) {
      (this.ownerWindow ?? globalThis).clearTimeout(this.focusOutTimer);
      this.focusOutTimer = null;
    }
    this.bound = false;
    this.closePanel();
  }

  contains(target: EventTarget | Node | null) {
    return !!target && !!this.root.querySelector<HTMLElement>("[data-instance-combobox]")?.contains(target as Node);
  }

  isQueryTarget(target: HTMLElement | null) {
    return !!target?.closest("[data-instance-query]");
  }

  hasDropdownOpen() {
    return this.panel === "catalog";
  }

  hasOptionsOpen() {
    return this.panel === "matches";
  }

  closePanel() {
    this.closeDropdown();
    this.closeOptions();
    this.disarmKeyboardCapture();
    this.root.classList.remove("is-open");
    this.events.onPanelVisibilityChange?.(false);
  }

  settle() {
    this.acceptCompletion({ focus: false });
    this.closeDropdown();
    this.closeOptions();
  }

  beginPlacement(item: InstancePaletteItem, options: { armKeyboard?: boolean; prefillQuery?: boolean } = {}) {
    const armKeyboard = options.armKeyboard ?? false;
    this.query = armKeyboard || options.prefillQuery ? paletteDisplayName(item) : "";
    this.panel = armKeyboard ? "matches" : "closed";
    this.activeIndex = 0;
    this.dropdownIndex = this.dropdownIndexFor(item);
    this.keyboard = armKeyboard ? "captured-selected" : "idle";
    this.root.classList.add("is-open");
    this.events.onPanelVisibilityChange?.(true);
    if (options.armKeyboard) {
      this.showQuery({ selectAll: true });
      this.markKeyboardState();
      this.events.previewItem(item);
      this.update();
    } else {
      this.markKeyboardState();
      this.showSelectedName();
    }
  }

  enterPlacementMode() {
    this.root.classList.add("is-open");
  }

  prepareNextPlacementInput(item: InstancePaletteItem) {
    if (!this.capturesKeyboard()) return;
    this.query = paletteDisplayName(item);
    this.panel = "closed";
    this.activeIndex = 0;
    this.keyboard = "captured-armed";
    this.markKeyboardState();
    this.showQuery({ selectAll: true, focus: false });
    this.update();
  }

  closeDropdown(options: { acceptCompletion?: boolean; selectAll?: boolean } = {}) {
    if (!this.hasDropdownOpen()) return;
    if (options.acceptCompletion) this.acceptCompletion({ focus: false });
    this.panel = "closed";
    this.update();
    if (options.selectAll) this.showQuery({ selectAll: true });
  }

  closeOptions() {
    if (!this.hasOptionsOpen()) return;
    this.panel = "closed";
    this.update();
  }

  handleKeyboardCapture(event: KeyboardEvent) {
    if (!this.events.isPlacementMode() || !this.capturesKeyboard()) return false;
    if (event.ctrlKey || event.metaKey || event.altKey) return false;

    if (event.key.length === 1) {
      event.preventDefault();
      event.stopPropagation();
      this.applyQueryEdit(this.replacesNextInput() ? event.key : `${this.query}${event.key}`, {
        markKeyboardState: true
      });
      return true;
    }

    if (event.key === "Backspace") {
      event.preventDefault();
      event.stopPropagation();
      this.applyQueryEdit(this.replacesNextInput() ? "" : this.query.slice(0, -1), {
        markKeyboardState: true
      });
      return true;
    }

    return this.handleCandidateNavigationKey(event, { stopPropagation: true });
  }

  update() {
    this.updateCurrent();
    const input = this.queryInput();
    const target = this.root.querySelector<HTMLElement>("[data-instance-options]");
    const dropdown = this.root.querySelector<HTMLElement>("[data-instance-dropdown]");
    const dropdownButton = this.root.querySelector<HTMLButtonElement>("[data-instance-dropdown-button]");
    const dropdownOpen = this.hasDropdownOpen();
    const optionsOpen = this.hasOptionsOpen();
    if (dropdownButton) dropdownButton.setAttribute("aria-expanded", String(dropdownOpen));
    if (dropdown) {
      dropdown.hidden = !dropdownOpen;
      dropdown.innerHTML = INSTANCE_PALETTE_ORDER.map((item, index) => {
        const active = index === this.dropdownIndex;
        const selected = item === this.events.activeItem();
        return `
          <button
            type="button"
            id="${this.dropdownOptionId(item)}"
            role="option"
            class="instance-dropdown-option${active ? " is-active" : ""}${selected ? " is-selected" : ""}"
            aria-selected="${active}"
            data-dropdown-palette-item="${item}"
            data-instance-dropdown-option
          >${escapeHtml(paletteDisplayName(item))}</button>
        `;
      }).join("");
    }
    if (!target) return;
    const candidates = this.candidates();
    if (this.activeIndex >= candidates.length) this.activeIndex = Math.max(0, candidates.length - 1);
    target.hidden = !optionsOpen || dropdownOpen;
    target.innerHTML = candidates.length
      ? candidates.map((item, index) => {
          const active = index === this.activeIndex;
          const selected = item === this.events.activeItem();
          return `
            <button
              type="button"
              id="${this.matchOptionId(item)}"
              role="option"
              class="instance-option${isSchematicTemplateId(item) ? " is-template" : ""}${active ? " is-active" : ""}${selected ? " is-selected" : ""}"
              aria-selected="${active}"
              data-palette-item="${item}"
            >
              ${paletteItemPreview(item, { symbolTemplate: this.events.symbolTemplate?.() })}
              <span>${escapeHtml(paletteDisplayName(item))}</span>
            </button>
          `;
        }).join("")
      : `<div class="instance-option-empty">No matching instance</div>`;
    if (!input) return;
    input.setAttribute("aria-expanded", String(optionsOpen || dropdownOpen));
    if (dropdownOpen && INSTANCE_PALETTE_ORDER[this.dropdownIndex]) {
      input.setAttribute("aria-activedescendant", this.dropdownOptionId(INSTANCE_PALETTE_ORDER[this.dropdownIndex]));
    } else if (optionsOpen && candidates[this.activeIndex]) {
      input.setAttribute("aria-activedescendant", this.matchOptionId(candidates[this.activeIndex]));
    } else {
      input.removeAttribute("aria-activedescendant");
    }
    this.renderCompletion();
  }

  private dropdownOptionId(item: InstancePaletteItem) {
    return `${this.idNamespace}-dropdown-${item}`;
  }

  private matchOptionId(item: InstancePaletteItem) {
    return `${this.idNamespace}-option-${item}`;
  }

  private handleInputKeydown(event: KeyboardEvent) {
    const input = (event.target as HTMLElement).closest<HTMLInputElement>("[data-instance-query]");
    if (!input) return;
    if (this.hasDropdownOpen()) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        this.moveDropdown(1);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        this.moveDropdown(-1);
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        this.acceptDropdownItem(INSTANCE_PALETTE_ORDER[this.dropdownIndex]);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        this.closeDropdown();
        return;
      }
    }
    if (this.handleCandidateNavigationKey(event)) return;
    if (event.key === "Escape" && this.hasOptionsOpen()) {
      event.preventDefault();
      event.stopPropagation();
      this.closeOptions();
    }
  }

  private handleCandidateNavigationKey(event: KeyboardEvent, options: { stopPropagation?: boolean } = {}) {
    let handled = true;
    switch (event.key) {
      case "Tab":
        if (this.acceptCompletion({ focus: false })) this.events.focusCanvas?.();
        break;
      case "ArrowDown":
        this.moveActiveCandidate(1);
        break;
      case "ArrowUp":
        this.moveActiveCandidate(-1);
        break;
      case "Enter":
        break;
      default:
        handled = false;
    }
    if (!handled) return false;
    event.preventDefault();
    if (options.stopPropagation) event.stopPropagation();
    return true;
  }

  private openDropdown() {
    this.acceptCompletion();
    this.panel = "catalog";
    this.dropdownIndex = this.dropdownIndexFor(this.events.activeItem() ?? this.events.currentItem());
    this.update();
    this.showQuery({ selectAll: true });
    this.scrollDropdownActiveIntoView();
  }

  private toggleDropdown() {
    if (this.hasDropdownOpen()) {
      this.closeDropdown({ acceptCompletion: true, selectAll: true });
      return;
    }
    this.openDropdown();
  }

  private dropdownIndexFor(item: InstancePaletteItem) {
    return Math.max(0, INSTANCE_PALETTE_ORDER.indexOf(item));
  }

  private moveDropdown(delta: number) {
    if (!INSTANCE_PALETTE_ORDER.length) return;
    this.dropdownIndex = clamp(this.dropdownIndex + delta, 0, INSTANCE_PALETTE_ORDER.length - 1);
    this.acceptDropdownItem(INSTANCE_PALETTE_ORDER[this.dropdownIndex], { keepOpen: true });
    this.scrollDropdownActiveIntoView();
  }

  private applyQueryEdit(query: string, options: { markKeyboardState?: boolean } = {}) {
    this.query = query;
    this.panel = "matches";
    this.activeIndex = 0;
    this.keyboard = this.capturesKeyboard() ? "captured-editing" : "input-editing";
    if (options.markKeyboardState) this.markKeyboardState();
    this.syncActiveCandidate();
    this.update();
  }

  private moveActiveCandidate(delta: number) {
    const candidates = this.candidates();
    this.panel = "matches";
    if (!candidates.length) {
      this.update();
      return;
    }
    this.activeIndex = clamp(this.activeIndex + delta, 0, candidates.length - 1);
    this.acceptCandidate(candidates[this.activeIndex]);
    this.update();
  }

  private acceptDropdownItem(item: InstancePaletteItem, options: { keepOpen?: boolean } = {}) {
    this.dropdownIndex = this.dropdownIndexFor(item);
    this.panel = options.keepOpen ? "catalog" : "closed";
    this.acceptCandidate(item, { selectAll: true });
    this.update();
    if (this.hasDropdownOpen()) this.scrollDropdownActiveIntoView();
  }

  private scrollDropdownActiveIntoView() {
    this.requestFrame(() => {
      const target = this.root.querySelector<HTMLElement>("[data-instance-dropdown-option].is-active");
      target?.scrollIntoView({ block: "nearest" });
    });
  }

  private queryInput() {
    return this.root.querySelector<HTMLInputElement>("[data-instance-query]");
  }

  private showQuery(options: { selectAll?: boolean; caret?: number; focus?: boolean } = {}) {
    const input = this.queryInput();
    if (!input) return;
    input.value = this.query;
    this.applyQuerySelection(input, options);
    if (options.focus === false) {
      this.renderCompletion();
      return;
    }
    const applyFocus = () => {
      input.focus({ preventScroll: true });
      this.applyQuerySelection(input, options);
      this.renderCompletion();
    };
    applyFocus();
    this.requestFrame(applyFocus);
  }

  private applyQuerySelection(input: HTMLInputElement, options: { selectAll?: boolean; caret?: number }) {
    if (options.selectAll) {
      input.setSelectionRange(0, input.value.length);
      return;
    }
    const caret = clamp(options.caret ?? input.value.length, 0, input.value.length);
    input.setSelectionRange(caret, caret);
  }

  private disarmKeyboardCapture() {
    if (this.keyboard === "idle") return;
    this.query = "";
    this.keyboard = "idle";
    this.markKeyboardState();
    this.showSelectedName();
  }

  private capturesKeyboard() {
    return this.keyboard.startsWith("captured-");
  }

  private replacesNextInput() {
    return this.keyboard === "captured-selected" || this.keyboard === "captured-armed";
  }

  private isEditing() {
    return this.keyboard.endsWith("-editing") || this.keyboard === "captured-selected";
  }

  private markKeyboardState() {
    const combobox = this.root.querySelector<HTMLElement>("[data-instance-combobox]");
    combobox?.classList.toggle("is-keyboard-armed", this.keyboard === "captured-armed");
    combobox?.classList.toggle("is-keyboard-editing", this.isEditing());
    const input = this.queryInput();
    if (!input) return;
    if (this.keyboard === "captured-armed") {
      input.setSelectionRange(0, input.value.length);
    } else if (this.ownerDocument.activeElement !== input) {
      input.setSelectionRange(input.value.length, input.value.length);
    }
  }

  private showSelectedName() {
    const input = this.queryInput();
    if (input) input.value = paletteDisplayName(this.events.currentItem());
    this.renderCompletion();
  }

  private candidates() {
    return findInstancePaletteMatches(this.query);
  }

  private completion(value = this.query) {
    if (!value) return "";
    const item = this.candidates()[this.activeIndex];
    if (!item) return "";
    const name = paletteSearchNames(item).find(name => name.toLowerCase().startsWith(value.toLowerCase()));
    return name ? name.slice(value.length) : "";
  }

  private acceptCandidate(item: InstancePaletteItem, options: { caret?: number; focus?: boolean; selectAll?: boolean } = {}) {
    const captured = this.capturesKeyboard();
    const query = paletteDisplayName(item);
    const candidates = findInstancePaletteMatches(query);
    this.query = query;
    this.activeIndex = Math.max(0, candidates.indexOf(item));
    this.keyboard = captured ? "captured-editing" : "input-editing";
    this.events.activateItem(item, { selectAll: options.selectAll });
    if (this.events.closeAfterActivation) this.closePanel();
    this.showQuery({ caret: options.caret, focus: options.focus, selectAll: options.selectAll });
  }

  private acceptCompletion(options: { caret?: number; focus?: boolean } = {}) {
    const item = this.candidates()[this.activeIndex];
    if (!item) return false;
    const exactMatch = paletteSearchNames(item).some(name => name.toLowerCase() === this.query.toLowerCase());
    if (!this.completion() && !exactMatch) return false;
    this.acceptCandidate(item, options);
    return true;
  }

  private caretIndexFromOverlayEvent(event: PointerEvent, completion: string) {
    const input = this.queryInput();
    const ghost = this.root.querySelector<HTMLElement>("[data-instance-query-ghost]");
    if (!input || !ghost) return this.query.length;
    const text = `${this.query}${completion}`;
    if (!text) return 0;
    const range = this.ownerDocument.createRange();
    const textNode = ghost.firstChild;
    if (!textNode || textNode.nodeType !== 3) return text.length;
    for (let index = 0; index <= completion.length; index += 1) {
      range.setStart(textNode, 0);
      range.setEnd(textNode, index);
      const rect = range.getBoundingClientRect();
      const midpoint = rect.left + rect.width;
      if (event.clientX <= midpoint) {
        return clamp(this.query.length + index, 0, text.length);
      }
    }
    return text.length;
  }

  private syncActiveCandidate() {
    const item = this.candidates()[this.activeIndex];
    this.events.previewItem(item ?? null);
    this.events.onStatusChange();
  }

  private updateCurrent() {
    const symbol = this.root.querySelector<HTMLElement>("[data-instance-current-symbol]");
    const activeItem = this.events.activeItem();
    if (symbol) symbol.innerHTML = activeItem ? paletteItemPreview(activeItem, { symbolTemplate: this.events.symbolTemplate?.() }) : "";
    const input = this.queryInput();
    if (!input) return;
    input.setAttribute("aria-expanded", String(this.panel !== "closed"));
    if (this.isEditing()) {
      if (this.ownerDocument.activeElement !== input && input.value !== this.query) input.value = this.query;
    } else if (this.ownerDocument.activeElement !== input) {
      input.value = paletteDisplayName(this.events.currentItem());
    }
  }

  private renderCompletion() {
    const mirror = this.root.querySelector<HTMLElement>("[data-instance-query-mirror]");
    const caret = this.root.querySelector<HTMLElement>("[data-instance-query-caret]");
    const selection = this.root.querySelector<HTMLElement>("[data-instance-query-selection]");
    const after = this.root.querySelector<HTMLElement>("[data-instance-query-after]");
    const ghost = this.root.querySelector<HTMLElement>("[data-instance-query-ghost]");
    const overlay = this.root.querySelector<HTMLElement>("[data-instance-query-overlay]");
    const input = this.queryInput();
    if (!mirror || !caret || !selection || !after || !ghost || !overlay || !input) return;
    const value = input.value;
    const completion = this.completion(value);
    const rawSelectionStart = input.selectionStart ?? value.length;
    const rawSelectionEnd = input.selectionEnd ?? rawSelectionStart;
    const selectionStart = clamp(Math.min(rawSelectionStart, rawSelectionEnd), 0, value.length);
    const selectionEnd = clamp(Math.max(rawSelectionStart, rawSelectionEnd), 0, value.length);
    const isVirtualKeyboardEditing = this.keyboard === "captured-selected" || this.keyboard === "captured-editing";
    const hasVisibleSelection = selectionEnd > selectionStart && (isVirtualKeyboardEditing || this.ownerDocument.activeElement === input);
    const caretIndex = clamp(rawSelectionStart, 0, value.length);
    mirror.textContent = value.slice(0, hasVisibleSelection ? selectionStart : caretIndex);
    selection.textContent = hasVisibleSelection ? value.slice(selectionStart, selectionEnd) : "";
    after.textContent = hasVisibleSelection ? value.slice(selectionEnd) : value.slice(caretIndex);
    ghost.textContent = completion;
    overlay.classList.toggle("has-selection", hasVisibleSelection);
    overlay.classList.toggle("is-caret-visible", (isVirtualKeyboardEditing || this.ownerDocument.activeElement === input) && selectionStart === selectionEnd);
  }
}

function paletteDisplayName(item: InstancePaletteItem) {
  return isSchematicTemplateId(item) ? item : getComponentDef(item).hotLabel;
}

function paletteSearchNames(item: InstancePaletteItem): readonly string[] {
  return isSchematicTemplateId(item) ? [item]
    : [getComponentDef(item).hotLabel, ...(getComponentDef(item).aliases ?? [])];
}

export function findInstancePaletteMatches(query: string): InstancePaletteItem[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [];
  const prefixMatches: InstancePaletteItem[] = [];
  const substringMatches: InstancePaletteItem[] = [];
  INSTANCE_PALETTE_ORDER.forEach((item) => {
    const names = paletteSearchNames(item).map(name => name.toLowerCase());
    if (names.some(name => name.startsWith(normalized))) {
      prefixMatches.push(item);
    } else if (names.some(name => name.includes(normalized))) {
      substringMatches.push(item);
    }
  });
  return [...prefixMatches, ...substringMatches];
}

function paletteItemId(value: string | undefined): InstancePaletteItem | null {
  if (!value) return null;
  if (PALETTE_ORDER.includes(value as ComponentType)) return value as ComponentType;
  if (isSchematicTemplateId(value)) return value;
  return null;
}

export function paletteItemPreview(item: InstancePaletteItem, context: SymbolTemplateContext = {}) {
  return isSchematicTemplateId(item) ? paletteTemplatePreview(item, context) : paletteSymbolPreview(item, context);
}

export function paletteSymbolPreview(type: ComponentType, context: SymbolTemplateContext = {}) {
  const base = getComponentDef(type);
  const model = resolveComponentVisualModel({
    id: `palette-${type}-preview`,
    type,
    variantId: base.defaultVariantId,
    ref: base.hotLabel,
    x: 0,
    y: 0,
    rotation: 0,
    mirrored: false,
    values: { ...(base.defaultValues ?? {}) }
  }, { ...context, preview: true });
  const def = model.def;
  const symbolContent = renderSymbolContentSvg(model.symbolContentLayout);
  return `
    <svg class="palette-symbol-preview" viewBox="0 0 ${def.size.width} ${def.size.height}" aria-hidden="true" focusable="false">
      ${model.path ? `<path d="${escapeAttribute(model.path)}" fill="none" stroke="currentColor" stroke-width="${model.symbolStrokeWidth}" stroke-linecap="round" stroke-linejoin="round"></path>` : ""}
      ${model.accentPath ? `<path d="${escapeAttribute(model.accentPath)}" fill="none" stroke="currentColor" stroke-width="${model.accentStrokeWidth}" stroke-linecap="round" stroke-linejoin="round"></path>` : ""}
      ${model.pinMarksPath ? `<path d="${escapeAttribute(model.pinMarksPath)}" fill="none" stroke="currentColor" stroke-width="${SYMBOL_STROKE_WIDTH}" stroke-linecap="square" stroke-linejoin="miter"></path>` : ""}
      ${model.markerPath ? `<path d="${escapeAttribute(model.markerPath)}" fill="currentColor" stroke="none"></path>` : ""}
      ${symbolContent}
      ${!model.isAnnotation && model.labelText ? `<text x="${model.labelLayout.x}" y="${model.labelLayout.y}" fill="currentColor" font-family="Arial, Helvetica, sans-serif" font-size="${model.labelLayout.fontSize}" font-weight="${model.labelFontWeight}" text-anchor="${model.labelLayout.textAnchor}" dominant-baseline="${model.labelLayout.dominantBaseline}">${escapeHtml(model.labelText)}</text>` : ""}
    </svg>
  `;
}

function paletteTemplatePreview(id: SchematicTemplateId, context: SymbolTemplateContext) {
  const template = getSchematicTemplateDef(id);
  const bounds = schematicTemplateBounds(template);
  const padding = 12;
  const viewBox = `${bounds.x - padding} ${bounds.y - padding} ${Math.max(1, bounds.width + 2 * padding)} ${Math.max(1, bounds.height + 2 * padding)}`;
  const wires = template.wires
    .map((wire) => {
      const points = wire.points.map((point) => `${point.x},${point.y}`).join(" ");
      return `<polyline points="${escapeAttribute(points)}" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"></polyline>`;
    })
    .join("");
  const components = template.components
    .map((component) => {
      return renderComponentSvg({ id: "preview", type: component.type, variantId: component.variantId, ref: "", x: component.x, y: component.y, rotation: component.rotation ?? 0, mirrored: component.mirrored ?? false, values: {} }, { ...context, preview: true });
    })
    .join("");
  return `
    <svg class="palette-symbol-preview palette-template-preview" viewBox="${escapeAttribute(viewBox)}" aria-hidden="true" focusable="false">
      ${wires}
      ${components}
    </svg>
  `;
}
