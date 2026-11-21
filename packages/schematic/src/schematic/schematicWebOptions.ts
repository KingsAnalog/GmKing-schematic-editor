import { refreshSchematicMessages } from "./schematicI18n";

export function bindSchematicWebOptions(root: HTMLElement) {
  const { ownerDocument } = root;
  const view = ownerDocument.defaultView;
  const dialog = root.querySelector<HTMLDialogElement>("[data-schematic-options-dialog]");
  if (!view || !dialog) return () => {};

  const html = ownerDocument.documentElement;
  html.lang = "en";
  html.dataset.schematicLanguage = "en";
  html.dataset.theme = "light";
  html.dataset.effectiveTheme = "light";
  refreshSchematicMessages(root);

  const controller = new view.AbortController();
  const { signal } = controller;

  root.querySelector("[data-schematic-open-options]")?.addEventListener("click", () => {
    if (!dialog.open) dialog.showModal();
  }, { signal });
  dialog.querySelector("[data-schematic-options-close]")?.addEventListener("click", () => dialog.close(), { signal });
  dialog.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    dialog.close();
  }, { signal });
  return () => {
    controller.abort();
    if (dialog.open) dialog.close();
  };
}
