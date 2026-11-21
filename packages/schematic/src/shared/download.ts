export function downloadBlob(blob: Blob, filename: string, ownerDocument = document) {
  const ownerWindow = ownerDocument.defaultView;
  if (!ownerWindow) throw new Error("Download window is unavailable.");
  const url = ownerWindow.URL.createObjectURL(blob);
  let link: HTMLAnchorElement | undefined;
  try {
    link = ownerDocument.createElement("a");
    link.href = url;
    link.download = filename;
    link.hidden = true;
    ownerDocument.body.appendChild(link);
    link.click();
  } finally {
    try {
      link?.remove();
    } finally {
      try {
        ownerWindow.setTimeout(() => ownerWindow.URL.revokeObjectURL(url), 1000);
      } catch {
        ownerWindow.URL.revokeObjectURL(url);
      }
    }
  }
}
