import { build } from "esbuild";
import { promises as fs } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { launchBrowser, openPage, navigate, evaluate, clickSelector, waitFor, serveDist } from "../../../scripts/browser-smoke.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const output = await fs.mkdtemp(path.join(tmpdir(), "schematic-obsidian-note-"));
let server, browser, page;
try {
  await build({
    absWorkingDir: root,
    entryPoints: ["apps/obsidian/tests/browser/noteEditing.ts"],
    outfile: path.join(output, "main.js"),
    bundle: true, format: "esm", platform: "browser", target: "es2022",
    alias: { obsidian: path.join(root, "apps/obsidian/tests/obsidianMock.ts") },
    logLevel: "silent"
  });
  await fs.writeFile(path.join(output, "index.html"), '<!doctype html><html><head><link rel="stylesheet" href="./main.css"><style>body{font-family:Arial;margin:16px}.cm-editor{border:1px solid #bbb}.schematic-editor-block{min-height:300px}button{margin:8px}</style></head><body><button id="outside">Outside editor</button><div id="app"></div><script type="module" src="./main.js"></script></body></html>');
  server = await serveDist(output);
  browser = await launchBrowser();
  page = await openPage(browser.baseUrl, server.url);
  await page.send("Page.enable");
  await page.send("Runtime.enable");
  await page.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 1000, deviceScaleFactor: 1, mobile: false });
  await navigate(page, server.url);
  await waitFor(page, () => !!window.noteSmoke, "Obsidian test host did not initialize");
  await clickSelector(page, "[data-schematic-session]");
  await evaluate(page, () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await evaluate(page, () => window.noteSmoke.coordinator.activeEditor().execute({ kind: "note" }));
  await waitFor(page, () => document.activeElement?.matches("[data-note-editor]"), "New Note did not enter editing");
  await evaluate(page, () => { window.originalNoteInput = document.activeElement; });
  for (const [text, total] of [["First", "First"], [" second", "First second"], [" third", "First second third"]]) {
    await page.send("Input.insertText", { text });
    await waitFor(page, expected => window.noteSmoke.view.state.doc.toString().includes(expected), "Note autosave did not write text", { args: [total] });
    await evaluate(page, () => new Promise(resolve => setTimeout(resolve, 600)));
    const state = await evaluate(page, () => ({ ...window.noteSmoke.snapshot(), sameInput: document.activeElement === window.originalNoteInput }));
    console.log(JSON.stringify({ text: state.text, editing: state.editing, focused: state.focused, caret: state.caret }));
    if (state.text !== total || state.textarea !== total || !state.editing || !state.focused || !state.sameInput) {
      throw new Error("Note lost its editing session across a typing pause: " + JSON.stringify(state));
    }
  }
  await evaluate(page, () => document.querySelector("[data-note-editor]").setSelectionRange(6, 12));
  await page.send("Input.insertText", { text: "第二段" });
  await waitFor(page, () => window.noteSmoke.view.state.doc.toString().includes("First 第二段 third"), "Middle-of-text edit was not saved");
  await evaluate(page, () => new Promise(resolve => setTimeout(resolve, 600)));
  const middle = await evaluate(page, () => window.noteSmoke.snapshot());
  if (!middle.editing || !middle.focused || middle.caret !== 9) throw new Error("Autosave lost the middle caret: " + JSON.stringify(middle));
  await page.send("Input.insertText", { text: "!" });
  await clickSelector(page, "#outside");
  const done = await evaluate(page, () => window.noteSmoke.snapshot());
  if (done.editing) throw new Error("An intentional outside click did not finish Note editing");
  if (done.text !== "First 第二段! third") throw new Error("Outside click did not save the pending text");
  await evaluate(page, () => window.noteSmoke.coordinator.activeEditor().execute({ kind: "undo" }));
  await waitFor(page, () => window.noteSmoke.coordinator.activeEditor().getContent().notes[0].text === "First 第二段 third", "CodeMirror Undo failed");
  await evaluate(page, () => window.noteSmoke.coordinator.activeEditor().execute({ kind: "redo" }));
  await waitFor(page, () => window.noteSmoke.coordinator.activeEditor().getContent().notes[0].text === "First 第二段! third", "CodeMirror Redo failed");
  console.log("[obsidian-note] repeated typing, autosave, focus, caret, outside blur and Undo/Redo passed");
  await checkStaticPreview(page);
} finally {
  page?.close();
  await browser?.close();
  await server?.close();
  if (path.dirname(path.resolve(output)) !== path.resolve(tmpdir()) || !path.basename(output).startsWith("schematic-obsidian-note-")) throw new Error("Unexpected test output directory");
  await fs.rm(output, { recursive: true, force: true });
}

async function checkStaticPreview(page) {
  async function open(version) {
    await clickSelector(page, "[data-schematic-session]");
    const text = await evaluate(page, () => window.noteSmoke.coordinator.activeEditor()?.getContent().notes[0]?.text);
    if (text !== `Preview ${version}`) throw new Error(`Reopening preview ${version} loaded ${text}`);
  }
  async function close(version) {
    // Click Markdown text inside CodeMirror, which freezes the schematic into its static SVG.
    await clickSelector(page, ".cm-content > .cm-line:last-child");
    const state = await evaluate(page, () => ({
      active: !!window.noteSmoke.coordinator.activeEditor(),
      svg: document.querySelector(".schematic-static-svg")?.textContent,
      saved: JSON.parse(window.noteSmoke.view.state.doc.toString().split("```json\n")[1].split("```")[0]).schematic.notes[0].text
    }));
    if (state.active || state.svg !== `Preview ${version}` || state.saved !== `Preview ${version}`) {
      throw new Error(`Static preview ${version} is stale: ${JSON.stringify(state)}`);
    }
  }
  for (const version of ["A", "B", "C"]) {
    if (version !== "A") await open(version === "B" ? "A" : "B");
    await evaluate(page, version => {
      window.noteSmoke.coordinator.activeEditor().transact(draft => {
        draft.notes = [{ id: "preview-note", x: 100, y: 100, width: 200, height: 40, format: "plain", text: `Preview ${version}` }];
        if (version === "B") draft.wires = [
          { id: "left", routeMode: "orthogonal", points: [{ x: 0, y: 0 }, { x: 40, y: 0 }], appearance: { variant: "signal", startMarker: "arrow" } },
          { id: "right", routeMode: "orthogonal", points: [{ x: 80, y: 0 }, { x: 40, y: 0 }] },
          { id: "branch", routeMode: "orthogonal", points: [{ x: 40, y: 0 }, { x: 40, y: 40 }] }
        ];
      }, { origin: "editor", reason: "preview-regression" });
    }, version);
    await close(version);
    await open(version);
    await close(version);
  }
  await open("C");
  await evaluate(page, () => window.noteSmoke.coordinator.activeEditor().execute({ kind: "undo" }));
  await close("B");
  await open("B");
  await evaluate(page, () => window.noteSmoke.coordinator.activeEditor().execute({ kind: "redo" }));
  await close("C");
  console.log("[obsidian-preview] A/B/C, no-edit reactivation and CodeMirror Undo/Redo always render the latest saved version");
}
