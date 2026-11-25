import { afterEach, describe, expect, it, vi } from "vitest";
import { renderMathTexInto } from "../../src/shared/mathjax";

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
