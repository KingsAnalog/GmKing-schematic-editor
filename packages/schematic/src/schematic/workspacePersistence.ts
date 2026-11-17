import type { SchematicDocumentState, WorkspaceStorage } from "../shared/workspaceState";
import { sanitizeSchematicDocumentState } from "../shared/workspaceTabCodecs";
import type { SchematicWorkspacePort } from "./schematicEditorHostPorts";
import { contentFromDocument } from "./document/documentModel";
import {
  createSchematicDocumentSnapshot, persistSchematicDocumentSnapshot,
  persistSchematicWorkspaceManifest, projectSchematicDocumentRestore,
  readSchematicDocumentSnapshot, readSchematicWorkspaceManifest,
  removeSchematicDocumentSnapshot, SCHEMATIC_DOCUMENT_STORAGE_PREFIX,
  SCHEMATIC_WORKSPACE_STORAGE_KEY
} from "./workspaceAdapter";

export const SCHEMATIC_VIEW_STORAGE_PREFIX = "schematic-view:";
export type WorkspaceWriteLock = <T>(key: string, write: () => T) => Promise<T>;

export class SchematicStorageConflict extends Error {
  constructor() {
    super("This schematic changed in another window. Your local edits are still available; export them before reloading the latest version.");
    this.name = "SchematicStorageConflict";
  }
}

/** Each mounted workspace has its own read versions and serial write queue.
 * The browser supplies Web Locks so checking and writing a version is atomic
 * with respect to other mounted workspaces in the same origin.
 */
export function createSchematicWorkspacePersistence(
  storage: WorkspaceStorage | null,
  withLock: WorkspaceWriteLock = async (_key, write) => write()
): SchematicWorkspacePort {
  const bases = new Map<string, string | null>();
  const queues = new Map<string, Promise<unknown>>();
  let manifestBase: string | null = null;
  const raw = (key: string) => storage?.getItem(key) ?? null;
  const contentVersion = (id: string) => {
    const value = raw(SCHEMATIC_DOCUMENT_STORAGE_PREFIX + id);
    if (!value) return null;
    try {
      const document = JSON.parse(value).state?.document;
      return JSON.stringify(document ?? null);
    }
    catch { return value; }
  };
  function enqueue<T>(key: string, write: () => T): Promise<T> {
    const pending = queues.get(key) ?? Promise.resolve();
    const result = pending.catch(() => {}).then(() => withLock(key, write));
    queues.set(key, result);
    void result.finally(() => { if (queues.get(key) === result) queues.delete(key); }).catch(() => {});
    return result;
  }
  function persistView(id: string, view: Omit<SchematicDocumentState, "document">) {
    if (!storage) return;
    const key = SCHEMATIC_VIEW_STORAGE_PREFIX + id;
    const next = JSON.stringify(view);
    if (raw(key) !== next) storage.setItem(key, next);
  }
  return {
    createDocumentSnapshot: createSchematicDocumentSnapshot,
    projectDocumentRestore: projectSchematicDocumentRestore,
    readManifest() {
      manifestBase = raw(SCHEMATIC_WORKSPACE_STORAGE_KEY);
      return readSchematicWorkspaceManifest(storage);
    },
    persistManifest(snapshot) {
      const next = structuredClone(snapshot);
      return enqueue(SCHEMATIC_WORKSPACE_STORAGE_KEY, () => {
        const current = raw(SCHEMATIC_WORKSPACE_STORAGE_KEY);
        if (storage && current !== manifestBase) {
          // Merely activating a tab never overwrites another window's tab list.
          const previousDocuments = manifestBase ? JSON.parse(manifestBase).documents : [];
          if (JSON.stringify(previousDocuments) !== JSON.stringify(next.documents)) throw new SchematicStorageConflict();
          return readSchematicWorkspaceManifest(storage);
        }
        const saved = persistSchematicWorkspaceManifest(next, storage);
        manifestBase = raw(SCHEMATIC_WORKSPACE_STORAGE_KEY);
        return saved;
      });
    },
    readDocument(id) {
      const version = contentVersion(id);
      bases.set(id, version);
      if (storage && version === null) return undefined;
      const document = readSchematicDocumentSnapshot(id, storage);
      if (!document) return undefined;
      try {
        const view = sanitizeSchematicDocumentState(JSON.parse(raw(SCHEMATIC_VIEW_STORAGE_PREFIX + id) ?? "null"));
        if (view) { const { document: _ignored, ...settings } = view; return { ...document, ...settings }; }
      } catch { /* A damaged view does not invalidate schematic content. */ }
      return document;
    },
    persistView,
    persistDocument(id, snapshot) {
      const captured = structuredClone(snapshot);
      return enqueue(SCHEMATIC_DOCUMENT_STORAGE_PREFIX + id, () => {
        const { document } = captured;
        // Derived junctions are absent from the stored content version.
        const desired = JSON.stringify(document ? contentFromDocument(document) : null);
        const base = bases.get(id) ?? null;
        const current = contentVersion(id);
        if (storage && current !== base && desired !== base && desired !== current) throw new SchematicStorageConflict();
        if (desired !== base || !storage) {
          persistSchematicDocumentSnapshot(id, { document }, storage);
          bases.set(id, contentVersion(id));
        }
        return captured;
      });
    },
    removeDocument(id) {
      return enqueue(SCHEMATIC_DOCUMENT_STORAGE_PREFIX + id, () => {
        if (storage && contentVersion(id) !== (bases.get(id) ?? null)) throw new SchematicStorageConflict();
        removeSchematicDocumentSnapshot(id, storage);
        storage?.removeItem?.(SCHEMATIC_VIEW_STORAGE_PREFIX + id);
        bases.set(id, null);
      });
    }
  };
}
