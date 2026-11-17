import { fixtureDocument } from "../support/fixtureDocument";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  copySchematicSelectionAs,
  SchematicContextMenuController,
  type SchematicSelectionExportFormat
} from "../../../src/schematic/contextMenuController";
import { decideSchematicContextMenuOpen, projectSchematicContextMenuTarget } from "../../../src/schematic/contextMenuModel";
import {
  type SchematicSelectionExportInput,
  type SchematicSelectionSvgExport
} from "../../../src/schematic/selection/selectionExport";
import { copySvgToClipboard } from "../../../src/schematic/selection/selectionExportWebAdapter";

const emptyInput: SchematicSelectionExportInput = fixtureDocument({
  netLabels: [],
  components: [],
  wires: [],
  junctionPoints: [],
  notes: []
});

const exportedSvg: SchematicSelectionSvgExport = {
  svg: "<svg data-export='rich'></svg>",
  clipboardSvg: "<svg data-export='portable'></svg>",
  bounds: { x: 0, y: 0, width: 10, height: 8 },
  viewBox: { x: 0, y: 0, width: 10, height: 8 },
  width: 10,
  height: 8
};

class FakeClipboardItem {
  readonly types: string[];

  constructor(readonly entries: Record<string, Blob>) {
    this.types = Object.keys(entries);
  }

  async getType(type: string) {
    const value = this.entries[type];
    if (!value) throw new Error(`Missing clipboard type: ${type}`);
    return value;
  }

