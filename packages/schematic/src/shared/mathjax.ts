/** Typesets each group with the MathJax instance belonging to its own window. */
export function typesetMath(elements: Element | Element[]) {
  const groups = new Map<Window, Element[]>();
  for (const element of Array.isArray(elements) ? elements : [elements]) {
    const ownerWindow = element.ownerDocument.defaultView;
    if (!ownerWindow) continue;
    const targets = groups.get(ownerWindow) ?? [];
    targets.push(element);
    groups.set(ownerWindow, targets);
  }
  for (const [ownerWindow, targets] of groups) {
    const mathJax = ownerWindow.MathJax;
    if (!mathJax?.typesetPromise) continue;
    mathJax.typesetClear?.(targets);
    mathJax.typesetPromise(targets).catch(() => {});
  }
}

const renderTokens = new WeakMap<Element, number>();
const texRenderTokens = new WeakMap<Element, number>();
const mathJaxReadyPromises = new WeakMap<Window, Promise<boolean>>();
const MATHJAX_READY_TIMEOUT_MS = 3000;

function waitForMathJax(ownerWindow: Window) {
  if (ownerWindow.MathJax?.typesetPromise) return Promise.resolve(true);
  const existing = mathJaxReadyPromises.get(ownerWindow);
  if (existing) return existing;
  const pending = new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      ownerWindow.removeEventListener("mathjax-ready", finish);
      ownerWindow.clearTimeout(timeout);
      resolve(Boolean(ownerWindow.MathJax?.typesetPromise));
    };
    const timeout = ownerWindow.setTimeout(finish, MATHJAX_READY_TIMEOUT_MS);
    ownerWindow.MathJax?.startup?.promise?.then(finish).catch(finish);
    ownerWindow.addEventListener("mathjax-ready", finish, { once: true });
  });
  mathJaxReadyPromises.set(ownerWindow, pending);
  void pending.then(() => {
    if (mathJaxReadyPromises.get(ownerWindow) === pending) mathJaxReadyPromises.delete(ownerWindow);
  });
  return pending;
}

function waitForMathJaxOrAbort(ownerWindow: Window, signal?: AbortSignal) {
  if (signal?.aborted) return Promise.resolve(false);
  const pending = waitForMathJax(ownerWindow);
  if (!signal) return pending;
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (ready: boolean) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", abort);
      resolve(ready);
    };
    const abort = () => finish(false);
    signal.addEventListener("abort", abort, { once: true });
    pending.then(finish).catch(() => finish(false));
  });
}

function createMathStage(ownerDocument: Document, mathHtml: string) {
  const stage = ownerDocument.createElement("span");
  stage.className = "schematic-math-stage";
  stage.textContent = mathHtml;
  ownerDocument.body.appendChild(stage);
  return stage;
}

export async function renderMathHtmlInto(
  element: HTMLElement,
  mathHtml: string,
  options: { signal?: AbortSignal } = {}
) {
  if (options.signal?.aborted) return false;
  const token = (renderTokens.get(element) ?? 0) + 1;
  renderTokens.set(element, token);
  const ownerDocument = element.ownerDocument;
  const ownerWindow = ownerDocument.defaultView;
  if (!ownerWindow || !(await waitForMathJaxOrAbort(ownerWindow, options.signal))) return false;
  const mathJax = ownerWindow.MathJax;
  if (options.signal?.aborted || !mathJax?.typesetPromise || element.ownerDocument !== ownerDocument) return false;

  const stage = createMathStage(ownerDocument, mathHtml);
  try {
    await mathJax.typesetPromise([stage]);
    if (options.signal?.aborted || renderTokens.get(element) !== token || element.ownerDocument !== ownerDocument) return false;
    if (!stage.querySelector("mjx-container, svg")) return false;
    if (stage.querySelector('mjx-merror, [data-mjx-error], [data-mml-node="merror"]')) return false;

    const renderedNodes = Array.from(stage.childNodes);
    mathJax.typesetClear?.([element]);
    element.replaceChildren(...renderedNodes);
    return true;
  } catch {
    // Keep the previous rendered formula visible if the new TeX fails to render.
    return false;
  } finally {
    mathJax.typesetClear?.([stage]);
    stage.remove();
  }
}

export async function renderMathTexInto(
  element: HTMLElement,
  tex: string,
  options: { display?: boolean; signal?: AbortSignal } = {}
) {
  if (options.signal?.aborted) return false;
  const token = (texRenderTokens.get(element) ?? 0) + 1;
  texRenderTokens.set(element, token);
  const source = tex.trim();
  const fallback = options.display ? `$$${source}$$` : `$${source}$`;
  element.textContent = fallback;
  element.setAttribute("aria-label", source || "Empty formula");
  element.classList.remove("is-math-error");
  const rendered = await renderMathHtmlInto(
    element,
    options.display ? `\\[${source}\\]` : `\\(${source}\\)`,
    { signal: options.signal }
  );
  if (options.signal?.aborted || texRenderTokens.get(element) !== token) return false;
  element.classList.toggle("is-math-error", !rendered);
  return rendered;
}

/** Produces a vector formula in the target window without attaching an editor. */
export async function renderMathSvg(doc: Document, tex: string, options: { display: boolean; signal?: AbortSignal }) {
  const ownerWindow = doc.defaultView;
  if (!ownerWindow || !(await waitForMathJaxOrAbort(ownerWindow, options.signal))) return null;
  if (options.signal?.aborted) return null;
  try {
    const mathJax = ownerWindow.MathJax;
    let container: HTMLElement;
    if (mathJax?.tex2svg) {
      try {
        container = mathJax.tex2svg(tex, { display: options.display });
      } catch (error) {
        if (!mathJax.tex2svgPromise) throw error;
        container = await mathJax.tex2svgPromise(tex, { display: options.display });
      }
    } else if (mathJax?.tex2svgPromise) {
      container = await mathJax.tex2svgPromise(tex, { display: options.display });
    } else {
      container = doc.createElement("span");
      await renderMathTexInto(container, tex, options);
    }
    if (options.signal?.aborted || container.querySelector('mjx-merror, [data-mjx-error], [data-mml-node="merror"]')) return null;
    return container.querySelector<SVGSVGElement>("svg");
  } catch {
    return null;
  }
}
