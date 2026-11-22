import {
  type SchematicDocumentState,
  type SchematicTabState,
  type SchematicWorkspaceDocument,
  type WorkspaceStorage
} from "../shared/workspaceState";
import { sanitizeSchematicDocumentState, sanitizeSchematicTab } from "../shared/workspaceTabCodecs";
import {
  cloneSchematicDocument,
  contentFromDocument,
  documentFromContent
} from "./document/documentModel";
import { parseSchematicContent, SCHEMATIC_FILE_FORMAT } from "./schematicDocumentCodec";
import { decodeSchematicProject } from "./schematicProject";
import type {
  AnalysisPortSelection,
  Point,
  SchematicContent,
  SchematicDocument
} from "./types";
import { clamp } from "./uiUtils";
import { defaultSchematicView, type SchematicView } from "./viewAdapter";

export interface SchematicWorkspaceSnapshotInput {
  analysisSelection: AnalysisPortSelection;
  zoom: number;
  viewTranslate: Point;
  presentationMode: boolean;
}

export interface SchematicWorkspaceRestoreOptions {
  minZoom: number;
  maxZoom: number;
  defaultView?: SchematicView;
}

export interface SchematicWorkspaceRestoreProjection {
  document?: SchematicDocument;
  presentationMode: boolean;
  view: SchematicView;
  analysisSelection?: AnalysisPortSelection;
}

export interface SchematicWorkspaceManifest {
  activeDocumentId: string;
  documents: SchematicWorkspaceDocument[];
}

export const SCHEMATIC_DOCUMENT_STORAGE_PREFIX = "adc-helper-schematic:";
export const SCHEMATIC_DOCUMENT_SNAPSHOT_FORMAT = "adc-helper/schematic-workspace-snapshot";

interface SchematicDocumentSnapshotEnvelope {
  format: typeof SCHEMATIC_DOCUMENT_SNAPSHOT_FORMAT;
  state: Omit<SchematicDocumentState, "document"> & { document?: SchematicContent };
}

export const SCHEMATIC_WORKSPACE_STORAGE_KEY = "schematic-workspace";
let memoryManifest: SchematicWorkspaceManifest | undefined;

const memoryDocuments = new Map<string, SchematicDocumentState>();
const storageMemoryDocuments = new WeakMap<WorkspaceStorage, Map<string, SchematicDocumentState>>();

export function createSchematicDocumentSnapshot(document: SchematicDocument, input: SchematicWorkspaceSnapshotInput): SchematicDocumentState {
  return cloneSchematicDocumentSnapshot({
    document,
    analysisSelection: input.analysisSelection,
    zoom: input.zoom,
    viewTranslate: input.viewTranslate,
    presentationMode: input.presentationMode
  });
}

export function readSchematicWorkspaceManifest(storage?: WorkspaceStorage | null): SchematicWorkspaceManifest | undefined {
  const target = resolveStorage(storage);
  if (!target) return memoryManifest ? cloneSchematicWorkspaceManifest(memoryManifest) : undefined;
  try {
    const stored = sanitizeSchematicTab(JSON.parse(target.getItem(SCHEMATIC_WORKSPACE_STORAGE_KEY) ?? "null"));
    return stored ? cloneSchematicWorkspaceManifest(stored) : undefined;
  } catch { return undefined; }
}

export function persistSchematicWorkspaceManifest(snapshot: SchematicWorkspaceManifest, storage?: WorkspaceStorage | null) {
  const target = resolveStorage(storage);
  return persistSchematicWorkspaceManifestValue(snapshot, target);
}

function persistSchematicWorkspaceManifestValue(snapshot: SchematicWorkspaceManifest, target: WorkspaceStorage | null) {
  const cloned = cloneSchematicWorkspaceManifest(snapshot);
  if (target) target.setItem(SCHEMATIC_WORKSPACE_STORAGE_KEY, JSON.stringify(cloned));
  else memoryManifest = cloned;
  return cloned;
}

