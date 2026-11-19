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
  components: [
    { id: "R1", type: "resistor", ref: "R1", x: 300, y: 200, rotation: 0, mirrored: false, values: { main: "1k" } }
  ]
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
    localStorage.setItem("schematic-workspace", JSON.stringify({ activeDocumentId: "smoke", documents: [{ id: "smoke", title: "Netlist smoke" }] }));
    localStorage.setItem("adc-helper-schematic:smoke", JSON.stringify({
      format: "adc-helper/schematic-workspace-snapshot",
      state: { document: snapshot, zoom: 1, viewTranslate: { x: 0, y: 0 }, presentationMode: false }
    }));
  }, content);
  await navigate(page, server.url);
  await waitFor(page, () => Boolean(document.querySelector("[model-id='R1']")), "saved resistor did not restore");
  await clickSelector(page, "[data-command='netlist']");
  await waitFor(page, () => document.querySelector("[data-right-panel='netlist']")?.hidden === false, "netlist tab did not open");
  await waitFor(page, () => (document.querySelector("[data-netlist-diagnostics-list]")?.childElementCount ?? 0) > 0, "diagnostics did not render");
  const state = await evaluate(page, () => ({
    status: document.querySelector("[data-netlist-status]")?.textContent,
    code: document.querySelector("[data-netlist-code]")?.textContent,
    diagnostics: document.querySelectorAll(".netlist-diagnostic").length,
    blocked: document.querySelector("[data-netlist-status]")?.getAttribute("data-state")
  }));
  if (state.blocked !== "blocked" || state.diagnostics < 1) throw new Error("netlist panel did not block: " + JSON.stringify(state));
  const shot = await page.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  await fs.writeFile(path.join(outDir, "r2-netlist-blocked.png"), Buffer.from(shot.data, "base64"));

  await clickSelector(page, "[data-netlist-format='spectre']");
  const format = await evaluate(page, () => document.querySelector("[data-netlist-format='spectre']")?.getAttribute("aria-pressed"));
  if (format !== "true") throw new Error("format did not switch");
  await clickSelector(page, "[data-right-view='diagnostics']");
  await waitFor(page, () => document.querySelector("[data-right-panel='diagnostics']")?.hidden === false, "diagnostics tab did not open");
  const shot2 = await page.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  await fs.writeFile(path.join(outDir, "r2-diagnostics.png"), Buffer.from(shot2.data, "base64"));
  await clickSelector(page, "[data-netlist-diagnostic-component]");
  await waitFor(page, () => (document.querySelector("[data-schematic-status]")?.textContent ?? "").includes("Selected R1"), "diagnostic did not select the component");
  console.log(JSON.stringify({ state, format, ok: true }));
} finally {
  page?.close();
  await browser?.close();
  await server.close();
}
