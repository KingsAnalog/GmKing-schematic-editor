import type { SchematicDocument } from "../types";
import {
  buildStructuralNetlist,
  hasNetlistErrors,
  printNetlist,
  type NetlistDesign,
  type NetlistDiagnostic,
  type NetlistFormat
} from "./index";

interface NetlistPanelOptions {
  onSelect?: (componentId: string) => void;
}

export class NetlistPanelController {
  private design: NetlistDesign | null = null;
  private format: NetlistFormat = "spice";
  private readonly lifecycle = new AbortController();
  private mounted = false;
  private codeEl: HTMLElement | null = null;
  private statusEl: HTMLElement | null = null;
  private summaryEl: HTMLElement | null = null;
  private diagnosticsEl: HTMLElement | null = null;
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
    this.copyButton = this.root.querySelector<HTMLButtonElement>("[data-netlist-copy]");
    this.downloadButton = this.root.querySelector<HTMLButtonElement>("[data-netlist-download]");
    const { signal } = this.lifecycle;
    this.root.querySelectorAll<HTMLElement>("[data-netlist-format]").forEach((button) => {
      button.addEventListener("click", () => this.setFormat(button.dataset.netlistFormat === "spectre" ? "spectre" : "spice"), { signal });
    });
    this.copyButton?.addEventListener("click", () => this.copy(), { signal });
    this.downloadButton?.addEventListener("click", () => this.download(), { signal });
    this.diagnosticsEl?.addEventListener("click", (event) => {
      const target = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-netlist-diagnostic-component]");
      const componentId = target?.dataset.netlistDiagnosticComponent;
      if (componentId) this.options.onSelect?.(componentId);
    }, { signal });
    this.render();
  }

  destroy() {
    this.lifecycle.abort();
    this.mounted = false;
  }

  refresh(schematic: SchematicDocument) {
    this.design = buildStructuralNetlist(schematic, { process: "sky130" });
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

  private render() {
    const design = this.design;
    const errors = design?.diagnostics.filter(item => item.severity === "error").length ?? 0;
    const warnings = design?.diagnostics.filter(item => item.severity === "warning").length ?? 0;
    const blocked = !design || errors > 0;
    if (this.statusEl) {
      this.statusEl.textContent = !design
        ? "Netlist is not ready."
        : errors > 0
          ? `Blocked · ${errors} error${errors === 1 ? "" : "s"}`
          : warnings > 0
            ? `Ready · ${warnings} warning${warnings === 1 ? "" : "s"}`
            : `Ready · ${design.instances.length} instance${design.instances.length === 1 ? "" : "s"}`;
      this.statusEl.dataset.state = blocked ? "blocked" : warnings > 0 ? "warning" : "ready";
    }
    if (this.copyButton) this.copyButton.disabled = blocked;
    if (this.downloadButton) this.downloadButton.disabled = blocked;
    this.renderCode();
    this.renderDiagnostics();
  }

  private renderCode() {
    const code = this.codeEl;
    if (!code) return;
    const document = code.ownerDocument;
    code.replaceChildren();
    if (!this.design || hasNetlistErrors(this.design)) {
      code.textContent = this.design
        ? "Netlist is blocked by errors. See Diagnostics."
        : "Waiting for a schematic.";
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
      content.textContent = line;
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
      ? `${errors} error${errors === 1 ? "" : "s"} · ${warnings} warning${warnings === 1 ? "" : "s"}`
      : "No diagnostics.";
    summary.dataset.state = errors > 0 ? "blocked" : warnings > 0 ? "warning" : "ready";
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
    if (!this.design || hasNetlistErrors(this.design)) return;
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
    if (!this.design || hasNetlistErrors(this.design)) return;
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
