import { cloneSchematicDocument } from "../document/documentModel";
import { extractNetlist } from "../netlist";
import {
  analysisPortLabel,
  nearestVoltageNet,
  normalizeAnalysisPortSelection,
  sortAnalysisNets,
  type VoltageNetPick
} from "./analysisNetSelectionModel";
import {
  clearAnalysisOutputs,
  readAnalysisPortSelection,
  renderAnalysisDiagnostics,
  renderAnalysisPortOptions,
  renderAnalysisResultOutput,
  setAnalysisBusy,
  setActiveAnalysisPortPick,
  trySetAnalysisPortValue
} from "./analysisPanelView";
import {
  SchematicAnalysisWorkerClient,
  type SchematicAnalysisWorkerPayload
} from "./analysisWorkerClient";
import type { AnalysisPortSelection, AnalysisResult, ExtractedNetlist, Point, SchematicDocument } from "../types";

const ANALYSIS_PORT_FIELDS = ["inputP", "inputN", "outputP", "outputN"] as const;

type AnalysisPortField = keyof AnalysisPortSelection;

export interface SchematicAnalysisClient {
  run(runId: number, payload: SchematicAnalysisWorkerPayload): Promise<AnalysisResult>;
  cancel?(): void;
}

export interface SchematicAnalysisControllerOptions {
  getDocument(): SchematicDocument;
  prepareNetPick(): void;
  focusCanvas(): void;
  setStatus(message: string): void;
  persistWorkspaceState(): void;
  workerClient?: SchematicAnalysisClient;
  findVoltageNetAtPoint?: (document: SchematicDocument, point: Point) => VoltageNetPick | null;
}

export class SchematicAnalysisController {
  private activeNetField: AnalysisPortField | null = null;
  private analysisRunId = 0;
  private readonly workerClient: SchematicAnalysisClient;
  private readonly findVoltageNetAtPoint: (document: SchematicDocument, point: Point) => VoltageNetPick | null;
  private bindingController: AbortController | null = null;
  private currentNetNames: string[] = [];

  constructor(
    private readonly root: HTMLElement,
    private readonly options: SchematicAnalysisControllerOptions
  ) {
    this.workerClient = options.workerClient ?? new SchematicAnalysisWorkerClient();
    this.findVoltageNetAtPoint = options.findVoltageNetAtPoint ?? nearestVoltageNet;
  }

  bind() {
    if (this.bindingController) return;
    const realm = this.root.ownerDocument.defaultView as (Window & typeof globalThis) | null;
    const AbortControllerCtor = realm?.AbortController ?? AbortController;
    this.bindingController = new AbortControllerCtor();
    const { signal } = this.bindingController;
    this.root.addEventListener("click", (event) => this.handleClick(event), { signal });
    this.root.addEventListener("change", (event) => this.handleChange(event), { signal });
    this.root.addEventListener("focusin", (event) => this.handleFocusIn(event), { signal });
  }

  destroy() {
    this.bindingController?.abort();
    this.bindingController = null;
    this.cancelPendingCompute();
  }

  beginPick(field: AnalysisPortField) {
    this.options.prepareNetPick();
    this.setActiveNetField(field);
    this.options.focusCanvas();
    this.options.setStatus(`Pick ${analysisPortLabel(field)} by clicking a wire or wire node on the schematic.`);
  }

  clearActivePick() {
    this.setActiveNetField(null);
  }

  hasActivePick() {
    return this.activeNetField !== null;
  }

  pickNet(point: Point) {
    if (!this.activeNetField) return false;
    const field = this.activeNetField;
    const picked = this.findVoltageNetAtPoint(this.options.getDocument(), point);
    if (!picked) {
      this.options.setStatus(`No wire node near click for ${analysisPortLabel(field)}. Voltage picks use wires, not component pins.`);
      return true;
    }
    if (trySetAnalysisPortValue(this.root, field, picked.net)) {
      this.options.setStatus(`${analysisPortLabel(field)} set to ${picked.net}.`);
      this.setActiveNetField(null);
      this.options.persistWorkspaceState();
    }
    return true;
  }

