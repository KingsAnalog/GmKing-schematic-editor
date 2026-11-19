import { t } from "./schematicI18n";

export type LogLevel = "info" | "warn" | "error";

export interface LogEntry {
  time: Date;
  level: LogLevel;
  source: string;
  message: string;
}

const MAX_ENTRIES = 500;

export class SchematicEventLog {
  private entries: LogEntry[] = [];
  private levelFilter: LogLevel | "all" = "all";
  private search = "";
  private drawer: HTMLElement | null = null;
  private list: HTMLElement | null = null;
  private levelSelect: HTMLSelectElement | null = null;
  private searchInput: HTMLInputElement | null = null;
  private readonly lifecycle = new AbortController();
  private mounted = false;
  private openState = false;

  constructor(private readonly root: HTMLElement) {}

  mount() {
    if (this.mounted) return;
    this.mounted = true;
    this.drawer = this.root.querySelector<HTMLElement>("[data-schematic-log]");
    this.list = this.root.querySelector<HTMLElement>("[data-log-list]");
    this.levelSelect = this.root.querySelector<HTMLSelectElement>("[data-log-level]");
    this.searchInput = this.root.querySelector<HTMLInputElement>("[data-log-search]");
    const { signal } = this.lifecycle;
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

  private render() {
    const list = this.list;
    if (!list) return;
    const doc = list.ownerDocument;
    const query = this.search.trim().toLowerCase();
    const visible = this.entries.filter(entry =>
      (this.levelFilter === "all" || entry.level === this.levelFilter)
      && (!query || `${entry.source} ${entry.message}`.toLowerCase().includes(query))
    );
    list.replaceChildren();
    if (!visible.length) {
      const empty = doc.createElement("div");
      empty.className = "schematic-log-empty";
      empty.textContent = t("log.empty", "No events yet.");
      list.append(empty);
      return;
    }
    for (const entry of visible) {
      const row = doc.createElement("div");
      row.className = "schematic-log-row";
      row.dataset.level = entry.level;
      const time = doc.createElement("span");
      time.className = "schematic-log-time";
      time.textContent = entry.time.toLocaleTimeString(undefined, { hour12: false });
      const level = doc.createElement("span");
      level.className = "schematic-log-level";
      level.textContent = entry.level.toUpperCase();
      const source = doc.createElement("span");
      source.className = "schematic-log-source";
      source.textContent = entry.source;
      const message = doc.createElement("span");
      message.className = "schematic-log-message";
      message.textContent = entry.message;
      row.append(time, level, source, message);
      list.append(row);
    }
  }

  private scrollToEnd() {
    if (this.list) this.list.scrollTop = this.list.scrollHeight;
  }

  private async copy() {
    const text = this.entries
      .map(entry => `${entry.time.toISOString()} ${entry.level.toUpperCase()} [${entry.source}] ${entry.message}`)
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
