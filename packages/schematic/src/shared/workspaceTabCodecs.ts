import type { SchematicDocumentState, SchematicTabState, SchematicWorkspaceDocument } from "./workspaceState";
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function finite(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function finitePositive(value: unknown): number | undefined {
  const numeric = finite(value);
  return numeric !== undefined && numeric > 0 ? numeric : undefined;
}

export function finiteBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

const SCHEMATIC_DOCUMENT_COLLECTIONS = [
  "components",
  "wires",
  "junctionAppearances",
  "netLabels",
  "notes"
] as const;

function sanitizeSchematicDocument(value: unknown): SchematicDocumentState["document"] | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const candidate = value as Record<string, unknown>;
  if (!candidate.connections || typeof candidate.connections !== "object" || Array.isArray(candidate.connections)) return undefined;
  if (SCHEMATIC_DOCUMENT_COLLECTIONS.some((key) => !Array.isArray(candidate[key]))) {
    return undefined;
  }
  return clone({
    ...candidate,
    components: candidate.components,
    wires: candidate.wires,
    junctions: candidate.junctions ?? [],
    junctionAppearances: candidate.junctionAppearances,
    netLabels: candidate.netLabels,
    notes: candidate.notes
  }) as SchematicDocumentState["document"];
}

export function sanitizeSchematicDocumentState(value: unknown): SchematicDocumentState | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const next: SchematicDocumentState = {};
  if ("document" in record) {
    const document = sanitizeSchematicDocument(record.document);
    if (!document) return undefined;
    next.document = document;
  }
  if (record.analysisSelection && typeof record.analysisSelection === "object") {
    const selection = record.analysisSelection as Record<string, unknown>;
    next.analysisSelection = {
      inputP: typeof selection.inputP === "string" ? selection.inputP : "",
      inputN: typeof selection.inputN === "string" ? selection.inputN : "",
      outputP: typeof selection.outputP === "string" ? selection.outputP : "",
      outputN: typeof selection.outputN === "string" ? selection.outputN : ""
    };
  }
  const zoom = finitePositive(record.zoom);
  if (zoom !== undefined) next.zoom = zoom;
  if (record.viewTranslate && typeof record.viewTranslate === "object") {
    const translate = record.viewTranslate as Record<string, unknown>;
    const x = finite(translate.x);
    const y = finite(translate.y);
    if (x !== undefined && y !== undefined) next.viewTranslate = { x, y };
  }
  const presentationMode = finiteBoolean(record.presentationMode);
  if (presentationMode !== undefined) next.presentationMode = presentationMode;
  return Object.keys(next).length > 0 ? next : undefined;
}

export function sanitizeSchematicTab(value: unknown): SchematicTabState | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.documents)) return undefined;

  const ids = new Set<string>();
  const documents: SchematicWorkspaceDocument[] = [];
  record.documents.forEach((value, index) => {
    if (!value || typeof value !== "object") return;
    const candidate = value as Record<string, unknown>;
    const id = typeof candidate.id === "string" ? candidate.id.trim() : "";
    if (!id || ids.has(id)) return;
    const title = typeof candidate.title === "string" && candidate.title.trim()
      ? candidate.title.trim()
      : `Schematic ${index + 1}`;
    ids.add(id);
    documents.push({ id, title });
  });
  if (documents.length === 0) return undefined;
  const activeDocumentId =
    typeof record.activeDocumentId === "string" && ids.has(record.activeDocumentId)
      ? record.activeDocumentId
      : documents[0].id;
  return { activeDocumentId, documents };
}
