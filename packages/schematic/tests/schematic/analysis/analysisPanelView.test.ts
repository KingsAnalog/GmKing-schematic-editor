import { describe, expect, it, vi } from "vitest";
import {
  readAnalysisPortSelection,
  renderAnalysisDiagnostics,
  renderAnalysisPortOptions,
  renderAnalysisResultOutput,
  setActiveAnalysisPortPick,
  setAnalysisBusy,
  trySetAnalysisPortValue
} from "../../../src/schematic/analysis/analysisPanelView";
import type { AnalysisPortSelection, AnalysisResult } from "../../../src/schematic/types";

const COMPUTE_BUTTON_TEXT = "Compute H(s), ZIN(s), Zout(s)";
const PROGRESS_TEXT = "Solving symbolic MNA...";

type FakeNode = FakeElement | FakeTextNode;

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
  readonly defaultView: { MathJax?: Window["MathJax"] } = {};

  createElement(tagName: string) {
    return new FakeElement(tagName, this);
  }

  createTextNode(text: string) {
    return new FakeTextNode(text);
  }
}

class FakeTextNode {
  parent: FakeElement | null = null;

  constructor(private text: string) {}

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
  disabled = false;
  hidden = false;
  parent: FakeElement | null = null;
  value = "";
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
    return this.childNodes.length ? this.childNodes.map((node) => node.textContent ?? "").join("") : this.text;
  }

  set textContent(value: string | null) {
    this.replaceChildren();
    this.text = value ?? "";
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

function createDocument() {
  return new FakeDocument();
}

function createRoot() {
  return createDocument().createElement("section");
}

function asHTMLElement(element: FakeElement) {
  return element as unknown as HTMLElement;
}

function fakeElement(element: HTMLElement) {
  return element as unknown as FakeElement;
}

function matchesSelector(element: FakeElement, selector: string) {
  return selector.split(",").some((part) => matchesSingleSelector(element, part.trim()));
}

function matchesSingleSelector(element: FakeElement, selector: string) {
  const dataAttribute = selector.match(/^\[data-([a-z-]+)(?:=(["'])(.*?)\2)?\]$/);
  if (!dataAttribute) return false;
  const key = datasetKey(dataAttribute[1]);
  const expectedValue = dataAttribute[3];
  if (expectedValue === undefined) return element.dataset[key] !== undefined;
  return element.dataset[key] === expectedValue;
}

function datasetKey(attributeName: string) {
  return attributeName.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}

function serializeChildren(element: FakeElement) {
  return element.childNodes.map(serializeNode).join("");
}

function serializeNode(node: FakeNode): string {
  if (node instanceof FakeTextNode) return escapeHtmlForTest(node.textContent);
  const tagName = node.tagName.toLowerCase();
  if (tagName === "option") {
    return `<option value="${escapeHtmlForTest(node.value)}">${serializeElementContent(node)}</option>`;
  }
  return `<${tagName}>${serializeElementContent(node)}</${tagName}>`;
}

function serializeElementContent(element: FakeElement) {
  return element.childNodes.length ? element.childNodes.map(serializeNode).join("") : escapeHtmlForTest(element.textContent);
}

function escapeHtmlForTest(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

function createBusyRoot(options: { button?: boolean; progress?: boolean } = {}) {
  const includeButton = options.button ?? true;
  const includeProgress = options.progress ?? true;
  const root = createRoot();
  let button: FakeElement | null = null;
  let progress: FakeElement | null = null;
  let progressText: FakeElement | null = null;

  if (includeButton) {
    button = root.ownerDocument.createElement("button");
    button.dataset.analysis = "compute";
    button.textContent = COMPUTE_BUTTON_TEXT;
    root.appendChild(button);
  }

  if (includeProgress) {
    progress = root.ownerDocument.createElement("div");
    progress.dataset.analysisProgress = "";
    progress.hidden = true;
    progress.setAttribute("aria-busy", "false");
    progressText = root.ownerDocument.createElement("span");
    progressText.dataset.analysisProgressText = "";
    progressText.textContent = PROGRESS_TEXT;
    progress.appendChild(progressText);
    root.appendChild(progress);
  }

  return {
    root: asHTMLElement(root),
    button,
    progress,
    progressText
  };
}

function createDiagnosticsRoot() {
  const root = createRoot();
  const target = root.ownerDocument.createElement("div");
  target.dataset.analysisDiagnostics = "";
  root.appendChild(target);
  return {
    root: asHTMLElement(root),
    target
  };
}

function paragraphTexts(target: FakeElement) {
  return target.children.map((child) => child.textContent);
}

type OutputKey = "transfer" | "zin" | "zout";

function createOutputRoot(outputs: Partial<Record<OutputKey, boolean>> = {}) {
  const includeOutput = {
    transfer: outputs.transfer ?? true,
    zin: outputs.zin ?? true,
    zout: outputs.zout ?? true
  };
  const root = createRoot();
  const transfer = includeOutput.transfer ? createOutput(root.ownerDocument, "analysisTransfer") : null;
  const zin = includeOutput.zin ? createOutput(root.ownerDocument, "analysisZin") : null;
  const zout = includeOutput.zout ? createOutput(root.ownerDocument, "analysisZout") : null;

  [transfer, zin, zout].forEach((output) => {
    if (output) root.appendChild(output);
  });

  return {
    root: asHTMLElement(root),
    transfer,
    zin,
    zout
  };
}

function createOutput(document: FakeDocument, datasetKeyName: string) {
  const output = document.createElement("output");
  output.dataset[datasetKeyName] = "";
  return output;
}

function successResult(overrides: Partial<AnalysisResult> = {}): AnalysisResult {
  return {
    ok: true,
    diagnostics: [],
    transferTex: "\\frac{R_2}{R_1+R_2}",
    inputImpedanceTex: "R_1+R_2",
    outputImpedanceTex: "R_1\\parallel R_2",
    ...overrides
  };
}

function failureResult(): AnalysisResult {
  return {
    ok: false,
    diagnostics: ["Missing or invalid inputP net selection."]
  };
}

function stubMathJax(root: HTMLElement, options: { reject?: boolean } = {}) {
  const calls: string[] = [];
  const typesetClear = vi.fn((elements?: Element[]) => {
    calls.push("clear");
    return elements;
  });
  const typesetPromise = vi.fn((elements?: Element[]) => {
    calls.push("promise");
    if (options.reject) return Promise.reject(new Error("typeset failed"));
    return Promise.resolve(elements);
  });
  fakeElement(root).ownerDocument.defaultView.MathJax = {
    typesetClear,
    typesetPromise
  };
  return { calls, typesetClear, typesetPromise };
}

function createPortRoot(fields: Array<keyof AnalysisPortSelection> = ["inputP", "inputN", "outputP", "outputN"]) {
  const root = createRoot();
  fields.forEach((field) => {
    const select = root.ownerDocument.createElement("select");
    select.dataset.netSelect = field;
    root.appendChild(select);

    const button = root.ownerDocument.createElement("button");
    button.dataset.pickNet = field;
    root.appendChild(button);
  });
  return asHTMLElement(root);
}

function selectByField(root: HTMLElement, field: keyof AnalysisPortSelection) {
  return fakeElement(root).querySelector<FakeElement>(`[data-net-select="${field}"]`)!;
}

function pickButtonByField(root: HTMLElement, field: keyof AnalysisPortSelection) {
  return fakeElement(root)
    .querySelectorAll<FakeElement>("[data-pick-net]")
    .find((button) => button.dataset.pickNet === field)!;
}

function optionValues(select: FakeElement) {
  return select.children.map((option) => option.value);
}

function optionLabels(select: FakeElement) {
  return select.children.map((option) => option.textContent);
}

describe("analysis busy DOM helper", () => {
  it("projects busy=true to the compute button and progress indicator", () => {
    const { root, button, progress, progressText } = createBusyRoot();

    setAnalysisBusy(root, true);

    expect(button?.disabled).toBe(true);
    expect(button?.textContent).toBe("Computing...");
    expect(progress?.hidden).toBe(false);
    expect(progress?.getAttribute("aria-busy")).toBe("true");
    expect(progressText?.textContent).toBe(PROGRESS_TEXT);
  });

  it("projects busy=false to the compute button and progress indicator", () => {
    const { root, button, progress, progressText } = createBusyRoot();
    button!.disabled = true;
    button!.textContent = "Computing...";
    progress!.hidden = false;
    progress!.setAttribute("aria-busy", "true");

    setAnalysisBusy(root, false);

    expect(button?.disabled).toBe(false);
    expect(button?.textContent).toBe(COMPUTE_BUTTON_TEXT);
    expect(progress?.hidden).toBe(true);
    expect(progress?.getAttribute("aria-busy")).toBe("false");
    expect(progressText?.textContent).toBe(PROGRESS_TEXT);
  });

  it("keeps repeated true-to-false renders idempotent", () => {
    const { root, button, progress } = createBusyRoot();

    setAnalysisBusy(root, true);
    setAnalysisBusy(root, true);
    setAnalysisBusy(root, false);
    setAnalysisBusy(root, false);

    expect(button?.disabled).toBe(false);
    expect(button?.textContent).toBe(COMPUTE_BUTTON_TEXT);
    expect(progress?.hidden).toBe(true);
    expect(progress?.getAttribute("aria-busy")).toBe("false");
  });

  it("updates progress when the compute button is missing", () => {
    const { root, progress } = createBusyRoot({ button: false });

    expect(() => setAnalysisBusy(root, true)).not.toThrow();
    expect(progress?.hidden).toBe(false);
    expect(progress?.getAttribute("aria-busy")).toBe("true");
  });

  it("updates the compute button when progress is missing", () => {
    const { root, button } = createBusyRoot({ progress: false });

    expect(() => setAnalysisBusy(root, true)).not.toThrow();
    expect(button?.disabled).toBe(true);
    expect(button?.textContent).toBe("Computing...");
  });

  it("does nothing when both busy targets are missing", () => {
    const { root } = createBusyRoot({ button: false, progress: false });

    expect(() => setAnalysisBusy(root, true)).not.toThrow();
    expect(() => setAnalysisBusy(root, false)).not.toThrow();
  });
});

describe("analysis diagnostics DOM helper", () => {
  it("renders an empty diagnostics fallback paragraph", () => {
    const { root, target } = createDiagnosticsRoot();

    renderAnalysisDiagnostics(root, []);

    expect(paragraphTexts(target)).toEqual(["No netlist diagnostics."]);
  });

  it("renders multiple diagnostics as paragraphs in order", () => {
    const { root, target } = createDiagnosticsRoot();

    renderAnalysisDiagnostics(root, ["first", "second", "third"]);

    expect(paragraphTexts(target)).toEqual(["first", "second", "third"]);
  });

  it("clears stale paragraphs on rerender", () => {
    const { root, target } = createDiagnosticsRoot();
    renderAnalysisDiagnostics(root, ["old one", "old two"]);

    renderAnalysisDiagnostics(root, ["new"]);

    expect(paragraphTexts(target)).toEqual(["new"]);
  });

  it("renders special characters as text content", () => {
    const { root, target } = createDiagnosticsRoot();

    renderAnalysisDiagnostics(root, [`v<in>&"'>`]);

    expect(paragraphTexts(target)).toEqual([`v<in>&"'>`]);
    expect(serializeChildren(target)).toBe(`<p>v&lt;in&gt;&amp;&quot;&#39;&gt;</p>`);
  });

  it("does nothing when the diagnostics target is missing", () => {
    const root = asHTMLElement(createRoot());

    expect(() => renderAnalysisDiagnostics(root, ["ignored"])).not.toThrow();
  });

  it("renders empty string diagnostics as empty paragraphs", () => {
    const { root, target } = createDiagnosticsRoot();

    renderAnalysisDiagnostics(root, ["", "after"]);

    expect(paragraphTexts(target)).toEqual(["", "after"]);
    expect(serializeChildren(target)).toBe("<p></p><p>after</p>");
  });
});

describe("analysis result output DOM helper", () => {
  it("renders successful transfer, input impedance, and output impedance TeX", () => {
    const { root, transfer, zin, zout } = createOutputRoot();
    stubMathJax(root);

    renderAnalysisResultOutput(root, successResult());

    expect(transfer?.textContent).toBe("\\[H(s)=\\frac{R_2}{R_1+R_2}\\]");
    expect(zin?.textContent).toBe("\\[Z_{in}(s)=R_1+R_2\\]");
    expect(zout?.textContent).toBe("\\[Z_{out}(s)=R_1\\parallel R_2\\]");
  });

  it("clears stale outputs for a failed result", () => {
    const { root, transfer, zin, zout } = createOutputRoot();
    transfer!.textContent = "old transfer";
    zin!.textContent = "old zin";
    zout!.textContent = "old zout";

    renderAnalysisResultOutput(root, failureResult());

    expect(transfer?.textContent).toBe("");
    expect(zin?.textContent).toBe("");
    expect(zout?.textContent).toBe("");
  });

  it("does nothing when any output target is missing", () => {
    const { root, transfer, zin } = createOutputRoot({ zout: false });
    transfer!.textContent = "old transfer";
    zin!.textContent = "old zin";
    const mathJax = stubMathJax(root);

    expect(() => renderAnalysisResultOutput(root, successResult())).not.toThrow();
    expect(transfer?.textContent).toBe("old transfer");
    expect(zin?.textContent).toBe("old zin");

    expect(() => renderAnalysisResultOutput(root, failureResult())).not.toThrow();
    expect(transfer?.textContent).toBe("old transfer");
    expect(zin?.textContent).toBe("old zin");
    expect(mathJax.typesetClear).not.toHaveBeenCalled();
    expect(mathJax.typesetPromise).not.toHaveBeenCalled();
  });

  it("overwrites stale values on repeated successful renders", () => {
    const { root, transfer, zin, zout } = createOutputRoot();
    stubMathJax(root);

    renderAnalysisResultOutput(root, successResult());
    renderAnalysisResultOutput(
      root,
      successResult({
        transferTex: "A<B&C",
        inputImpedanceTex: "Z_{new}",
        outputImpedanceTex: "\\omega C"
      })
    );

    expect(transfer?.textContent).toBe("\\[H(s)=A<B&C\\]");
    expect(zin?.textContent).toBe("\\[Z_{in}(s)=Z_{new}\\]");
    expect(zout?.textContent).toBe("\\[Z_{out}(s)=\\omega C\\]");
  });

  it("writes special characters through textContent", () => {
    const { root, transfer, zin, zout } = createOutputRoot();
    stubMathJax(root);

    renderAnalysisResultOutput(
      root,
      successResult({
        transferTex: `<script>alert("x")</script>&H`,
        inputImpedanceTex: `R<&"'>`,
        outputImpedanceTex: `Z_out>0 && Z_out<1`
      })
    );

    expect(transfer?.textContent).toBe(`\\[H(s)=<script>alert("x")</script>&H\\]`);
    expect(zin?.textContent).toBe(`\\[Z_{in}(s)=R<&"'>\\]`);
    expect(zout?.textContent).toBe(`\\[Z_{out}(s)=Z_out>0 && Z_out<1\\]`);
  });

  it("calls MathJax clear before typeset with the three output elements", () => {
    const { root, transfer, zin, zout } = createOutputRoot();
    const mathJax = stubMathJax(root);

    renderAnalysisResultOutput(root, successResult());

    expect(mathJax.calls).toEqual(["clear", "promise"]);
    expect(mathJax.typesetClear).toHaveBeenCalledWith([transfer, zin, zout]);
    expect(mathJax.typesetPromise).toHaveBeenCalledWith([transfer, zin, zout]);
  });

  it("swallows MathJax typesetPromise rejections", async () => {
    const { root } = createOutputRoot();
    const mathJax = stubMathJax(root, { reject: true });

    expect(() => renderAnalysisResultOutput(root, successResult())).not.toThrow();
    await Promise.resolve();

    expect(mathJax.typesetPromise).toHaveBeenCalledTimes(1);
  });
});

describe("analysis port selector DOM helpers", () => {
  it("reads all four analysis port selects", () => {
    const root = createPortRoot();
    selectByField(root, "inputP").value = "vinp";
    selectByField(root, "inputN").value = "vinn";
    selectByField(root, "outputP").value = "voutp";
    selectByField(root, "outputN").value = "voutn";

    expect(readAnalysisPortSelection(root)).toEqual({
      inputP: "vinp",
      inputN: "vinn",
      outputP: "voutp",
      outputN: "voutn"
    });
  });

  it("falls back to empty strings for missing selects", () => {
    const root = createPortRoot(["inputP", "outputP"]);
    selectByField(root, "inputP").value = "vinp";
    selectByField(root, "outputP").value = "voutp";

    expect(readAnalysisPortSelection(root)).toEqual({
      inputP: "vinp",
      inputN: "",
      outputP: "voutp",
      outputN: ""
    });
  });

  it("renders placeholder and net options in order with selected values", () => {
    const root = createPortRoot();

    renderAnalysisPortOptions(root, ["0", "vin", "vout"], {
      inputP: "vin",
      inputN: "0",
      outputP: "vout",
      outputN: ""
    });

    expect(optionValues(selectByField(root, "inputP"))).toEqual(["", "0", "vin", "vout"]);
    expect(optionLabels(selectByField(root, "inputP"))).toEqual(["Select net", "0", "vin", "vout"]);
    expect(selectByField(root, "inputP").value).toBe("vin");
    expect(selectByField(root, "inputN").value).toBe("0");
    expect(selectByField(root, "outputP").value).toBe("vout");
    expect(selectByField(root, "outputN").value).toBe("");
  });

  it("clears old options and stale selections on rerender", () => {
    const root = createPortRoot();
    renderAnalysisPortOptions(root, ["old", "keep"], {
      inputP: "old",
      inputN: "",
      outputP: "",
      outputN: ""
    });

    renderAnalysisPortOptions(root, ["keep", "new"], {
      inputP: "old",
      inputN: "",
      outputP: "new",
      outputN: ""
    });

    expect(optionValues(selectByField(root, "inputP"))).toEqual(["", "keep", "new"]);
    expect(selectByField(root, "inputP").value).toBe("");
    expect(selectByField(root, "outputP").value).toBe("new");
  });

  it("reuses option nodes when only the selected ports change", () => {
    const root = createPortRoot();
    renderAnalysisPortOptions(root, ["0", "vin", "vout"], {
      inputP: "vin",
      inputN: "0",
      outputP: "vout",
      outputN: ""
    });
    const inputOptions = [...selectByField(root, "inputP").children];

    renderAnalysisPortOptions(root, ["0", "vin", "vout"], {
      inputP: "vout",
      inputN: "vin",
      outputP: "0",
      outputN: "vout"
    });

    expect(selectByField(root, "inputP").children).toEqual(inputOptions);
    expect(selectByField(root, "inputP").value).toBe("vout");
  });

  it("sets one field value and reports whether the select exists", () => {
    const root = createPortRoot(["inputP"]);

    expect(trySetAnalysisPortValue(root, "inputP", "vin")).toBe(true);
    expect(selectByField(root, "inputP").value).toBe("vin");
    expect(trySetAnalysisPortValue(root, "outputN", "vout")).toBe(false);
  });

  it("synchronizes and clears active pick classes", () => {
    const root = createPortRoot();

    setActiveAnalysisPortPick(root, "outputN");

    expect(selectByField(root, "outputN").classList.contains("is-picking")).toBe(true);
    expect(pickButtonByField(root, "outputN").classList.contains("is-picking")).toBe(true);
    expect(selectByField(root, "inputP").classList.contains("is-picking")).toBe(false);
    expect(pickButtonByField(root, "inputP").classList.contains("is-picking")).toBe(false);

    setActiveAnalysisPortPick(root, null);

    expect(selectByField(root, "outputN").classList.contains("is-picking")).toBe(false);
    expect(pickButtonByField(root, "outputN").classList.contains("is-picking")).toBe(false);
  });

  it("renders special net names through DOM text nodes", () => {
    const root = createPortRoot(["inputP"]);
    const net = `v<in>&"'>`;

    renderAnalysisPortOptions(root, [net], {
      inputP: net,
      inputN: "",
      outputP: "",
      outputN: ""
    });

    const select = selectByField(root, "inputP");
    expect(optionLabels(select)).toEqual(["Select net", net]);
    expect(serializeChildren(select)).toBe(`<option value="">Select net</option><option value="v&lt;in&gt;&amp;&quot;&#39;&gt;">v&lt;in&gt;&amp;&quot;&#39;&gt;</option>`);
  });
});
