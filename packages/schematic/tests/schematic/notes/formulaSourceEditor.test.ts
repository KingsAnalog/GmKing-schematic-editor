import { describe, expect, it } from "vitest";
import {
  resolveFormulaSourceKeyAction,
  type FormulaSourceKeyContext
} from "../../../src/schematic/notes/formulaSourceEditor";

function context(overrides: Partial<FormulaSourceKeyContext> = {}): FormulaSourceKeyContext {
  return {
    mode: "block",
    key: "Enter",
    docLength: 6,
    selectionFrom: 3,
    selectionTo: 3,
    lineNumber: 1,
    lineCount: 1,
    ...overrides
  };
}

describe("resolveFormulaSourceKeyAction", () => {
  it("commits inline Enter and block Mod-Enter only", () => {
    expect(resolveFormulaSourceKeyAction(context({ mode: "inline", key: "Enter" }))).toBe("commit");
    expect(resolveFormulaSourceKeyAction(context({ mode: "block", key: "Enter", modKey: true }))).toBe("commit");
    expect(resolveFormulaSourceKeyAction(context({ mode: "block", key: "Enter", modKey: false }))).toBeNull();
  });

  it("cancels either editor mode on Escape", () => {
    expect(resolveFormulaSourceKeyAction(context({ mode: "inline", key: "Escape" }))).toBe("cancel");
    expect(resolveFormulaSourceKeyAction(context({ mode: "block", key: "Escape" }))).toBe("cancel");
  });

  it("only deletes a block formula when Backspace starts with an empty document", () => {
    expect(resolveFormulaSourceKeyAction(context({ key: "Backspace", docLength: 0, selectionFrom: 0, selectionTo: 0 })))
      .toBe("delete-empty-block");
    expect(resolveFormulaSourceKeyAction(context({ key: "Backspace", docLength: 1, selectionFrom: 1, selectionTo: 1 })))
      .toBeNull();
    expect(resolveFormulaSourceKeyAction(context({
      mode: "inline",
      key: "Backspace",
      docLength: 0,
      selectionFrom: 0,
      selectionTo: 0
    }))).toBeNull();
  });

  it("escapes inline math only at collapsed horizontal boundaries", () => {
    expect(resolveFormulaSourceKeyAction(context({
      mode: "inline",
      key: "ArrowLeft",
      selectionFrom: 0,
      selectionTo: 0
    }))).toBe("escape-before");
    expect(resolveFormulaSourceKeyAction(context({
      mode: "inline",
      key: "ArrowRight",
      selectionFrom: 6,
      selectionTo: 6
    }))).toBe("escape-after");
    expect(resolveFormulaSourceKeyAction(context({
      mode: "inline",
      key: "ArrowLeft",
      selectionFrom: 0,
      selectionTo: 2
    }))).toBeNull();
  });

  it("escapes block math from the first and last source lines", () => {
    expect(resolveFormulaSourceKeyAction(context({
      key: "ArrowUp",
      lineNumber: 1,
      lineCount: 3
    }))).toBe("escape-before");
    expect(resolveFormulaSourceKeyAction(context({
      key: "ArrowDown",
      lineNumber: 3,
      lineCount: 3
    }))).toBe("escape-after");
    expect(resolveFormulaSourceKeyAction(context({
      key: "ArrowDown",
      lineNumber: 2,
      lineCount: 3
    }))).toBeNull();
    expect(resolveFormulaSourceKeyAction(context({
      key: "ArrowUp",
      selectionFrom: 0,
      selectionTo: 2,
      lineNumber: 1,
      lineCount: 3
    }))).toBeNull();
  });
});
