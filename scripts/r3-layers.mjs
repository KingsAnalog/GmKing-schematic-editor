import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serveDist, launchBrowser, openPage, navigate, clickSelector, waitFor, evaluate } from "./browser-smoke.mjs";

const here = fileURLToPath(new URL(".", import.meta.url));
const dist = path.resolve(here, "../apps/web/dist");
const outDir = path.resolve(here, "../../../.tmp-shots");
await fs.mkdir(outDir, { recursive: true });
const { createSchematicDocument, contentFromDocument } = await import("../packages/schematic/dist/schematic/document/documentModel.js");
const content = contentFromDocument(createSchematicDocument({
  components: [{ id: "R1", type: "resistor", ref: "R1", x: 300, y: 200, rotation: 0, mirrored: false, values: { main: "1k" } }]
}));
const server = await serveDist(dist);
const browser = await launchBrowser();
let page;
try {
  page = await openPage(browser.baseUrl, server.url);
  await page.send("Page.enable");
  await page.send("Runtime.enable");
  await page.send("Emulation.setDeviceMetricsOverride", { width: 1600, height: 980, deviceScaleFactor: 1, mobile: false });
  await navigate(page, server.url);
  await waitFor(page, () => Boolean(document.querySelector("[data-schematic-paper] svg")), "editor did not mount");
  await evaluate(page, (snapshot) => {
    localStorage.setItem("schematic-workspace", JSON.stringify({ activeDocumentId: "layers", documents: [{ id: "layers", title: "Layers" }] }));
    localStorage.setItem("adc-helper-schematic:layers", JSON.stringify({
      format: "adc-helper/schematic-workspace-snapshot",
      state: { document: snapshot, zoom: 1, viewTranslate: { x: 0, y: 0 }, presentationMode: false }
    }));
  }, content);
  await navigate(page, server.url);
  await waitFor(page, () => Boolean(document.querySelector("[data-layer='component']")), "component layer was not tagged");
  await clickSelector(page, "[data-sidebar-tab='layers']");
  await waitFor(page, () => document.querySelector("[data-sidebar-panel='layers']")?.hidden === false, "layers panel did not open");
  const before = await evaluate(page, () => ({
    tabs: [...document.querySelectorAll("[data-sidebar-tab]")].map(tab => tab.textContent),
    font: getComputedStyle(document.querySelector(".schematic-palette")).fontFamily,
    display: getComputedStyle(document.querySelector("[data-layer='component']")).display
  }));
  await evaluate(page, () => {
    const input = document.querySelector("[data-layer-toggle='component']");
    if (input) {
      input.checked = false;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });
  await new Promise((resolve) => setTimeout(resolve, 200));
  const after = await evaluate(page, () => ({
    display: getComputedStyle(document.querySelector("[data-layer='component']")).display,
    hidden: document.querySelector(".schematic-shell")?.classList.contains("is-layer-hidden-component")
  }));
  await evaluate(page, () => document.querySelector("[data-command='analysis']")?.click());
  await waitFor(page, () => Boolean(document.querySelector("[data-analysis='compute'] sub")), "analysis compute subscripts did not render");
  const compute = await evaluate(page, () => ({
    text: document.querySelector("[data-analysis='compute']")?.textContent,
    subscripts: [...document.querySelectorAll("[data-analysis='compute'] sub")].map(item => item.textContent)
  }));
  const shot = await page.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  await fs.writeFile(path.join(outDir, "r3-layers.png"), Buffer.from(shot.data, "base64"));
  if (!before.tabs.includes("Layers") || !before.font.includes("Microsoft YaHei") || after.display !== "none" || !after.hidden) {
    throw new Error("layers/font check failed: " + JSON.stringify({ before, after }));
  }
  if (compute.subscripts.join(",") !== "IN,out") {
    throw new Error("compute button subscripts are wrong: " + JSON.stringify(compute));
  }
  console.log(JSON.stringify({ before, after, compute, ok: true }));
} finally {
  page?.close();
  await browser?.close();
  await server.close();
}
