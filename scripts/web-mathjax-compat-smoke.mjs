import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { brotliCompressSync, constants, gunzipSync, gzipSync } from "node:zlib";
import { createSchematicDocument } from "../packages/schematic/dist/schematic/document/documentModel.js";
import { serializeSchematicContent } from "../packages/schematic/dist/schematic/schematicDocumentCodec.js";
import { clickSelector, evaluate, launchBrowser, navigate, openPage, serveDist, waitFor } from "./browser-smoke.mjs";

const formulas = [
  { display: false, tex: String.raw`V_{GS}=\frac{2 I_D}{g_m},\quad \sqrt[3]{\alpha+\beta^2}` },
  { display: true, tex: String.raw`\begin{aligned} H(s)&=\frac{1}{1+sRC} \\ Z_{in}(s)&=R+\frac{1}{sC} \end{aligned}` },
  { display: false, tex: String.raw`\newcommand{\gain}{\mathcal{A}_v}\gain=\mathbf{G}_{\lambda}^{2}\qquad\text{中文 English}` },
  { display: true, tex: String.raw`\left\langle\mathbb{R},\mathfrak{g}\right\rangle \qquad \widehat{\Gamma}+\sum_{k=1}^{n}k` },
  { display: false, tex: String.raw`\frac{1` }
];
const anchors = ["lowerLeft", "upperRight", "centerCenter", "lowerRight"];
const documentJson = serializeSchematicContent(createSchematicDocument({
  notes: formulas.slice(0, -1).map(({ tex, display }, i) => ({
    id: "math-parity-" + i, text: "中文 English " + (display ? "\\[" + tex + "\\]" : "\\(" + tex + "\\)"),
    x: 390 + (i % 2) * 280, y: 180 + i * 100, width: 200, fontSizePx: 18, anchor: anchors[i]
  }))
}));
const baseline = process.argv[2];
const current = fileURLToPath(new URL("../apps/web/dist/", import.meta.url));
const browser = await launchBrowser();
try {
  const before = baseline ? await checkBuild(resolve(baseline)) : undefined;
  const after = await checkBuild(current, { checkPromiseMethods: true });
  console.log(JSON.stringify({ baseline: before?.network, current: after.network,
    fileBytes: { baseline: before?.sizes, current: after.sizes } }, null, 2));
  if (before) {
    assert.deepEqual(after.runtime.packages, before.runtime.packages, "Enabled TeX packages differ");
    assert.deepEqual(after.runtime.formulas, before.runtime.formulas, "MathJax SVG, metrics, accessibility or error output differs");
    assert.deepEqual(after.notes, before.notes, "Canvas formula SVG or Note anchor geometry differs");
    comparePng(after.png, before.png);
    assert(after.sizes.gzip9 < before.sizes.gzip9 && after.sizes.brotli11 < before.sizes.brotli11);
    console.log("Baseline and new build match in formula geometry, error/accessible output and Note anchors.");
  }
} finally {
  await browser.close();
}

