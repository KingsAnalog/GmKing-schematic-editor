import { describe, expect, it } from "vitest";
import { SCHEMATIC_WORKSPACE_STORAGE_KEY, persistSchematicWorkspaceManifest, readSchematicWorkspaceManifest, persistSchematicDocumentSnapshot, readSchematicDocumentSnapshot, SCHEMATIC_DOCUMENT_STORAGE_PREFIX } from "../../../src/schematic/workspaceAdapter";
describe("standalone workspace storage",()=>{
  it("round-trips a manifest and preserves unrelated storage",()=>{
    const values=new Map([["other-app","keep"]]);
    const storage={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);}};
    const manifest={activeDocumentId:"a",documents:[{id:"a",title:"Circuit"}]};
    persistSchematicWorkspaceManifest(manifest,storage);
    expect(readSchematicWorkspaceManifest(storage)).toEqual(manifest);
    expect(values.get("other-app")).toBe("keep");
    expect(values.has("adc-helper-workspace-v1")).toBe(false);
    persistSchematicDocumentSnapshot("a",{zoom:2},storage);
    expect(readSchematicDocumentSnapshot("a",storage)?.zoom).toBe(2);
    values.set(SCHEMATIC_DOCUMENT_STORAGE_PREFIX+"broken","not-json");
    expect(readSchematicDocumentSnapshot("broken",storage)).toBeUndefined();
    expect(values.get(SCHEMATIC_DOCUMENT_STORAGE_PREFIX+"broken")).toBe("not-json");
    values.set(SCHEMATIC_WORKSPACE_STORAGE_KEY,"not-json");
    expect(readSchematicWorkspaceManifest(storage)).toBeUndefined();
  });
});
