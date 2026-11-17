import { describe, expect, it } from "vitest";
import { renderSchematicSelectionSummary } from "../../../src/schematic/selection/selectionSummaryRenderer";

type FakeNode = FakeElement | FakeTextNode;

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
  parent: FakeElement | null = null;

  constructor(
    readonly tagName: string,
    readonly ownerDocument: FakeDocument
  ) {}

  get children() {
    return this.childNodes.filter((node): node is FakeElement => node instanceof FakeElement);
  }

  get textContent(): string {
    return this.childNodes.map((node) => node.textContent ?? "").join("");
  }

  set textContent(value: string | null) {
    this.replaceChildren(new FakeTextNode(value ?? ""));
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
    nodes.forEach((node) => this.appendChild(node));
  }
}

function createTarget() {
  return new FakeDocument().createElement("div") as unknown as HTMLElement;
}

function fakeElement(target: HTMLElement) {
  return target as unknown as FakeElement;
}

function serializeChildren(target: HTMLElement) {
  return fakeElement(target).childNodes.map(serializeNode).join("");
}

function serializeNode(node: FakeNode): string {
  if (node instanceof FakeTextNode) return escapeHtmlForTest(node.textContent);
  const tagName = node.tagName.toLowerCase();
  return `<${tagName}>${node.childNodes.map(serializeNode).join("")}</${tagName}>`;
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

describe("renderSchematicSelectionSummary", () => {
  it("clears labeled child nodes when rendering a later plain summary", () => {
    const target = createTarget();
    renderSchematicSelectionSummary(target, {
      kind: "labeled",
      title: "Tool:",
      separator: "space",
      parts: [{ text: "Wire" }, { text: "waiting", muted: true }]
    });

    renderSchematicSelectionSummary(target, { kind: "plain", text: "No object selected." });

    expect(target.textContent).toBe("No object selected.");
    expect(fakeElement(target).children).toEqual([]);
  });

  it("renders a labeled title, leading space, space separator, and muted span", () => {
    const target = createTarget();

    renderSchematicSelectionSummary(target, {
      kind: "labeled",
      title: "Tool:",
      separator: "space",
      parts: [{ text: "Wire" }, { text: "waiting for start", muted: true }]
    });

    expect(fakeElement(target).children.map((node) => node.tagName)).toEqual(["strong", "span"]);
    expect(fakeElement(target).childNodes.map((node) => node.textContent)).toEqual(["Tool:", " ", "Wire", " ", "waiting for start"]);
    expect(target.textContent).toBe("Tool: Wire waiting for start");
  });

  it("renders comma-separated labeled parts", () => {
    const target = createTarget();

    renderSchematicSelectionSummary(target, {
      kind: "labeled",
      title: "Selected:",
      separator: "comma",
      parts: [{ text: "R1" }, { text: "C1" }, { text: "wire" }]
    });

    expect(fakeElement(target).childNodes.map((node) => node.textContent)).toEqual(["Selected:", " ", "R1", ", ", "C1", ", ", "wire"]);
    expect(target.textContent).toBe("Selected: R1, C1, wire");
  });

  it("keeps summary text escaped through DOM text nodes", () => {
    const target = createTarget();

    renderSchematicSelectionSummary(target, {
      kind: "labeled",
      title: "Selected <&\"'>:",
      separator: "space",
      parts: [{ text: "R<1>&\"'" }, { text: "<muted>", muted: true }]
    });

    expect(target.textContent).toBe("Selected <&\"'>: R<1>&\"' <muted>");
    expect(serializeChildren(target)).toBe(
      "<strong>Selected &lt;&amp;&quot;&#39;&gt;:</strong> R&lt;1&gt;&amp;&quot;&#39; <span>&lt;muted&gt;</span>"
    );
  });

  it("renders an empty labeled summary as only the title", () => {
    const target = createTarget();

    renderSchematicSelectionSummary(target, {
      kind: "labeled",
      title: "Selected:",
      separator: "comma",
      parts: []
    });

    expect(fakeElement(target).children.map((node) => node.tagName)).toEqual(["strong"]);
    expect(fakeElement(target).childNodes.map((node) => node.textContent)).toEqual(["Selected:"]);
    expect(target.textContent).toBe("Selected:");
  });
});
