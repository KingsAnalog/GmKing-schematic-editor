import { describe, expect, it } from "vitest";
import {
  applyNoteBackgroundColor,
  applyNoteFontSize,
  applyNoteFormat,
  applyNoteWidth,
  createNoteFontSizeSnapshot,
  createNoteWidthSnapshot,
  normalizeNoteBackgroundColor,
  normalizeNoteFontSizeInput,
  normalizeNoteWidthInput,
  noteFontSizeSnapshotChanged,
  noteWidthSnapshotChanged
} from "../../../src/schematic/notes/noteProperties";
import type { SchematicNote } from "../../../src/schematic/types";

function note(overrides: Partial<SchematicNote> = {}): SchematicNote {
  return {
    id: "n1",
    x: 0,
    y: 0,
    width: 80,
    height: 40,
    format: "plain",
    text: "hello",
    ...overrides
  };
}

function normalizedFontSize(value: string) {
  const result = normalizeNoteFontSizeInput(value);
  if (result === null) throw new Error(`Expected ${value} to normalize`);
  return result;
}

describe("schematic note property normalization", () => {
  it("trims and lowercases valid note background colors", () => {
    expect(normalizeNoteBackgroundColor("  #AaBbCc  ")).toBe("#aabbcc");
  });

  it("rejects invalid note background colors", () => {
    expect(normalizeNoteBackgroundColor("#abc")).toBeNull();
    expect(normalizeNoteBackgroundColor("123456")).toBeNull();
    expect(normalizeNoteBackgroundColor("#12345g")).toBeNull();
    expect(normalizeNoteBackgroundColor("#1234567")).toBeNull();
  });

  it("clamps note font size input to the minimum", () => {
    expect(normalizeNoteFontSizeInput("0")).toBe(1);
  });

  it("clamps note font size input to the maximum", () => {
    expect(normalizeNoteFontSizeInput("300")).toBe(200);
  });

  it("rounds finite note font size input", () => {
    expect(normalizeNoteFontSizeInput("15.4")).toBe(15);
    expect(normalizeNoteFontSizeInput("15.6")).toBe(16);
  });

  it("rejects invalid note font size input", () => {
    expect(normalizeNoteFontSizeInput("abc")).toBeNull();
    expect(normalizeNoteFontSizeInput("Infinity")).toBeNull();
  });

  it("snaps and clamps Markdown note width to the 20 px grid", () => {
    expect(normalizeNoteWidthInput("151")).toBe(160);
    expect(normalizeNoteWidthInput("333")).toBe(340);
    expect(normalizeNoteWidthInput("999")).toBe(800);
    expect(normalizeNoteWidthInput("bad")).toBeNull();
  });
});

describe("schematic note property mutations", () => {
  it("applies valid note background colors", () => {
    const target = note({ backgroundColor: "#ffffff" });

    expect(applyNoteBackgroundColor(target, "  #AaBbCc  ")).toEqual({
      status: "changed",
      color: "#aabbcc"
    });
    expect(target.backgroundColor).toBe("#aabbcc");
  });

  it("applies and preserves an explicit no-fill note background", () => {
    const target = note({ backgroundColor: "#ffffff" });

    expect(applyNoteBackgroundColor(target, null)).toEqual({
      status: "changed",
      color: null
    });
    expect(target.backgroundColor).toBeNull();
    expect(applyNoteBackgroundColor(target, null)).toEqual({
      status: "unchanged",
      color: null
    });
  });

  it("rejects invalid note background colors without mutation", () => {
    const target = note({ backgroundColor: "#ffffff" });

    expect(applyNoteBackgroundColor(target, "#12345g")).toEqual({ status: "invalid" });
    expect(target.backgroundColor).toBe("#ffffff");
  });

  it("leaves unchanged note background colors alone", () => {
    const target = note({ backgroundColor: "#aabbcc" });

    expect(applyNoteBackgroundColor(target, "#aabbcc")).toEqual({
      status: "unchanged",
      color: "#aabbcc"
    });
    expect(target.backgroundColor).toBe("#aabbcc");
  });

  it("rejects invalid note font sizes without mutation", () => {
    const target = note({ fontSizePx: 18 });

    expect(normalizeNoteFontSizeInput("abc")).toBeNull();
    expect(target.fontSizePx).toBe(18);
  });

  it("clamps and rounds note font sizes before mutation", () => {
    const target = note({ fontSizePx: 14 });
    const minimum = normalizedFontSize("0");
    const rounded = normalizedFontSize("15.6");

    expect(minimum).toBe(1);
    expect(applyNoteFontSize(target, minimum)).toEqual({ status: "changed", nextSize: 1 });
    expect(target.fontSizePx).toBe(1);

    expect(rounded).toBe(16);
    expect(applyNoteFontSize(target, rounded)).toEqual({ status: "changed", nextSize: 16 });
    expect(target.fontSizePx).toBe(16);
  });

  it("treats an undefined note font size as unchanged when input is the default", () => {
    const target = note({ fontSizePx: undefined });

    expect(applyNoteFontSize(target, 14)).toEqual({ status: "unchanged", nextSize: 14 });
    expect(target.fontSizePx).toBeUndefined();
  });

  it("mutates changed note font sizes", () => {
    const target = note({ fontSizePx: undefined });

    expect(applyNoteFontSize(target, 18)).toEqual({ status: "changed", nextSize: 18 });
    expect(target.fontSizePx).toBe(18);
  });

  it("compares note font size snapshots across font size and bounds", () => {
    const target = note({ fontSizePx: 12, width: 80, height: 40 });
    const snapshot = createNoteFontSizeSnapshot(target);

    expect(noteFontSizeSnapshotChanged(snapshot, target)).toBe(false);

    target.fontSizePx = 13;
    expect(noteFontSizeSnapshotChanged(snapshot, target)).toBe(true);

    target.fontSizePx = 12;
    target.width = 100;
    expect(noteFontSizeSnapshotChanged(snapshot, target)).toBe(true);

    target.width = 80;
    target.height = 60;
    expect(noteFontSizeSnapshotChanged(snapshot, target)).toBe(true);
  });

  it("keeps Markdown source intact across reversible format switches", () => {
    const target = note({ format: "plain", text: "# Gain\n\n$A_v$", width: 80 });
    expect(applyNoteFormat(target, "markdown")).toBe(true);
    expect(target).toMatchObject({ format: "markdown", text: "# Gain\n\n$A_v$", width: 320 });
    expect(applyNoteFormat(target, "plain")).toBe(true);
    expect(target).toMatchObject({ format: "plain", text: "# Gain\n\n$A_v$", width: 320 });
  });

  it("applies width and detects a single width transaction snapshot", () => {
    const target = note({ format: "markdown", width: 320 });
    const snapshot = createNoteWidthSnapshot(target);
    expect(noteWidthSnapshotChanged(snapshot, target)).toBe(false);
    expect(applyNoteWidth(target, 371)).toEqual({ status: "changed", nextSize: 380 });
    expect(target.width).toBe(380);
    expect(noteWidthSnapshotChanged(snapshot, target)).toBe(true);
  });
});
