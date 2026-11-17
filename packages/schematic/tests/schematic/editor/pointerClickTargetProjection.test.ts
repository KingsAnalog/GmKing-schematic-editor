import { describe, expect, it } from "vitest";
import { componentPinPoint } from "../../../src/schematic/netlist";
import {
  projectBlankPointerClickTarget,
  projectElementPointerClickTarget,
  projectLinkPointerClickTarget,
  projectPinPointerClickTarget
} from "../../../src/schematic/pointerClickTargetProjection";
import { junctionId } from "../../../src/schematic/renderer";
import type { ComponentInstance } from "../../../src/schematic/types";
import type { ModelLike } from "../../../src/schematic/viewTargets";

function model(id: unknown, attrs: Record<string, unknown> = {}): ModelLike {
  return {
    id,
    get: (attribute) => attrs[attribute]
  };
}

function resistorInstance(id = "R1"): ComponentInstance {
  return {
    id,
    type: "resistor",
    ref: id,
    x: 100,
    y: 80,
    rotation: 0,
    mirrored: false,
    values: {}
  };
}

describe("schematic pointer click target projection", () => {
  it("carries blade hits only for real component targets", () => {
    const input = { model: model("S1", { componentId: "S1" }), clickPoint: { x: 20, y: 40 }, junctionPoint: null, switchBlade: true };
    expect(projectElementPointerClickTarget(input)).toEqual({ kind: "component", id: "S1", point: input.clickPoint, switchBlade: true });
    expect(projectElementPointerClickTarget({ ...input, model: model("preview", { preview: true }) }))
      .toEqual({ kind: "preview", surface: "element", point: input.clickPoint });
  });

  it("projects blank targets from the provided snapped point", () => {
    const point = { x: 20, y: 40 };

    expect(projectBlankPointerClickTarget(point)).toEqual({ kind: "blank", point });
  });

  it("projects preview element and link targets with their own click surfaces", () => {
    const clickPoint = { x: 13, y: 27 };
    const linkPoint = { x: 40, y: 60 };

    expect(
      projectElementPointerClickTarget({
        model: model("preview-element", { preview: true }),
        clickPoint,
        junctionPoint: null
      })
    ).toEqual({ kind: "preview", surface: "element", point: clickPoint });
    expect(
      projectLinkPointerClickTarget({
        model: model("preview-link", { preview: true }),
        point: linkPoint,
        junctions: []
      })
    ).toEqual({ kind: "preview", surface: "link", point: linkPoint });
  });

  it("projects resolved junction elements with strict junction ids", () => {
    const clickPoint = { x: 13, y: 27 };
    const junctionPoint = { x: 40, y: 60 };
    const id = junctionId(junctionPoint);

    expect(
      projectElementPointerClickTarget({
        model: model("joint-cell-id", { junction: true }),
        clickPoint,
        junctionPoint
      })
    ).toEqual({
      kind: "junction",
      id,
      selectionId: id,
      point: junctionPoint,
      placementPoint: junctionPoint
    });
  });

  it("projects unresolved junction elements with model fallback only for selection", () => {
    const clickPoint = { x: 13, y: 27 };

    expect(
      projectElementPointerClickTarget({
        model: model("joint-cell-id", { junction: true }),
        clickPoint,
        junctionPoint: null
      })
    ).toEqual({
      kind: "junction",
      id: null,
      selectionId: "joint-cell-id",
      point: null,
      placementPoint: clickPoint
    });
  });

  it("projects component elements using the component fallback target and click point", () => {
    const clickPoint = { x: 13, y: 27 };

    expect(
      projectElementPointerClickTarget({
        model: model("component-cell", { componentId: "R1" }),
        clickPoint,
        junctionPoint: null
      })
    ).toEqual({ kind: "component", id: "R1", point: clickPoint });
    expect(
      projectElementPointerClickTarget({
        model: model("fallback-component-cell"),
        clickPoint,
        junctionPoint: null
      })
    ).toEqual({ kind: "component", id: "fallback-component-cell", point: clickPoint });
  });

  it("projects link clicks over junctions as junction targets", () => {
    const point = { x: 100, y: 120 };
    const id = junctionId(point);

    expect(
      projectLinkPointerClickTarget({
        model: model("wire-cell", { wireId: "w1" }),
        point,
        junctions: [point]
      })
    ).toEqual({
      kind: "junction",
      id,
      selectionId: id,
      point,
      placementPoint: point
    });
  });

  it("keeps the center of a one-grid wire selectable between two junction hit areas", () => {
    const snappedPoint = { x: 20, y: 0 };

    expect(
      projectLinkPointerClickTarget({
        model: model("short-wire", { wireId: "short-wire" }),
        point: snappedPoint,
        junctions: [{ x: 0, y: 0 }, { x: 20, y: 0 }],
        junctionHitPoint: { x: 10, y: 0 },
        junctionHitRadius: 5
      })
    ).toEqual({
      kind: "wire",
      id: "short-wire",
      point: snappedPoint
    });
  });

  it("keeps link fallback clicks inside the visible junction radius on the junction", () => {
    const junction = { x: 20, y: 0 };

    expect(
      projectLinkPointerClickTarget({
        model: model("wire-cell", { wireId: "w1" }),
        point: junction,
        junctions: [junction],
        junctionHitPoint: { x: 24, y: 0 },
        junctionHitRadius: 5
      })
    ).toMatchObject({
      kind: "junction",
      id: junctionId(junction),
      point: junction,
      placementPoint: junction
    });
  });

  it("projects ordinary wire links from model wire targets", () => {
    const point = { x: 100, y: 120 };

    expect(
      projectLinkPointerClickTarget({
        model: model("wire-cell", { wireId: "w1" }),
        point,
        junctions: []
      })
    ).toEqual({ kind: "wire", id: "w1", point });
    expect(
      projectLinkPointerClickTarget({
        model: model("fallback-wire-cell"),
        point,
        junctions: []
      })
    ).toEqual({ kind: "wire", id: "fallback-wire-cell", point });
  });

  it("projects unresolved wire links when neither model nor fallback id resolves", () => {
    const point = { x: 100, y: 120 };

    expect(
      projectLinkPointerClickTarget({
        model: model(undefined),
        point,
        junctions: []
      })
    ).toEqual({ kind: "wire", id: null, point });
  });

  it("projects valid pin clicks from component target, port id, and instance", () => {
    const instance = resistorInstance();
    const point = componentPinPoint(instance, "p");

    expect(
      projectPinPointerClickTarget({
        model: model("component-cell", { componentId: "R1" }),
        portId: "p",
        components: [instance]
      })
    ).toEqual({ kind: "pin", componentId: "R1", point });
    expect(
      projectPinPointerClickTarget({
        model: model("R1"),
        portId: "p",
        components: [instance]
      })
    ).toEqual({ kind: "pin", componentId: "R1", point });
  });

  it("ignores pin clicks with a missing port id", () => {
    const instance = resistorInstance();

    expect(
      projectPinPointerClickTarget({
        model: model("component-cell", { componentId: "R1" }),
        portId: null,
        components: [instance]
      })
    ).toBeNull();
  });

  it("ignores pin clicks with a missing component target or instance", () => {
    const instance = resistorInstance();

    expect(
      projectPinPointerClickTarget({
        model: model(undefined),
        portId: "p",
        components: [instance]
      })
    ).toBeNull();
    expect(
      projectPinPointerClickTarget({
        model: model("component-cell", { componentId: "R2" }),
        portId: "p",
        components: [instance]
      })
    ).toBeNull();
  });
});
