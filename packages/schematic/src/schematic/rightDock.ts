export type RightDockView = "hierarchy" | "analysis" | "netlist";

export interface RightDockState {
  activeView: RightDockView;
}

interface RightDockOptions {
  initial?: Partial<RightDockState>;
  onChange?: (state: RightDockState) => void;
}

const VIEWS: readonly RightDockView[] = ["hierarchy", "analysis", "netlist"];

function isView(value: unknown): value is RightDockView {
  return typeof value === "string" && (VIEWS as readonly string[]).includes(value);
}

export class RightDockController {
  private state: RightDockState;
  private readonly lifecycle = new AbortController();
  private bound = false;

  constructor(
    private readonly root: HTMLElement,
    private readonly options: RightDockOptions = {}
  ) {
    this.state = {
      activeView: isView(options.initial?.activeView) ? options.initial.activeView : "analysis"
    };
  }

  mount() {
    if (this.bound) return;
    this.bound = true;
    this.root.addEventListener("click", (event) => {
      const button = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-right-view]");
      const view = button?.dataset.rightView;
      if (isView(view)) this.setView(view);
    }, { signal: this.lifecycle.signal });
    this.apply();
  }

  destroy() {
    this.lifecycle.abort();
    this.bound = false;
  }

  getState(): RightDockState {
    return { activeView: this.state.activeView };
  }

  activeView(): RightDockView {
    return this.state.activeView;
  }

  setView(view: RightDockView) {
    if (this.state.activeView === view) return;
    this.state = { activeView: view };
    this.apply();
    this.options.onChange?.(this.getState());
  }

  private apply() {
    this.root.querySelectorAll<HTMLElement>("[data-right-panel]").forEach((panel) => {
      const view = panel.dataset.rightPanel;
      if (!isView(view)) return;
      panel.hidden = view !== this.state.activeView;
      panel.classList.toggle("is-active", view === this.state.activeView);
    });
    this.root.querySelectorAll<HTMLElement>("[data-right-view]").forEach((button) => {
      const view = button.dataset.rightView;
      if (!isView(view)) return;
      const active = view === this.state.activeView;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
    });
  }
}
