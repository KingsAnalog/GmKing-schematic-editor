import { fixtureDocument } from "../support/fixtureDocument";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SchematicAnalysisController, type SchematicAnalysisClient } from "../../../src/schematic/analysis/analysisController";
import type { AnalysisPortSelection, AnalysisResult, Point, SchematicDocument } from "../../../src/schematic/types";

type FakeNode = FakeElement | FakeTextNode;
type Listener = (event: { target: FakeElement }) => void;

class FakeClassList {
  private readonly classes = new Set<string>();

  contains(className: string) {
    return this.classes.has(className);
  }

  toggle(className: string, force?: boolean) {
    const enabled = force ?? !this.classes.has(className);
    if (enabled) this.classes.add(className);
    else this.classes.delete(className);
    return enabled;
  }
}

class FakeDocument {
  createElement(tagName: string) {
    return new FakeElement(tagName, this);
  }

  createTextNode(text: string) {
    return new FakeTextNode(text);
  }
}

class FakeTextNode {
  parent: FakeElement | null = null;

  constructor(private text = "") {}

  get textContent(): string {
    return this.text;
  }

  set textContent(value: string | null) {
    this.text = value ?? "";
  }
}

class FakeElement {
  readonly childNodes: FakeNode[] = [];
  readonly classList = new FakeClassList();
  readonly dataset: Record<string, string> = {};
  readonly listeners = new Map<string, Listener[]>();
  parent: FakeElement | null = null;
  value = "";
  disabled = false;
  hidden = false;
  private readonly attributes: Record<string, string> = {};
  private text = "";

  constructor(
    readonly tagName: string,
    readonly ownerDocument: FakeDocument
  ) {}

  get children() {
    return this.childNodes.filter((node): node is FakeElement => node instanceof FakeElement);
  }

  get textContent(): string {
    return this.childNodes.length ? this.childNodes.map((node) => node.textContent).join("") : this.text;
  }

  set textContent(value: string | null) {
    this.replaceChildren(this.ownerDocument.createTextNode(value ?? ""));
  }

  appendChild(node: FakeNode) {
    node.parent = this;
    this.childNodes.push(node);
    return node;
  }

  replaceChildren(...nodes: FakeNode[]) {
    this.childNodes.forEach((node) => {
      node.parent = null;
    });
    this.childNodes.length = 0;
    this.text = "";
    nodes.forEach((node) => this.appendChild(node));
  }

  setAttribute(name: string, value: string) {
    this.attributes[name] = value;
  }

  getAttribute(name: string) {
    return this.attributes[name] ?? null;
  }

  addEventListener(type: string, listener: Listener) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  dispatch(type: string, target: FakeElement = this) {
    (this.listeners.get(type) ?? []).forEach((listener) => listener({ target }));
  }

  closest<T = FakeElement>(selector: string): T | null {
    let candidate: FakeElement | null = this;
    while (candidate) {
      if (matchesSelector(candidate, selector)) return candidate as T;
      candidate = candidate.parent;
    }
    return null;
  }

  querySelector<T = FakeElement>(selector: string): T | null {
    return this.querySelectorAll<T>(selector)[0] ?? null;
  }

  querySelectorAll<T = FakeElement>(selector: string): T[] {
    const matches: FakeElement[] = [];
    this.walk((element) => {
      if (matchesSelector(element, selector)) matches.push(element);
    });
    return matches as T[];
  }

  private walk(visit: (element: FakeElement) => void) {
    this.children.forEach((child) => {
      visit(child);
      child.walk(visit);
    });
  }
}

class ControllableAnalysisClient implements SchematicAnalysisClient {
  readonly calls: Array<{ runId: number; payload: { document: SchematicDocument; selection: AnalysisPortSelection } }> = [];
  readonly deferred: Array<{
    resolve: (result: AnalysisResult) => void;
    reject: (error: unknown) => void;
    promise: Promise<AnalysisResult>;
  }> = [];
  cancelCalls = 0;

