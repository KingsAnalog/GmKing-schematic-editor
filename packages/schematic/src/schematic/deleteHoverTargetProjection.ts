import { samePoint } from "./geometry";
import { junctionId } from "./junctionIdentity";
import type { Point } from "./types";
import {
  viewTargetFromModel,
  viewTargetFromNoteId,
  viewTargetIdsFromModel,
  type ModelLike
} from "./viewTargets";

export interface DeleteHoverTargetProjection {
  readonly ids: string[];
  readonly noteIds: string[];
}

export interface DeleteHoverModelProjectionInput {
  readonly model: ModelLike | null | undefined;
  readonly junctionPoint?: Point | null;
}

export interface DeleteHoverLinkProjectionInput {
  readonly model: ModelLike | null | undefined;
  readonly point: Point;
  readonly junctions: readonly Point[];
}

export function projectDeleteHoverNoteTarget(noteId: string | null | undefined): DeleteHoverTargetProjection {
  const target = viewTargetFromNoteId(noteId);
  return target ? { ids: [], noteIds: [target.id] } : { ids: [], noteIds: [] };
}

export function projectDeleteHoverModelTarget(input: DeleteHoverModelProjectionInput): DeleteHoverTargetProjection {
  const couplingId = input.model?.get("couplingId");
  if (typeof couplingId === "string" && couplingId) return { ids: [couplingId], noteIds: [] };
  const target = viewTargetFromModel(input.model, junctionTargetOptions(input));
  return target ? { ids: [target.id], noteIds: [] } : { ids: [], noteIds: [] };
}

export function projectDeleteHoverElementTarget(input: DeleteHoverModelProjectionInput): string[] {
  const couplingId = input.model?.get("couplingId");
  if (typeof couplingId === "string" && couplingId) return [couplingId];
  return viewTargetIdsFromModel(input.model, {
    enabledKinds: ["component"],
    fallbackKind: "component",
    ...junctionTargetOptions(input)
  });
}

export function projectDeleteHoverLinkTarget(input: DeleteHoverLinkProjectionInput): string[] {
  if (input.model?.get("preview")) return [];

  const clickedJunction = input.junctions.find((junction) => samePoint(junction, input.point));
  if (clickedJunction) return [junctionId(clickedJunction)];

  return viewTargetIdsFromModel(input.model, { enabledKinds: ["wire"], fallbackKind: "wire" });
}

function junctionTargetOptions(input: DeleteHoverModelProjectionInput) {
  const isJunction = Boolean(input.model?.get("junction"));
  return {
    junctionId: isJunction && input.junctionPoint ? junctionId(input.junctionPoint) : null,
    requireJunctionId: isJunction
  };
}
