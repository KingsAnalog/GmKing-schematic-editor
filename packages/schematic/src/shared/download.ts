export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  let link: HTMLAnchorElement | undefined;
  try {
    link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.hidden = true;
    document.body.appendChild(link);
    link.click();
  } finally {
    try {
      link?.remove();
    } finally {
      try {
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      } catch {
        URL.revokeObjectURL(url);
      }
    }
  }
}