export function readSchematicDocumentSnapshot(id: string, storage?: WorkspaceStorage | null): SchematicDocumentState | undefined {
  const target = resolveStorage(storage);
  const memorySnapshot = cachedSchematicDocumentSnapshot(id, target);
  if (!target) {
    return memorySnapshot ? cloneSchematicDocumentSnapshot(memorySnapshot) : undefined;
  }
  const currentRaw = readStorageItem(target, schematicDocumentStorageKey(id));
  const current = decodeSchematicDocumentSnapshotEnvelope(currentRaw);
  if (current) {
    cacheSchematicDocumentSnapshot(id, current, target);
    return cloneSchematicDocumentSnapshot(current);
  }
  const hasStoredSnapshot = currentRaw !== null && currentRaw !== undefined;
  if (hasStoredSnapshot) return undefined;
  return memorySnapshot ? cloneSchematicDocumentSnapshot(memorySnapshot) : undefined;
}

export function persistSchematicDocumentSnapshot(
  id: string,
  snapshot: SchematicDocumentState,
  storage?: WorkspaceStorage | null
) {
  const target = resolveStorage(storage);
  const cloned = cloneSchematicDocumentSnapshot(snapshot);
  if (!target) {
    cacheSchematicDocumentSnapshot(id, cloned, target);
    return cloneSchematicDocumentSnapshot(cloned);
  }
  target.setItem(schematicDocumentStorageKey(id), serializeSchematicDocumentSnapshotEnvelope(cloned));
  cacheSchematicDocumentSnapshot(id, cloned, target);
  return cloneSchematicDocumentSnapshot(cloned);
}

export function removeSchematicDocumentSnapshot(id: string, storage?: WorkspaceStorage | null) {
  const target = resolveStorage(storage);
  deleteCachedSchematicDocumentSnapshot(id, target);
  target?.removeItem?.(schematicDocumentStorageKey(id));
}

export function projectSchematicDocumentRestore(
  state: SchematicDocumentState | undefined,
  options: SchematicWorkspaceRestoreOptions
): SchematicWorkspaceRestoreProjection {
  const fallbackView = options.defaultView ? cloneSchematicView(options.defaultView) : defaultSchematicView();
  const viewTranslate = state?.viewTranslate ? clonePoint(state.viewTranslate) : fallbackView.translate;
  const projection: SchematicWorkspaceRestoreProjection = {
    presentationMode: state?.presentationMode ?? false,
    view: {
      zoom: clamp(state?.zoom ?? fallbackView.zoom, options.minZoom, options.maxZoom),
      translate: viewTranslate
    }
  };
  if (state?.document) projection.document = cloneSchematicDocument(state.document);
  if (state?.analysisSelection) projection.analysisSelection = cloneAnalysisSelection(state.analysisSelection);
  return projection;
}

function cloneSchematicDocumentSnapshot(snapshot: SchematicDocumentState): SchematicDocumentState {
  const next: SchematicDocumentState = {};
  if (snapshot.document) next.document = cloneSchematicDocument(snapshot.document);
  if (snapshot.project) next.project = structuredClone(snapshot.project);
  if (snapshot.sheetPath) next.sheetPath = structuredClone(snapshot.sheetPath);
  if (snapshot.analysisSelection) next.analysisSelection = cloneAnalysisSelection(snapshot.analysisSelection);
  if (snapshot.zoom !== undefined) next.zoom = snapshot.zoom;
  if (snapshot.viewTranslate) next.viewTranslate = clonePoint(snapshot.viewTranslate);
  if (snapshot.presentationMode !== undefined) next.presentationMode = snapshot.presentationMode;
  return next;
}

function cloneSchematicWorkspaceManifest(snapshot: Pick<SchematicTabState, "activeDocumentId" | "documents">): SchematicWorkspaceManifest {
  return {
    activeDocumentId: snapshot.activeDocumentId,
    documents: snapshot.documents.map(cloneSchematicWorkspaceDocument)
  };
}

function cloneSchematicWorkspaceDocument(document: SchematicWorkspaceDocument): SchematicWorkspaceDocument {
  return {
    id: document.id,
    title: document.title
  };
}

