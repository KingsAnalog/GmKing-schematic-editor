import { describe, expect, it } from "vitest";
import { suppressSchematicHoverLabels } from "../src/hoverLabelSuppression";

describe("Obsidian schematic hover label suppression", () => {
  it("removes existing and dynamically-added normal hover labels until cleanup", async () => {
    const root = document.createElement("div");
    root.setAttribute("aria-label", "Schematic drawing");
    root.innerHTML = '<div aria-label="Schematic canvas"><div title="pin"></div></div>';
    document.body.append(root);

    const cleanup = suppressSchematicHoverLabels(root);
    expect(root.querySelector("[aria-label], [title]")).toBeNull();
    expect(root.hasAttribute("aria-label")).toBe(false);

    const note = document.createElement("div");
    note.setAttribute("aria-label", "Schematic note");
    root.append(note);
    await Promise.resolve();
    expect(note.hasAttribute("aria-label")).toBe(false);

    cleanup();
    note.setAttribute("title", "preserved after cleanup");
    await Promise.resolve();
    expect(note.getAttribute("title")).toBe("preserved after cleanup");
    root.remove();
  });
});
