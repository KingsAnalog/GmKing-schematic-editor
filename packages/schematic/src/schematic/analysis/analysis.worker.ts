import { analyzeSchematic } from "./analysis";
import type { AnalysisPortSelection, AnalysisResult, SchematicDocument } from "../types";

interface AnalysisRequest {
  id: number;
  document: SchematicDocument;
  selection: AnalysisPortSelection;
}

interface AnalysisResponse {
  id: number;
  result: AnalysisResult;
}

self.addEventListener("message", (event: MessageEvent<AnalysisRequest>) => {
  const { id, document, selection } = event.data;
  try {
    const result = analyzeSchematic(document, selection);
    self.postMessage({ id, result } satisfies AnalysisResponse);
  } catch (error) {
    self.postMessage({
      id,
      result: {
        ok: false,
        diagnostics: [error instanceof Error ? error.message : "Symbolic analysis failed."]
      }
    } satisfies AnalysisResponse);
  }
});

export {};
