// @ts-expect-error Vite provides raw text imports at test runtime.
import indexHtml from "../../../../apps/web/index.html?raw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderMathTexInto } from "../../src/shared/mathjax";

const APPROVED_TEX_PACKAGES = [
  "amscd",
  "bbox",
  "bbm",
  "bboldx",
  "begingroup",
  "boldsymbol",
  "braket",
  "bussproofs",
  "cancel",
  "cases",
  "centernot",
  "color",
  "colortbl",
  "dsfont",
  "empheq",
  "enclose",
  "extpfeil",
  "mathtools",
  "mhchem",
  "physics",
  "tagformat",
  "textcomp",
  "unicode",
  "units",
  "upgreek",
  "verb"
] as const;

interface MathJaxPageConfig {
  loader: {
    load: string[];
    paths: Record<string, string>;
  };
  tex: {
    packages: Record<string, string[]>;
    require: {
      allow: Record<string, boolean>;
      defaultAllow: boolean;
    };
  };
  svg: {
    fontCache: string;
  };
  options: {
    safeOptions: {
      allow: Record<string, string>;
      safeProtocols: Record<string, boolean>;
    };
  };
}

function readMathJaxPageConfig() {
  const source = indexHtml.match(/<script>\s*(window\.MathJax\s*=[\s\S]*?;)\s*<\/script>/)?.[1];
  if (!source) throw new Error("MathJax page configuration was not found");

  const target: { MathJax?: unknown } = {};
  new Function("window", source)(target);
  return {
    config: target.MathJax as MathJaxPageConfig,
    html: indexHtml
  };
}

describe("MathJax render lifecycle", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not write a completed third-party render into an aborted target", async () => {
    let finishTypeset!: () => void;
    const typesetGate = new Promise<void>((resolve) => {
      finishTypeset = resolve;
    });
    const typesetPromise = vi.fn(() => typesetGate);
    const typesetClear = vi.fn();
    const stage = {
      childNodes: [{}],
      querySelector: vi.fn(),
      remove: vi.fn(),
      style: {},
      textContent: ""
    };
    const appendChild = vi.fn();
    vi.stubGlobal("window", {
      MathJax: { typesetClear, typesetPromise }
    });
    vi.stubGlobal("document", {
      defaultView: window,
      body: { appendChild },
      createElement: vi.fn(() => stage)
    });

    const replaceChildren = vi.fn();
    const target = {
      ownerDocument: document,
      classList: {
        remove: vi.fn(),
        toggle: vi.fn()
      },
      replaceChildren,
      setAttribute: vi.fn(),
      textContent: ""
    } as unknown as HTMLElement;
    const controller = new AbortController();

    const rendering = renderMathTexInto(target, "x^2", {
      signal: controller.signal
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(typesetPromise).toHaveBeenCalledWith([stage]);

    controller.abort();
    finishTypeset();

    await expect(rendering).resolves.toBe(false);
    expect(replaceChildren).not.toHaveBeenCalled();
    expect(typesetClear).not.toHaveBeenCalledWith([target]);
    expect(stage.remove).toHaveBeenCalledOnce();
  });

  it("keeps a newer preview when an older MathJax render settles later", async () => {
    let finishOlder!: () => void;
    let finishNewer!: () => void;
    const olderGate = new Promise<void>((resolve) => {
      finishOlder = resolve;
    });
    const newerGate = new Promise<void>((resolve) => {
      finishNewer = resolve;
    });
    const olderNode = { id: "older" };
    const newerNode = { id: "newer" };
    const olderStage = {
      childNodes: [olderNode],
      querySelector: vi.fn((selector: string) =>
        selector === "mjx-container, svg" ? olderNode : null
      ),
      remove: vi.fn(),
      style: {},
      textContent: ""
    };
    const newerStage = {
      childNodes: [newerNode],
      querySelector: vi.fn((selector: string) =>
        selector === "mjx-container, svg" ? newerNode : null
      ),
      remove: vi.fn(),
      style: {},
      textContent: ""
    };
    const stageQueue = [olderStage, newerStage];
    const typesetPromise = vi.fn((targets: unknown[]) =>
      targets[0] === olderStage ? olderGate : newerGate
    );
    const typesetClear = vi.fn();
    vi.stubGlobal("window", {
      MathJax: { typesetClear, typesetPromise }
    });
    vi.stubGlobal("document", {
      defaultView: window,
      body: { appendChild: vi.fn() },
      createElement: vi.fn(() => stageQueue.shift())
    });

    const replaceChildren = vi.fn();
    const target = {
      ownerDocument: document,
      classList: {
        remove: vi.fn(),
        toggle: vi.fn()
      },
      replaceChildren,
      setAttribute: vi.fn(),
      textContent: ""
    } as unknown as HTMLElement;

    const olderRender = renderMathTexInto(target, "x");
    await Promise.resolve();
    await Promise.resolve();
    const renderedOlderStage = typesetPromise.mock.calls[0]?.[0]?.[0];

    const newerRender = renderMathTexInto(target, "x^2");
    await Promise.resolve();
    await Promise.resolve();
    const renderedNewerStage = typesetPromise.mock.calls[1]?.[0]?.[0];

    expect(renderedOlderStage).toBe(olderStage);
    expect(renderedNewerStage).toBe(newerStage);
    finishNewer();
    await expect(newerRender).resolves.toBe(true);
    finishOlder();
    await expect(olderRender).resolves.toBe(false);

    expect(replaceChildren).toHaveBeenCalledOnce();
    expect(replaceChildren).toHaveBeenCalledWith(newerNode);
    expect(typesetClear).toHaveBeenCalledWith([target]);
  });
});

