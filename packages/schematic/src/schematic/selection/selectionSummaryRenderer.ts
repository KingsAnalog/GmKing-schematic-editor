import type { SchematicSelectionSummary, SchematicSelectionSummaryPart } from "./selectionSummary";
import { localizeSchematicStatus } from "../schematicUiText";

export function renderSchematicSelectionSummary(target: HTMLElement, summary: SchematicSelectionSummary) {
  if (summary.kind === "plain") {
    target.textContent = localizeSchematicStatus(summary.text);
    return;
  }

  const document = target.ownerDocument;
  const nodes: Node[] = [];
  const title = document.createElement("strong");
  title.textContent = localizeSchematicStatus(summary.title);
  nodes.push(title);

  if (summary.parts.length > 0) {
    nodes.push(document.createTextNode(" "));
    summary.parts.forEach((part, index) => {
      if (index > 0) nodes.push(document.createTextNode(summary.separator === "comma" ? ", " : " "));
      nodes.push(renderSchematicSelectionSummaryPart(document, part, summary.title === "Tool:"));
    });
  }

  target.replaceChildren(...nodes);
}

function renderSchematicSelectionSummaryPart(document: Document, part: SchematicSelectionSummaryPart, tool: boolean) {
  if (!part.muted) return document.createTextNode(tool ? localizeSchematicStatus(part.text) : part.text);
  const span = document.createElement("span");
  span.textContent = localizeSchematicStatus(part.text);
  return span;
}
