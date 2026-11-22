import type { AnalysisPortSelection, SchematicDocument } from "../schematic/types";
import type { SchematicProject } from "../schematic/schematicProject";
export interface SchematicDocumentState {
  document?: SchematicDocument;
  project?: SchematicProject;
  sheetPath?: { sheetId: string; instanceId?: string }[];
  analysisSelection?: AnalysisPortSelection;
  zoom?: number;
  viewTranslate?: { x: number; y: number };
  presentationMode?: boolean;
}

export interface SchematicWorkspaceDocument {
  id: string;
  title: string;
}

export interface SchematicTabState {
  activeDocumentId: string;
  documents: SchematicWorkspaceDocument[];
}

export interface WorkspaceStorage {
  readonly length?: number;
  key?: (index: number) => string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): unknown;
  removeItem?: (key: string) => unknown;
}