  run(runId: number, payload: { document: SchematicDocument; selection: AnalysisPortSelection }) {
    this.calls.push({ runId, payload });
    let resolve!: (result: AnalysisResult) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<AnalysisResult>((innerResolve, innerReject) => {
      resolve = innerResolve;
      reject = innerReject;
    });
    this.deferred.push({ resolve, reject, promise });
    return promise;
  }

  cancel() {
    this.cancelCalls += 1;
  }
}

function createRoot() {
  const document = new FakeDocument();
  const root = document.createElement("section");
  (["inputP", "inputN", "outputP", "outputN"] as const).forEach((field) => {
    const select = document.createElement("select");
    select.dataset.netSelect = field;
    root.appendChild(select);

    const pick = document.createElement("button");
    pick.dataset.pickNet = field;
    pick.textContent = "Pick";
    root.appendChild(pick);
  });

  const compute = document.createElement("button");
  compute.dataset.analysis = "compute";
  compute.textContent = "Compute H(s), Zin(s), Zout(s)";
  root.appendChild(compute);

  const progress = document.createElement("div");
  progress.dataset.analysisProgress = "";
  progress.hidden = true;
  progress.setAttribute("aria-busy", "false");
  const progressText = document.createElement("span");
  progressText.dataset.analysisProgressText = "";
  progressText.textContent = "Solving symbolic MNA...";
  progress.appendChild(progressText);
  root.appendChild(progress);

  const diagnostics = document.createElement("div");
  diagnostics.dataset.analysisDiagnostics = "";
  root.appendChild(diagnostics);

  const transfer = createOutput(document, "analysisTransfer");
  const zin = createOutput(document, "analysisZin");
  const zout = createOutput(document, "analysisZout");
  root.appendChild(transfer);
  root.appendChild(zin);
  root.appendChild(zout);

  return {
    root: root as unknown as HTMLElement,
    fakeRoot: root,
    compute,
    progress,
    diagnostics,
    transfer,
    zin,
    zout
  };
}

function createOutput(document: FakeDocument, datasetKey: string) {
  const output = document.createElement("output");
  output.dataset[datasetKey] = "";
  return output;
}

function createDocument(): SchematicDocument {
  return fixtureDocument({

    junctionAppearances: [],
    netLabels: [],
    notes: [],
    components: [],
    junctions: [],
    wires: [
      { id: "w0", routeMode: "orthogonal", points: [{ x: 0, y: 0 }, { x: 40, y: 0 }] },
      { id: "w1", routeMode: "orthogonal", points: [{ x: 100, y: 0 }, { x: 140, y: 0 }] }
    ]
  });
}

function createHarness(options: {
  document?: SchematicDocument;
  client?: SchematicAnalysisClient;
  findVoltageNetAtPoint?: (document: SchematicDocument, point: Point) => { net: string; distance: number } | null;
} = {}) {
  const root = createRoot();
  const document = options.document ?? createDocument();
  const calls = {
    prepare: 0,
    focus: 0,
    persist: 0,
    documentReads: 0,
    statuses: [] as string[]
  };
  const controller = new SchematicAnalysisController(root.root, {
    getDocument: () => {
      calls.documentReads += 1;
      return document;
    },
    prepareNetPick: () => {
      calls.prepare += 1;
    },
    focusCanvas: () => {
      calls.focus += 1;
    },
    setStatus: (message) => {
      calls.statuses.push(message);
    },
    persistWorkspaceState: () => {
      calls.persist += 1;
    },
    workerClient: options.client,
    findVoltageNetAtPoint: options.findVoltageNetAtPoint
  });
  return { ...root, document, calls, controller };
}

function selectByField(root: FakeElement, field: keyof AnalysisPortSelection) {
  return root.querySelector<FakeElement>(`[data-net-select="${field}"]`)!;
}

function pickByField(root: FakeElement, field: keyof AnalysisPortSelection) {
  return root.querySelectorAll<FakeElement>("[data-pick-net]").find((button) => button.dataset.pickNet === field)!;
}

function diagnosticTexts(target: FakeElement) {
  return target.children.map((child) => child.textContent);
}

