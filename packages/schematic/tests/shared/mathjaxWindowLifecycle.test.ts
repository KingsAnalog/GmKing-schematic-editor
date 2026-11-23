// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { registerMathJaxLoader, renderMathTexInto, typesetMath } from "../../src/shared/mathjax";
import { createWebMathJaxLoader } from "../../../../apps/web/mathjax";

function frame() {
  const iframe = document.createElement("iframe");
  document.body.appendChild(iframe);
  const ownerWindow = iframe.contentWindow! as Window & typeof globalThis;
  const target = ownerWindow.document.createElement("div");
  ownerWindow.document.body.appendChild(target);
  return { ownerWindow, target };
}

function mathRuntime(ownerWindow: Window) {
  const runtime = {
    typesetClear: vi.fn((_targets: Element[] = []) => {}),
    typesetPromise: vi.fn(async (targets: Element[] = []) => {
      for (const target of targets) {
        target.replaceChildren(ownerWindow.document.createElement("mjx-container"));
      }
    })
  };
  ownerWindow.MathJax = runtime;
  return runtime;
}

afterEach(() => {
  delete window.MathJax;
  document.body.replaceChildren();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("MathJax window ownership", () => {
  it("requests the local runtime only on demand, coalesces loads and retries on network or startup failure", async () => {
    const { ownerWindow, target } = frame();
    const doc = target.ownerDocument;
    const base = doc.createElement("base");
    base.href = "https://example.test/tools/schematic/";
    doc.head.append(base);
    const load = createWebMathJaxLoader(ownerWindow);
    const script = () => doc.head.querySelector<HTMLScriptElement>("script")!;
    expect(script()).toBeNull();
    const first = load();
    expect(load()).toBe(first);
    expect(script().src).toBe("https://example.test/tools/schematic/vendor/mathjax/tex-mml-svg-mathjax-tex.js");
    expect(ownerWindow.MathJax).toMatchObject({
      loader: { paths: { fonts: "./vendor" } },
      output: { font: "mathjax-tex" },
      svg: { fontCache: "none" },
      tex: { packages: { "[-]": ["autoload", "require"] } },
      options: { enableMenu: false, enableSpeech: false, enableBraille: false },
      startup: { typeset: false }
    });
    script().dispatchEvent(new Event("error"));
    await expect(first).resolves.toBe(false);
    expect(script()).toBeNull();
    const retry = load();
    ownerWindow.MathJax!.startup!.promise = Promise.reject(new Error("Startup failed"));
    script().dispatchEvent(new Event("load"));
    await expect(retry).resolves.toBe(false);
    expect(script()).toBeNull();
    const working = load();
    mathRuntime(ownerWindow);
    ownerWindow.MathJax!.startup = { promise: Promise.resolve() };
    script().dispatchEvent(new Event("load"));
    await expect(working).resolves.toBe(true);
    expect(load()).toBe(working);
  });

  it("waits for the first analysis result and skips old output cleared while loading", async () => {
    const { ownerWindow, target } = frame();
    const stale = ownerWindow.document.createElement("output");
    ownerWindow.document.body.append(stale);
    const load = createWebMathJaxLoader(ownerWindow);
    registerMathJaxLoader(ownerWindow, load);
    target.textContent = "\\[x\\]";
    stale.textContent = "\\[y\\]";
    typesetMath([target, stale]);
    expect(target.ownerDocument.querySelectorAll("script")).toHaveLength(1);
    stale.textContent = "";
    const runtime = mathRuntime(ownerWindow);
    ownerWindow.MathJax!.startup = { promise: Promise.resolve() };
    target.ownerDocument.head.querySelector("script")!.dispatchEvent(new Event("load"));
    await vi.waitFor(() => expect(runtime.typesetPromise).toHaveBeenCalledWith([target]));
    expect(stale.firstChild).toBeNull();
  });

  it("uses each target's window for typesetting, staging and cleanup", async () => {
    const first = frame();
    const second = frame();
    const firstMath = mathRuntime(first.ownerWindow);
    const secondMath = mathRuntime(second.ownerWindow);
    const globalMath = mathRuntime(window);
    typesetMath([first.target, second.target]);
    expect(firstMath.typesetPromise).toHaveBeenCalledWith([first.target]);
    expect(secondMath.typesetPromise).toHaveBeenCalledWith([second.target]);
    expect(globalMath.typesetPromise).not.toHaveBeenCalled();

    await expect(renderMathTexInto(first.target, "x")).resolves.toBe(true);
    const stage = firstMath.typesetPromise.mock.calls[1][0]![0];
    expect(stage.ownerDocument).toBe(first.ownerWindow.document);
    expect(first.target.firstElementChild?.tagName.toLowerCase()).toBe("mjx-container");
    expect(stage.isConnected).toBe(false);
    expect(firstMath.typesetClear.mock.calls.some(([elements]) => elements?.[0] === stage)).toBe(true);
    expect(globalMath.typesetClear).not.toHaveBeenCalled();
  });

  it("waits independently for two windows to become ready", async () => {
    const first = frame();
    const second = frame();
    const one = renderMathTexInto(first.target, "a");
    let secondFinished = false;
    const two = renderMathTexInto(second.target, "b").then(result => {
      secondFinished = true;
      return result;
    });
    mathRuntime(first.ownerWindow);
    first.ownerWindow.dispatchEvent(new Event("mathjax-ready"));
    await expect(one).resolves.toBe(true);
    expect(secondFinished).toBe(false);
    expect(second.target.textContent).toBe("$b$");

    mathRuntime(second.ownerWindow);
    second.ownerWindow.dispatchEvent(new Event("mathjax-ready"));
    await expect(two).resolves.toBe(true);
  });

  it("shares one readiness wait within a window while allowing one render to abort", async () => {
    const { ownerWindow, target } = frame();
    const other = ownerWindow.document.createElement("div");
    ownerWindow.document.body.appendChild(other);
    const addListener = vi.spyOn(ownerWindow, "addEventListener");
    const removeListener = vi.spyOn(ownerWindow, "removeEventListener");
    const controller = new AbortController();
    const first = renderMathTexInto(target, "a", { signal: controller.signal });
    const second = renderMathTexInto(other, "b");
    expect(addListener.mock.calls.filter(call => call[0] === "mathjax-ready")).toHaveLength(1);
    controller.abort();
    await expect(first).resolves.toBe(false);
    const runtime = mathRuntime(ownerWindow);
    ownerWindow.dispatchEvent(new Event("mathjax-ready"));
    await expect(second).resolves.toBe(true);
    expect(target.querySelector("mjx-container")).toBeNull();
    expect(runtime.typesetPromise).toHaveBeenCalledOnce();
    expect(removeListener.mock.calls.filter(call => call[0] === "mathjax-ready")).toHaveLength(1);
  });

  it("allows a fresh wait after a readiness timeout", async () => {
    vi.useFakeTimers();
    const { ownerWindow, target } = frame();
    const removeListener = vi.spyOn(ownerWindow, "removeEventListener");
    const timedOut = renderMathTexInto(target, "a");
    await vi.advanceTimersByTimeAsync(3001);
    await expect(timedOut).resolves.toBe(false);
    expect(removeListener.mock.calls.filter(call => call[0] === "mathjax-ready")).toHaveLength(1);

    const retry = renderMathTexInto(target, "b");
    mathRuntime(ownerWindow);
    ownerWindow.dispatchEvent(new Event("mathjax-ready"));
    await expect(retry).resolves.toBe(true);
  });

  it("uses the startup promise of the owning window", async () => {
    const { ownerWindow, target } = frame();
    let ready!: () => void;
    ownerWindow.MathJax = { startup: { promise: new Promise<void>(resolve => { ready = resolve; }) } };
    const rendering = renderMathTexInto(target, "x");
    mathRuntime(ownerWindow);
    ready();
    await expect(rendering).resolves.toBe(true);
  });

  it("does not publish an old render after the element moves to another document", async () => {
    const first = frame();
    const second = frame();
    let finish!: () => void;
    const gate = new Promise<void>(resolve => { finish = resolve; });
    const runtime = mathRuntime(first.ownerWindow);
    runtime.typesetPromise.mockImplementation(async (targets = []) => {
      await gate;
      targets[0].replaceChildren(first.ownerWindow.document.createElement("mjx-container"));
    });
    const rendering = renderMathTexInto(first.target, "x");
    await vi.waitFor(() => expect(runtime.typesetPromise).toHaveBeenCalledOnce());
    const stage = runtime.typesetPromise.mock.calls[0][0]![0];
    second.ownerWindow.document.body.appendChild(first.target);
    finish();
    await expect(rendering).resolves.toBe(false);
    expect(first.target.querySelector("mjx-container")).toBeNull();
    expect(stage.isConnected).toBe(false);
    expect(runtime.typesetClear.mock.calls.some(([elements]) => elements?.[0] === stage)).toBe(true);
  });
});
