// @vitest-environment jsdom
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
    const container = document.createElement("div");
    const viewer = mountReadonlySchematicViewer(
      container,
      contentWithNote("first")
    );

    expect(observeCount).toBe(1);
    expect(container.innerHTML).toContain('data-note-id="first"');
    expect(container.innerHTML).not.toContain("joint-paper");
    expect(container.querySelector("svg")?.getAttribute("width")).toBe("100%");
    expect(container.querySelector("svg")?.getAttribute("height")).toBe("100%");

    viewer.update(contentWithNote("second"));
    viewer.fit();
    expect(container.innerHTML).toContain('data-note-id="second"');
    expect(container.querySelector("svg")?.getAttribute("viewBox")).toBeTruthy();

    viewer.destroy();
    viewer.destroy();
    expect(disconnectCount).toBe(1);
    expect(container.innerHTML).toBe("");
    expect(container.classList.contains("schematic-readonly-viewer")).toBe(false);
  });
});

function contentWithNote(id: string): SchematicContent {
  return fixtureDocument({
    components: [],
    wires: [],

    junctionAppearances: [],
    netLabels: [],
    notes: [{ id, x: 0, y: 0, width: 120, height: 40, format: "plain", text: id }]
  });
}