function optionValues(select: FakeElement) {
  return select.children.map((option) => option.value);
}

function successResult(label: string): AnalysisResult {
  return {
    ok: true,
    diagnostics: [],
    transferTex: label,
    inputImpedanceTex: `${label}_zin`,
    outputImpedanceTex: `${label}_zout`
  };
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

function stubMathJax() {
  vi.stubGlobal("window", {
    MathJax: {
      typesetClear: vi.fn(),
      typesetPromise: vi.fn(() => Promise.resolve())
    }
  });
}

function matchesSelector(element: FakeElement, selector: string) {
  return selector.split(",").some((part) => matchesSingleSelector(element, part.trim()));
}

function matchesSingleSelector(element: FakeElement, selector: string) {
  const dataAttribute = selector.match(/^\[data-([a-z-]+)(?:=(['"])(.*?)\2)?\]$/);
  if (!dataAttribute) return false;
  const key = datasetKey(dataAttribute[1]);
  const expectedValue = dataAttribute[3];
  if (expectedValue === undefined) return element.dataset[key] !== undefined;
  return element.dataset[key] === expectedValue;
}

function datasetKey(attributeName: string) {
  return attributeName.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}

describe("SchematicAnalysisController", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("handles pick buttons, select focus, and select changes", () => {
    const { controller, fakeRoot, calls } = createHarness();
    controller.bind();

    fakeRoot.dispatch("click", pickByField(fakeRoot, "outputP"));

    expect(calls.prepare).toBe(1);
    expect(calls.focus).toBe(1);
    expect(calls.statuses).toEqual(["Pick Output + by clicking a wire or wire node on the schematic."]);
    expect(selectByField(fakeRoot, "outputP").classList.contains("is-picking")).toBe(true);
    expect(pickByField(fakeRoot, "outputP").classList.contains("is-picking")).toBe(true);

    fakeRoot.dispatch("focusin", selectByField(fakeRoot, "inputN"));

    expect(selectByField(fakeRoot, "outputP").classList.contains("is-picking")).toBe(false);
    expect(selectByField(fakeRoot, "inputN").classList.contains("is-picking")).toBe(true);

    fakeRoot.dispatch("change", selectByField(fakeRoot, "inputN"));

    expect(calls.persist).toBe(1);
  });

  it("begins and clears active picks with synchronized classes", () => {
    const { controller, fakeRoot } = createHarness();

    controller.beginPick("inputP");

    expect(controller.hasActivePick()).toBe(true);
    expect(selectByField(fakeRoot, "inputP").classList.contains("is-picking")).toBe(true);
    expect(pickByField(fakeRoot, "inputP").classList.contains("is-picking")).toBe(true);

    controller.clearActivePick();

    expect(controller.hasActivePick()).toBe(false);
    expect(selectByField(fakeRoot, "inputP").classList.contains("is-picking")).toBe(false);
    expect(pickByField(fakeRoot, "inputP").classList.contains("is-picking")).toBe(false);
  });

  it("refreshes net selectors, normalizes stale selections, and renders diagnostics", () => {
    const { controller, fakeRoot, diagnostics } = createHarness();
    selectByField(fakeRoot, "inputP").value = "stale";
    selectByField(fakeRoot, "inputN").value = "0";
    selectByField(fakeRoot, "outputP").value = "n1";

    controller.refreshNetSelectors();

    expect(optionValues(selectByField(fakeRoot, "inputP"))).toEqual(["", "NET_1", "NET_2"]);
    expect(selectByField(fakeRoot, "inputP").value).toBe("");
    expect(selectByField(fakeRoot, "inputN").value).toBe("");
    expect(selectByField(fakeRoot, "outputP").value).toBe("");
    expect(diagnosticTexts(diagnostics)).toEqual(["No netlist diagnostics."]);
  });

  it("reuses a precomputed netlist when refreshing selectors", () => {
    const { controller, fakeRoot, diagnostics } = createHarness({
      document: fixtureDocument({

        junctionAppearances: [],
        netLabels: [],
        notes: [], components: [], wires: [], junctions: [] })
    });

    controller.refreshNetSelectors({
      nets: new Map([["PRECOMPUTED", [{ x: 0, y: 0 }]]]),
      pins: [],
      components: [],
      diagnostics: ["precomputed diagnostics"]
    });

    expect(optionValues(selectByField(fakeRoot, "inputP"))).toEqual(["", "PRECOMPUTED"]);
    expect(diagnosticTexts(diagnostics)).toEqual(["precomputed diagnostics"]);
  });

  it("refreshes selector names and restored selection without extracting a netlist", () => {
    const { controller, fakeRoot, calls } = createHarness();

    controller.refreshNetSelectorsFromNames(["OUT", "0"], {
      inputP: "OUT",
      inputN: "0",
      outputP: "stale",
      outputN: ""
    });
    controller.setSelection({ inputP: "0", inputN: "OUT", outputP: "stale", outputN: "" });

    expect(calls.documentReads).toBe(0);
    expect(optionValues(selectByField(fakeRoot, "inputP"))).toEqual(["", "0", "OUT"]);
    expect(selectByField(fakeRoot, "inputP").value).toBe("0");
    expect(selectByField(fakeRoot, "inputN").value).toBe("OUT");
    expect(selectByField(fakeRoot, "outputP").value).toBe("");
  });

  it("uses an explicit restored selection instead of values left by another document", () => {
    const { controller, fakeRoot } = createHarness();
    selectByField(fakeRoot, "inputP").value = "NET_1";
    selectByField(fakeRoot, "outputP").value = "NET_2";

    controller.refreshNetSelectors(undefined, {
      inputP: "",
      inputN: "",
      outputP: "NET_1",
      outputN: ""
    });

    expect(selectByField(fakeRoot, "inputP").value).toBe("");
    expect(selectByField(fakeRoot, "outputP").value).toBe("NET_1");
  });

  it("clears stale analysis names when explicit label nets merge and does not migrate them after a split", () => {
    const document: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      notes: [],
      components: [],
      junctions: [],
      wires: [
        { id: "left", routeMode: "orthogonal", points: [{ x: 0, y: 0 }, { x: 40, y: 0 }] },
        { id: "right", routeMode: "orthogonal", points: [{ x: 100, y: 0 }, { x: 140, y: 0 }] }
      ],
      netLabels: [
        { id: "left-label", name: "OUT", attachment: { wireId: "left", point: { x: 20, y: 0 } } },
        { id: "right-label", name: "AUX", attachment: { wireId: "right", point: { x: 120, y: 0 } } }
      ]
    });
    const { controller, fakeRoot } = createHarness({ document });

    controller.refreshNetSelectors();
    selectByField(fakeRoot, "outputP").value = "AUX";
    document.netLabels![1].name = "OUT";
    controller.refreshNetSelectors();

    expect(optionValues(selectByField(fakeRoot, "outputP"))).toEqual(["", "OUT"]);
    expect(selectByField(fakeRoot, "outputP").value).toBe("");

    document.netLabels![1].name = "AUX";
    controller.refreshNetSelectors();
    expect(optionValues(selectByField(fakeRoot, "outputP"))).toEqual(["", "AUX", "OUT"]);
    expect(selectByField(fakeRoot, "outputP").value).toBe("");
  });

  it("keeps active pick on miss without persisting and persists once on hit", () => {
    let hit = false;
    const { controller, fakeRoot, calls } = createHarness({
      findVoltageNetAtPoint: () => (hit ? { net: "n1", distance: 0 } : null)
    });
    controller.beginPick("outputN");
    calls.statuses.length = 0;

    expect(controller.pickNet({ x: 200, y: 200 })).toBe(true);

    expect(calls.statuses).toEqual(["No wire node near click for Output -. Voltage picks use wires, not component pins."]);
    expect(calls.persist).toBe(0);
    expect(controller.hasActivePick()).toBe(true);
    expect(selectByField(fakeRoot, "outputN").classList.contains("is-picking")).toBe(true);

    hit = true;
    expect(controller.pickNet({ x: 100, y: 0 })).toBe(true);

    expect(selectByField(fakeRoot, "outputN").value).toBe("n1");
    expect(calls.statuses.at(-1)).toBe("Output - set to n1.");
    expect(calls.persist).toBe(1);
    expect(controller.hasActivePick()).toBe(false);
    expect(selectByField(fakeRoot, "outputN").classList.contains("is-picking")).toBe(false);
  });

  it("runs analysis with busy/output updates and a cloned document payload", async () => {
    stubMathJax();
    const client = new ControllableAnalysisClient();
    const { controller, document, fakeRoot, compute, progress, diagnostics, transfer } = createHarness({ client });
    selectByField(fakeRoot, "inputP").value = "n1";
    selectByField(fakeRoot, "inputN").value = "0";
    selectByField(fakeRoot, "outputP").value = "n1";
    selectByField(fakeRoot, "outputN").value = "0";
    transfer.textContent = "stale";

    const pending = controller.compute();

    expect(compute.disabled).toBe(true);
    expect(compute.textContent).toBe("Computing...");
    expect(progress.hidden).toBe(false);
    expect(progress.getAttribute("aria-busy")).toBe("true");
    expect(transfer.textContent).toBe("");
    expect(client.calls[0].payload.document).not.toBe(document);
    document.wires[0].points[0].x = 999;
    expect(client.calls[0].payload.document.wires[0].points[0].x).toBe(0);
    expect(client.calls[0].payload.selection).toEqual({ inputP: "n1", inputN: "0", outputP: "n1", outputN: "0" });

    client.deferred[0].resolve(successResult("A"));
    await pending;

    expect(compute.disabled).toBe(false);
    expect(compute.textContent).toBe("Compute H(s), Zin(s), Zout(s)");
    expect(progress.hidden).toBe(true);
    expect(progress.getAttribute("aria-busy")).toBe("false");
    expect(transfer.textContent).toBe("\\[H(s)=A\\]");
    expect(diagnosticTexts(diagnostics)).toEqual(["No netlist diagnostics."]);
  });

  it("renders worker errors and clears busy state", async () => {
    const client = new ControllableAnalysisClient();
    const { controller, compute, diagnostics, transfer } = createHarness({ client });
    transfer.textContent = "stale";

    const pending = controller.compute();
    client.deferred[0].reject(new Error("worker boom"));
    await pending;

    expect(compute.disabled).toBe(false);
    expect(transfer.textContent).toBe("");
    expect(diagnosticTexts(diagnostics)).toEqual(["worker boom"]);
  });

  it("ignores stale worker results", async () => {
    stubMathJax();
    const client = new ControllableAnalysisClient();
    const { controller, transfer, compute } = createHarness({ client });

    const first = controller.compute();
    const second = controller.compute();

    expect(client.calls.map((call) => call.runId)).toEqual([1, 2]);

    client.deferred[1].resolve(successResult("second"));
    await second;

    expect(transfer.textContent).toBe("\\[H(s)=second\\]");
    expect(compute.disabled).toBe(false);

    client.deferred[0].resolve(successResult("first"));
    await first;
    await flushPromises();

    expect(transfer.textContent).toBe("\\[H(s)=second\\]");
    expect(compute.disabled).toBe(false);
  });

  it("cancels pending analysis and prevents its result from reaching another schematic document", async () => {
    const client = new ControllableAnalysisClient();
    const { controller, transfer, compute, progress, diagnostics } = createHarness({ client });
    const pending = controller.compute();

    controller.cancelPendingCompute();

    expect(client.cancelCalls).toBe(1);
    expect(compute.disabled).toBe(false);
    expect(progress.hidden).toBe(true);
    expect(transfer.textContent).toBe("");
    expect(diagnosticTexts(diagnostics)).toEqual(["No netlist diagnostics."]);

    client.deferred[0].resolve(successResult("old-sheet"));
    await pending;
    expect(transfer.textContent).toBe("");
  });
});
