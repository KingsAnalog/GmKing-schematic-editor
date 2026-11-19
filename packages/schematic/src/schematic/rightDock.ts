export type RightDockView = "analysis" | "netlist" | "diagnostics";

export class RightDockController {
  private view: RightDockView = "analysis";
  private readonly lifecycle = new AbortController();
  private bound = false;

  constructor(private readonly root: HTMLElement) {}

  mount() {
    if (this.bound) return;
    this.bound = true;
    const { signal } = this.lifecycle;
    this.root.addEventListener("click", (event) => {
      const button = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-right-view]");
      const view = button?.dataset.rightView;
      if (view === "analysis" || view === "netlist" || view === "diagnostics") this.setView(view);
    }, { signal });
    this.setView("analysis");
  }

  destroy() {
    this.lifecycle.abort();
    this.bound = false;
  }

  activeView(): RightDockView {
    return this.view;
  }

  setView(view: RightDockView) {
    this.view = view;
    this.root.querySelectorAll<HTMLElement>("[data-right-view]").forEach((button) => {
      const active = button.dataset.rightView === view;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
    });
    this.root.querySelectorAll<HTMLElement>("[data-right-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.rightPanel !== view;
    });
  }
}
