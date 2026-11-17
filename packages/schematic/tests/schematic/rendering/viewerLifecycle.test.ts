import { fixtureDocument } from "../support/fixtureDocument";
import { afterEach, describe, expect, it } from "vitest";
import { mountReadonlySchematicViewer } from "../../../src/schematic/viewer";
import type { SchematicContent } from "../../../src/schematic/types";

const originalResizeObserver = globalThis.ResizeObserver;

afterEach(() => {
  globalThis.ResizeObserver = originalResizeObserver;
});

describe("readonly schematic viewer lifecycle", () => {
  it("updates and fits static SVG without mounting a JointJS Paper", () => {
    let observeCount = 0;
    let disconnectCount = 0;
    globalThis.ResizeObserver = class {
      constructor(private readonly callback: ResizeObserverCallback) {}
      observe() { observeCount += 1; this.callback([], this as unknown as ResizeObserver); }
      disconnect() { disconnectCount += 1; }
      unobserve() {}
    };
    const container = new FakeContainer();
    const viewer = mountReadonlySchematicViewer(
      container as unknown as HTMLElement,
      contentWithNote("first")
    );

    expect(observeCount).toBe(1);
    expect(container.html).toContain('data-note-id="first"');
    expect(container.html).not.toContain("joint-paper");
    expect(container.svg.attributes.get("width")).toBe("100%");
    expect(container.svg.attributes.get("height")).toBe("100%");

    viewer.update(contentWithNote("second"));
    viewer.fit();
    expect(container.html).toContain('data-note-id="second"');
    expect(container.svg.attributes.get("viewBox")).toBeTruthy();

    viewer.destroy();
    viewer.destroy();
    expect(disconnectCount).toBe(1);
    expect(container.html).toBe("");
    expect(container.classes.has("schematic-readonly-viewer")).toBe(false);
  });
});

class FakeSvg {
  readonly attributes = new Map<string, string>();
  readonly classList = { add: (_name: string) => undefined };
  setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
  }
}

class FakeContainer {
  readonly classes = new Set<string>();
  readonly svg = new FakeSvg();
  readonly classList = {
    add: (name: string) => this.classes.add(name),
    remove: (name: string) => this.classes.delete(name)
  };
  html = "";

  set innerHTML(value: string) { this.html = value; }
  get innerHTML() { return this.html; }
  set textContent(value: string) { this.html = value; }
  get textContent() { return this.html; }

  querySelector(selector: string) {
    return selector === "svg" && this.html.includes("<svg") ? this.svg : null;
  }
}

function contentWithNote(id: string): SchematicContent {
  return fixtureDocument({
    components: [],
    wires: [],

    junctionAppearances: [],
    netLabels: [],
    notes: [{ id, x: 0, y: 0, width: 120, height: 40, format: "plain", text: id }]
  });
}
