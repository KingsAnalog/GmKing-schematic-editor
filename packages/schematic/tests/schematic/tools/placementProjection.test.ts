import { describe, expect, it } from "vitest";
import { buildPlacementStatusMessage, buildPlacementSummaryPlacement } from "../../../src/schematic/placementProjection";

describe("schematic placement projection", () => {
  it("projects missing placement as the invalid prompt state", () => {
    expect(buildPlacementStatusMessage(null)).toBe("Type a component or template name to place.");
    expect(buildPlacementSummaryPlacement(null)).toEqual({ kind: "invalid" });
  });

  it("projects component placement with catalog labels", () => {
    expect(buildPlacementStatusMessage("resistor")).toBe(
      "Placing resistor. Move to preview, click grid points to place, r rotates preview, Esc cancels."
    );
    expect(buildPlacementSummaryPlacement("resistor")).toEqual({ kind: "component", hotLabel: "resistor", label: "R" });
  });

  it("projects template placement with the raw template id", () => {
    expect(buildPlacementStatusMessage("flipped_amp_diff")).toBe(
      "Placing flipped_amp_diff. Move to preview, click grid points to place, Esc cancels."
    );
    expect(buildPlacementSummaryPlacement("flipped_amp_diff")).toEqual({ kind: "template", id: "flipped_amp_diff" });
  });
});
