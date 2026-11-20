import { MAX_SCHEMATIC_TAB_TITLE_LENGTH } from "./schematicTabTitle";

export interface SchematicDocumentTabItem {
  id: string;
  title: string;
}

/** Async callbacks own error reporting; DOM events dispatch them without waiting. */
type SchematicTabAction<Args extends unknown[] = []> =
  | ((...args: Args) => void)
  | ((...args: Args) => Promise<void>);

export interface SchematicDocumentTabsOptions {
  onActivate: SchematicTabAction<[id: string]>;
  onClose: SchematicTabAction<[id: string]>;
  onCreate: SchematicTabAction;
  onReorder?: SchematicTabAction<[id: string, insertionIndex: number]>;
  onRename?: SchematicTabAction<[id: string, title: string]>;
  onImport?: SchematicTabAction<[file: File]>;
  onImportFromClipboard?: SchematicTabAction;
  onExport?(): void;
  onRetrySave?: SchematicTabAction;
}

export interface SchematicCloseSnackbarOptions {
  message: string;
  onUndo: SchematicTabAction;
  timeoutMs?: number;
}

export interface SchematicDocumentTabsRuntime {
  setTimeout(callback: () => void, delayMs: number): number;
  clearTimeout(handle: number): void;
}

export class SchematicDocumentTabs {
  private bound = false;
  private closeSnackbarTimer: number | null = null;
  private closeUndo: SchematicCloseSnackbarOptions["onUndo"] | null = null;
  private renameInput: HTMLInputElement | null = null;
  private pendingDrag: { id: string; pointerId: number; startX: number; handle: HTMLElement } | null = null;
  private draggedTabId: string | null = null;
  private dropIndicator: { element: HTMLElement; placement: "before" | "after" } | null = null;
  private suppressNextTabClick: string | null = null;
  private suppressAuxClickUntil = 0;
  private bindingController: AbortController | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly options: SchematicDocumentTabsOptions,
    private readonly runtime: SchematicDocumentTabsRuntime = {
      setTimeout: (callback, delayMs) => globalThis.setTimeout(callback, delayMs) as unknown as number,
      clearTimeout: (handle) => globalThis.clearTimeout(handle)
    }
  ) {}

  bind() {
    if (this.bound || this.bindingController) return;
    this.bound = true;
    const realm = this.root.ownerDocument.defaultView;
    const AbortControllerCtor = realm?.AbortController ?? AbortController;
    this.bindingController = new AbortControllerCtor();
    const { signal } = this.bindingController;
    this.root.addEventListener("click", (event) => this.handleClick(event), { signal });
    this.root.addEventListener("dblclick", (event) => this.handleDoubleClick(event), { signal });
    this.root.addEventListener("pointerdown", (event) => this.handlePointerDown(event), { signal });
    this.root.addEventListener("pointermove", (event) => this.handlePointerMove(event), { signal });
    this.root.addEventListener("pointerup", (event) => this.handlePointerUp(event), { signal });
    this.root.addEventListener("pointercancel", (event) => this.handlePointerCancel(event), { signal });
    this.root.addEventListener("auxclick", (event) => this.handleAuxClick(event), { signal });
    this.root.addEventListener("change", (event) => this.handleChange(event), { signal });
    this.root.addEventListener("focusout", (event) => this.handleFocusOut(event), { signal });
    this.root.addEventListener("keydown", (event) => this.handleKeyDown(event), { signal });
  }

  destroy() {
    this.bindingController?.abort();
    this.bindingController = null;
    this.bound = false;
    this.hideCloseSnackbar();
    this.finishDrag();
    this.suppressNextTabClick = null;
    this.renameInput = null;
  }

  render(items: readonly SchematicDocumentTabItem[], activeId: string) {
    const list = this.root.querySelector<HTMLElement>("[data-schematic-document-tab-list]");
    if (!list) return;
    const existing = new Map(
      Array.from(list.querySelectorAll<HTMLElement>("[data-schematic-document-tab-item]"))
        .map((tab) => [tab.dataset.schematicDocumentTabItem, tab] as const)
        .filter((entry): entry is [string, HTMLElement] => Boolean(entry[0]))
    );
    const tabs = items.map((item) => {
      const tab = existing.get(item.id) ?? this.createTab(item, item.id === activeId);
      this.updateTab(tab, item, item.id === activeId);
      return tab;
    });
    const currentTabs = Array.from(list.children);
    const orderUnchanged = tabs.length === currentTabs.length
      && tabs.every((tab, index) => tab === currentTabs[index]);
    if (!orderUnchanged) list.replaceChildren(...tabs);

    const renameId = this.renameInput?.dataset.schematicDocumentRename;
    if (renameId && !items.some((item) => item.id === renameId)) this.renameInput = null;
  }

  showCloseSnackbar(options: SchematicCloseSnackbarOptions) {
    const snackbar = this.root.querySelector<HTMLElement>("[data-schematic-close-snackbar]");
    const message = snackbar?.querySelector<HTMLElement>("[data-schematic-close-message]");
    if (!snackbar || !message) return;

    this.clearCloseSnackbarTimer();
    this.closeUndo = options.onUndo;
    message.textContent = options.message;
    snackbar.hidden = false;

    const timeoutMs = options.timeoutMs ?? 6000;
    if (timeoutMs > 0) {
      this.closeSnackbarTimer = this.runtime.setTimeout(() => this.hideCloseSnackbar(), timeoutMs);
    }
  }

  hideCloseSnackbar() {
    this.clearCloseSnackbarTimer();
    this.closeUndo = null;
    const snackbar = this.root.querySelector<HTMLElement>("[data-schematic-close-snackbar]");
    const message = snackbar?.querySelector<HTMLElement>("[data-schematic-close-message]");
    if (message) message.textContent = "";
    if (snackbar) snackbar.hidden = true;
  }

  showStorageError(messageText: string) {
    const notice = this.root.querySelector<HTMLElement>("[data-schematic-storage-error]");
    const message = notice?.querySelector<HTMLElement>("[data-schematic-storage-error-message]");
    if (!notice || !message) return;
    message.textContent = messageText;
    notice.hidden = false;
  }

  clearStorageError() {
    const notice = this.root.querySelector<HTMLElement>("[data-schematic-storage-error]");
    const message = notice?.querySelector<HTMLElement>("[data-schematic-storage-error-message]");
    if (message) message.textContent = "";
    if (notice) notice.hidden = true;
  }

  private createTab(item: SchematicDocumentTabItem, active: boolean) {
    const wrapper = this.root.ownerDocument.createElement("div");
    wrapper.className = "schematic-document-tab";
    wrapper.classList.toggle("is-active", active);
    wrapper.dataset.schematicDocumentTabItem = item.id;

    const tab = this.createTabLabel(item.id, item.title, active);

    const close = this.root.ownerDocument.createElement("button");
    close.type = "button";
    close.className = "schematic-document-tab-close";
    close.dataset.schematicDocumentClose = item.id;
    close.setAttribute("aria-label", `Close ${item.title}`);
    close.title = `Close ${item.title}`;

    wrapper.append(tab, close);
    return wrapper;
  }

  private updateTab(wrapper: HTMLElement, item: SchematicDocumentTabItem, active: boolean) {
    wrapper.classList.toggle("is-active", active);
    wrapper.dataset.schematicDocumentTabItem = item.id;

    const tab = wrapper.querySelector<HTMLButtonElement>("[data-schematic-document-tab]");
    if (tab) {
      tab.dataset.schematicDocumentTab = item.id;
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
      tab.textContent = item.title;
      tab.title = item.title;
    }

    const close = wrapper.querySelector<HTMLButtonElement>("[data-schematic-document-close]");
    if (close) {
      close.dataset.schematicDocumentClose = item.id;
      close.setAttribute("aria-label", `Close ${item.title}`);
      close.title = `Close ${item.title}`;
    }
  }

  private createTabLabel(id: string, title: string, active: boolean) {
    const tab = this.root.ownerDocument.createElement("button");
    tab.type = "button";
    tab.className = "schematic-document-tab-label";
    tab.dataset.schematicDocumentTab = id;
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
    tab.textContent = title;
    tab.title = title;
    return tab;
  }

  private handleClick(event: MouseEvent) {
    const target = event.target as HTMLElement | null;
    const close = target?.closest<HTMLButtonElement>("[data-schematic-document-close]");
    if (close?.dataset.schematicDocumentClose) {
      void this.options.onClose(close.dataset.schematicDocumentClose);
      return;
    }
    if (target?.closest("[data-schematic-document-new]")) {
      void this.options.onCreate();
      return;
    }
    if (target?.closest("[data-schematic-document-import]")) {
      const input = this.root.querySelector<HTMLInputElement>("[data-schematic-document-import-input]");
      if (input) {
        input.value = "";
        input.click();
      }
      return;
    }
    if (target?.closest("[data-schematic-document-paste]")) {
      this.options.onImportFromClipboard?.();
      return;
    }
    if (target?.closest("[data-schematic-document-export]")) {
      this.options.onExport?.();
      return;
    }
    if (target?.closest("[data-schematic-close-undo]")) {
      const onUndo = this.closeUndo;
      this.hideCloseSnackbar();
      void onUndo?.();
      return;
    }
    if (target?.closest("[data-schematic-storage-retry]")) {
      void this.options.onRetrySave?.();
      return;
    }
    if (target?.closest("[data-schematic-storage-error-dismiss]")) {
      this.clearStorageError();
      return;
    }
    const tab = target?.closest<HTMLButtonElement>("[data-schematic-document-tab]");
    const id = tab?.dataset.schematicDocumentTab;
    if (!id) return;
    if (this.suppressNextTabClick === id) {
      this.suppressNextTabClick = null;
      event.preventDefault();
      return;
    }
    void this.options.onActivate(id);
  }

  private handleDoubleClick(event: MouseEvent) {
    if (event.button !== 0) return;
    const tab = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>("[data-schematic-document-tab]");
    if (!tab?.dataset.schematicDocumentTab) return;
    event.preventDefault();
    this.startRename(tab);
  }

  private handlePointerDown(event: PointerEvent) {
    if (event.button === 1) {
      const id = this.tabIdFromTarget(event.target);
      if (!id) return;
      event.preventDefault();
      event.stopPropagation();
      this.suppressAuxClickUntil = Date.now() + 750;
      void this.options.onClose(id);
      return;
    }
    if (event.button !== 0) return;
    const handle = (event.target as HTMLElement | null)?.closest<HTMLElement>(
      "[data-schematic-document-tab]"
    );
    const id = handle?.dataset.schematicDocumentTab;
    if (!handle || !id) return;
    this.pendingDrag = { id, pointerId: event.pointerId, startX: event.clientX, handle };
    handle.setPointerCapture?.(event.pointerId);
  }

  private handleAuxClick(event: MouseEvent) {
    if (event.button !== 1) return;
    const id = this.tabIdFromTarget(event.target);
    if (!id) return;
    event.preventDefault();
    event.stopPropagation();
    if (Date.now() <= this.suppressAuxClickUntil) return;
    void this.options.onClose(id);
  }

  private handlePointerMove(event: PointerEvent) {
    const pending = this.pendingDrag;
    if (!pending || pending.pointerId !== event.pointerId) return;
    if (!this.draggedTabId && Math.abs(event.clientX - pending.startX) < 5) return;
    if (!this.draggedTabId) {
      this.draggedTabId = pending.id;
      this.findTabWrapperById(pending.id)?.classList.toggle("is-dragging", true);
    }
    event.preventDefault();
    const list = this.root.querySelector<HTMLElement>("[data-schematic-document-tab-list]");
    if (!list) return;
    const listBounds = list.getBoundingClientRect();
    if (event.clientY < listBounds.top || event.clientY > listBounds.bottom) {
      this.clearDropIndicator();
      return;
    }
    const tabs = Array.from(list.querySelectorAll<HTMLElement>("[data-schematic-document-tab-item]"));
    const nextTab = tabs.find((tab) => {
      const bounds = tab.getBoundingClientRect();
      return event.clientX < bounds.left + bounds.width / 2;
    });
    if (nextTab) this.setDropIndicator(nextTab, "before");
    else this.setDropIndicator(tabs[tabs.length - 1] ?? null, "after");
  }

  private handlePointerUp(event: PointerEvent) {
    const pending = this.pendingDrag;
    if (!pending || pending.pointerId !== event.pointerId) return;
    const id = this.draggedTabId;
    const indicator = this.dropIndicator;
    pending.handle.releasePointerCapture?.(event.pointerId);
    this.pendingDrag = null;
    if (!id) return;
    event.preventDefault();
    this.suppressNextTabClick = id;
    this.runtime.setTimeout(() => {
      if (this.suppressNextTabClick === id) this.suppressNextTabClick = null;
    }, 0);
    const tabs = Array.from(
      this.root.querySelectorAll<HTMLElement>("[data-schematic-document-tab-item]")
    );
    const targetIndex = indicator ? tabs.indexOf(indicator.element) : -1;
    const insertionIndex = targetIndex < 0
      ? tabs.length
      : targetIndex + (indicator?.placement === "after" ? 1 : 0);
    this.finishDrag();
    if (indicator) void this.options.onReorder?.(id, insertionIndex);
  }

  private handlePointerCancel(event: PointerEvent) {
    const pending = this.pendingDrag;
    if (!pending || pending.pointerId !== event.pointerId) return;
    pending.handle.releasePointerCapture?.(event.pointerId);
    this.pendingDrag = null;
    this.finishDrag();
  }

  private setDropIndicator(element: HTMLElement | null, placement: "before" | "after") {
    if (this.dropIndicator?.element === element && this.dropIndicator.placement === placement) return;
    this.clearDropIndicator();
    if (!element) return;
    element.classList.toggle(placement === "before" ? "is-drop-before" : "is-drop-after", true);
    this.dropIndicator = { element, placement };
  }

  private clearDropIndicator() {
    const indicator = this.dropIndicator;
    if (!indicator) return;
    indicator.element.classList.toggle("is-drop-before", false);
    indicator.element.classList.toggle("is-drop-after", false);
    this.dropIndicator = null;
  }

  private finishDrag() {
    this.clearDropIndicator();
    if (this.draggedTabId) {
      const wrapper = this.findTabWrapperById(this.draggedTabId);
      wrapper?.classList.toggle("is-dragging", false);
    }
    this.draggedTabId = null;
    this.pendingDrag = null;
  }

  private handleChange(event: Event) {
    const input = (event.target as HTMLElement | null)?.closest<HTMLInputElement>(
      "[data-schematic-document-import-input]"
    );
    if (!input) return;
    const file = input.files?.item(0);
    input.value = "";
    if (file) this.options.onImport?.(file);
  }

  private handleFocusOut(event: FocusEvent) {
    const input = (event.target as HTMLElement | null)?.closest<HTMLInputElement>("[data-schematic-document-rename]");
    if (input && input === this.renameInput) this.finishRename(input, true, false);
  }

  private handleKeyDown(event: KeyboardEvent) {
    const rename = (event.target as HTMLElement | null)?.closest<HTMLInputElement>(
      "[data-schematic-document-rename]"
    );
    if (rename) {
      if (event.key === "Enter") {
        event.preventDefault();
        this.finishRename(rename, true, true);
      } else if (event.key === "Escape") {
        event.preventDefault();
        this.finishRename(rename, false, true);
      }
      return;
    }

    const target = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>("[data-schematic-document-tab]");
    if (!target) return;
    if (event.key === "F2") {
      event.preventDefault();
      this.startRename(target);
      return;
    }
    const tabs = Array.from(this.root.querySelectorAll<HTMLButtonElement>("[data-schematic-document-tab]"));
    const index = tabs.indexOf(target);
    if (index < 0) return;

    let nextIndex: number | null = null;
    if (event.key === "ArrowLeft") nextIndex = (index - 1 + tabs.length) % tabs.length;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = tabs.length - 1;
    if (nextIndex === null) return;

    event.preventDefault();
    const next = tabs[nextIndex];
    const id = next?.dataset.schematicDocumentTab;
    if (id) void this.options.onActivate(id);
    this.scheduleFrame(() => {
      if (id) this.findTabById(id)?.focus();
    });
  }

  private startRename(tab: HTMLButtonElement) {
    const id = tab.dataset.schematicDocumentTab;
    if (!id) return;
    if (this.renameInput) this.finishRename(this.renameInput, true, false);

    const title = tab.textContent ?? "";
    const input = this.root.ownerDocument.createElement("input");
    input.type = "text";
    input.className = "schematic-document-tab-rename";
    input.dataset.schematicDocumentRename = id;
    input.dataset.schematicDocumentOriginalTitle = title;
    input.value = title;
    input.setAttribute("aria-label", `Rename ${title}`);
    input.setAttribute("autocomplete", "off");
    input.setAttribute("spellcheck", "false");
    input.setAttribute("maxlength", String(MAX_SCHEMATIC_TAB_TITLE_LENGTH));
    tab.replaceWith(input);
    this.renameInput = input;
    this.scheduleFrame(() => {
      input.focus();
      input.select();
    });
  }

  private finishRename(input: HTMLInputElement, commit: boolean, restoreFocus: boolean) {
    if (input !== this.renameInput) return;
    const id = input.dataset.schematicDocumentRename;
    const originalTitle = input.dataset.schematicDocumentOriginalTitle ?? "";
    const nextTitle = commit ? input.value.trim() : "";
    const title = nextTitle || originalTitle;
    const wrapper = input.closest<HTMLElement>("[data-schematic-document-tab-item]");
    const active = wrapper?.classList.contains("is-active") ?? false;
    const label = id ? this.createTabLabel(id, title, active) : null;
    const close = wrapper?.querySelector<HTMLButtonElement>("[data-schematic-document-close]");

    this.renameInput = null;
    if (label) input.replaceWith(label);
    if (close) {
      close.setAttribute("aria-label", `Close ${title}`);
      close.title = `Close ${title}`;
    }
    if (commit && id && nextTitle && nextTitle !== originalTitle) {
      void this.options.onRename?.(id, nextTitle);
    }
    if (restoreFocus && id) {
      this.scheduleFrame(() => this.findTabById(id)?.focus());
    }
  }

  private findTabById(id: string) {
    return Array.from(this.root.querySelectorAll<HTMLButtonElement>("[data-schematic-document-tab]"))
      .find((tab) => tab.dataset.schematicDocumentTab === id);
  }

  private findTabWrapperById(id: string) {
    return Array.from(this.root.querySelectorAll<HTMLElement>("[data-schematic-document-tab-item]"))
      .find((tab) => tab.dataset.schematicDocumentTabItem === id);
  }

  private tabIdFromTarget(target: EventTarget | null) {
    const wrapper = (target as HTMLElement | null)?.closest<HTMLElement>(
      "[data-schematic-document-tab-item]"
    );
    return wrapper?.dataset.schematicDocumentTabItem ?? null;
  }

  private scheduleFrame(callback: () => void) {
    const requestFrame = this.root.ownerDocument.defaultView?.requestAnimationFrame;
    if (requestFrame) requestFrame.call(this.root.ownerDocument.defaultView, callback);
    else callback();
  }

  private clearCloseSnackbarTimer() {
    if (this.closeSnackbarTimer === null) return;
    this.runtime.clearTimeout(this.closeSnackbarTimer);
    this.closeSnackbarTimer = null;
  }
}
