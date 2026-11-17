import { build } from "esbuild";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { launchBrowser, openPage, navigate, evaluate, clickSelector, waitFor, serveDist } from "./browser-smoke.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = await fs.mkdtemp(path.join(tmpdir(), "schematic-interaction-"));
let browser, server, page;
const failures = [];
try {
  await build({
    absWorkingDir: root, stdin: { resolveDir: root, contents: `
      import { renderSchematicTab, initSchematicEditor } from '@edahelper/schematic/web';
      import { createSchematicDocument, contentFromDocument } from '@edahelper/schematic/core';
      import '@edahelper/schematic/styles/web.css';
      import './apps/web/style.css';
      const root = document.querySelector('#app'); root.innerHTML = renderSchematicTab();
      window.interactionEditor = initSchematicEditor(root);
      window.authorContent = input => contentFromDocument(createSchematicDocument(input));
    ` }, outfile: path.join(output, "main.js"), bundle: true, format: "esm", platform: "browser", target: "es2022", logLevel: "silent"
  });
  await fs.writeFile(path.join(output, "index.html"), '<!doctype html><html><head><link rel="stylesheet" href="./main.css"><style>html{font-size:19px}body{word-break:break-word;overflow-wrap:anywhere}button{height:30px}</style></head><body><div id="app"></div><script type="module" src="./main.js"></script></body></html>');
  server = await serveDist(output); browser = await launchBrowser();
  page = await openPage(browser.baseUrl, server.url);
  await page.send("Page.enable"); await page.send("Runtime.enable");
  await page.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await navigate(page, server.url);
  await waitFor(page, () => !!window.interactionEditor && !!localStorage.getItem("schematic-workspace"), "Editor did not initialize");
  await evaluate(page, () => {
    const part = (id, type, x, y) => ({ id, ref: id, type, x, y, rotation: 0, mirrored: false, values: {} });
    window.interactionEditor.replaceContent(window.authorContent({
      components: [part("delay", "delay", 440, 120), part("adc", "adc", 440, 260)],
      wires: [
        { id: "w1", routeMode: "orthogonal", points: [{x:100,y:120},{x:240,y:120}] },
        { id: "w2", routeMode: "freeAngle", points: [{x:100,y:220},{x:160,y:240},{x:240,y:220}] },
        { id: "w3", routeMode: "orthogonal", points: [{x:100,y:320},{x:220,y:320}] }
      ], notes: [], junctionAppearances: [], netLabels: []
    }), { commit: true });
    window.interactionEditor.fit();
  });
  const content = () => evaluate(page, () => window.interactionEditor.getContent());
  async function wirePoint(id) {
    return evaluate(page, id => {
      const path = document.querySelector('[model-id="' + id + '"] [joint-selector="line"]');
      const matrix = path.getScreenCTM(), point = path.getPointAtLength(30).matrixTransform(matrix);
      return { x: point.x, y: point.y, scale: Math.hypot(matrix.a, matrix.b) };
    }, id);
  }
  async function clickWire(id, modifiers = 0) {
    const { x, y } = await wirePoint(id);
    await page.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1, modifiers });
    await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", buttons: 0, clickCount: 1, modifiers });
  }
  async function dragWire(id, cancel = false) {
    const p = await wirePoint(id);
    await page.send("Input.dispatchMouseEvent", { type: "mousePressed", x: p.x, y: p.y, button: "left", buttons: 1, clickCount: 1 });
    for (const t of [0.25, 0.5, 1]) await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: p.x + 40 * p.scale * t, y: p.y + 20 * p.scale * t, button: "left", buttons: 1 });
    if (cancel) {
      await page.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
      await page.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    }
    await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: p.x + 40 * p.scale, y: p.y + 20 * p.scale, button: "left", buttons: 0, clickCount: 1 });
  }
  await clickWire("w1"); await clickWire("w2", 8);
  const before = await content();
  const revision = await evaluate(page, () => window.interactionEditor.getState().revision);
  await dragWire("w1");
  const moved = await content();
  for (const id of ["w1", "w2"]) assert.deepEqual(moved.wires.find(w=>w.id===id).points, before.wires.find(w=>w.id===id).points.map(p => ({x:p.x+40,y:p.y+20})), "Selected wire was not translated as a whole: " + id);
  assert.deepEqual(moved.wires.find(w=>w.id==="w3"), before.wires.find(w=>w.id==="w3")); assert.deepEqual(moved.components, before.components);
  assert.equal(await evaluate(page, () => window.interactionEditor.getState().revision), revision + 1);
  await clickSelector(page, '[data-command="undo"]'); assert.deepEqual(await content(), before);
  await clickSelector(page, '[data-command="redo"]'); assert.deepEqual(await content(), moved);
  await clickWire("w1"); await clickWire("w2", 8);
  await dragWire("w1", true); assert.deepEqual(await content(), moved, "Escape did not restore the group");
  console.log("[wire-group] real mouse group drag, Undo/Redo and Escape passed");
  await clickWire("w1"); await dragWire("w1");
  const single = await content();
  assert.deepEqual(single.wires[1], moved.wires[1]);
  try {
    assert.deepEqual(single.wires[0].points, moved.wires[0].points.map(p => ({x:p.x,y:p.y+20})), "Dragging a horizontal wire must move its segment by 20px vertically");
    console.log("[wire-segment] real mouse single-segment movement passed");
  } catch (error) {
    failures.push(error);
    console.error("[wire-segment] FAILED:", error.message);
  }

  await clickSelector(page, '[model-id="delay"]');
  await evaluate(page, () => {
    const select = document.querySelector('[data-property-variant]');
    select.value = "transmission-line"; select.dispatchEvent(new Event("change", {bubbles:true}));
  });
  assert.equal((await content()).components[0].variantId, "transmission-line");
  for (const rotation of [0, 90, 180, 270]) for (const mirrored of [false, true]) {
    await evaluate(page, (rotation, mirrored) => window.interactionEditor.transact(draft => Object.assign(draft.components[0], {rotation, mirrored})), rotation, mirrored);
    const box = await evaluate(page, () => {
      const body = document.querySelector('[model-id="delay"] [joint-selector="symbolBody"]');
      const b = body.getBBox(), stroke = Number(getComputedStyle(body).strokeWidth.replace("px", ""));
      return { w:b.width+stroke, h:b.height+stroke, stroke, d:body.getAttribute("d") };
    });
    assert.equal(box.stroke, 4); assert(box.w <= 80 && box.h <= 40); assert(box.d.includes("A 8 8"));
  }
  console.log("[delay] transmission line UI, 2a stroke and 4x2 footprint at every rotation/mirror passed");
  await clickSelector(page, '[model-id="adc"]');
  const layout = await evaluate(page, () => {
    const control = document.querySelector('[data-property-component-color-row] .property-color-control');
    const bounds = control.getBoundingClientRect();
    const boxes = [...control.querySelectorAll('button,input[type=color]')].map(e => { const b=e.getBoundingClientRect(); return {x:b.x,y:b.y,w:b.width,h:b.height}; });
    const labels = [...document.querySelectorAll('.property-pin-header span,.property-row > span:first-child')].filter(e=>e.getBoundingClientRect().width && /^(Show|Show label|Show value)$/.test(e.textContent.trim())).map(e=>({text:e.textContent.trim(),h:e.getBoundingClientRect().height,line:parseFloat(getComputedStyle(e).lineHeight)||parseFloat(getComputedStyle(e).fontSize)*1.25}));
    return {right:bounds.right,boxes,labels};
  });
  for (const b of layout.boxes) { assert(Math.abs(b.w-b.h)<1); assert(b.x+b.w<=layout.right+1); }
  for (let i=0;i<layout.boxes.length;i++) for(let j=i+1;j<layout.boxes.length;j++) {
    const a=layout.boxes[i],b=layout.boxes[j]; assert(a.x+a.w<=b.x+0.5||b.x+b.w<=a.x+0.5||a.y+a.h<=b.y+0.5||b.y+b.h<=a.y+0.5,"Palette swatches overlap");
  }
  assert(layout.labels.length>=3); for(const label of layout.labels) assert(label.h<=label.line+1,JSON.stringify(label));
  console.log("[properties] host button height and word-breaking do not distort colors or Show labels");

  // Use actual mouse/keyboard routing, deletion, history and reload for detached junctions.
  await evaluate(page, () => {
    window.interactionEditor.replaceContent(window.authorContent({ components: [], notes: [], netLabels: [], junctionAppearances: [],
      wires: [
        { id: "horizontal", routeMode: "orthogonal", points: [{x:200,y:200},{x:400,y:200}] },
        { id: "stem", routeMode: "orthogonal", points: [{x:300,y:200},{x:300,y:300}] }
      ] }), { commit: true });
    window.interactionEditor.fit();
  });
  async function key(key, code, virtualCode) {
    await page.send("Input.dispatchKeyEvent", { type:"keyDown", key, code, windowsVirtualKeyCode:virtualCode });
    await page.send("Input.dispatchKeyEvent", { type:"keyUp", key, code, windowsVirtualKeyCode:virtualCode });
  }
  async function clickWorld(x, y) {
    const p = await evaluate(page, (x,y) => {
      const matrix=document.querySelector('[model-id="horizontal"] [joint-selector="line"]').getScreenCTM();
      const p=new DOMPoint(x,y).matrixTransform(matrix); return {x:p.x,y:p.y};
    }, x,y);
    await page.send("Input.dispatchMouseEvent", {type:"mouseMoved",...p,button:"none"});
    await page.send("Input.dispatchMouseEvent", {type:"mousePressed",...p,button:"left",buttons:1,clickCount:1});
    await page.send("Input.dispatchMouseEvent", {type:"mouseReleased",...p,button:"left",buttons:0,clickCount:1});
  }
  await clickSelector(page, '[model-id="junction-300-200"]');
  await key("Delete","Delete",46);
  assert.equal((await content()).wires.length,2);
  assert.equal(await evaluate(page, () => !!document.querySelector('[model-id="junction-300-200"]')),false);
  await clickWire("stem"); await key("Delete","Delete",46);
  const deleted = await content(); assert.equal(deleted.wires.length,1);
  await key("w","KeyW",87);
  await clickWorld(300,200); await clickWorld(300,300); await key("Enter","Enter",13); await key("Escape","Escape",27);
  const redrawn = await content(); assert.equal(redrawn.wires.length,3);
  assert.equal(await evaluate(page, () => !!document.querySelector('[model-id="junction-300-200"]')),true);
  assert(!JSON.stringify(redrawn).includes("noConnect"));
  await clickSelector(page,'[data-command="undo"]'); assert.deepEqual(await content(),deleted);
  await clickSelector(page,'[data-command="redo"]'); assert.deepEqual(await content(),redrawn);
  await evaluate(page, () => window.interactionEditor.destroy());
  await navigate(page,server.url);
  await waitFor(page, () => !!window.interactionEditor && !!document.querySelector('[model-id="junction-300-200"]'), "Redrawn junction did not survive reload");
  assert.deepEqual(await content(),redrawn);
  console.log("[connections] delete junction, delete branch, redraw, Undo/Redo and reload passed with real mouse and keyboard events");
  if (failures.length) throw new AggregateError(failures, "Interaction regressions failed");
} finally {
  if (page) await evaluate(page, () => window.interactionEditor?.destroy()).catch(()=>{});
  page?.close(); await browser?.close(); await server?.close();
  if(path.dirname(path.resolve(output))!==path.resolve(tmpdir())||!path.basename(output).startsWith("schematic-interaction-")) throw new Error("Unexpected smoke output directory");
  await fs.rm(output,{recursive:true,force:true});
}
