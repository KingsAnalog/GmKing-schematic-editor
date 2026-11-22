import { typesetMath } from "../../shared/mathjax";
import { t } from "../schematicI18n";
import { localizeAnalysisDiagnostic } from "../schematicUiText";
import type { AnalysisPortSelection, AnalysisResult } from "../types";

const COMPUTE_BUTTON_TEXT = "Compute H(s), ZIN(s), Zout(s)";
const ANALYSIS_OUTPUT_SELECTOR = "[data-analysis-transfer], [data-analysis-zin], [data-analysis-zout]";
const ANALYSIS_PORT_FIELDS = ["inputP", "inputN", "outputP", "outputN"] as const;

type AnalysisPortField = keyof AnalysisPortSelection;

type AnalysisOutputTargets = {
  transfer: HTMLElement;
  zin: HTMLElement;
  zout: HTMLElement;
};

export function setAnalysisBusy(root: HTMLElement, busy: boolean): void {
  const button = root.querySelector<HTMLButtonElement>("[data-analysis='compute']");
  if (button) {
    button.disabled = busy;
    renderComputeButton(button, busy);
  }

  const progress = root.querySelector<HTMLElement>("[data-analysis-progress]");
  if (progress) {
    progress.hidden = !busy;
    progress.setAttribute("aria-busy", String(busy));
  }
}

function renderComputeButton(button: HTMLButtonElement, busy: boolean) {
  button.setAttribute("aria-label", t("analysis.computeLabel", COMPUTE_BUTTON_TEXT));
  if (busy) {
    button.textContent = t("analysis.computing", "Computing...");
    return;
  }
  const document = button.ownerDocument;
  const inputSubscript = document.createElement("sub");
  inputSubscript.textContent = "IN";
  const outputSubscript = document.createElement("sub");
  outputSubscript.textContent = "out";
  button.replaceChildren(
    document.createTextNode(t("ui.computeFormula", "Compute H(s), Z")),
    inputSubscript,
    document.createTextNode(t("ui.formulaSeparator", "(s), Z")),
    outputSubscript,
    document.createTextNode("(s)")
  );
}

export function renderAnalysisDiagnostics(root: HTMLElement, diagnostics: readonly string[]): void {
  const target = root.querySelector<HTMLElement>("[data-analysis-diagnostics]");
  if (!target) return;

  const messages = diagnostics.length ? diagnostics : [t("analysis.noDiagnostics", "No netlist diagnostics.")];
  const paragraphs = messages.map((diagnostic) => {
    const paragraph = target.ownerDocument.createElement("p");
    paragraph.textContent = diagnostic === "Solving symbolic MNA equations..."
      ? t("analysis.solving", diagnostic) : localizeAnalysisDiagnostic(diagnostic);
    return paragraph;
  });
  target.replaceChildren(...paragraphs);
}

export function renderAnalysisResultOutput(root: HTMLElement, result: AnalysisResult): void {
  const targets = findAnalysisOutputTargets(root);
  if (!targets) return;

  if (!result.ok) {
    clearAnalysisOutputs(root);
    return;
  }

  const elements = [targets.transfer, targets.zin, targets.zout];
  targets.transfer.textContent = `\\[H(s)=${result.transferTex}\\]`;
  targets.zin.textContent = `\\[Z_{in}(s)=${result.inputImpedanceTex}\\]`;
  targets.zout.textContent = `\\[Z_{out}(s)=${result.outputImpedanceTex}\\]`;
  typesetMath(elements);
}

export function clearAnalysisOutputs(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>(ANALYSIS_OUTPUT_SELECTOR).forEach((output) => {
    output.textContent = "";
  });
}

export function readAnalysisPortSelection(root: HTMLElement): AnalysisPortSelection {
  return {
    inputP: readAnalysisPortValue(root, "inputP"),
    inputN: readAnalysisPortValue(root, "inputN"),
    outputP: readAnalysisPortValue(root, "outputP"),
    outputN: readAnalysisPortValue(root, "outputN")
  };
}

export function renderAnalysisPortOptions(root: HTMLElement, nets: Iterable<string>, selection: AnalysisPortSelection) {
  const netList = Array.from(nets);
  const selectableNets = new Set(netList);
  root.querySelectorAll<HTMLSelectElement>("[data-net-select]").forEach((select) => {
    const field = parseAnalysisPortField(select.dataset.netSelect);
    const optionValues = ["", ...netList];
    if (!analysisPortOptionsMatch(select, optionValues)) {
      const options = [
        createAnalysisPortOption(select.ownerDocument, "", t("analysis.selectNet", "Select net")),
        ...netList.map((net) => createAnalysisPortOption(select.ownerDocument, net, net))
      ];
      select.replaceChildren(...options);
    }
    const placeholder = select.children[0];
    if (placeholder) placeholder.textContent = t("analysis.selectNet", "Select net");
    const selectedValue = field ? selection[field] : "";
    select.value = selectedValue && selectableNets.has(selectedValue) ? selectedValue : "";
  });
}

function analysisPortOptionsMatch(select: HTMLSelectElement, values: readonly string[]) {
  const options = Array.from(select.children) as HTMLOptionElement[];
  return options.length === values.length && options.every((option, index) => option.value === values[index]);
}

export function trySetAnalysisPortValue(root: HTMLElement, field: AnalysisPortField, value: string) {
  const select = selectForAnalysisPort(root, field);
  if (!select) return false;
  select.value = value;
  return true;
}

export function setActiveAnalysisPortPick(root: HTMLElement, field: AnalysisPortField | null) {
  root.querySelectorAll<HTMLElement>("[data-pick-net], [data-net-select]").forEach((element) => {
    const candidate = element.dataset.pickNet ?? element.dataset.netSelect;
    element.classList.toggle("is-picking", !!field && candidate === field);
  });
}

function findAnalysisOutputTargets(root: HTMLElement): AnalysisOutputTargets | null {
  const transfer = root.querySelector<HTMLElement>("[data-analysis-transfer]");
  const zin = root.querySelector<HTMLElement>("[data-analysis-zin]");
  const zout = root.querySelector<HTMLElement>("[data-analysis-zout]");
  if (!transfer || !zin || !zout) return null;
  return { transfer, zin, zout };
}

function readAnalysisPortValue(root: HTMLElement, field: AnalysisPortField) {
  return selectForAnalysisPort(root, field)?.value ?? "";
}

function selectForAnalysisPort(root: HTMLElement, field: AnalysisPortField) {
  return root.querySelector<HTMLSelectElement>(`[data-net-select="${field}"]`);
}

function createAnalysisPortOption(document: Document, value: string, label: string) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  return option;
}

function parseAnalysisPortField(value: string | undefined): AnalysisPortField | null {
  return ANALYSIS_PORT_FIELDS.includes(value as AnalysisPortField) ? (value as AnalysisPortField) : null;
}
