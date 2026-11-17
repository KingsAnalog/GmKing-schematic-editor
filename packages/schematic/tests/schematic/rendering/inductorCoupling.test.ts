import { fixtureDocument } from "../support/fixtureDocument";
import { describe, expect, it } from "vitest";
import {
  addInductorCoupling,
  documentInductorCouplings,
  inductorCouplingColor,
  inductorCouplingLabel,
  normalizeInductorCouplings,
  removeInductorCoupling,
  resetInductorCouplingCoefficient,
  setInductorCouplingColor,
  updateInductorCoupling
} from "../../../src/schematic/inductorCouplingModel";
import {
  inductorCouplingFlipsReferenceLabel,
  inductorCouplingGeometry
} from "../../../src/schematic/inductorCouplingGeometry";
import { makeInductorCouplingCell } from "../../../src/schematic/inductorCouplingCell";
import { renderInductorCouplingSvg } from "../../../src/schematic/inductorCouplingRenderer";
import { inductorDotTerminal } from "../../../src/schematic/inductorModel";
import type {
  ComponentInstance,
  InductorCoupling,
  SchematicDocument
} from "../../../src/schematic/types";

function inductor(
  id: string,
  ref: string,
  x: number,
  y: number,
  rotation = 0,
  value = "1m"
): ComponentInstance {
  return {
    id,
    type: "inductor",
    ref,
    x,
    y,
    rotation,
    mirrored: false,
    values: { main: value }
  };
}

function schematic(components: ComponentInstance[]): SchematicDocument {
  return fixtureDocument({
    components,
    wires: [],
    junctions: [],

    junctionAppearances: [],
    netLabels: [],
    notes: []
  });
}

function coupling(overrides: Partial<InductorCoupling> = {}): InductorCoupling {
  return {
    id: "coupling-12",
    inductorAId: "l1",
    inductorBId: "l2",
    coefficient: "k12",
    coefficientAuto: true,
    labelMode: "coefficient",
    showLabel: true,
    showArc: true,
    showCore: false,
    arcFlipped: false,
    ...overrides
  };
}

function arcEndpoints(path: string) {
  const match = /^M (-?[\d.]+) (-?[\d.]+) Q .* (-?[\d.]+) (-?[\d.]+)$/.exec(path);
  if (!match) throw new Error("Unexpected coupling arc path: " + path);
  return {
    start: { x: Number(match[1]), y: Number(match[2]) },
    end: { x: Number(match[3]), y: Number(match[4]) }
  };
}

function arrowPointYs(path: string) {
  return [...path.matchAll(/[ML] (-?[\d.]+) (-?[\d.]+)/g)]
    .map((match) => Number(match[2]));
}

