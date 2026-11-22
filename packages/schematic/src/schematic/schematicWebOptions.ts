import { refreshSchematicMessages, type SchematicLanguage } from "./schematicI18n";

type ColorMode = "system" | "light" | "dark";

export function bindSchematicWebOptions(root: HTMLElement, onLanguageChange: () => void) {
  const { ownerDocument } = root;
  const view = ownerDocument.defaultView;
  const dialog = root.querySelector<HTMLDialogElement>("[data-schematic-options-dialog]");
  if (!view || !dialog) return () => {};
  const html = ownerDocument.documentElement;
  const controller = new view.AbortController();
  const { signal } = controller;
  const colorPreference = view.matchMedia?.("(prefers-color-scheme: dark)");
  const languageSelect = dialog.querySelector<HTMLSelectElement>("[data-schematic-language-select]");
  const themeSelect = dialog.querySelector<HTMLSelectElement>("[data-schematic-theme-select]");
  const languageKey = "at-lang";
  const themeKey = "at-theme";
  let mode: ColorMode = "system";

  const read = (key: string) => {
    try { return view.localStorage.getItem(key); } catch { return null; }
  };
  const store = (key: string, value: string | null) => {
    try {
      if (value === null) view.localStorage.removeItem(key);
      else view.localStorage.setItem(key, value);
    } catch {
      // Apply the preference in memory for this tab.
    }
  };
  const setLanguage = (language: SchematicLanguage, notify: boolean) => {
    const changed = html.dataset.schematicLanguage !== language;
    html.dataset.schematicLanguage = language;
    html.lang = language === "zh" ? "zh-CN" : "en";
    if (languageSelect) languageSelect.value = language;
    if (changed || !notify) refreshSchematicMessages(root);
    if (changed && notify) onLanguageChange();
  };
  const applyTheme = () => {
    if (mode === "system") delete html.dataset.theme;
    else html.dataset.theme = mode;
    html.dataset.effectiveTheme = mode === "system" ? (colorPreference?.matches ? "dark" : "light") : mode;
    if (themeSelect) themeSelect.value = mode;
  };
  const readTheme = () => {
    const stored = read(themeKey);
    mode = stored === "dark" || stored === "light" ? stored : "system";
    applyTheme();
  };
  setLanguage(read(languageKey) === "zh" ? "zh" : "en", false);
  readTheme();
  languageSelect?.addEventListener("change", () => {
    const language = languageSelect.value === "zh" ? "zh" : "en";
    store(languageKey, language);
    setLanguage(language, true);
  }, { signal });
  themeSelect?.addEventListener("change", () => {
    const selected = themeSelect.value;
    mode = selected === "dark" || selected === "light" ? selected : "system";
    store(themeKey, mode === "system" ? null : mode);
    applyTheme();
  }, { signal });
  colorPreference?.addEventListener("change", applyTheme, { signal });
  view.addEventListener("storage", event => {
    if (!event.key || event.key === languageKey) setLanguage(read(languageKey) === "zh" ? "zh" : "en", true);
    if (!event.key || event.key === themeKey) readTheme();
  }, { signal });

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
