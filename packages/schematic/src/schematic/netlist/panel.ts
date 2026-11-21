import type { SchematicDocument } from "../types";
import {
  buildStructuralNetlist,
  defaultDeviceConfig,
  DEVICE_KINDS,
  DEVICE_LABELS,
  printNetlist,
  processProfile,
  type DeviceKind,
  type NetlistDesign,
  type NetlistDiagnostic,
  type NetlistDeviceConfig,
  type NetlistFormat,
  type ProcessId
} from "./index";

interface NetlistPanelOptions {
  onSelect?: (componentId: string) => void;
}

interface HighlightToken {
  text: string;
  kind: "text" | "comment" | "directive" | "device" | "number" | "node" | "punct" | "value";
}

export class NetlistPanelController {
  private design: NetlistDesign | null = null;
  private schematic: SchematicDocument | null = null;
  private config: NetlistDeviceConfig = defaultDeviceConfig("sky130");
  private format: NetlistFormat = "spice";
  private readonly lifecycle = new AbortController();
  private mounted = false;
  private codeEl: HTMLElement | null = null;
  private statusEl: HTMLElement | null = null;
  private summaryEl: HTMLElement | null = null;
  private diagnosticsEl: HTMLElement | null = null;
  private processEl: HTMLSelectElement | null = null;
  private devicesEl: HTMLElement | null = null;
  private copyButton: HTMLButtonElement | null = null;
  private downloadButton: HTMLButtonElement | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly options: NetlistPanelOptions = {}
  ) {}

  mount() {
    if (this.mounted) return;
    this.mounted = true;
    this.codeEl = this.root.querySelector<HTMLElement>("[data-netlist-code]");
    this.statusEl = this.root.querySelector<HTMLElement>("[data-netlist-status]");
    this.summaryEl = this.root.querySelector<HTMLElement>("[data-netlist-diagnostics-summary]");
    this.diagnosticsEl = this.root.querySelector<HTMLElement>("[data-netlist-diagnostics-list]");
    this.processEl = this.root.querySelector<HTMLSelectElement>("[data-netlist-process]");
    this.devicesEl = this.root.querySelector<HTMLElement>("[data-netlist-devices]");
    this.copyButton = this.root.querySelector<HTMLButtonElement>("[data-netlist-copy]");
    this.downloadButton = this.root.querySelector<HTMLButtonElement>("[data-netlist-download]");
    const { signal } = this.lifecycle;
    this.root.querySelectorAll<HTMLElement>("[data-netlist-format]").forEach((button) => {
      button.addEventListener("click", () => this.setFormat(button.dataset.netlistFormat === "spectre" ? "spectre" : "spice"), { signal });
    });
    this.processEl?.addEventListener("change", () => {
      this.config = defaultDeviceConfig(this.processEl?.value as ProcessId);
      this.renderConfig();
      this.rebuild();
    }, { signal });
    this.devicesEl?.addEventListener("change", (event) => {
      const control = (event.target as HTMLElement | null)?.closest<HTMLInputElement | HTMLSelectElement>("[data-netlist-device]");
      const kind = control?.dataset.netlistDevice as DeviceKind | undefined;
      if (!control || !kind) return;
      this.config = {
        ...this.config,
        devices: { ...this.config.devices, [kind]: control.value.trim() }
      };
      this.rebuild();
    }, { signal });
    this.copyButton?.addEventListener("click", () => this.copy(), { signal });
    this.downloadButton?.addEventListener("click", () => this.download(), { signal });
    this.diagnosticsEl?.addEventListener("click", (event) => {
      const target = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-netlist-diagnostic-component]");
      const componentId = target?.dataset.netlistDiagnosticComponent;
      if (componentId) this.options.onSelect?.(componentId);
    }, { signal });
    this.renderConfig();
    this.render();
  }

  destroy() {
    this.lifecycle.abort();
    this.mounted = false;
  }

  refresh(schematic: SchematicDocument) {
    this.schematic = schematic;
    this.rebuild();
  }

  private rebuild() {
    this.design = this.schematic
      ? buildStructuralNetlist(this.schematic, { config: this.config })
      : null;
    this.render();
  }

  private setFormat(format: NetlistFormat) {
    if (this.format === format) return;
    this.format = format;
    this.root.querySelectorAll<HTMLElement>("[data-netlist-format]").forEach((button) => {
      const active = button.dataset.netlistFormat === format;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    this.renderCode();
  }

  private renderConfig() {
    if (this.processEl) this.processEl.value = this.config.process;
    const grid = this.devicesEl;
    if (!grid) return;
    const document = grid.ownerDocument;
    grid.replaceChildren();
    DEVICE_KINDS.forEach((kind) => {
      const row = document.createElement("label");
      row.className = "netlist-device-row";
      const label = document.createElement("span");
      label.textContent = DEVICE_LABELS[kind];
      row.append(label);
      if (this.config.process === "custom") {
        const input = document.createElement("input");
        input.type = "text";
        input.spellcheck = false;
        input.autocomplete = "off";
        input.dataset.netlistDevice = kind;
        input.value = this.config.devices[kind];
        input.placeholder = DEVICE_LABELS[kind];
        input.title = input.value;
        input.addEventListener("input", () => { input.title = input.value; });
        const list = document.createElement("datalist");
        list.id = `at-netlist-${kind}-options`;
        processProfile("custom").options[kind].forEach((option) => {
          const item = document.createElement("option");
          item.value = option;
          list.append(item);
        });
        input.setAttribute("list", list.id);
        row.append(input, list);
      } else {
        const select = document.createElement("select");
        select.dataset.netlistDevice = kind;
        const options = processProfile(this.config.process).options[kind];
        const values = options.includes(this.config.devices[kind])
          ? options
          : [this.config.devices[kind], ...options];
        values.forEach((option) => {
          const item = document.createElement("option");
          item.value = option;
          item.textContent = option;
          select.append(item);
        });
        select.value = this.config.devices[kind];
        select.title = select.value;
        select.addEventListener("change", () => { select.title = select.value; });
        row.append(select);
      }
      grid.append(row);
    });
  }

  private render() {
    const design = this.design;
    const errors = design?.diagnostics.filter(item => item.severity === "error").length ?? 0;
    const warnings = design?.diagnostics.filter(item => item.severity === "warning").length ?? 0;
    if (this.statusEl) {
      this.statusEl.textContent = !design
        ? "Netlist is not ready."
        : errors > 0
          ? `Generated · ${errors} error${errors === 1 ? "" : "s"}`
          : warnings > 0
            ? `Ready · ${warnings} warning${warnings === 1 ? "" : "s"}`
            : `Ready · ${design.instances.length} instance${design.instances.length === 1 ? "" : "s"}`;
      this.statusEl.dataset.state = !design ? "blocked" : errors > 0 ? "error" : warnings > 0 ? "warning" : "ready";
    }
    if (this.copyButton) this.copyButton.disabled = !design;
    if (this.downloadButton) this.downloadButton.disabled = !design;
    this.renderCode();
    this.renderDiagnostics();
  }

  private renderCode() {
    const code = this.codeEl;
    if (!code) return;
    const document = code.ownerDocument;
    code.replaceChildren();
    if (!this.design) {
      code.textContent = "Waiting for a schematic.";
      return;
    }
    const text = printNetlist(this.design, this.format);
    const lines = text.replace(/\n$/, "").split("\n");
    lines.forEach((line, index) => {
      const row = document.createElement("span");
      row.className = "netlist-line";
      const number = document.createElement("span");
      number.className = "netlist-line-number";
      number.textContent = String(index + 1);
      const content = document.createElement("span");
      content.className = "netlist-line-text";
      tokenizeLine(line, this.format).forEach((token) => {
        const span = document.createElement("span");
        span.className = `netlist-token netlist-token-${token.kind}`;
        span.textContent = token.text;
        content.append(span);
      });
      row.append(number, content);
      code.append(row);
    });
  }

  private renderDiagnostics() {
    const summary = this.summaryEl;
    const list = this.diagnosticsEl;
    if (!summary || !list) return;
    const diagnostics = this.design?.diagnostics ?? [];
    const errors = diagnostics.filter(item => item.severity === "error").length;
    const warnings = diagnostics.filter(item => item.severity === "warning").length;
    summary.textContent = diagnostics.length
      ? `Diagnostics · ${errors} error${errors === 1 ? "" : "s"} · ${warnings} warning${warnings === 1 ? "" : "s"}`
      : "Diagnostics · none";
    summary.dataset.state = errors > 0 ? "error" : warnings > 0 ? "warning" : "ready";
    const document = list.ownerDocument;
    list.replaceChildren();
    diagnostics.forEach((diagnostic) => {
      list.append(this.diagnosticRow(document, diagnostic));
    });
  }

  private diagnosticRow(document: Document, diagnostic: NetlistDiagnostic) {
    const row = document.createElement(diagnostic.componentId ? "button" : "div");
    row.className = "netlist-diagnostic";
    row.dataset.severity = diagnostic.severity;
    if (diagnostic.componentId) {
      (row as HTMLButtonElement).type = "button";
      row.dataset.netlistDiagnosticComponent = diagnostic.componentId;
    }
    const head = document.createElement("span");
    head.className = "netlist-diagnostic-head";
    const severity = document.createElement("span");
    severity.className = "netlist-diagnostic-severity";
    severity.textContent = diagnostic.severity.toUpperCase();
    const code = document.createElement("span");
    code.className = "netlist-diagnostic-code";
    code.textContent = diagnostic.code;
    head.append(severity, code);
    const message = document.createElement("span");
    message.className = "netlist-diagnostic-message";
    message.textContent = diagnostic.message;
    row.append(head, message);
    return row;
  }

  private copy() {
    if (!this.design) return;
    const document = this.root.ownerDocument;
    const textarea = document.createElement("textarea");
    textarea.value = printNetlist(this.design, this.format);
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

  private download() {
    if (!this.design) return;
    const document = this.root.ownerDocument;
    const text = printNetlist(this.design, this.format);
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = this.format === "spice" ? "schematic.sp" : "schematic.scs";
    anchor.hidden = true;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    document.defaultView?.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

function tokenizeLine(line: string, format: NetlistFormat): HighlightToken[] {
  const commentPrefix = format === "spice" ? "*" : "//";
  if (line.trimStart().startsWith(commentPrefix)) return [{ text: line, kind: "comment" }];
  const tokens = line.split(/(\s+|[(){}]|,|=)/g).filter(token => token.length > 0);
  let firstWord = true;
  let afterEquals = false;
  return tokens.map((token) => {
    if (/^\s+$/.test(token)) return { text: token, kind: "text" };
    if (/^[(){}]$/.test(token) || token === "," || token === "=") {
      afterEquals = token === "=";
      return { text: token, kind: "punct" };
    }
    if (token.startsWith(".") || /^(?:subckt|ends|parameters|simulator|lang)$/.test(token)) {
      return { text: token, kind: "directive" };
    }
    if (firstWord) {
      firstWord = false;
      return { text: token, kind: "device" };
    }
    if (afterEquals) {
      afterEquals = false;
      return { text: token, kind: isNumber(token) ? "number" : "value" };
    }
    return { text: token, kind: isNumber(token) ? "number" : "node" };
  });
}

function isNumber(value: string) {
  return /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?[a-zA-Z]*$/.test(value);
}
