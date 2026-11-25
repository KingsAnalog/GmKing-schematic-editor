(() => {
  const html = document.documentElement;
  const system = matchMedia("(prefers-color-scheme: dark)");
  function apply() {
    let language;
    let theme;
    try {
      language = localStorage.getItem("at-lang");
      theme = localStorage.getItem("at-theme");
    } catch {
      // The page still works if browser storage is disabled.
    }
    html.dataset.schematicLanguage = language === "zh" ? "zh" : "en";
    html.lang = language === "zh" ? "zh-CN" : "en";
    const manualTitle = html.dataset.manualTitle;
    if (manualTitle) document.title = language === "zh" ? manualTitle : "Schematic Editor Help";
    if (theme === "dark" || theme === "light") html.dataset.theme = theme;
    else delete html.dataset.theme;
    html.dataset.effectiveTheme = html.dataset.theme ?? (system.matches ? "dark" : "light");
  }
  apply();
  if (html.hasAttribute("data-manual-title")) {
    system.addEventListener("change", apply);
    addEventListener("storage", event => {
      if (!event.key || event.key === "at-lang" || event.key === "at-theme") apply();
    });
  }
})();