  static supports() {
    return false;
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

class FakeElement {
  className = "";
  hidden = false;
  textContent: string | null = null;
  type = "";
  readonly dataset: Record<string, string> = {};
  readonly style: Record<string, string> = {};
  readonly children: FakeElement[] = [];
  rect = { width: 0, height: 0 };
  parent: FakeElement | null = null;
  private readonly attributes = new Map<string, string>();
  private readonly listeners = new Map<string, Array<(event: FakeEvent) => void>>();

  constructor(readonly tagName: string) {}

  append(...nodes: FakeElement[]) {
    nodes.forEach((node) => this.appendChild(node));
  }

  appendChild(node: FakeElement) {
    node.parent = this;
    this.children.push(node);
    return node;
  }

  remove() {
    if (!this.parent) return;
    this.parent.children.splice(this.parent.children.indexOf(this), 1);
    this.parent = null;
  }

  setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
  }

  getAttribute(name: string) {
    return this.attributes.get(name) ?? null;
  }

  addEventListener(type: string, listener: (event: FakeEvent) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  dispatchEvent(event: FakeEvent) {
    (this.listeners.get(event.type) ?? []).forEach((listener) => listener(event));
  }

  contains(target: unknown): boolean {
    return target === this || this.children.some((child) => child.contains(target));
  }

  querySelectorAll(selector: string): FakeElement[] {
    const key = selector === "[data-copy-export]" ? "copyExport" : "pasteSchematic";
    return this.children.flatMap(child => [...(key in child.dataset ? [child] : []), ...child.querySelectorAll(selector)]);
  }

  querySelector(selector: string) { return this.querySelectorAll(selector)[0] ?? null; }

  closest(selector: string): FakeElement | null {
    if (selector === "[data-paste-schematic]" && "pasteSchematic" in this.dataset) return this;
    if (selector === "[data-copy-export]" && this.dataset.copyExport) return this;
    return this.parent?.closest(selector) ?? null;
  }

  getBoundingClientRect() {
    return {
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: this.rect.width,
      bottom: this.rect.height,
      width: this.rect.width,
      height: this.rect.height,
      toJSON: () => ({})
    };
  }
}

class FakeDocument {
  readonly body = new FakeElement("body");

  createElement(tagName: string) {
    return new FakeElement(tagName);
  }
}

class FakeEvent {
  defaultPrevented = false;
  propagationStopped = false;

  constructor(readonly type: string, readonly target: FakeElement) {}

  preventDefault() {
    this.defaultPrevented = true;
  }

  stopPropagation() {
    this.propagationStopped = true;
  }
}

function createController(options: {
  document?: FakeDocument;
  copiedSvg?: string[];
  copiedPng?: Blob[];
  copiedNetlist?: string[];
  copiedJson?: string[];
  status?: string[];
  onPaste?: () => void;
}) {
  const document = options.document ?? new FakeDocument();
  return new SchematicContextMenuController({
    ownerDocument: document as unknown as Document,
    onPaste: options.onPaste,
    viewport: () => ({ width: 320, height: 240 }),
    getExportInput: () => emptyInput,
    getNetlistText: () => "subckt copied_sub_circuit()\n\nends copied_sub_circuit",
    getJsonText: () => '{\n  "format": "adc-helper/schematic"\n}\n',
    setStatus: (message) => options.status?.push(message),
    buildSelectionSvg: () => exportedSvg,
    copySvgToClipboard: (svg) => {
      options.copiedSvg?.push(svg);
    },
    rasterizeSvgToPngBlob: () => new Blob(["png"], { type: "image/png" }),
    copyPngToClipboard: (blob) => {
      options.copiedPng?.push(blob);
    },
    copyTextToClipboard: (text) => {
      options.copiedNetlist?.push(text);
      options.copiedJson?.push(text);
    }
  });
}

function controllerElement(controller: SchematicContextMenuController) {
  return controller.element as unknown as FakeElement;
}

function menuButton(controller: SchematicContextMenuController, format: SchematicSelectionExportFormat) {
  const button = controllerElement(controller).children.find((child) => child.dataset.copyExport === format);
  if (!button) throw new Error(`Missing ${format} menu button`);
  return button;
}

async function flushAsyncExport() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function model(id: string, attributes: Record<string, unknown> = {}) {
  return {
    id,
    get: (attribute: string) => attributes[attribute]
  };
}

describe("copySvgToClipboard", () => {
  it("tries the native SVG MIME even when ClipboardItem.supports reports false", async () => {
    const writes: FakeClipboardItem[][] = [];
    vi.stubGlobal("ClipboardItem", FakeClipboardItem);
    vi.stubGlobal("document", { defaultView: globalThis });
    vi.stubGlobal("navigator", {
      clipboard: {
        write: async (items: FakeClipboardItem[]) => {
          writes.push(items);
        }
      }
    });

    const result = await copySvgToClipboard("<svg data-test='native'></svg>");

    expect(result).toBe("svg");
    expect(writes).toHaveLength(1);
    expect(writes[0]?.[0]?.types).toEqual(["image/svg+xml", "text/html", "text/plain"]);
    const plainText = await writes[0]![0]!.getType("text/plain");
    expect(plainText.type).toBe("text/plain");
    expect(await plainText.text()).toBe("<svg data-test='native'></svg>");
  });

  it("retries with a PNG image when the native SVG clipboard write is rejected", async () => {
    const writes: FakeClipboardItem[][] = [];
    const png = new Blob(["png-fallback"], { type: "image/png" });
    const pngFallback = vi.fn(() => png);
    vi.stubGlobal("ClipboardItem", FakeClipboardItem);
    vi.stubGlobal("document", { defaultView: globalThis });
    vi.stubGlobal("navigator", {
      clipboard: {
        write: async (items: FakeClipboardItem[]) => {
          writes.push(items);
          if (writes.length === 1) throw new Error("SVG MIME is unsupported");
        }
      }
    });

    const result = await copySvgToClipboard("<svg data-test='fallback'></svg>", { pngFallback });

    expect(result).toBe("png");
    expect(pngFallback).toHaveBeenCalledOnce();
    expect(writes).toHaveLength(2);
    expect(writes[0]?.[0]?.types).toContain("image/svg+xml");
    expect(writes[1]?.[0]?.types).toEqual(["image/png"]);
    expect(await writes[1]![0]!.getType("image/png")).toBe(png);
  });
});

describe("projectSchematicContextMenuTarget", () => {
  it("projects note ids to note targets", () => {
    expect(projectSchematicContextMenuTarget({ noteId: "note-1" })).toEqual({ kind: "note", id: "note-1" });
  });

  it("keeps note targets ahead of model targets", () => {
    expect(
      projectSchematicContextMenuTarget({
        noteId: "note-1",
        model: model("cell-r1", { componentId: "R1" })
      })
    ).toEqual({ kind: "note", id: "note-1" });
  });

  it("projects component, wire, and junction model targets", () => {
    expect(projectSchematicContextMenuTarget({ model: model("cell-r1", { componentId: "R1" }) })).toEqual({
      kind: "component",
      id: "R1"
    });
    expect(projectSchematicContextMenuTarget({ model: model("cell-w1", { wireId: "w1" }) })).toEqual({
      kind: "wire",
      id: "w1"
    });
    expect(projectSchematicContextMenuTarget({ model: model("junction:20,40", { junction: true }) })).toEqual({
      kind: "junction",
      id: "junction:20,40"
    });
  });

  it("returns null for empty notes and null, preview, or unresolved models", () => {
    expect(projectSchematicContextMenuTarget({ noteId: "", model: null })).toBeNull();
    expect(projectSchematicContextMenuTarget({ model: model("preview-cell", { preview: true, componentId: "R1" }) })).toBeNull();
    expect(projectSchematicContextMenuTarget({ model: model("unresolved-cell") })).toBeNull();
  });
});

describe("decideSchematicContextMenuOpen", () => {
  const target = { kind: "component", id: "R1" };

  it("ignores panning while consuming the browser context menu default", () => {
    expect(
      decideSchematicContextMenuOpen({
        isPanning: true,
        isSelectMode: true,
        isEditableTarget: false,
        target,
        targetSelected: true,
        hasExportableSelection: true
      })
    ).toEqual({
      kind: "ignore-panning",
      preventDefault: true,
      stopPropagation: false,
      focusCanvas: false,
      selectTarget: false,
      closeMenu: false,
      showMenu: false
    });
  });

  it("closes without consuming the event outside selectable canvas targets", () => {
    const expected = {
      kind: "close",
      closeReason: "inactive-or-editable",
      preventDefault: false,
      stopPropagation: false,
      focusCanvas: false,
      selectTarget: false,
      closeMenu: true,
      showMenu: false
    };

    expect(
      decideSchematicContextMenuOpen({
        isPanning: false,
        isSelectMode: false,
        isEditableTarget: false,
        target,
        targetSelected: true,
        hasExportableSelection: true
      })
    ).toEqual(expected);
    expect(
      decideSchematicContextMenuOpen({
        isPanning: false,
        isSelectMode: true,
        isEditableTarget: true,
        target,
        targetSelected: true,
        hasExportableSelection: true
      })
    ).toEqual(expected);
  });

  it.each([false, true])("shows Paste on blank canvas with selection=%s", (hasExportableSelection) => {
    expect(
      decideSchematicContextMenuOpen({
        isPanning: false,
        isSelectMode: true,
        isEditableTarget: false,
        target: null,
        targetSelected: false,
        hasExportableSelection
      })
    ).toEqual({
      kind: "show-blank",
      preventDefault: true,
      stopPropagation: true,
      focusCanvas: true,
      selectTarget: false,
      closeMenu: false,
      showMenu: true
    });
  });

  it("selects an unselected target before showing the export menu", () => {
    expect(
      decideSchematicContextMenuOpen({
        isPanning: false,
        isSelectMode: true,
        isEditableTarget: false,
        target,
        targetSelected: false,
        hasExportableSelection: false
      })
    ).toEqual({
      kind: "select-and-show",
      preventDefault: true,
      stopPropagation: true,
      focusCanvas: true,
      selectTarget: true,
      closeMenu: false,
      showMenu: true
    });
  });

  it("shows the export menu for an already selected exportable target", () => {
    expect(
      decideSchematicContextMenuOpen({
        isPanning: false,
        isSelectMode: true,
        isEditableTarget: false,
        target,
        targetSelected: true,
        hasExportableSelection: true
      })
    ).toEqual({
      kind: "show",
      preventDefault: true,
      stopPropagation: true,
      focusCanvas: true,
      selectTarget: false,
      closeMenu: false,
      showMenu: true
    });
  });

  it("closes after consuming a resolved target event when no exportable selection remains", () => {
    expect(
      decideSchematicContextMenuOpen({
        isPanning: false,
        isSelectMode: true,
        isEditableTarget: false,
        target,
        targetSelected: true,
        hasExportableSelection: false
      })
    ).toEqual({
      kind: "close",
      closeReason: "empty-selection",
      preventDefault: true,
      stopPropagation: true,
      focusCanvas: true,
      selectTarget: false,
      closeMenu: true,
      showMenu: false
    });
  });
});

describe("SchematicContextMenuController", () => {
  it("creates the public menu DOM anchors and dispatches export button clicks", async () => {
    const document = new FakeDocument();
    const copiedSvg: string[] = [];
    const status: string[] = [];
    const controller = createController({ document, copiedSvg, status });
    const menu = controllerElement(controller);
    const svgButton = menuButton(controller, "svg");

    expect(document.body.children).toEqual([menu]);
    expect(menu.className).toBe("schematic-context-menu");
    expect(menu.hidden).toBe(true);
    expect(menu.getAttribute("role")).toBe("menu");
    expect(menu.getAttribute("aria-label")).toBe("Schematic selection copy menu");
    expect(svgButton.type).toBe("button");
    expect(svgButton.getAttribute("role")).toBe("menuitem");
    expect(svgButton.textContent).toBe("Copy as SVG");
    expect(menuButton(controller, "png").textContent).toBe("Copy as PNG");
    expect(menuButton(controller, "netlist").textContent).toBe("Copy as Netlist");
    expect(menuButton(controller, "json").textContent).toBe("Copy as JSON");
    expect(menu.children.map((button) => button.dataset.copyExport)).toEqual([
      "svg",
      "png",
      "netlist",
      "json"
    ]);

    controller.show(20, 20);
    expect(controller.hidden).toBe(false);

    const event = new FakeEvent("click", svgButton);
    menu.dispatchEvent(event);
    await flushAsyncExport();

    expect(event.defaultPrevented).toBe(true);
    expect(event.propagationStopped).toBe(true);
    expect(controller.hidden).toBe(true);
    expect(copiedSvg).toEqual(["<svg data-export='portable'></svg>"]);
    expect(status).toEqual(["Copied selected schematic SVG to clipboard."]);
  });

  it("dispatches Copy as Netlist through the text clipboard path", async () => {
    const copiedNetlist: string[] = [];
    const status: string[] = [];
    const controller = createController({ copiedNetlist, status });
    const button = menuButton(controller, "netlist");

    controller.show(20, 20);
    const event = new FakeEvent("click", button);
    controllerElement(controller).dispatchEvent(event);
    await flushAsyncExport();

    expect(copiedNetlist).toEqual(["subckt copied_sub_circuit()\n\nends copied_sub_circuit"]);
    expect(status).toEqual(["Copied selected schematic netlist to clipboard."]);
  });

  it("dispatches Copy as JSON after Netlist through the text clipboard path", async () => {
    const copiedJson: string[] = [];
    const status: string[] = [];
    const controller = createController({ copiedJson, status });
    const button = menuButton(controller, "json");

    controller.show(20, 20);
    const event = new FakeEvent("click", button);
    controllerElement(controller).dispatchEvent(event);
    await flushAsyncExport();

    expect(event.defaultPrevented).toBe(true);
    expect(event.propagationStopped).toBe(true);
    expect(controller.hidden).toBe(true);
    expect(copiedJson).toEqual(['{\n  "format": "adc-helper/schematic"\n}\n']);
    expect(status).toEqual(["Copied selected schematic JSON to clipboard."]);
  });

  it("shows only Paste on blank canvas and invokes the shared paste action", () => {
    const pasted: boolean[] = [];
    const controller = createController({ onPaste: () => pasted.push(true) });
    const menu = controllerElement(controller);
    controller.show(20, 30, "blank");
    const paste = menu.querySelector("[data-paste-schematic]")!;
    expect(paste.hidden).toBe(false);
    expect(paste.textContent).toBe("Paste schematic from clipboard");
    expect(menu.querySelectorAll("[data-copy-export]").every(button => button.hidden)).toBe(true);
    const event = new FakeEvent("click", paste);
    menu.dispatchEvent(event);
    expect(pasted).toEqual([true]);
    expect(controller.hidden).toBe(true);
    expect(event.defaultPrevented).toBe(true);
    controller.show(20, 30);
    expect(paste.hidden).toBe(true);
    expect(menuButton(controller, "svg").hidden).toBe(false);
  });

  it("shows inside the viewport, clamps to edges, closes, and detects outside targets", () => {
    const controller = createController({});
    const menu = controllerElement(controller);
    menu.rect = { width: 150, height: 80 };

    controller.show(400, 300);
    expect(menu.hidden).toBe(false);
    expect(menu.style.left).toBe("162px");
    expect(menu.style.top).toBe("152px");

    controller.show(2, 3);
    expect(menu.style.left).toBe("8px");
    expect(menu.style.top).toBe("8px");
    expect(controller.containsTarget(menuButton(controller, "svg") as unknown as EventTarget)).toBe(true);
    expect(controller.containsTarget(new FakeElement("div") as unknown as EventTarget)).toBe(false);

    controller.close();
    expect(menu.hidden).toBe(true);
  });
});

describe("copySchematicSelectionAs", () => {
  it("copies netlist text and reports empty selections or clipboard errors", async () => {
    const copied: string[] = [];
    const status: string[] = [];
    const emptyStatus: string[] = [];
    const errorStatus: string[] = [];

    await copySchematicSelectionAs("netlist", {
      getExportInput: () => emptyInput,
      getNetlistText: () => "subckt copied_sub_circuit()\n\nends copied_sub_circuit",
      copyTextToClipboard: (text) => {
        copied.push(text);
      },
      setStatus: (message) => status.push(message)
    });
    await copySchematicSelectionAs("netlist", {
      getExportInput: () => emptyInput,
      getNetlistText: () => null,
      setStatus: (message) => emptyStatus.push(message)
    });
    await copySchematicSelectionAs("netlist", {
      getExportInput: () => emptyInput,
      getNetlistText: () => "netlist",
      copyTextToClipboard: () => {
        throw new Error("denied");
      },
      setStatus: (message) => errorStatus.push(message)
    });

    expect(copied).toEqual(["subckt copied_sub_circuit()\n\nends copied_sub_circuit"]);
    expect(status).toEqual(["Copied selected schematic netlist to clipboard."]);
    expect(emptyStatus).toEqual(["Select netlistable schematic components before copying."]);
    expect(errorStatus).toEqual(["Could not copy selected schematic netlist: denied"]);
  });

  it("copies JSON text and reports empty selections or clipboard errors without a download fallback", async () => {
    const copied: string[] = [];
    const status: string[] = [];
    const emptyStatus: string[] = [];
    const errorStatus: string[] = [];
    let downloaded = false;

    await copySchematicSelectionAs("json", {
      getExportInput: () => emptyInput,
      getJsonText: () => '{ "format": "adc-helper/schematic" }',
      copyTextToClipboard: (text) => {
        copied.push(text);
      },
      setStatus: (message) => status.push(message)
    });
    await copySchematicSelectionAs("json", {
      getExportInput: () => emptyInput,
      getJsonText: () => null,
      copyTextToClipboard: () => {
        throw new Error("clipboard should not be touched");
      },
      downloadSvg: () => {
        downloaded = true;
      },
      downloadPng: () => {
        downloaded = true;
      },
      setStatus: (message) => emptyStatus.push(message)
    });
    await copySchematicSelectionAs("json", {
      getExportInput: () => emptyInput,
      getJsonText: () => '{ "format": "adc-helper/schematic" }',
      copyTextToClipboard: () => {
        throw new Error("permission denied");
      },
      downloadSvg: () => {
        downloaded = true;
      },
      downloadPng: () => {
        downloaded = true;
      },
      setStatus: (message) => errorStatus.push(message)
    });

    expect(copied).toEqual(['{ "format": "adc-helper/schematic" }']);
    expect(status).toEqual(["Copied selected schematic JSON to clipboard."]);
    expect(emptyStatus).toEqual(["Select schematic objects before copying as JSON."]);
    expect(errorStatus).toEqual(["Could not copy selected schematic JSON: permission denied"]);
    expect(downloaded).toBe(false);
  });

  it("reports an empty selection without touching clipboard or download paths", async () => {
    const status: string[] = [];
    let copied = false;

    await copySchematicSelectionAs("svg", {
      getExportInput: () => emptyInput,
      setStatus: (message) => status.push(message),
      buildSelectionSvg: () => null,
      copySvgToClipboard: () => {
        copied = true;
      }
    });

    expect(status).toEqual(["Select schematic objects before copying."]);
    expect(copied).toBe(false);
  });

  it("copies SVG or falls back to an SVG download with the editor status strings", async () => {
    const successStatus: string[] = [];
    const fallbackStatus: string[] = [];
    const copiedSvg: string[] = [];
    const downloadedSvg: string[] = [];

    await copySchematicSelectionAs("svg", {
      getExportInput: () => emptyInput,
      setStatus: (message) => successStatus.push(message),
      buildSelectionSvg: () => exportedSvg,
      copySvgToClipboard: (svg) => {
        copiedSvg.push(svg);
      }
    });
    await copySchematicSelectionAs("svg", {
      getExportInput: () => emptyInput,
      setStatus: (message) => fallbackStatus.push(message),
      buildSelectionSvg: () => exportedSvg,
      copySvgToClipboard: () => {
        throw new Error("denied");
      },
      downloadSvg: (svg) => downloadedSvg.push(svg)
    });

    expect(copiedSvg).toEqual(["<svg data-export='portable'></svg>"]);
    expect(downloadedSvg).toEqual(["<svg data-export='rich'></svg>"]);
    expect(successStatus).toEqual(["Copied selected schematic SVG to clipboard."]);
    expect(fallbackStatus).toEqual(["Clipboard unavailable; downloaded selected schematic SVG."]);
  });

  it("reports when the SVG clipboard path falls back to PNG", async () => {
    const status: string[] = [];
    const copiedSvg: string[] = [];
    let fallbackFactory: (() => Blob | Promise<Blob>) | undefined;

    await copySchematicSelectionAs("svg", {
      getExportInput: () => emptyInput,
      setStatus: (message) => status.push(message),
      buildSelectionSvg: () => exportedSvg,
      copySvgToClipboard: (svg, options) => {
        copiedSvg.push(svg);
        fallbackFactory = options?.pngFallback;
        return "png";
      },
      rasterizeSvgToPngBlob: () => new Blob(["fallback"], { type: "image/png" })
    });

    expect(copiedSvg).toEqual(["<svg data-export='portable'></svg>"]);
    const fallback = await fallbackFactory?.();
    expect(fallback?.type).toBe("image/png");
    expect(fallback?.size).toBe(8);
    expect(status).toEqual(["SVG clipboard unavailable; copied selected schematic PNG instead."]);
  });

  it("uses the same export model for SVG and PNG", async () => {
    const buildInputs: SchematicSelectionExportInput[] = [];

    await copySchematicSelectionAs("svg", {
      getExportInput: () => emptyInput,
      setStatus: () => {},
      buildSelectionSvg: (input) => {
        buildInputs.push(input);
        return exportedSvg;
      },
      copySvgToClipboard: () => {}
    });
    await copySchematicSelectionAs("png", {
      getExportInput: () => emptyInput,
      setStatus: () => {},
      buildSelectionSvg: (input) => {
        buildInputs.push(input);
        return exportedSvg;
      },
      rasterizeSvgToPngBlob: () => new Blob(["png"], { type: "image/png" }),
      copyPngToClipboard: () => {}
    });

    expect(buildInputs).toEqual([emptyInput, emptyInput]);
  });

  it("copies PNG, falls back after clipboard failure, and reports rasterize errors", async () => {
    const copiedStatus: string[] = [];
    const fallbackStatus: string[] = [];
    const errorStatus: string[] = [];
    const rasterizedBlob = new Blob(["png"], { type: "image/png" });
    const copiedPng: Blob[] = [];
    const downloadedPng: Blob[] = [];

    await copySchematicSelectionAs("png", {
      getExportInput: () => emptyInput,
      setStatus: (message) => copiedStatus.push(message),
      buildSelectionSvg: () => exportedSvg,
      rasterizeSvgToPngBlob: () => rasterizedBlob,
      copyPngToClipboard: (blob) => {
        copiedPng.push(blob);
      }
    });
    await copySchematicSelectionAs("png", {
      getExportInput: () => emptyInput,
      setStatus: (message) => fallbackStatus.push(message),
      buildSelectionSvg: () => exportedSvg,
      rasterizeSvgToPngBlob: () => rasterizedBlob,
      copyPngToClipboard: () => {
        throw new Error("denied");
      },
      downloadPng: (blob) => downloadedPng.push(blob)
    });
    await copySchematicSelectionAs("png", {
      getExportInput: () => emptyInput,
      setStatus: (message) => errorStatus.push(message),
      buildSelectionSvg: () => exportedSvg,
      rasterizeSvgToPngBlob: () => {
        throw new Error("canvas missing");
      }
    });

    expect(copiedPng).toEqual([rasterizedBlob]);
    expect(downloadedPng).toEqual([rasterizedBlob]);
    expect(copiedStatus).toEqual(["Copied selected schematic PNG to clipboard."]);
    expect(fallbackStatus).toEqual(["Clipboard unavailable; downloaded selected schematic PNG."]);
    expect(errorStatus).toEqual(["Could not export selected schematic PNG: canvas missing"]);
  });
});