function cachedSchematicDocumentSnapshot(id: string, storage: WorkspaceStorage | null) {
  return storage ? storageMemoryDocuments.get(storage)?.get(id) : memoryDocuments.get(id);
}

function cacheSchematicDocumentSnapshot(
  id: string,
  snapshot: SchematicDocumentState,
  storage: WorkspaceStorage | null
) {
  if (!storage) {
    memoryDocuments.set(id, cloneSchematicDocumentSnapshot(snapshot));
    return;
  }
  let documents = storageMemoryDocuments.get(storage);
  if (!documents) {
    documents = new Map<string, SchematicDocumentState>();
    storageMemoryDocuments.set(storage, documents);
  }
  documents.set(id, cloneSchematicDocumentSnapshot(snapshot));
}

function deleteCachedSchematicDocumentSnapshot(id: string, storage: WorkspaceStorage | null) {
  if (storage) storageMemoryDocuments.get(storage)?.delete(id);
  else memoryDocuments.delete(id);
}

function schematicDocumentStorageKey(id: string) {
  return `${SCHEMATIC_DOCUMENT_STORAGE_PREFIX}${id}`;
}

function readStorageItem(storage: WorkspaceStorage, key: string) {
  try {
    return storage.getItem(key);
  } catch {
    return undefined;
  }
}

function serializeSchematicDocumentSnapshotEnvelope(state: SchematicDocumentState) {
  const envelope: SchematicDocumentSnapshotEnvelope = {
    format: SCHEMATIC_DOCUMENT_SNAPSHOT_FORMAT,
    state: persistentSchematicDocumentSnapshot(state)
  };
  return JSON.stringify(envelope);
}

function persistentSchematicDocumentSnapshot(
  snapshot: SchematicDocumentState
): SchematicDocumentSnapshotEnvelope["state"] {
  const cloned = cloneSchematicDocumentSnapshot(snapshot);
  const { document, ...state } = cloned;
  return document
    ? { ...state, document: contentFromDocument(document) }
    : state;
}

function decodeSchematicDocumentSnapshotEnvelope(raw: string | null | undefined) {
  if (!raw) return undefined;
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (
      !value
      || typeof value !== "object"
      || Array.isArray(value)
      || value.format !== SCHEMATIC_DOCUMENT_SNAPSHOT_FORMAT
      || Object.keys(value).some(key => key !== "format" && key !== "state")
    ) {
      return undefined;
    }
    return normalizeStoredSchematicDocumentState(value.state);
  } catch {
    return undefined;
  }
}

function normalizeStoredSchematicDocumentState(value: unknown): SchematicDocumentState | undefined {
  const sanitized = sanitizeSchematicDocumentState(value);
  const emptyState = isEmptyRecord(value) ? {} : undefined;
  const state: SchematicDocumentState | undefined = sanitized ?? emptyState;
  if (!state) return undefined;
  try {
    const stored = value as Pick<SchematicDocumentState, "project" | "sheetPath">;
    if (stored.project) state.project = decodeSchematicProject(stored.project);
    if (Array.isArray(stored.sheetPath) && stored.sheetPath.every(step => step && typeof step.sheetId === "string"
      && (step.instanceId === undefined || typeof step.instanceId === "string"))) state.sheetPath = stored.sheetPath;
    if (state.document) {
      const content = (value as { document: unknown }).document;
      state.document = documentFromContent(parseSchematicContent(JSON.stringify({
        format: SCHEMATIC_FILE_FORMAT,
        schematic: content
      })));
    }
    return cloneSchematicDocumentSnapshot(state);
  } catch {
    return undefined;
  }
}

function isEmptyRecord(value: unknown): value is Record<string, never> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.keys(value).length === 0;
}

function resolveStorage(storage: WorkspaceStorage | null | undefined): WorkspaceStorage | null {
  if (storage !== undefined) return storage;
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function cloneAnalysisSelection(selection: AnalysisPortSelection): AnalysisPortSelection {
  return { ...selection };
}

function clonePoint(point: Point): Point {
  return { ...point };
}

function cloneSchematicView(view: SchematicView): SchematicView {
  return {
    zoom: view.zoom,
    translate: clonePoint(view.translate)
  };
}
