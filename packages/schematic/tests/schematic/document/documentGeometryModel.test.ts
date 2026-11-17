import { describe, expect, it } from "vitest";
import { moveJunctionAppearancesWithPath } from "../../../src/schematic/document/documentGeometryModel";
import { mixedSelectionDoc } from "../support/fixtures";

describe("schematic document geometry model", () => {
  it("moves junction colors only when a path moves by a uniform delta", () => {
    const document = mixedSelectionDoc();
    document.junctionAppearances = [{ point: { x: 280, y: 200 }, color: "#ff0000" }];

    moveJunctionAppearancesWithPath(
      document,
      [
        { x: 240, y: 200 },
        { x: 320, y: 200 }
      ],
      [
        { x: 260, y: 220 },
        { x: 340, y: 220 }
      ]
    );
    expect(document.junctionAppearances).toEqual([{ point: { x: 300, y: 220 }, color: "#ff0000" }]);

    moveJunctionAppearancesWithPath(
      document,
      [
        { x: 260, y: 220 },
        { x: 340, y: 220 }
      ],
      [
        { x: 260, y: 220 },
        { x: 340, y: 260 }
      ]
    );
    expect(document.junctionAppearances).toEqual([{ point: { x: 300, y: 220 }, color: "#ff0000" }]);
  });
});
