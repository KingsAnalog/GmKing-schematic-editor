import { describe, expect, it } from "vitest";
import { snapPoint } from "../../../src/schematic/geometry";
import {
  noteSizeFromMeasuredContent,
  markdownNoteHeightFromMeasuredContent,
  textForNoteMeasurement
} from "../../../src/schematic/notes/noteSizing";
import {
  extendOrthogonalPath,
  normalizeWirePath,
  pointOnPath,
  rerouteWireEndpoint,
  samePath,
  uniformPathDelta
} from "../../../src/schematic/wire/wireGeometry";

describe("schematic geometry", () => {
  it("snaps placement to the 10 px grid, including the old grid's midpoints", () => {
    expect(snapPoint({ x: 23, y: 37 })).toEqual({ x: 20, y: 40 });
    expect(snapPoint({ x: 29, y: -31 })).toEqual({ x: 30, y: -30 });
  });

  it("normalizes wire paths by snapping, deduping, and removing collinear bends", () => {
    expect(
      normalizeWirePath([
        { x: 3, y: 4 },
        { x: 18, y: 1 },
        { x: 40, y: 0 },
        { x: 40, y: 20 },
        { x: 40, y: 41 }
      ])
    ).toEqual([
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 40 }
    ]);
  });

  it("reroutes moved endpoints while preserving the rest of the orthogonal path", () => {
    const movedStart = rerouteWireEndpoint(
      [
        { x: 0, y: 0 },
        { x: 40, y: 0 },
        { x: 40, y: 40 }
      ],
      { x: 0, y: 0 },
      { x: 0, y: 20 }
    );
    expect(movedStart).toEqual([
      { x: 0, y: 20 },
      { x: 40, y: 20 },
      { x: 40, y: 40 }
    ]);
    expect(samePath(movedStart, normalizeWirePath(movedStart))).toBe(true);
  });

  it("preserves a moved endpoint direction independently of endpoint order", () => {
    expect(rerouteWireEndpoint(
      [{ x: 0, y: 0 }, { x: 80, y: 0 }],
      { x: 0, y: 0 },
      { x: 0, y: 40 },
      { preserveMovedEndpointDirection: true }
    )).toEqual([{ x: 0, y: 40 }, { x: 80, y: 40 }, { x: 80, y: 0 }]);
    expect(rerouteWireEndpoint(
      [{ x: 80, y: 0 }, { x: 0, y: 0 }],
      { x: 0, y: 0 },
      { x: 0, y: 40 },
      { preserveMovedEndpointDirection: true }
    )).toEqual([{ x: 80, y: 0 }, { x: 80, y: 40 }, { x: 0, y: 40 }]);
  });

  it("extends orthogonal paths without duplicating the last route point", () => {
    expect(extendOrthogonalPath([{ x: 0, y: 0 }], { x: 40, y: 40 })).toEqual([
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 40 }
    ]);
    expect(extendOrthogonalPath([{ x: 0, y: 0 }, { x: 40, y: 0 }], { x: 40, y: 1 })).toEqual([
      { x: 0, y: 0 },
      { x: 40, y: 0 }
    ]);
  });

  it("detects uniform wire movement", () => {
    const previous = [
      { x: 0, y: 0 },
      { x: 60, y: 0 }
    ];
    const next = [
      { x: 20, y: 40 },
      { x: 80, y: 40 }
    ];
    expect(uniformPathDelta(previous, next)).toEqual({ x: 20, y: 40 });
    expect(pointOnPath({ x: 40, y: 0 }, previous)).toBe(true);
    expect(pointOnPath({ x: 40, y: 20 }, previous)).toBe(false);

  });

  it("fits plain text to the fine 10 px grid instead of the old 20 px grid", () => {
    expect(noteSizeFromMeasuredContent({ width: 19, height: 21 }, 14)).toEqual({ width: 30, height: 30 });
    expect(noteSizeFromMeasuredContent({ width: 81.2, height: 42.1 }, 14)).toEqual({ width: 100, height: 50 });
  });

  it("allows short small-font notes to shrink below the old 40 px minimum width", () => {
    expect(noteSizeFromMeasuredContent({ width: 9.8, height: 9 }, 9)).toEqual({ width: 20, height: 10 });
    expect(noteSizeFromMeasuredContent({ width: 23, height: 14 }, 14)).toEqual({ width: 40, height: 20 });
  });

  it("retains the Markdown height grid independently of plain text sizing", () => {
    expect(markdownNoteHeightFromMeasuredContent(10)).toBe(20);
    expect(markdownNoteHeightFromMeasuredContent(21)).toBe(40);
    expect(markdownNoteHeightFromMeasuredContent(42)).toBe(60);
  });

  it("keeps trailing blank note lines measurable", () => {
    expect(textForNoteMeasurement("")).toBe(" ");
    expect(textForNoteMeasurement("line\n")).toBe("line\n ");
    expect(textForNoteMeasurement("line   ")).toBe("line   ");
  });
});
