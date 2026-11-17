import { describe, expect, it, vi } from "vitest";
import { createSchematicWorkspacePersistence, SCHEMATIC_VIEW_STORAGE_PREFIX, type WorkspaceWriteLock } from "../../../src/schematic/workspacePersistence";
import { createEmptySchematicDocument } from "../../../src/schematic/document/documentModel";
import { persistSchematicDocumentSnapshot, SCHEMATIC_DOCUMENT_STORAGE_PREFIX } from "../../../src/schematic/workspaceAdapter";
import type { WorkspaceStorage } from "../../../src/shared/workspaceState";

function fixture() {
  const data = new Map<string, string>();
  const storage: WorkspaceStorage = {
    getItem: key => data.get(key) ?? null,
    setItem: vi.fn((key, value) => { data.set(key, value); }),
    removeItem: key => { data.delete(key); }
  };
  const locks = new Map<string, Promise<unknown>>();
  const lock: WorkspaceWriteLock = (key, write) => {
    const task = (locks.get(key) ?? Promise.resolve()).catch(() => {}).then(write);
    locks.set(key, task);
    return task;
  };
  const document = createEmptySchematicDocument();
  document.notes.push({ id: "n", x: 0, y: 0, width: 120, format: "plain", text: "A" });
  persistSchematicDocumentSnapshot("doc", { document, zoom: 1 }, storage);
  const first = createSchematicWorkspacePersistence(storage, lock);
  const second = createSchematicWorkspacePersistence(storage, lock);
  const a = first.readDocument("doc")!;
  const b = second.readDocument("doc")!;
  return { first, second, a, b, data, storage };
}

describe("workspace persistence across windows", () => {
  it("does not overwrite a newer view when an earlier content save completes", async () => {
    const { first, a } = fixture();
    a.document!.notes[0].text = "B";
    const pending = first.persistDocument("doc", { ...a, zoom: 1 });
    first.persistView!("doc", { zoom: 3 });
    await pending;
    expect(first.readDocument("doc")?.zoom).toBe(3);
  });

  it("saves views independently and never writes stale circuit content on Fit", async () => {
    const { first, second, a, b, storage, data } = fixture();
    a.document!.notes[0].text = "B";
    await first.persistDocument("doc", a);
    vi.mocked(storage.setItem).mockClear();
    second.persistView!("doc", { zoom: 2 });
    second.persistView!("doc", { zoom: 2 });
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(storage.setItem).toHaveBeenCalledWith(SCHEMATIC_VIEW_STORAGE_PREFIX + "doc", JSON.stringify({ zoom: 2 }));
    await second.persistDocument("doc", b); // leaving an unchanged stale tab
    expect(JSON.parse(data.get(SCHEMATIC_DOCUMENT_STORAGE_PREFIX + "doc")!).state.document.notes[0].text).toBe("B");
  });

  it("rejects simultaneous edits from the same old version under the shared lock", async () => {
    const { first, second, a, b, data } = fixture();
    a.document!.notes[0].text = "B";
    b.document!.notes[0].text = "C";
    const outcomes = await Promise.allSettled([first.persistDocument("doc", a), second.persistDocument("doc", b)]);
    expect(outcomes.map(result => result.status)).toEqual(["fulfilled", "rejected"]);
    expect(outcomes[1]).toMatchObject({ reason: { name: "SchematicStorageConflict" } });
    expect(b.document!.notes[0].text).toBe("C");
    expect(JSON.parse(data.get(SCHEMATIC_DOCUMENT_STORAGE_PREFIX + "doc")!).state.document.notes[0].text).toBe("B");
  });

  it("serializes successive local edits and captures the value at submission time", async () => {
    const { first, a } = fixture();
    a.document!.notes[0].text = "B";
    const saveB = first.persistDocument("doc", a);
    a.document!.notes[0].text = "C";
    const saveC = first.persistDocument("doc", a);
    expect((await saveB).document!.notes[0].text).toBe("B");
    await saveC;
    expect(first.readDocument("doc")!.document!.notes[0].text).toBe("C");
  });

  it("keeps a failed save retryable without advancing its stored version", async () => {
    const { first, a, storage } = fixture();
    const write = storage.setItem;
    storage.setItem = () => { throw new Error("quota"); };
    a.document!.notes[0].text = "B";
    await expect(first.persistDocument("doc", a)).rejects.toThrow("quota");
    storage.setItem = write;
    await first.persistDocument("doc", a);
    expect(first.readDocument("doc")!.document!.notes[0].text).toBe("B");
  });

  it("does not resurrect a document deleted in another window", async () => {
    const { first, second, b } = fixture();
    await first.removeDocument("doc");
    b.document!.notes[0].text = "C";
    await expect(second.persistDocument("doc", b)).rejects.toMatchObject({ name: "SchematicStorageConflict" });
    expect(second.readDocument("doc")).toBeUndefined();
  });

  it("preserves another window's tab list and rejects divergent manifest edits", async () => {
    const { first, second } = fixture();
    first.readManifest();
    await first.persistManifest({ activeDocumentId: "doc", documents: [{ id: "doc", title: "One" }] });
    const old = second.readManifest()!;
    await first.persistManifest({ activeDocumentId: "doc", documents: [...old.documents, { id: "new", title: "Two" }] });
    await second.persistManifest(old); // selection-only update
    await expect(second.persistManifest({ ...old, documents: [{ id: "doc", title: "Renamed" }] })).rejects.toMatchObject({ name: "SchematicStorageConflict" });
    expect(first.readManifest()!.documents).toHaveLength(2);
  });
});
