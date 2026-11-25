import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { clickSelector, evaluate, launchBrowser, navigate, openPage, serveDist, waitFor } from "./browser-smoke.mjs";

const server = await serveDist(fileURLToPath(new URL("../apps/web/dist", import.meta.url)));
let browser, page;
try {
  browser = await launchBrowser();
  page = await openPage(browser.baseUrl, "about:blank");
  await viewport(1440);
  await navigate(page, server.url);
  await waitFor(page, () => !!document.querySelector("[data-schematic-paper] svg"), "Editor did not initialize");
  await clickSelector(page, '[data-command="note"]');
  const draft = "[data-schematic-note-dialog][open]";
  assert.equal(await evaluate(page, () => document.querySelector("[data-note-anchor]").value), "lowerLeft");
  assert.equal(await evaluate(page, () => document.querySelector("[data-note-anchor]").options.length), 9);
  const mixed = String.raw`偏置 Bias \(V_{GS}=0.8\,\mathrm V\)` + "\n" + String.raw`\[g_m=\frac{2I_D}{V_{OV}}\]`;
  await evaluate(page, text => {
    document.querySelector("[data-note-text]").value = text;
    document.querySelector("[data-note-font-size]").value = "18";
  }, mixed);
  await key("Enter", "Enter", 13);
  assert.equal(await evaluate(page, draft => !!document.querySelector(draft), draft), false);
  const point = await canvasPoint(220, 205);
  await move(point);
  const marker = await evaluate(page, () => {
    const dot = document.querySelector("[data-routing-snap]");
    return { x: Number(dot.getAttribute("cx")), y: Number(dot.getAttribute("cy")), visible: !dot.parentElement.hasAttribute("hidden") };
  });
  assert(marker.visible);
  await clickAt(point);
  await waitFor(page, () => document.querySelector(".schematic-note-content svg path"), "MathJax did not render a Note formula");
  const notes = await savedNotes();
  assert.equal(notes[0].anchor, "lowerLeft");
  assert.equal(notes[0].fontSizePx, 18);
  const noteSelector = `[data-note-id="${notes[0].id}"]`;
  assert.deepEqual(await evaluate(page, selector => {
    const note = document.querySelector(selector);
    return { x: parseFloat(note.style.left), y: parseFloat(note.style.top), visible: true };
  }, noteSelector), marker);
  assert(await evaluate(page, selector => document.querySelector(selector).textContent.includes("偏置 Bias"), noteSelector));
  assert(!(await evaluate(page, selector => document.querySelector(selector).textContent, noteSelector)).includes("mathrm"));

  await clickSelector(page, "[data-sidebar-tab='properties']");
  const inside = await evaluate(page, selector => {
    const r = document.querySelector(selector).getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, noteSelector);
  await clickAt(inside);
  await clickAt(inside, 2);
  assert.equal(await evaluate(page, selector => !!document.querySelector(selector + " textarea, " + selector + " [contenteditable=true]"), noteSelector), false);
  const updated = String.raw`更新 Gain \(A_v=-g_m R_D\)`;
  await evaluate(page, text => {
    const input = document.querySelector("[data-property-note-text]");
    input.value = text;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    const anchor = document.querySelector("[data-property-note-anchor]");
    anchor.value = "upperRight";
    anchor.dispatchEvent(new Event("change", { bubbles: true }));
  }, updated);
  await waitFor(page, selector => document.querySelector(selector)?.textContent.includes("更新 Gain") &&
    !!document.querySelector(selector + " .schematic-note-content svg path"), "Note properties did not re-render", { args: [noteSelector] });
  assert.equal((await savedNotes())[0].text, updated);
  assert.equal((await savedNotes())[0].anchor, "upperRight");
  assert.equal((await savedNotes())[0].x, notes[0].x);
  assert.equal((await savedNotes())[0].y, notes[0].y);

  await evaluate(page, () => document.querySelector("[data-schematic-paper]").focus());
  await key("c", "KeyC", 67);
  const copyPoint = await canvasPoint(410, 310);
  await move(copyPoint);
  await waitFor(page, () => !!document.querySelector(".schematic-note-copy-preview svg path"), "Copy preview did not preserve TeX");
  await clickAt(copyPoint);
  await waitFor(page, () => document.querySelectorAll(".schematic-note:not(.schematic-note-copy-preview)").length === 2, "Copy placement did not create a Note");
  await key("Escape", "Escape", 27);
  await waitFor(page, () => {
    const { activeDocumentId } = JSON.parse(localStorage.getItem("schematic-workspace"));
    return JSON.parse(localStorage.getItem("adc-helper-schematic:" + activeDocumentId)).state.document.notes.length === 2;
  }, "Copied Note did not save");
  const copy = (await savedNotes()).find(item => item.id !== notes[0].id);
  assert.equal(copy.anchor, "upperRight");
  assert.equal(copy.x - notes[0].x, 190);
  assert.equal(copy.y - notes[0].y, 100);
  const copiedNote = `[data-note-id="${copy.id}"]`;
  const dragStart = await evaluate(page, selector => {
    const r = document.querySelector(selector).getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, copiedNote);
  const dragEnd = { x: dragStart.x + 50, y: dragStart.y + 30 };
  await move(dragStart);
  await page.send("Input.dispatchMouseEvent", { type: "mousePressed", ...dragStart, button: "left", buttons: 1, clickCount: 1 });
  await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", ...dragEnd, button: "left", buttons: 1 });
  await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", ...dragEnd, button: "left", buttons: 0, clickCount: 1 });
  await waitFor(page, (id, x) => {
    const { activeDocumentId } = JSON.parse(localStorage.getItem("schematic-workspace"));
    return JSON.parse(localStorage.getItem("adc-helper-schematic:" + activeDocumentId)).state.document.notes.some(note => note.id === id && note.x === x);
  }, "Dragged Note did not save its new anchor", { args: [copy.id, copy.x + 50] });
  const moved = (await savedNotes()).find(item => item.id === copy.id);
  assert.equal(moved.anchor, "upperRight");
  assert.equal(moved.x, copy.x + 50);
  assert.equal(moved.y, copy.y + 30);

  await clickAt(await canvasPoint(550, 220));
  await key("m", "KeyM", 77);
  const originalBody = await evaluate(page, selector => {
    const r = document.querySelector(selector).getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, noteSelector);
  await clickAt(originalBody);
  const moveDestination = await canvasPoint(370, 180);
  await move(moveDestination);
  await waitFor(page, () => !!document.querySelector('.schematic-note-copy-preview svg path'),
    "Click-move preview dropped the TeX formula");
  await clickAt(moveDestination);
  assert.match(await evaluate(page, () => document.querySelector("[data-selection-summary]").textContent), /Stretch move.*click an object/);
  await waitFor(page, (id, x) => {
    const { activeDocumentId } = JSON.parse(localStorage.getItem("schematic-workspace"));
    return JSON.parse(localStorage.getItem("adc-helper-schematic:" + activeDocumentId)).state.document.notes.some(note => note.id === id && note.x === x);
  }, "Click-moved Note did not save its new anchor", { args: [notes[0].id, notes[0].x + 150] });
  const movedOriginal = (await savedNotes()).find(item => item.id === notes[0].id);
  assert.equal(movedOriginal.x - notes[0].x, 150);
  assert.equal(movedOriginal.y - notes[0].y, -30);
  assert.equal(movedOriginal.anchor, "upperRight");
  await key("Escape", "Escape", 27);
  await key("c", "KeyC", 67);
  await clickAt(await canvasPoint(345, 190));
  await waitFor(page, () => /Copy.*click to place/.test(document.querySelector("[data-selection-summary]").textContent),
    "Copy did not pick up the note in repeat mode");
  const overOtherNote = await evaluate(page, selector => {
    const rect = document.querySelector(selector).getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }, copiedNote);
  await clickAt(overOtherNote);
  await waitFor(page, () => document.querySelectorAll(".schematic-note:not(.schematic-note-copy-preview)").length === 3,
    "A copy did not commit when dropped over a note");
  assert.match(await evaluate(page, () => document.querySelector("[data-selection-summary]").textContent), /Copy.*click an object/);
  await key("Escape", "Escape", 27);
  await clickSelector(page, '[data-command="undo"]');
  await waitFor(page, () => document.querySelectorAll(".schematic-note:not(.schematic-note-copy-preview)").length === 2,
    "Undo did not remove the copy");

  await evaluate(page, () => {
    const create = URL.createObjectURL.bind(URL);
    URL.createObjectURL = blob => {
      if (blob.type.startsWith("image/svg+xml")) void blob.text().then(svg => { window.noteSvg = svg; });
      if (blob.type === "image/png") void blob.arrayBuffer().then(value => { window.notePng = [...new Uint8Array(value, 0, 8)]; });
      return create(blob);
    };
  });
  await exportFile("svg");
  await waitFor(page, () => !!window.noteSvg, "SVG not generated");
  const exported = await evaluate(page, () => window.noteSvg);
  assert.match(exported, /data-note-id=.*?data-mml-node=/s);
  assert(!exported.includes("\\(") && !exported.includes("foreignObject"));
  await exportFile("png");
  await waitFor(page, () => !!window.notePng, "PNG not generated");
  assert.deepEqual(await evaluate(page, () => window.notePng), [137, 80, 78, 71, 13, 10, 26, 10]);

  await clickSelector(page, "[data-schematic-open-options]");
  await evaluate(page, () => {
    for (const [selector, value] of [["[data-schematic-language-select]", "zh"], ["[data-schematic-theme-select]", "dark"]]) {
      const field = document.querySelector(selector);
      field.value = value;
      field.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });
  await clickSelector(page, "[data-schematic-options-close]");
  await viewport(375);
  await evaluate(page, () => document.querySelector("[data-schematic-paper]").focus());
  await key("N", "KeyN", 78, 8);
  await waitFor(page, draft => !!document.querySelector(draft), "Shift+N did not open the dialog", { args: [draft] });
  assert(await evaluate(page, draft => {
    const modal = document.querySelector(draft);
    const rect = modal.getBoundingClientRect();
    return rect.left >= 0 && rect.right <= innerWidth && modal.scrollWidth <= modal.clientWidth &&
      document.documentElement.dataset.effectiveTheme === "dark" && modal.textContent.includes("定位点");
  }, draft));
  await key("Escape", "Escape", 27);
  assert.equal(await evaluate(page, draft => !!document.querySelector(draft), draft), false);
  await clickAt(await canvasPoint(200, 185));
  for (const [shortcut, code, virtualCode, modifiers, summary] of [
    ["M", "KeyM", 77, 8, /仅移动.*点选或框选对象/],
    ["c", "KeyC", 67, 0, /复制.*点选或框选对象/]
  ]) {
    await key(shortcut, code, virtualCode, modifiers);
    assert.match(await evaluate(page, () => document.querySelector("[data-selection-summary]").textContent), summary);
    await key("Escape", "Escape", 27);
  }
  console.log("Note TeX passed: nine anchors, snap placement, properties, anchor-aware copy and move, local MathJax, SVG and PNG, and 375px dark mode.");
} finally {
  page?.close();
  await browser?.close();
  await server.close();
}

function viewport(width) {
  return page.send("Emulation.setDeviceMetricsOverride", { width, height: 980, deviceScaleFactor: 1, mobile: width < 600 });
}
async function key(key, code, windowsVirtualKeyCode, modifiers = 0) {
  for (const type of ["keyDown", "keyUp"]) await page.send("Input.dispatchKeyEvent", { type, key, code, windowsVirtualKeyCode, modifiers });
}
function canvasPoint(x, y) {
  return evaluate(page, (x, y) => {
    const bounds = document.querySelector("[data-schematic-paper]").getBoundingClientRect();
    return { x: bounds.x + x, y: bounds.y + y };
  }, x, y);
}
function move(point) {
  return page.send("Input.dispatchMouseEvent", { type: "mouseMoved", ...point });
}
async function clickAt(point, clickCount = 1) {
  await move(point);
  for (const type of ["mousePressed", "mouseReleased"]) await page.send("Input.dispatchMouseEvent", { type, ...point, button: "left", clickCount });
}
function savedNotes() {
  return evaluate(page, () => {
    const { activeDocumentId } = JSON.parse(localStorage.getItem("schematic-workspace"));
    return JSON.parse(localStorage.getItem("adc-helper-schematic:" + activeDocumentId)).state.document.notes;
  });
}
async function exportFile(format) {
  await clickSelector(page, "[data-schematic-document-export]");
  await clickSelector(page, '[data-schematic-document-export-dialog][open] [data-schematic-export-format="' + format + '"]');
}
