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
    const labels = [...document.querySelectorAll(".property-pin-header span, .property-row > span:first-child")]
      .filter(label => label.getBoundingClientRect().width && /^(Show|Show label|Show value)$/.test(label.textContent.trim()))
      .map(label => {
        const text = document.createRange();
        text.selectNodeContents(label);
        return {
          text: label.textContent.trim(),
          lineCount: new Set([...text.getClientRects()].map(rect => rect.top)).size
        };
      });
    return {right:bounds.right,boxes,labels};
  });
  for (const b of layout.boxes) { assert(Math.abs(b.w-b.h)<1); assert(b.x+b.w<=layout.right+1); }
  for (let i=0;i<layout.boxes.length;i++) for(let j=i+1;j<layout.boxes.length;j++) {
    const a=layout.boxes[i],b=layout.boxes[j]; assert(a.x+a.w<=b.x+0.5||b.x+b.w<=a.x+0.5||a.y+a.h<=b.y+0.5||b.y+b.h<=a.y+0.5,"Palette swatches overlap");
  }
  assert(layout.labels.length >= 3);
  for (const label of layout.labels) assert.equal(label.lineCount, 1, JSON.stringify(label));
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
  async function key(key, code, virtualCode, modifiers = 0) {
    for (const type of ["keyDown", "keyUp"]) {
      await page.send("Input.dispatchKeyEvent", { type, key, code, windowsVirtualKeyCode: virtualCode, modifiers });
    }
  }
  async function assertCursor(expected) {
    const state = await evaluate(page, () => {
      const paper = document.querySelector("[data-schematic-paper]");
      const wire = paper.querySelector(".joint-link [joint-selector='line']");
      return {
        name: paper.getAttribute("data-schematic-tool-cursor"),
        paper: getComputedStyle(paper).cursor,
        wire: wire && getComputedStyle(wire).cursor
      };
    });
    assert.equal(state.name, expected);
    if (expected) {
      assert.match(state.paper, /^url\("data:image\/svg\+xml,/);
      if (state.wire) assert.equal(state.wire, state.paper);
    } else assert(!state.paper.includes("data:image/svg+xml"));
  }
  async function moveToWorld(x, y) {
    const point = await evaluate(page, (x,y) => {
      const matrix=document.querySelector('[model-id="horizontal"] [joint-selector="line"]').getScreenCTM();
      const p=new DOMPoint(x,y).matrixTransform(matrix); return {x:p.x,y:p.y};
    }, x,y);
    await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", ...point, button: "none" });
    return point;
  }
  async function clickWorld(x, y, clickCount = 1) {
    const point = await moveToWorld(x, y);
    await page.send("Input.dispatchMouseEvent", { type: "mousePressed", ...point, button: "left", buttons: 1, clickCount });
    await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", ...point, button: "left", buttons: 0, clickCount });
  }
  await clickSelector(page, '[model-id="junction-300-200"]');
  await key("Delete","Delete",46);
  assert.equal((await content()).wires.length,2);
  assert.equal(await evaluate(page, () => !!document.querySelector('[model-id="junction-300-200"]')),false);
  await clickWire("stem"); await key("Delete","Delete",46);
  const deleted = await content(); assert.equal(deleted.wires.length,1);
  await key("w","KeyW",87);
  await clickWorld(300,200); await moveToWorld(300,300); await key("Enter","Enter",13); await key("Escape","Escape",27);
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

  await clickWorld(350, 250);
  await key("w", "KeyW", 87);
  await assertCursor("wire");
  await clickWorld(350, 250);
  await clickWorld(350, 250, 2);
  assert.deepEqual(await content(), redrawn, "Double-clicking the start must not create a zero-length wire");
  await clickWorld(350, 200);
  assert.deepEqual(await content(), redrawn, "A single click on an existing wire must keep the route pending");
  await clickWorld(350, 200, 2);
  const joined = await content();
  assert.equal(joined.wires.length, redrawn.wires.length + 2, "Finishing at an existing wire must split it and add the new branch");
  assert(joined.wires.some(wire => wire.points.every(point => point.x === 350) &&
    wire.points.some(point => point.y === 200) && wire.points.some(point => point.y === 250)));
  await key("Escape", "Escape", 27);
  await clickSelector(page, '[data-command="undo"]');
  assert.deepEqual(await content(), redrawn, "One Undo must remove the double-click route and its junction");
  console.log("[wire-finish] Enter at the preview endpoint and double-click at a wire junction passed");

  await evaluate(page, () => {
    const part = (id, x) => ({ id, ref: id, type: "resistor", x, y: 200, rotation: 0, mirrored: false, values: {} });
    window.interactionEditor.replaceContent(window.authorContent({
      components: [part("R1", 240), part("R2", 400), part("R3", 560)],
      wires: [
        { id: "horizontal", routeMode: "orthogonal", points: [{ x: 100, y: 200 }, { x: 200, y: 200 }] },
        { id: "r2-wire", routeMode: "orthogonal", points: [{ x: 440, y: 200 }, { x: 480, y: 200 }] },
        { id: "scale", routeMode: "orthogonal", points: [{ x: 100, y: 440 }, { x: 680, y: 440 }] }
      ], notes: [], junctionAppearances: [], netLabels: []
    }), { commit: true });
    window.interactionEditor.fit();
    window.interactionEditor.focus();
  });
  const beforeMove = await content();
  const currentRevision = () => evaluate(page, () => window.interactionEditor.getState().revision);
  const beforeMoveRevision = await currentRevision();
  const location = async id => {
    const { x, y } = (await content()).components.find(part => part.id === id);
    return { x, y };
  };
  const assertTool = async text => {
    const summary = await evaluate(page, () => document.querySelector("[data-selection-summary]").textContent);
    assert.match(summary, text);
  };
  await key("m", "KeyM", 77);
  await assertCursor("stretch");
  await assertTool(/Stretch move.*click an object/);
  await clickWorld(240, 200);
  await moveToWorld(240, 300);
  await assertTool(/Stretch move.*click to place/);
  await waitFor(page, () => !!document.querySelector('[model-id="move-preview-R1"]') &&
    !!document.querySelector('[model-id="move-preview-horizontal"]'), "Stretch must preview both the device and the wire");
  assert.deepEqual(await content(), beforeMove, "Preview must keep the committed schematic intact");
  assert.equal(await currentRevision(), beforeMoveRevision);
  await clickWorld(240, 300);
  const firstMove = await content();
  assert.deepEqual(await location("R1"), { x: 240, y: 300 });
  const wireNodes = firstMove.connections.wires.horizontal;
  assert(wireNodes.includes(firstMove.connections.pins.R1.p) &&
    firstMove.wires.find(wire => wire.id === "horizontal").points.some(point => point.x === 200 && point.y === 300));
  await assertTool(/Stretch move.*click an object/);
  await clickWorld(440, 200); // Pick R2 through its pin.
  await assertTool(/Stretch move.*click to place/);
  await clickWorld(400, 310);
  assert.deepEqual(await location("R2"), { x: 400, y: 310 });
  assert.equal(await currentRevision(), beforeMoveRevision + 2);
  await clickWorld(560, 200);
  await moveToWorld(560, 340);
  await key("Escape", "Escape", 27);
  assert.deepEqual(await location("R3"), { x: 560, y: 200 });
  assert.equal(await currentRevision(), beforeMoveRevision + 2);
  await clickSelector(page, '[data-command="undo"]');
  assert.deepEqual(await content(), firstMove, "One Undo must restore only the last placement");

  await clickWorld(240, 300);
  await key("m", "KeyM", 77);
  await assertTool(/Stretch move.*click to place/);
  await clickWorld(240, 340);
  await assertTool(/Selected:.*R1/);
  await assertCursor(null);
  assert.deepEqual(await location("R1"), { x: 240, y: 340 });
  await clickWorld(530, 310);
  await key("M", "KeyM", 77, 8);
  await assertCursor("move-only");
  await assertTool(/Move only.*click an object/);
  for (const [x, y] of [[240, 340], [400, 200]]) {
    await clickWorld(x, y);
    await clickWorld(x, 370);
    await assertTool(/Move only.*click an object/);
  }
  const beforeMoveOnly = await content();
  assert.deepEqual(await location("R2"), { x: 400, y: 370 });
  assert(beforeMoveOnly.wires.find(wire => wire.id === "horizontal").points.some(point => point.x === 200 && point.y === 340));
  assert(!beforeMoveOnly.connections.wires.horizontal.includes(beforeMoveOnly.connections.pins.R1.p));
  await key("Escape", "Escape", 27);
  await clickWorld(400, 370);
  await key("M", "KeyM", 77, 8);
  await assertTool(/Move only.*click to place/);
  await clickWorld(480, 370);
  await assertTool(/Selected:.*R2/);
  assert.deepEqual(await location("R2"), { x: 480, y: 370 });
  assert.deepEqual((await content()).wires, beforeMoveOnly.wires, "Move-only must leave attached wire geometry untouched");

  await clickWorld(530, 310);
  await key("c", "KeyC", 67);
  await assertCursor("copy");
  await assertTool(/Copy.*click an object/);
  await clickWorld(240, 370);
  await clickWorld(280, 250);
  await assertTool(/Copy.*click an object/);
  await clickWorld(350, 270);
  assert.equal((await content()).components.length, 4, "Blank clicks must not duplicate the last picked source");
  await clickWorld(480, 370);
  await clickWorld(480, 260);
  await assertTool(/Copy.*click an object/);
  assert.equal((await content()).components.length, 5);
  await key("Escape", "Escape", 27);
  await clickWorld(560, 200);
  await key("c", "KeyC", 67);
  await assertTool(/Copy.*click to place/);
  await clickWorld(600, 310);
  await assertTool(/Selected:/);
  await clickWorld(620, 250);
  assert.equal((await content()).components.length, 6);
  assert((await content()).components.some(part => part.id !== "R3" && part.x === 600 && part.y === 310));
  console.log("[click-tools] M, Shift+M and C support preselection, repeat pickup, preview, Escape and Undo");

  await assertCursor(null);
  const beforeRotate = await content();
  const beforeRotateRevision = await currentRevision();
  await key("r", "KeyR", 82);
  await assertCursor("rotate");
  assert.equal(await evaluate(page, () => document.querySelector('[data-command="rotate"]').getAttribute("aria-pressed")), "true");
  await assertTool(/Rotate.*click a component/);
  await clickWorld(620, 250);
  await assertTool(/Rotate.*click a component/);
  await clickWorld(240, 370);
  await moveToWorld(280, 390);
  await assertTool(/Rotate.*click to place/);
  await waitFor(page, () => !!document.querySelector('[model-id="rotate-preview-R1"]'),
    "Rotation did not show an uncommitted device preview");
  assert.deepEqual(await content(), beforeRotate);
  assert.equal(await currentRevision(), beforeRotateRevision);
  await clickWorld(280, 390);
  const firstRotation = await content();
  assert.deepEqual(await location("R1"), { x: 280, y: 390 });
  assert.equal(firstRotation.components.find(part => part.id === "R1").rotation, 90);
  assert.deepEqual(firstRotation.wires, beforeRotate.wires);
  await assertCursor("rotate");
  await assertTool(/Rotate.*click a component/);

  await clickWorld(480, 370);
  await clickWorld(480, 370);
  assert.equal((await content()).components.find(part => part.id === "R2").rotation, 90);
  assert.deepEqual(await location("R2"), { x: 480, y: 370 });
  await assertTool(/Rotate.*click a component/);
  await assertCursor("rotate");
  await clickWorld(560, 200);
  await moveToWorld(550, 310);
  await key("Escape", "Escape", 27);
  assert.deepEqual((await content()).components.find(part => part.id === "R3"),
    beforeRotate.components.find(part => part.id === "R3"), "Escape must cancel the pending rotation");
  assert.equal(await currentRevision(), beforeRotateRevision + 2);
  await assertCursor(null);
  await clickSelector(page, '[data-command="undo"]');
  assert.deepEqual(await content(), firstRotation, "One Undo must restore only the last rotation");

  await clickWorld(560, 200);
  await key("r", "KeyR", 82);
  assert.equal((await content()).components.find(part => part.id === "R3").rotation, 90);
  assert.deepEqual(await location("R3"), { x: 560, y: 200 });
  await assertTool(/Selected:.*R3/);
  await assertCursor(null);
  assert.equal(await evaluate(page, () => document.querySelector('[data-command="rotate"]').getAttribute("aria-pressed")), "false");
  await clickWorld(620, 250);
  assert.equal((await content()).components.length, beforeRotate.components.length);
  console.log("[rotate-tool] repeat pickup, one-shot rotation, preview, cursor, Escape and Undo passed");

  await key("Delete", "Delete", 46);
  await assertCursor("delete");
  await key("Escape", "Escape", 27);
  await assertCursor(null);
  console.log("[tool-cursors] Tool switches and selection cursor passed");

  await key("W", "KeyW", 87, 8);
  await assertTool(/Wide wire/);
  await assertCursor("wire");
  await key("Escape", "Escape", 27);

  const isTemporarilyDeleted = async id => Boolean((await content()).components.find(part => part.id === id).temporarilyDeleted);
  await key("Delete", "Delete", 46, 8);
  await assertCursor("plus");
  await assertTool(/Temporary Delete/);
  await clickWorld(560, 200);
  assert.equal(await isTemporarilyDeleted("R3"), true);
  assert.equal(await evaluate(page, () => window.interactionEditor.hasExportableSelection()), false);
  await clickWorld(480, 370);
  assert.equal(await isTemporarilyDeleted("R2"), true);
  await assertCursor("plus");
  await clickWorld(560, 200);
  assert.equal(await isTemporarilyDeleted("R3"), false);
  await key("Escape", "Escape", 27);
  await assertCursor(null);
  await clickWorld(560, 200);
  await key("Delete", "Delete", 46, 8);
  assert.equal(await isTemporarilyDeleted("R3"), true);
  await clickWorld(280, 390);
  await assertTool(/Selected:.*R1/);
  assert.equal(await isTemporarilyDeleted("R1"), false);
  await assertCursor(null);
  console.log("[temporary-delete] Plus cursor, repeated toggle, recovery and one-shot selection passed");

  const dragStart = await moveToWorld(350, 310);
  await page.send("Input.dispatchMouseEvent", { type: "mousePressed", ...dragStart, button: "left", buttons: 1, clickCount: 1 });
  await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: dragStart.x + 70, y: dragStart.y + 30, button: "left", buttons: 1 });
  await assertCursor("selection-box");
  await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: dragStart.x + 70, y: dragStart.y + 30, button: "left", buttons: 0, clickCount: 1 });
  await assertCursor(null);
  await key("w", "KeyW", 87);
  const wireCursorPoint = await wirePoint("horizontal");
  const { x, y } = wireCursorPoint;
  await page.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "middle", buttons: 4, clickCount: 1 });
  assert.equal(await evaluate(page, () =>
    getComputedStyle(document.querySelector('[model-id="horizontal"] [joint-selector="line"]')).cursor), "grabbing");
  await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: x + 40, y: y + 30, button: "middle", buttons: 4 });
  await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: x + 40, y: y + 30, button: "middle", buttons: 0, clickCount: 1 });
  await assertCursor("wire");
  await key("Escape", "Escape", 27);
  console.log("[gesture-cursors] Box selection and panning over a wire passed");

  if (failures.length) throw new AggregateError(failures, "Interaction regressions failed");
} finally {
  if (page) await evaluate(page, () => window.interactionEditor?.destroy()).catch(()=>{});
  page?.close(); await browser?.close(); await server?.close();
  if(path.dirname(path.resolve(output))!==path.resolve(tmpdir())||!path.basename(output).startsWith("schematic-interaction-")) throw new Error("Unexpected smoke output directory");
  await fs.rm(output,{recursive:true,force:true});
}