async function checkBuild(root, { checkPromiseMethods = false } = {}) {
  const { server, responses, runtimePath, sizes } = await serveCompressedBuild(root);
  let page;
  try {
    console.log("Checking", runtimePath);
    page = await newPage(server.url);
    const cold = requestsSince(responses, 0);
    assert(!cold.files.some(file => file.includes("vendor/mathjax/")), "Cold blank page downloaded MathJax");
    assert.equal(await evaluate(page, () => typeof window.MathJax), "undefined");
    const beforeFormula = responses.length;
    await evaluate(page, json => {
      const files = new DataTransfer();
      files.items.add(new File([json], "formula-parity.sch.json", { type: "application/json" }));
      const input = document.querySelector("[data-schematic-document-import-input]");
      input.files = files.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }, documentJson);
    await waitForNotes(page);
    const firstFormula = requestsSince(responses, beforeFormula);
    assert.deepEqual(firstFormula.files, [runtimePath]);
    assert.equal(firstFormula.bodyBytes, sizes.brotli11);
    console.log("  loaded formula sheet with one Brotli response");

    const runtime = await evaluate(page, async () => {
      const mj = window.MathJax;
      await mj.startup.promise;
      const methods = ["typesetPromise", "typesetClear", "tex2svg", "tex2svgPromise"];
      return {
        version: mj.version, font: mj.startup.document.outputJax.font.constructor.NAME,
        fontCache: mj.config.svg.fontCache, methods: methods.every(name => typeof mj[name] === "function"),
        packages: mj.startup.document.inputJax.find(jax => jax.name === "TeX").options.packages
      };
    });
    console.log("  checked startup and typesetting APIs");
    const readFormulas = (formulas, usePromise) => {
        const mj = window.MathJax;
        const read = container => {
          const svg = container.querySelector("svg");
          return {
            viewBox: svg.getAttribute("viewBox"), width: svg.getAttribute("width"),
            height: svg.getAttribute("height"), baseline: svg.style.verticalAlign,
            role: svg.getAttribute("role"), hidden: svg.getAttribute("aria-hidden"),
            accessibility: [...container.attributes].filter(a => /^(aria-|role$|tabindex$)/.test(a.name))
              .map(a => [a.name, a.value]),
            paths: [...svg.querySelectorAll("path[d]")].map(path => path.getAttribute("d")).filter(Boolean),
            text: svg.textContent,
            errors: [...svg.querySelectorAll('[data-mml-node="merror"]')].map(node => node.getAttribute("data-mjx-error"))
          };
        };
        return usePromise
          ? Promise.all(formulas.map(({ tex, display }) => mj.tex2svgPromise(tex, { display }).then(read)))
          : formulas.map(({ tex, display }) => read(mj.tex2svg(tex, { display })));
    };
    runtime.formulas = await evaluate(page, readFormulas, formulas, false);
    if (checkPromiseMethods) {
      const asyncFormulas = await evaluate(page, readFormulas, formulas, true);
      assert.deepEqual(asyncFormulas, runtime.formulas);
      assert(await evaluate(page, async () => {
        const stage = document.createElement("span");
        stage.className = "schematic-math-stage";
        stage.textContent = "\\(x^2\\)";
        document.body.append(stage);
        try {
          await window.MathJax.typesetPromise([stage]);
          return !!stage.querySelector("mjx-container svg path");
        } finally {
          window.MathJax.typesetClear([stage]);
          stage.remove();
        }
      }));
    }
    assert.equal(runtime.version, "4.1.3");
    assert.equal(runtime.font, "MathJaxTex");
    assert.equal(runtime.fontCache, "none");
    assert(runtime.methods);
    assert(!runtime.packages.includes("require") && !runtime.packages.includes("autoload"));
    assert(runtime.formulas.slice(0, -1).every(sample => sample.paths.length && !sample.errors.length));
    assert(runtime.formulas.at(-1).errors.length > 0);
    console.log("  formula samples, invalid TeX and accessibility checks passed");
    const notes = await evaluate(page, () => [...document.querySelectorAll("[data-note-id]")].map(note => ({
      id: note.dataset.noteId,
      position: [note.style.left, note.style.top, note.style.transform],
      size: [note.style.width, note.style.height],
      label: note.querySelector(".schematic-note-content").getAttribute("aria-label"),
      formulas: [...note.querySelectorAll(".schematic-note-content svg")].map(svg =>
        ["x", "y", "width", "height", "viewBox"].map(attribute => svg.getAttribute(attribute)))
    })));

    await evaluate(page, () => {
      const original = URL.createObjectURL.bind(URL);
      URL.createObjectURL = blob => {
        if (blob.type.startsWith("image/svg+xml")) void blob.text().then(svg => { window.compatSvg = svg; });
        if (blob.type === "image/png") window.compatPng = blob;
        return original(blob);
      };
    });
    await exportAs(page, "svg");
    await waitFor(page, () => !!window.compatSvg, "SVG export did not finish");
    const svg = await evaluate(page, () => window.compatSvg);
    console.log("  captured full SVG");
    await checkOfflineSvg(svg);
    console.log("  opened SVG in an offline page");
    await exportAs(page, "png");
    await waitFor(page, () => !!window.compatPng, "PNG export did not finish");
    console.log("  captured full PNG");
    const png = await evaluate(page, async () => {
      const image = await createImageBitmap(window.compatPng);
      const canvas = new OffscreenCanvas(image.width, image.height);
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      if (!pixels.some((value, i) => i % 4 === 0 && value < 150 && pixels[i + 3] > 0)) {
        throw new Error("Raster export has no visible ink");
      }
      const compressed = new Blob([pixels]).stream().pipeThrough(new CompressionStream("gzip"));
      const blob = await new Response(compressed).blob();
      const reader = new FileReader();
      const rgba = await new Promise((resolve, reject) => {
        reader.onload = () => resolve(reader.result.split(",")[1]);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
      return { size: [image.width, image.height], rgba };
    });
    const formulaSession = requestsSince(responses, beforeFormula);
    if (checkPromiseMethods) {
      assert.deepEqual(formulaSession.files, [runtimePath], "Conversions or exports requested another file");
    }
    assert.deepEqual(page.externalRequests, []);

    const beforeReturn = responses.length;
    const returned = await newPage(server.url);
    try {
      await waitForNotes(returned);
      const cached = requestsSince(responses, beforeReturn);
      assert(!cached.files.includes(runtimePath), "Returning to a formula sheet transferred the cached runtime again");
      assert.deepEqual(returned.externalRequests, []);
      console.log("Formula restore, HTTP cache, offline SVG and full PNG passed.");
      return { runtime, notes, png, sizes, network: { cold, firstFormula, formulaSession, cached } };
    } finally {
      await closePage(returned);
    }
  } finally {
    if (page) await closePage(page);
    await server.close();
  }
}

function comparePng(current, baseline) {
  assert.deepEqual(current.size, baseline.size, "Exported PNG dimensions differ");
  const [width, height] = current.size;
  const after = gunzipSync(Buffer.from(current.rgba, "base64"));
  const before = gunzipSync(Buffer.from(baseline.rgba, "base64"));
  assert.equal(after.length, width * height * 4);
  assert.equal(before.length, after.length);
  let changed = 0;
  let maxDelta = 0;
  for (let i = 0; i < after.length; i += 4) {
    const delta = Math.max(
      Math.abs(after[i] - before[i]), Math.abs(after[i + 1] - before[i + 1]),
      Math.abs(after[i + 2] - before[i + 2]), Math.abs(after[i + 3] - before[i + 3])
    );
    if (delta) changed++;
    maxDelta = Math.max(maxDelta, delta);
  }
  // The official bundle emits additional SVG groups. Rounding their nested
  // transforms can change Chromium's antialiasing at a few glyph edges.
  assert(changed <= width * height * 0.001 && maxDelta <= 8,
    `PNG differs beyond edge antialiasing: ${changed} pixels, maximum channel delta ${maxDelta}`);
  console.log(`PNG parity: ${width}×${height}, ${changed} edge pixels differ, maximum channel delta ${maxDelta}/255.`);
}

async function serveCompressedBuild(root) {
  const vendor = join(root, "vendor/mathjax");
  const names = (await readdir(vendor)).filter(name => name.endsWith(".js"));
  assert.equal(names.length, 1);
  const runtimePath = "vendor/mathjax/" + names[0];
  const responses = [];
  const resources = new Map();
  for (const entry of await readdir(root, { recursive: true })) {
    const path = entry.replaceAll("\\", "/");
    const extension = path.split(".").at(-1);
    const mime = { js: "text/javascript", css: "text/css", html: "text/html" }[extension];
    if (!mime) continue;
    const raw = await readFile(join(root, entry));
    const br = brotliCompressSync(raw, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } });
    resources.set(path, { br, raw, mime, etag: '"' + createHash("sha256").update(raw).digest("hex") + '"' });
  }
  const asset = resources.get(runtimePath);
  const sizes = { raw: asset.raw.length, gzip9: gzipSync(asset.raw, { level: 9 }).length, brotli11: asset.br.length };
  const server = await serveDist(root, {
    base: "/tools/schematic/",
    intercept(path, response) {
      const file = path || "index.html";
      const content = resources.get(file);
      if (!content) {
        response.writeHead(404, { connection: "close" }).end();
        if (!file.endsWith("favicon.ico")) responses.push({ file, bytes: 0 });
        return true;
      }
      const acceptsBrotli = response.req.headers["accept-encoding"]?.includes("br");
      const body = acceptsBrotli ? content.br : content.raw;
      const headers = { "content-type": content.mime, "etag": content.etag, "vary": "Accept-Encoding", connection: "close",
        "cache-control": file.includes("/") ? "public, max-age=31536000, immutable" : "no-cache" };
      if (response.req.headers["if-none-match"] === content.etag) {
        responses.push({ file, bytes: 0 });
        response.writeHead(304, headers).end();
      } else {
        if (acceptsBrotli) headers["content-encoding"] = "br";
        responses.push({ file, bytes: body.length });
        response.writeHead(200, { ...headers, "content-length": body.length }).end(body);
      }
      return true;
    }
  });
  return { server, responses, runtimePath, sizes };
}

