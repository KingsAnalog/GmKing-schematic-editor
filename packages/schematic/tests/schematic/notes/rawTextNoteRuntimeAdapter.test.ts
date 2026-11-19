// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { rawTextNoteRuntimeAdapter } from "../../../src/schematic/notes/rawTextNoteRuntimeAdapter";

describe("raw-text note styles and export", () => {
  it.each([false, true])("preserves whitespace in standalone exports and restores the host (existing class: %s)", async (hadClass) => {
    const style = document.createElement("style");
    style.textContent = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../../../src/schematic/schematicCore.css"), "utf8");
    document.head.append(style);
    const root = document.createElement("div");
    root.className = "schematic-editor-root";
    const host = document.createElement("div");
    host.className = "schematic-note-content host-owned";
    if (hadClass) host.classList.add("schematic-note-raw-markdown-content");
    host.style.whiteSpace = "nowrap";
    const originalClasses = host.className;
    root.append(host);
    document.body.append(root);
    const text = "line 1  with spaces\n  **line 2** <literal>";
    const runtime = await rawTextNoteRuntimeAdapter.create({
      noteId: "raw", host, markdown: text, editable: false,
      onChange: vi.fn(), onResize: vi.fn()
    });
    let clone: HTMLElement | null = null;
    try {
      expect(window.getComputedStyle(host).whiteSpace).toBe("pre-wrap");
      expect(host.textContent).toBe(text);
      runtime.setEditable(true);
      expect(host.querySelector("textarea")?.value).toBe(text);
      runtime.setEditable(false);
      clone = runtime.cloneStaticContent();
      expect(clone).not.toBeNull();
      document.body.append(clone!);
      // The export must retain whitespace without the editor's stylesheet or root.
      style.remove();
      expect(clone!.textContent).toBe(text);
      expect(window.getComputedStyle(clone!).whiteSpace).toBe("pre-wrap");
      expect(clone!.querySelector("literal")).toBeNull();
      await runtime.destroy();
      expect(host.style.whiteSpace).toBe("nowrap");
      expect(host.className).toBe(originalClasses);
    } finally {
      await runtime.destroy();
      clone?.remove();
      root.remove();
      style.remove();
    }
  });
});
