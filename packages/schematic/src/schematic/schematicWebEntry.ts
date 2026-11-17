import { renderSchematicTabShell } from "./schematicTabShell";
import { SchematicWebEditorHostController } from "./schematicWebEditorHostController";
import { mountSchematicWebHost, createSchematicWebHostServices, type SchematicWebHostOptions } from "./schematicWebHost";

export function renderSchematicTab() {
  return renderSchematicTabShell();
}

export type { SchematicWebHostOptions };

export function initSchematicEditor(root: HTMLElement, options: SchematicWebHostOptions = {}) {
  return mountSchematicWebHost(
    root,
    (mounts, services) => new SchematicWebEditorHostController(mounts, services),
    createSchematicWebHostServices(root, options)
  );
}
