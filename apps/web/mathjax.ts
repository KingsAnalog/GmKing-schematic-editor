type MathJaxWindow = Window & typeof globalThis & {
  MathJax?: {
    startup?: { promise?: Promise<unknown> };
    typesetPromise?: (elements?: Element[]) => Promise<unknown>;
  };
};

function mathJaxConfig() {
  return {
    loader: { paths: { fonts: "./vendor" } },
    output: { font: "mathjax-tex" },
    tex: {
      packages: { "[-]": ["autoload", "require"] },
      inlineMath: [["\\(", "\\)"]],
      displayMath: [["\\[", "\\]"]]
    },
    svg: { fontCache: "none" },
    options: {
      enableMenu: false,
      enableEnrichment: false,
      enableSpeech: false,
      enableBraille: false,
      a11y: { speech: false, braille: false }
    },
    startup: { typeset: false }
  };
}

export function createWebMathJaxLoader(ownerWindow: MathJaxWindow) {
  let pending: Promise<boolean> | undefined;
  return () => {
    if (pending) return pending;
    if (ownerWindow.MathJax?.typesetPromise) return Promise.resolve(true);

    const { document } = ownerWindow;
    const script = document.createElement("script");
    script.src = new URL("./vendor/mathjax/tex-svg-mathjax-tex-4.1.3-4869dec38fd2.js", document.baseURI).href;
    script.async = true;
    Object.assign(ownerWindow, { MathJax: mathJaxConfig() });
    pending = new Promise<void>((resolve, reject) => {
      script.addEventListener("load", () => {
        const startup = ownerWindow.MathJax?.startup?.promise;
        if (startup) void startup.then(() => resolve(), reject);
        else reject();
      }, { once: true });
      script.addEventListener("error", reject, { once: true });
      document.head.append(script);
    }).then(() => {
      if (!ownerWindow.MathJax?.typesetPromise) throw new Error("MathJax startup did not install typesetting");
      ownerWindow.dispatchEvent(new ownerWindow.Event("mathjax-ready"));
      return true;
    }).catch(() => {
      script.remove();
      delete ownerWindow.MathJax;
      pending = undefined;
      return false;
    });
    return pending;
  };
}
