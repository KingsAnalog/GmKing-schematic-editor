export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

export function escapeAttribute(value: string) {
  return escapeHtml(value);
}