describe("MathJax page configuration", () => {
  it("pins MathJax and its external font extensions to 4.1.3", () => {
    const { config, html } = readMathJaxPageConfig();

    expect(html).toContain("https://cdn.jsdelivr.net/npm/mathjax@4.1.3/tex-svg.js");
    expect(config.loader.paths).toEqual({
      "mathjax-bbm-extension":
        "https://cdn.jsdelivr.net/npm/@mathjax/mathjax-bbm-font-extension@4.1.3",
      "mathjax-bboldx-extension":
        "https://cdn.jsdelivr.net/npm/@mathjax/mathjax-bboldx-font-extension@4.1.3",
      "mathjax-dsfont-extension":
        "https://cdn.jsdelivr.net/npm/@mathjax/mathjax-dsfont-font-extension@4.1.3",
      "mathjax-mhchem-extension":
        "https://cdn.jsdelivr.net/npm/@mathjax/mathjax-mhchem-font-extension@4.1.3"
    });
  });

  it("loads only the approved engineering package set through a strict require allowlist", () => {
    const { config } = readMathJaxPageConfig();
    const approved = [...APPROVED_TEX_PACKAGES];

    expect(config.loader.load).toEqual(["ui/safe", ...approved.map((name) => `[tex]/${name}`)]);
    expect(config.tex.packages).toEqual({
      "[-]": ["autoload", "noundefined"],
      "[+]": approved
    });
    expect(config.tex.require).toEqual({
      allow: Object.fromEntries(approved.map((name) => [name, true])),
      defaultAllow: false
    });

    for (const name of ["action", "html", "texhtml", "setoptions", "noerrors", "all-packages"]) {
      expect(config.loader.load).not.toContain(`[tex]/${name}`);
      expect(config.tex.packages["[+]"]).not.toContain(name);
      expect(config.tex.require.allow[name]).toBeUndefined();
    }
  });

  it("keeps SVG glyphs local and blocks unsafe URL protocols", () => {
    const { config } = readMathJaxPageConfig();

    expect(config.svg.fontCache).toBe("local");
    expect(config.loader.load).toContain("ui/safe");
    expect(config.options.safeOptions.allow).toEqual({
      URLs: "safe",
      classes: "safe",
      cssIDs: "safe",
      styles: "safe"
    });
    expect(config.options.safeOptions.safeProtocols).toEqual({
      http: true,
      https: true,
      file: false,
      javascript: false,
      data: false
    });
  });
});
