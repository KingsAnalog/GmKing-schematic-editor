import { samePoint } from "./geometry";
import { junctionId } from "./junctionIdentity";
import { componentPinPoint } from "./netlist";
import type { PointerClickTarget } from "./pointerClickRoutingModel";
import type { ComponentInstance, Point } from "./types";
import {
  viewTargetFromJunctionId,
  viewTargetFromModel,
  type ModelLike
} from "./viewTargets";

export function projectBlankPointerClickTarget(point: Point): PointerClickTarget {
  return { kind: "blank", point };
}

export function projectElementPointerClickTarget(input: {
  readonly model: ModelLike | null | undefined;
  readonly clickPoint: Point;
  readonly junctionPoint: Point | null;
  readonly switchBlade?: boolean;
}): PointerClickTarget | null {
  const { model, clickPoint, junctionPoint } = input;
  if (!model) return null;

  if (model.get("preview")) {
    return { kind: "preview", surface: "element", point: clickPoint };
  }

  if (model.get("junction")) {
    const junctionTarget = viewTargetFromModel(model, {
      junctionId: junctionPoint ? junctionId(junctionPoint) : null,
      requireJunctionId: true
    });
    const junctionSelectionTarget = junctionTarget ?? viewTargetFromModel(model);
    return {
      kind: "junction",
      id: junctionTarget?.id ?? null,
      selectionId: junctionSelectionTarget?.id ?? null,
      point: junctionPoint,
      placementPoint: junctionPoint ?? clickPoint
    };
  }

  const couplingId = model.get("couplingId");
  if (typeof couplingId === "string" && couplingId) {
    return { kind: "inductor-coupling", id: couplingId, point: clickPoint };
  }

  const labelTarget = viewTargetFromModel(model, { enabledKinds: ["net-label"] });
  if (labelTarget) return { kind: "net-label", id: labelTarget.id, point: clickPoint };

  const componentTarget = viewTargetFromModel(model, { enabledKinds: ["component"], fallbackKind: "component" });
  return componentTarget ? {
    kind: "component", id: componentTarget.id, point: clickPoint,
    ...(input.switchBlade ? { switchBlade: true } : {})
  } : null;
}

export function projectLinkPointerClickTarget(input: {
  readonly model: ModelLike | null | undefined;
  readonly point: Point;
  readonly junctions: readonly Point[];
  readonly junctionHitPoint?: Point;
  readonly junctionHitRadius?: number;
}): PointerClickTarget {
  const { model, point, junctions } = input;

  if (model?.get("preview")) {
    return { kind: "preview", surface: "link", point };
  }

  const hitPoint = input.junctionHitPoint ?? point;
  const hitRadius = Math.max(0, input.junctionHitRadius ?? 0);
  const clickedJunction = junctions.find((junction) => (
    hitRadius > 0
      ? Math.hypot(junction.x - hitPoint.x, junction.y - hitPoint.y) <= hitRadius
      : samePoint(junction, hitPoint)
  ));
  const linkTarget = clickedJunction
    ? viewTargetFromJunctionId(junctionId(clickedJunction))
    : viewTargetFromModel(model, { enabledKinds: ["wire"], fallbackKind: "wire" });

  if (clickedJunction) {
    return {
      kind: "junction",
      id: linkTarget?.id ?? null,
      selectionId: linkTarget?.id ?? null,
      point: clickedJunction,
      placementPoint: clickedJunction
    };
  }

  return linkTarget ? { kind: "wire", id: linkTarget.id, point } : { kind: "wire", id: null, point };
}

export function projectPinPointerClickTarget(input: {
  readonly model: ModelLike | null | undefined;
  readonly portId: string | null;
  readonly components: readonly ComponentInstance[];
}): PointerClickTarget | null {
  const componentTarget = viewTargetFromModel(input.model, { enabledKinds: ["component"], fallbackKind: "component" });
  if (!componentTarget || !input.portId) return null;

  const instance = input.components.find((component) => component.id === componentTarget.id);
  if (!instance) return null;

  return {
    kind: "pin",
    componentId: componentTarget.id,
    point: componentPinPoint(instance, input.portId)
  };
}
