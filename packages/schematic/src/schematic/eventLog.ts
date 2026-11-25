import { t } from "./schematicI18n";
import { localizeSchematicStatus } from "./schematicUiText";

export type LogLevel = "info" | "warn" | "error";

export interface LogEntry {
  time: Date;
  level: LogLevel;
  source: string;
  message: string;
}

const MAX_ENTRIES = 500;
const MIN_HEIGHT = 180;
const MAX_HEIGHT = 400;
const DEFAULT_HEIGHT = 230;

interface EventLogOptions {
  initialHeight?: number;
  onHeightChange?: (height: number) => void;
}

export class SchematicEventLog {
  private entries: LogEntry[] = [];
  private levelFilter: LogLevel | "all" = "all";
  private search = "";
  private drawer: HTMLElement | null = null;
  private list: HTMLElement | null = null;
  private levelSelect: HTMLSelectElement | null = null;
  private searchInput: HTMLInputElement | null = null;
  private resizer: HTMLElement | null = null;
  private height: number;
  private drag: { startY: number; startHeight: number } | null = null;
  private readonly lifecycle = new AbortController();
  private mounted = false;
  private openState = false;

  constructor(
    private readonly root: HTMLElement,
    private readonly options: EventLogOptions = {}
  ) {
    this.height = clampHeight(options.initialHeight ?? DEFAULT_HEIGHT);
  }

