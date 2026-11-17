const HOVER_LABEL_ATTRIBUTES = ["aria-label", "title"] as const;

export function suppressSchematicHoverLabels(root: HTMLElement) {
  stripHoverLabels(root);
  const Observer = root.ownerDocument.defaultView?.MutationObserver;
  if (!Observer) return () => {};

  const observer = new Observer((records) => {
    records.forEach((record) => {
      if (record.type === "attributes") {
        stripElementHoverLabels(record.target as Element);
        return;
      }
      record.addedNodes.forEach((node) => {
        if (node.nodeType === 1) stripHoverLabels(node as Element);
      });
    });
  });
  observer.observe(root, {
    attributes: true,
    attributeFilter: [...HOVER_LABEL_ATTRIBUTES],
    childList: true,
    subtree: true
  });
  return () => observer.disconnect();
}

function stripHoverLabels(root: Element) {
  stripElementHoverLabels(root);
  root.querySelectorAll<HTMLElement>("[aria-label], [title]").forEach(stripElementHoverLabels);
}

function stripElementHoverLabels(element: Element) {
  HOVER_LABEL_ATTRIBUTES.forEach((attribute) => element.removeAttribute(attribute));
}