describe("inductor coupling model", () => {
  it("creates pairwise relations, auto-dots unset terminals, and preserves dots on removal", () => {
    const l1 = inductor("l1", "L1", 0, 0);
    const l2 = inductor("l2", "L2", 0, 80);
    const l3 = inductor("l3", "L3", 0, 160);
    l1.values.inductorDot = "n";
    const document = schematic([l1, l2, l3]);

    const first = addInductorCoupling(document, l1.id, l2.id, "coupling-12");
    const second = addInductorCoupling(document, l1.id, l3.id, "coupling-13");
    const third = addInductorCoupling(document, l2.id, l3.id, "coupling-23");
    const duplicate = addInductorCoupling(document, l2.id, l1.id, "duplicate");

    expect(first?.coefficient).toBe("k12");
    expect(first?.showLabel).toBe(false);
    expect(inductorCouplingLabel(document, first!)).toBe("");
    expect(second?.coefficient).toBe("k13");
    expect(third?.coefficient).toBe("k23");
    expect(duplicate?.id).toBe("coupling-12");
    expect(documentInductorCouplings(document)).toHaveLength(3);
    expect(inductorDotTerminal(l1)).toBe("n");
    expect(inductorDotTerminal(l2)).toBe("p");
    expect(inductorDotTerminal(l3)).toBe("p");

    expect(removeInductorCoupling(document, "coupling-12")).toBe(true);
    expect(documentInductorCouplings(document)).toHaveLength(2);
    expect(inductorDotTerminal(l1)).toBe("n");
    expect(inductorDotTerminal(l2)).toBe("p");
  });

  it("keeps custom names across ref changes and restores automatic names on request", () => {
    const l1 = inductor("l1", "LP", 0, 0);
    const l2 = inductor("l2", "LS", 0, 80);
    const document = schematic([l1, l2]);
    addInductorCoupling(document, l1.id, l2.id, "coupling-ps");
    expect(documentInductorCouplings(document)[0].coefficient).toBe("kPS");

    expect(updateInductorCoupling(document, "coupling-ps", {
      coefficient: "kMain",
      coefficientAuto: false
    })).toBe(true);
    l1.ref = "L7";
    l2.ref = "L8";
    normalizeInductorCouplings(document);
    expect(documentInductorCouplings(document)[0].coefficient).toBe("kMain");

    expect(resetInductorCouplingCoefficient(document, "coupling-ps")).toBe(true);
    expect(documentInductorCouplings(document)[0].coefficient).toBe("k78");
  });

  it("derives a numeric turns ratio and suppresses symbolic ratios", () => {
    const numeric = schematic([
      inductor("l1", "L1", 0, 0, 0, "4m"),
      inductor("l2", "L2", 0, 80, 0, "1m")
    ]);
    const ratioCoupling = coupling({ labelMode: "ratio" });
    expect(inductorCouplingLabel(numeric, ratioCoupling)).toBe("2:1");

    numeric.components[0].values.main = "Lp";
    expect(inductorCouplingLabel(numeric, ratioCoupling)).toBe("");
  });

  it("preserves label mode independently of label visibility", () => {
    const document = schematic([
      inductor("l1", "L1", 0, 0),
      inductor("l2", "L2", 0, 80)
    ]);
    document.inductorCouplings = [coupling({ labelMode: "ratio", showLabel: false })];

    normalizeInductorCouplings(document);

    expect(document.inductorCouplings?.[0]).toMatchObject({
      labelMode: "ratio",
      showLabel: false
    });
  });

  it("normalizes, applies, and resets a custom coupling color", () => {
    const document = schematic([
      inductor("l1", "L1", 0, 0),
      inductor("l2", "L2", 120, 0)
    ]);
    document.inductorCouplings = [coupling()];

    expect(setInductorCouplingColor(document, "coupling-12", "#005F9E")).toBe(true);
    expect(document.inductorCouplings[0].appearance).toEqual({ color: "#005f9e" });
    expect(inductorCouplingColor(document.inductorCouplings[0])).toBe("#005f9e");
    expect(setInductorCouplingColor(document, "coupling-12", null)).toBe(true);
    expect(document.inductorCouplings[0].appearance).toBeUndefined();
    expect(inductorCouplingColor(document.inductorCouplings[0])).toBe("#111111");
  });
});

