import { build } from "esbuild";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launchBrowser, openPage, navigate, evaluate, clickSelector, waitFor, serveDist } from "./browser-smoke.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = await fs.mkdtemp(path.join(tmpdir(), "schematic-persistence-"));
let server, browser;
const pages = [];
try {
  await build({
    absWorkingDir: root,
    stdin: { resolveDir: root, contents: `
      import { renderSchematicTab, initSchematicEditor } from '@edahelper/schematic/web';
      import '@edahelper/schematic/styles/web.css';
      import './apps/web/style.css';
      const root = document.querySelector('#app');
      root.innerHTML = renderSchematicTab();
      const fixture = window.persistenceSmoke = { fail: false, writes: [], editor: null };
      const storage = {
        getItem: key => localStorage.getItem(key), removeItem: key => localStorage.removeItem(key),
        setItem(key, value) {
          fixture.writes.push(key);
          if (fixture.fail && key.startsWith('adc-helper-schematic:')) throw new Error('Simulated quota failure');
          localStorage.setItem(key, value);
        }
      };
      fixture.editor = initSchematicEditor(root, {storage});
    ` },
    outfile: path.join(output, "main.js"), bundle: true, format: "esm", platform: "browser", target: "es2022", logLevel: "silent"
  });
  await fs.writeFile(path.join(output, "index.html"), '<!doctype html><html><head><link rel="stylesheet" href="./main.css"></head><body><div id="app"></div><script type="module" src="./main.js"></script></body></html>');
  server = await serveDist(output);
  browser = await launchBrowser();
  async function mount(page) {
    await navigate(page, server.url);
    await waitFor(page, () => !!window.persistenceSmoke?.editor && !!localStorage.getItem("schematic-workspace"), "Workspace did not initialize");
    await settled(page, "saved");
  }
  async function newPage() {
    const page = await openPage(browser.baseUrl, server.url); pages.push(page);
    await page.send("Page.enable"); await page.send("Runtime.enable");
    await page.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    await mount(page); return page;
  }
  async function reload(page) { await evaluate(page, () => window.persistenceSmoke.editor.destroy()); await mount(page); }
  async function settled(page, state) {
    await waitFor(page, expected => window.persistenceSmoke.editor.getState().saveState === expected, "Unexpected save state", {args:[state]});
  }
  async function edit(page, text) {
    await evaluate(page, text => window.persistenceSmoke.editor.transact(draft => {
      draft.notes = [{id:"n",x:100,y:100,width:200,format:"plain",text}];
    }), text);
  }
  async function snapshot(page) {
    return evaluate(page, () => {
      const state = window.persistenceSmoke.editor.getState();
      const id = JSON.parse(localStorage.getItem("schematic-workspace")).activeDocumentId;
      return { local: state.content.notes[0]?.text, saved: JSON.parse(localStorage.getItem("adc-helper-schematic:"+id)).state.document.notes[0]?.text, revision: state.revision, saveState: state.saveState, canUndo: state.canUndo, canRedo: state.canRedo };
    });
  }
  function assert(condition, message, evidence) { if (!condition) throw new Error(message+" "+JSON.stringify(evidence)); }
  const a = await newPage(); await edit(a,"A"); await settled(a,"saved");
  const b = await newPage();
  await edit(a,"B"); await settled(a,"saved");
  await evaluate(b, () => { window.persistenceSmoke.writes.length=0; window.persistenceSmoke.editor.fit(); });
  await evaluate(b, () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const fit = await snapshot(b);
  const writes = await evaluate(b, () => window.persistenceSmoke.writes);
  assert(fit.saved === "B" && writes.every(key=>key.startsWith("schematic-view:")) && writes.length <= 1, "Fit overwrote content or saved repeatedly", {fit,writes});
  await edit(b,"C"); await settled(b,"failed");
  const conflict = await snapshot(b);
  assert(conflict.local === "C" && conflict.saved === "B" && conflict.canUndo, "Conflict lost a local or saved edit", conflict);
  console.log("[persistence] stale Fit writes only one view; divergent edits preserve both saved and local content");

  await reload(b);
  const before = await snapshot(b);
  await evaluate(b, () => { window.persistenceSmoke.fail=true; });
  await edit(b,"D"); await settled(b,"failed");
  const failed = await snapshot(b);
  assert(failed.local === "D" && failed.saved === "B" && failed.revision === before.revision+1 && failed.canUndo, "Save failure corrupted accepted edit state", failed);
  await evaluate(b, () => window.persistenceSmoke.editor.execute({kind:"undo"})); await settled(b,"saved");
  assert((await snapshot(b)).local === "B", "Undo after failed save failed", await snapshot(b));
  await evaluate(b, () => window.persistenceSmoke.editor.execute({kind:"redo"})); await settled(b,"failed");
  const retryRevision = (await snapshot(b)).revision;
  await evaluate(b, () => { window.persistenceSmoke.fail=false; });
  await clickSelector(b, "[data-schematic-storage-retry]"); await settled(b,"saved");
  const retried = await snapshot(b);
  assert(retried.saved === "D" && retried.revision === retryRevision, "Retry created another edit or lost content", retried);
  console.log("[persistence] quota failure advances local revision once, keeps Undo/Redo, and retries without adding history");

  await reload(a); await reload(b);
  await Promise.all([edit(a,"E"),edit(b,"F")]);
  await waitFor(a, () => window.persistenceSmoke.editor.getState().saveState !== "pending", "First racing write did not finish");
  await waitFor(b, () => window.persistenceSmoke.editor.getState().saveState !== "pending", "Second racing write did not finish");
  const race = [await snapshot(a),await snapshot(b)];
  assert(race.filter(state=>state.saveState==="saved").length===1 && race.filter(state=>state.saveState==="failed").length===1, "Concurrent writes were not protected", race);
  assert(race.every(state=>state.saved===race.find(candidate=>candidate.saveState==="saved").local), "Stored content does not match winning write", race);
  console.log("[persistence] simultaneous browser writes accept one version and report the conflicting version");
} finally {
  for (const page of pages) { try { await evaluate(page, () => window.persistenceSmoke?.editor?.destroy()); } catch {} page.close(); }
  await browser?.close(); await server?.close();
  if (path.dirname(path.resolve(output)) !== path.resolve(tmpdir()) || !path.basename(output).startsWith("schematic-persistence-")) throw new Error("Unexpected test directory");
  await fs.rm(output, {recursive:true, force:true});
}