  mount() {
    if (this.mounted) return;
    this.mounted = true;
    this.drawer = this.root.querySelector<HTMLElement>("[data-schematic-log]");
    this.list = this.root.querySelector<HTMLElement>("[data-log-list]");
    this.levelSelect = this.root.querySelector<HTMLSelectElement>("[data-log-level]");
    this.searchInput = this.root.querySelector<HTMLInputElement>("[data-log-search]");
    this.resizer = this.root.querySelector<HTMLElement>("[data-log-resizer]");
    this.applyHeight();
    const { signal } = this.lifecycle;
    this.resizer?.addEventListener("pointerdown", (event) => this.beginResize(event), { signal });
    this.resizer?.addEventListener("keydown", (event) => this.handleResizeKey(event), { signal });
    this.root.ownerDocument.addEventListener("pointermove", (event) => this.resizeTo(event), { signal });
    this.root.ownerDocument.addEventListener("pointerup", () => this.finishResize(), { signal });
    this.root.ownerDocument.addEventListener("pointercancel", () => this.finishResize(), { signal });
    this.root.querySelectorAll<HTMLElement>("[data-log-toggle]").forEach((button) => {
      button.addEventListener("click", () => this.toggle(), { signal });
    });
    this.root.querySelector<HTMLElement>("[data-log-close]")?.addEventListener("click", () => this.close(), { signal });
    this.root.querySelector<HTMLElement>("[data-log-clear]")?.addEventListener("click", () => this.clear(), { signal });
    this.root.querySelector<HTMLElement>("[data-log-copy]")?.addEventListener("click", () => void this.copy(), { signal });
    this.levelSelect?.addEventListener("change", () => {
      const value = this.levelSelect?.value;
      this.levelFilter = value === "info" || value === "warn" || value === "error" ? value : "all";
      this.render();
    }, { signal });
    this.searchInput?.addEventListener("input", () => {
      this.search = this.searchInput?.value ?? "";
      this.render();
    }, { signal });
    this.drawer?.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        this.close();
      }
    }, { signal });
    this.render();
  }

  destroy() {
    this.lifecycle.abort();
    this.mounted = false;
  }

  isOpen() {
    return this.openState;
  }

  refreshLanguage() {
    if (this.openState) this.render();
  }

  info(source: string, message: string) {
    this.log("info", source, message);
  }

  warn(source: string, message: string) {
    this.log("warn", source, message);
  }

  error(source: string, message: string) {
    this.log("error", source, message);
  }

  log(level: LogLevel, source: string, message: string) {
    const text = message.trim();
    if (!text) return;
    this.entries.push({ time: new Date(), level, source, message: text });
    if (this.entries.length > MAX_ENTRIES) this.entries.splice(0, this.entries.length - MAX_ENTRIES);
    if (this.openState) this.render();
  }

  open() {
    if (!this.drawer) return;
    this.openState = true;
    this.drawer.hidden = false;
    this.root.querySelectorAll<HTMLElement>("[data-log-toggle]").forEach((button) => {
      button.setAttribute("aria-expanded", "true");
    });
    this.render();
    this.scrollToEnd();
  }

  close() {
    if (!this.drawer) return;
    this.openState = false;
    this.drawer.hidden = true;
    this.root.querySelectorAll<HTMLElement>("[data-log-toggle]").forEach((button) => {
      button.setAttribute("aria-expanded", "false");
    });
  }

  toggle() {
    if (this.openState) this.close();
    else this.open();
  }

  clear() {
    this.entries = [];
    this.render();
  }

  private beginResize(event: PointerEvent) {
    if (event.button !== 0) return;
    event.preventDefault();
    this.drag = { startY: event.clientY, startHeight: this.height };
    this.resizer?.setPointerCapture?.(event.pointerId);
    this.root.classList.add("is-log-resizing");
  }

  private resizeTo(event: PointerEvent) {
    if (!this.drag) return;
    event.preventDefault();
    this.setHeight(this.drag.startHeight + (this.drag.startY - event.clientY), false);
  }

  private finishResize() {
    if (!this.drag) return;
    this.drag = null;
    this.root.classList.remove("is-log-resizing");
    this.options.onHeightChange?.(this.height);
  }

  private handleResizeKey(event: KeyboardEvent) {
    const step = event.shiftKey ? 40 : 20;
    if (event.key === "ArrowUp") {
      event.preventDefault();
      this.setHeight(this.height + step, true);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      this.setHeight(this.height - step, true);
    } else if (event.key === "Home") {
      event.preventDefault();
      this.setHeight(MAX_HEIGHT, true);
    } else if (event.key === "End") {
      event.preventDefault();
      this.setHeight(MIN_HEIGHT, true);
    }
  }

  private setHeight(height: number, persist: boolean) {
    this.height = clampHeight(height);
    this.applyHeight();
    if (persist) this.options.onHeightChange?.(this.height);
  }

  private applyHeight() {
    if (!this.drawer) return;
    this.drawer.style.height = `${this.height}px`;
    if (this.resizer) this.resizer.setAttribute("aria-valuenow", String(this.height));
  }

  private render() {
    const list = this.list;
    if (!list) return;
    const doc = list.ownerDocument;
    const query = this.search.trim().toLowerCase();
    const visible = this.entries
      .filter(entry => this.levelFilter === "all" || entry.level === this.levelFilter)
      .map(entry => ({ entry, ...localizeLogEntry(entry) }))
      .filter(({ entry, source, message }) =>
        !query || `${entry.source} ${entry.message} ${source} ${message}`.toLowerCase().includes(query)
      );
    list.replaceChildren();
    if (!visible.length) {
      const empty = doc.createElement("div");
      empty.className = "schematic-log-empty";
      empty.textContent = t("log.empty", "No events yet.");
      list.append(empty);
      return;
    }
    for (const { entry, level: levelText, source: sourceText, message: messageText } of visible) {
      const row = doc.createElement("div");
      row.className = "schematic-log-row";
      row.dataset.level = entry.level;
      const time = doc.createElement("span");
      time.className = "schematic-log-time";
      time.textContent = entry.time.toLocaleTimeString(undefined, { hour12: false });
      const level = doc.createElement("span");
      level.className = "schematic-log-level";
      level.textContent = levelText;
      const source = doc.createElement("span");
      source.className = "schematic-log-source";
      source.textContent = sourceText;
      const message = doc.createElement("span");
      message.className = "schematic-log-message";
      message.textContent = messageText;
      row.append(time, level, source, message);
      list.append(row);
    }
  }

  private scrollToEnd() {
    if (this.list) this.list.scrollTop = this.list.scrollHeight;
  }

  private async copy() {
    const text = this.entries
      .map(entry => {
        const { level, source, message } = localizeLogEntry(entry);
        return `${entry.time.toISOString()} ${level} [${source}] ${message}`;
      })
      .join("\n");
    const document = this.root.ownerDocument;
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-10000px";
    document.body.append(textarea);
    textarea.select();
    try {
      document.execCommand("copy");
    } finally {
      textarea.remove();
    }
  }
}

function localizeLogEntry(entry: LogEntry) {
  return {
    level: t(`log.${entry.level}`, entry.level.toUpperCase()),
    source: t(`log.source.${entry.source}`, entry.source),
    message: entry.source === "command"
      ? t(`toolbar.${entry.message}`, entry.message)
      : localizeSchematicStatus(entry.message)
  };
}

function clampHeight(value: number) {
  if (!Number.isFinite(value)) return DEFAULT_HEIGHT;
  return Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, Math.round(value)));
}