  refreshNetSelectors(
    netlist: ExtractedNetlist = extractNetlist(this.options.getDocument()),
    requestedSelection: AnalysisPortSelection = this.selection()
  ) {
    this.refreshNetSelectorsFromNames(netlist.nets.keys(), requestedSelection);
    this.renderDiagnostics(netlist.diagnostics);
  }

  refreshNetSelectorsFromNames(
    nets: Iterable<string>,
    requestedSelection: AnalysisPortSelection = this.selection()
  ) {
    this.currentNetNames = sortAnalysisNets(nets);
    const selection = normalizeAnalysisPortSelection(requestedSelection, this.currentNetNames);
    renderAnalysisPortOptions(this.root, this.currentNetNames, selection);
  }

  selection(): AnalysisPortSelection {
    return readAnalysisPortSelection(this.root);
  }

  setSelection(selection: AnalysisPortSelection) {
    const normalized = normalizeAnalysisPortSelection(selection, this.currentNetNames);
    (Object.keys(normalized) as AnalysisPortField[]).forEach((key) => {
      trySetAnalysisPortValue(this.root, key, normalized[key]);
    });
  }

  cancelPendingCompute() {
    this.analysisRunId += 1;
    this.workerClient.cancel?.();
    this.clearActivePick();
    this.setBusy(false);
    this.clearOutputs();
    this.renderDiagnostics([]);
  }

  async compute() {
    const runId = ++this.analysisRunId;
    this.setBusy(true);
    this.clearOutputs();
    this.renderDiagnostics(["Solving symbolic MNA equations..."]);

    try {
      const result = await this.workerClient.run(runId, {
        document: cloneSchematicDocument(this.options.getDocument()),
        selection: this.selection()
      });
      if (runId !== this.analysisRunId) return;
      this.renderResult(result);
    } catch (error) {
      if (runId !== this.analysisRunId) return;
      this.renderResult({
        ok: false,
        diagnostics: [error instanceof Error ? error.message : "Symbolic analysis failed."]
      });
    } finally {
      if (runId === this.analysisRunId) this.setBusy(false);
    }
  }

  private handleClick(event: Event) {
    const target = event.target as HTMLElement | null;
    const pickButton = target?.closest<HTMLButtonElement>("[data-pick-net]");
    if (pickButton) {
      const field = parseAnalysisPortField(pickButton.dataset.pickNet);
      if (field) this.beginPick(field);
      return;
    }

    const button = target?.closest<HTMLButtonElement>("[data-analysis]");
    if (button?.dataset.analysis === "compute") void this.compute();
  }

  private handleChange(event: Event) {
    const target = event.target as HTMLElement | null;
    const select = target?.closest<HTMLSelectElement>("[data-net-select]");
    if (select) this.options.persistWorkspaceState();
  }

  private handleFocusIn(event: Event) {
    const target = event.target as HTMLElement | null;
    const select = target?.closest<HTMLSelectElement>("[data-net-select]");
    const field = parseAnalysisPortField(select?.dataset.netSelect);
    if (field) {
      this.refreshNetSelectors();
      this.setActiveNetField(field);
    }
  }

  private setActiveNetField(field: AnalysisPortField | null) {
    this.activeNetField = field;
    setActiveAnalysisPortPick(this.root, field);
  }

  private renderResult(result: AnalysisResult) {
    this.renderDiagnostics(result.diagnostics);
    renderAnalysisResultOutput(this.root, result);
  }

  private clearOutputs() {
    clearAnalysisOutputs(this.root);
  }

  private setBusy(busy: boolean) {
    setAnalysisBusy(this.root, busy);
  }

  private renderDiagnostics(diagnostics: readonly string[]) {
    renderAnalysisDiagnostics(this.root, diagnostics);
  }
}

function parseAnalysisPortField(value: string | undefined): AnalysisPortField | null {
  return ANALYSIS_PORT_FIELDS.includes(value as AnalysisPortField) ? (value as AnalysisPortField) : null;
}
