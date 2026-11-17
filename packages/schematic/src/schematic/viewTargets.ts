export type SchematicViewTargetKind = "component" | "wire" | "junction" | "net-label" | "note";

export type SchematicViewTarget = {
  kind: SchematicViewTargetKind;
  id: string;
};

export type ModelTargetKind = Extract<SchematicViewTargetKind, "component" | "wire" | "net-label">;

export interface ModelLike {
  readonly id?: unknown;
  get(attribute: string): unknown;
}

export interface ViewTargetFromModelOptions {
  readonly enabledKinds?: readonly ModelTargetKind[];
  readonly fallbackKind?: ModelTargetKind;
  readonly junctionId?: string | null;
  readonly requireJunctionId?: boolean;
}

const DEFAULT_MODEL_TARGET_KINDS: readonly ModelTargetKind[] = ["component", "wire", "net-label"];

function stringId(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function viewTargetFromNoteId(noteId: string | null | undefined): SchematicViewTarget | null {
  const id = stringId(noteId);
  return id ? { kind: "note", id } : null;
}

export function viewTargetFromJunctionId(junctionId: string | null | undefined): SchematicViewTarget | null {
  const id = stringId(junctionId);
  return id ? { kind: "junction", id } : null;
}

export function viewTargetFromModel(model: ModelLike | null | undefined, options: ViewTargetFromModelOptions = {}): SchematicViewTarget | null {
  if (!model || model.get("preview")) return null;

  if (model.get("junction")) {
    const id = stringId(options.junctionId) ?? (options.requireJunctionId ? null : stringId(model.id));
    return id ? { kind: "junction", id } : null;
  }

  const enabledKinds = options.enabledKinds ?? DEFAULT_MODEL_TARGET_KINDS;
  if (enabledKinds.includes("component")) {
    const componentId = stringId(model.get("componentId"));
    if (componentId) return { kind: "component", id: componentId };
  }

  if (enabledKinds.includes("wire")) {
    const wireId = stringId(model.get("wireId"));
    if (wireId) return { kind: "wire", id: wireId };
  }

  if (enabledKinds.includes("net-label")) {
    const labelId = stringId(model.get("netLabelId"));
    if (labelId) return { kind: "net-label", id: labelId };
  }

  const fallbackId = stringId(model.id);
  return options.fallbackKind && fallbackId ? { kind: options.fallbackKind, id: fallbackId } : null;
}

export function viewTargetIdsFromModel(model: ModelLike | null | undefined, options: ViewTargetFromModelOptions = {}) {
  const target = viewTargetFromModel(model, options);
  return target ? [target.id] : [];
}
