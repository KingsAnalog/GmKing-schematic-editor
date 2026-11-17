import type { SchematicSelectionSummary, SchematicSelectionSummaryPart } from "./selectionSummary";

export function renderSchematicSelectionSummary(target: HTMLElement, summary: SchematicSelectionSummary) {
  if (summary.kind === "plain") {
    target.textContent = summary.text;
    return;
  }

  const document = target.ownerDocument;
  const nodes: Node[] = [];
  const title = document.createElement("strong");
  title.textContent = summary.title;
  nodes.push(title);

  if (summary.parts.length > 0) {
    nodes.push(document.createTextNode(" "));
    summary.parts.forEach((part, index) => {
      if (index > 0) nodes.push(document.createTextNode(summary.separator === "comma" ? ", " : " "));
      nodes.push(renderSchematicSelectionSummaryPart(document, part));
    });
  }

  target.replaceChildren(...nodes);
}

function renderSchematicSelectionSummaryPart(document: Document, part: SchematicSelectionSummaryPart) {
  if (!part.muted) return document.createTextNode(part.text);
  const span = document.createElement("span");
  span.textContent = part.text;
  return span;
}
