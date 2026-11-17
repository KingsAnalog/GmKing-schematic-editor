import {
  DELETE_TARGET_EMPTY_STATUS,
  projectSchematicDeleteTargets,
  type SchematicDeleteMode,
  type SchematicDeleteTargetProjection,
  TEMPORARY_DELETE_TARGET_EMPTY_STATUS
} from "./selection/selectionDeleteModel";
import type { SchematicDocument } from "./types";

export type DeleteToolMode = SchematicDeleteMode;

export type DeleteSelectedCommandIntent =
  | { kind: "begin-tool"; mode: DeleteToolMode }
  | { kind: "delete-selected" }
  | { kind: "temporary-delete-selected" };

export type DeleteTargetCommandIntent =
  | { kind: "delete-targets"; ids: string[]; noteIds: string[] }
  | { kind: "temporary-delete-targets"; ids: string[] };

export type DeleteTargetApplicationPlan =
  | { kind: "status"; status: typeof DELETE_TARGET_EMPTY_STATUS | typeof TEMPORARY_DELETE_TARGET_EMPTY_STATUS }
  | { kind: "delete-targets"; ids: string[]; noteIds: string[] }
  | { kind: "temporary-delete-targets"; ids: string[] };

export class SchematicDeleteToolController {
  private readonly hoverIds = new Set<string>();

  hoverState(): ReadonlySet<string> {
    return new Set(this.hoverIds);
  }

  hasHover() {
    return this.hoverIds.size > 0;
  }

  setHover(document: SchematicDocument, mode: DeleteToolMode, ids: Iterable<string>, noteIds: Iterable<string> = []) {
    const targets = this.projectTargets(document, mode, ids, noteIds);
    return this.replaceHover([...targets.ids, ...targets.noteIds]);
  }

  clearHover() {
    return this.replaceHover([]);
  }

  commandForSelection(mode: DeleteToolMode, hasSelection: boolean): DeleteSelectedCommandIntent {
    if (!hasSelection) return { kind: "begin-tool", mode };
    return mode === "temp-delete" ? { kind: "temporary-delete-selected" } : { kind: "delete-selected" };
  }

  commandForTargets(
    document: SchematicDocument,
    mode: DeleteToolMode,
    ids: Iterable<string>,
    noteIds: Iterable<string> = []
  ): DeleteTargetCommandIntent {
    const targets = this.projectTargets(document, mode, ids, noteIds);
    if (mode === "temp-delete") {
      return { kind: "temporary-delete-targets", ids: targets.ids };
    }
    return { kind: "delete-targets", ids: targets.ids, noteIds: targets.noteIds };
  }

  planTargetApplication(
    document: SchematicDocument,
    mode: DeleteToolMode,
    ids: Iterable<string>,
    noteIds: Iterable<string> = []
  ): DeleteTargetApplicationPlan {
    const command = this.commandForTargets(document, mode, ids, noteIds);
    if (command.kind === "temporary-delete-targets") {
      if (command.ids.length === 0) return { kind: "status", status: TEMPORARY_DELETE_TARGET_EMPTY_STATUS };
      return command;
    }
    if (command.ids.length === 0 && command.noteIds.length === 0) return { kind: "status", status: DELETE_TARGET_EMPTY_STATUS };
    return command;
  }

  private projectTargets(
    document: SchematicDocument,
    mode: DeleteToolMode,
    ids: Iterable<string>,
    noteIds: Iterable<string>
  ): SchematicDeleteTargetProjection {
    return projectSchematicDeleteTargets(document, mode, ids, noteIds);
  }

  private replaceHover(ids: Iterable<string>) {
    const next = Array.from(new Set(ids));
    if (next.length === this.hoverIds.size && next.every((id) => this.hoverIds.has(id))) return false;
    this.hoverIds.clear();
    next.forEach((id) => this.hoverIds.add(id));
    return true;
  }
}