async function newPage(url) {
  const origin = new URL(url).origin;
  const page = await openPage(browser.baseUrl, "about:blank");
  const external = [];
  page.externalRequests = external;
  page.socket.addEventListener("message", event => {
    if (typeof event.data !== "string") return;
    const message = JSON.parse(event.data);
    if (message.method !== "Network.requestWillBeSent") return;
    const url = new URL(message.params.request.url);
    if (/^https?:$/.test(url.protocol) && url.origin !== origin) external.push(url.href);
  });
  await page.send("Network.enable");
  await page.send("Network.setBlockedURLs", { urls: ["https://*"] });
  await page.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await navigate(page, url);
  await waitFor(page, () => document.readyState === "complete" && !!document.querySelector("[data-schematic-paper] svg"), "Web editor did not settle");
  return page;
}

async function checkOfflineSvg(svg) {
  const page = await openPage(browser.baseUrl, "about:blank");
  try {
    await page.send("Network.enable");
    await page.send("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
    await page.send("Page.navigate", { url: "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg) });
    await waitFor(page, () => document.documentElement.localName === "svg" &&
      document.querySelectorAll("[data-note-id] svg").length === 4, "Standalone offline SVG did not open");
    assert(await evaluate(page, () => {
      const formulas = [...document.querySelectorAll("[data-note-id] svg")];
      return formulas.every(svg => svg.querySelector("[data-mml-node] path") && [...svg.querySelectorAll("[href], [xlink\\:href]")]
        .every(node => (node.getAttribute("href") ?? node.getAttribute("xlink:href")).startsWith("#")));
    }));
  } finally {
    await closePage(page);
  }
}

async function closePage(page) {
  try {
    await page.send("Page.close");
  } catch {
    // Chromium may close the DevTools socket before acknowledging Page.close.
  } finally {
    page.close();
  }
}

async function waitForNotes(page) {
  await waitFor(page, () => document.querySelectorAll(".schematic-note-content svg").length === 4,
    "The formula sheet did not typeset");
}

async function exportAs(page, format) {
  await clickSelector(page, "[data-schematic-document-export]");
  await clickSelector(page, `[data-schematic-export-format="${format}"]`);
}

function requestsSince(responses, start) {
  const entries = responses.slice(start);
  return { files: entries.map(entry => entry.file), bodyBytes: entries.reduce((sum, entry) => sum + entry.bytes, 0) };
}
