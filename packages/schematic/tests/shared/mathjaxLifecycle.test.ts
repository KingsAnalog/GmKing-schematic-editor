// @ts-expect-error Vite provides raw text imports at test runtime.
import indexHtml from "../../../../apps/web/index.html?raw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderMathTexInto } from "../../src/shared/mathjax";

interface MathJaxPageConfig {
  loader: {
    load: string[];
    paths: Record<string, string>;
  };
  tex: { packages: Record<string, string[]> };
  output: { font: string };
  svg: { fontCache: string };
  options: { enableMenu: boolean; enableSpeech: boolean; enableBraille: boolean };
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
  it("uses the bundled local SVG renderer and self-contained glyph paths", () => {
    const { html, config } = readMathJaxPageConfig();
    expect(html).toContain("./vendor/mathjax/tex-mml-svg-mathjax-tex.js");
    expect(html).not.toContain("cdn.jsdelivr.net");
    expect(config.loader.paths.fonts).toBe("./vendor");
    expect(config.output.font).toBe("mathjax-tex");
    expect(config.svg.fontCache).toBe("none");
  });

  it("keeps dynamic TeX loads and speech services disabled", () => {
    const { config } = readMathJaxPageConfig();
    expect(config.tex.packages["[-]"]).toEqual(["autoload", "require"]);
    expect(config.options).toMatchObject({ enableMenu: false, enableSpeech: false, enableBraille: false });
  });
});