describe("inductor coupling geometry", () => {
  it("draws a double-ended circular arc and flips its side", () => {
    const document = schematic([
      inductor("l1", "L1", 0, 0),
      inductor("l2", "L2", 160, 80)
    ]);
    const normal = inductorCouplingGeometry(document, coupling());
    const flipped = inductorCouplingGeometry(document, coupling({ arcFlipped: true }));

    expect(normal?.arcPath).toContain(" Q ");
    expect(normal?.arrowPath.match(/ Z/g)).toHaveLength(2);
    expect(normal?.corePath).toBe("");
    expect(flipped?.arcPath).not.toBe(normal?.arcPath);
  });

  it("terminates the arc under each arrowhead instead of protruding through its tip", () => {
    const document = schematic([
      inductor("l1", "L1", 0, 0),
      inductor("l2", "L2", 160, 80)
    ]);
    const geometry = inductorCouplingGeometry(document, coupling())!;
    const arc = arcEndpoints(geometry.arcPath);
    const arrowTips = [...geometry.arrowPath.matchAll(/M (-?[\d.]+) (-?[\d.]+)/g)]
      .map((match) => ({ x: Number(match[1]), y: Number(match[2]) }));

    expect(arrowTips).toHaveLength(2);
    expect(arc.start).not.toEqual(arrowTips[0]);
    expect(arc.end).not.toEqual(arrowTips[1]);
  });

  it("aims arc endpoints at each winding outline for horizontal placement", () => {
    const horizontalWindings = schematic([
      inductor("l1", "L1", 0, 0, 0),
      inductor("l2", "L2", 120, 0, 0)
    ]);
    const verticalWindings = schematic([
      inductor("l1", "L1", 0, 0, 90),
      inductor("l2", "L2", 120, 0, 90)
    ]);

    const horizontal = arcEndpoints(inductorCouplingGeometry(horizontalWindings, coupling())!.arcPath);
    const vertical = arcEndpoints(inductorCouplingGeometry(verticalWindings, coupling())!.arcPath);

    expect(horizontal.start.x).toBeGreaterThan(0);
    expect(horizontal.end.x).toBeLessThan(120);
    expect(horizontal.start.y).toBeLessThan(-14);
    expect(horizontal.end.y).toBeLessThan(-14);
    expect(vertical.start.x).toBeGreaterThan(0);
    expect(vertical.end.x).toBeLessThan(120);
    expect(vertical.start.y).toBeLessThan(-26);
    expect(vertical.end.y).toBeLessThan(-26);

    const horizontalArrows = inductorCouplingGeometry(horizontalWindings, coupling())!.arrowPath;
    const verticalArrows = inductorCouplingGeometry(verticalWindings, coupling())!.arrowPath;
    expect(arrowPointYs(horizontalArrows).every((y) => y < -14)).toBe(true);
    expect(arrowPointYs(verticalArrows).every((y) => y < -26)).toBe(true);
  });

  it("places core lines between side-by-side windings and beside collinear windings", () => {
    const sideBySide = schematic([
      inductor("l1", "L1", 0, 0),
      inductor("l2", "L2", 0, 80)
    ]);
    const collinear = schematic([
      inductor("l1", "L1", 0, 0),
      inductor("l2", "L2", 120, 0)
    ]);
    const coreOnly = coupling({ showArc: false, showCore: true });
    const between = inductorCouplingGeometry(sideBySide, coreOnly);
    const beside = inductorCouplingGeometry(collinear, coreOnly);

    expect(between?.corePath.match(/M /g)).toHaveLength(2);
    expect(between?.corePath).toContain("-26 36.5");
    expect(between?.arcPath).toBe("");
    expect(beside?.corePath.match(/M /g)).toHaveLength(2);
    expect(beside?.corePath).toContain("-26 -26.5");
    expect(beside?.arcPath).toBe("");
  });

  it("moves only reference labels that face an enabled coupling core", () => {
    const sideBySide = schematic([
      inductor("l1", "L1", 0, 0, 90),
      inductor("l2", "L2", 120, 0, 90)
    ]);
    sideBySide.inductorCouplings = [coupling({ showArc: false, showCore: true })];
    expect(inductorCouplingFlipsReferenceLabel(sideBySide, sideBySide.components[0])).toBe(true);
    expect(inductorCouplingFlipsReferenceLabel(sideBySide, sideBySide.components[1])).toBe(false);

    const collinear = schematic([
      inductor("l1", "L1", 0, 0),
      inductor("l2", "L2", 120, 0)
    ]);
    collinear.inductorCouplings = [coupling({ showArc: false, showCore: true })];
    expect(inductorCouplingFlipsReferenceLabel(collinear, collinear.components[0])).toBe(true);
    expect(inductorCouplingFlipsReferenceLabel(collinear, collinear.components[1])).toBe(true);

    const opposed = schematic([
      inductor("l1", "L1", 0, 0, 180),
      inductor("l2", "L2", 120, 0)
    ]);
    opposed.inductorCouplings = [coupling({ showArc: false, showCore: true })];
    expect(inductorCouplingFlipsReferenceLabel(opposed, opposed.components[0])).toBe(false);
    expect(inductorCouplingFlipsReferenceLabel(opposed, opposed.components[1])).toBe(true);

    collinear.inductorCouplings[0].showCore = false;
    expect(inductorCouplingFlipsReferenceLabel(collinear, collinear.components[0])).toBe(false);
  });

  it("omits a core between nonparallel windings without adding an arc", () => {
    const document = schematic([
      inductor("l1", "L1", 0, 0, 0),
      inductor("l2", "L2", 100, 100, 90)
    ]);
    const geometry = inductorCouplingGeometry(
      document,
      coupling({ showArc: false, showCore: true })
    );

    expect(geometry?.corePath).toBe("");
    expect(geometry?.arcPath).toBe("");
    expect(geometry?.arrowPath).toBe("");
    expect(geometry?.hitPath).toBe("");
  });

  it("renders visible labels without a white backing stroke", () => {
    const document = schematic([
      inductor("l1", "L1", 0, 0),
      inductor("l2", "L2", 0, 80)
    ]);
    const relation = coupling();
    const cell = makeInductorCouplingCell(document, relation);
    const svg = renderInductorCouplingSvg(document, relation);

    expect(cell?.attr("label/stroke")).toBe("none");
    expect(svg).toContain('data-coupling-label');
    expect(svg).toContain('stroke="none"');
    expect(svg).not.toContain('paint-order');
    expect(svg).not.toContain('stroke="#ffffff"');
  });

  it("renders the selected coupling color on arcs, arrows, cores, and labels", () => {
    const document = schematic([
      inductor("l1", "L1", 0, 0),
      inductor("l2", "L2", 120, 0)
    ]);
    const relation = coupling({
      showCore: true,
      appearance: { color: "#005f9e" }
    });
    const cell = makeInductorCouplingCell(document, relation);
    const svg = renderInductorCouplingSvg(document, relation);

    expect(cell?.attr("arc/stroke")).toBe("#005f9e");
    expect(cell?.attr("arrows/fill")).toBe("#005f9e");
    expect(cell?.attr("core/stroke")).toBe("#005f9e");
    expect(cell?.attr("label/fill")).toBe("#005f9e");
    expect(svg).toContain('data-coupling-arc');
    expect(svg).toContain('stroke="#005f9e"');
    expect(svg).toContain('fill="#005f9e"');
  });
});
