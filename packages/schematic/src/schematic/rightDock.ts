export type RightDockView = "analysis" | "netlist" | "diagnostics";

export interface RightDockState {
  activeView: RightDockView;
  expanded: RightDockView[];
}

interface RightDockOptions {
  initial?: Partial<RightDockState>;
  onChange?: (state: RightDockState) => void;
}

const VIEWS: readonly RightDockView[] = ["analysis", "netlist", "diagnostics"];

function isView(value: unknown): value is RightDockView {
  return typeof value === "string" && (VIEWS as readonly string[]).includes(value);
}

function uniqueViews(values: readonly RightDockView[]): RightDockView[] {
  return [...new Set(values)];
}

export class RightDockController {
  private state: RightDockState;
  private readonly lifecycle = new AbortController();
  private bound = false;

  constructor(
    private readonly root: HTMLElement,
    private readonly options: RightDockOptions = {}
  ) {
    const expanded = Array.isArray(options.initial?.expanded)
      ? uniqueViews(options.initial!.expanded!.filter(isView))
      : [];
    this.state = {
      activeView: isView(options.initial?.activeView) ? options.initial.activeView : "analysis",
      expanded
    };
  }

  mount() {
    if (this.bound) return;
    this.bound = true;
    this.root.addEventListener("click", (event) => {
      const target = event.target as HTMLElement | null;
      const switcher = target?.closest<HTMLElement>("[data-right-switch]");
      const switchedView = switcher?.dataset.rightSwitch;
      if (isView(switchedView)) {
        this.ensureExpanded(switchedView);
        return;
      }
      const button = target?.closest<HTMLElement>("[data-right-view]");
      const view = button?.dataset.rightView;
      if (isView(view)) this.toggle(view);
    }, { signal: this.lifecycle.signal });
    this.apply();
  }

  destroy() {
    this.lifecycle.abort();
    this.bound = false;
  }

  getState(): RightDockState {
    return { activeView: this.state.activeView, expanded: [...this.state.expanded] };
  }

  setState(state: Partial<RightDockState>) {
    const expanded = Array.isArray(state.expanded)
      ? uniqueViews(state.expanded.filter(isView))
      : [];
    this.state = {
      activeView: isView(state.activeView) ? state.activeView : this.state.activeView,
      expanded
    };
    this.apply();
  }

  isExpanded(view: RightDockView) {
    return this.state.expanded.includes(view);
  }

  /** Expand a view without collapsing it, used when the panel is opened from its handle. */
  ensureExpanded(view: RightDockView = this.state.activeView): RightDockState {
    if (!this.state.expanded.includes(view)) {
      this.state = { activeView: view, expanded: [...this.state.expanded, view] };
    } else {
      this.state = { ...this.state, activeView: view };
    }
    this.apply();
    this.scrollToView(view);
    this.emit();
    return this.getState();
  }

  toggle(view: RightDockView): RightDockState {
    const wasExpanded = this.state.expanded.includes(view);
    let expanded: RightDockView[];
    if (wasExpanded) {
      expanded = this.state.expanded.filter(item => item !== view);
    } else {
      expanded = [...this.state.expanded, view];
    }
    const activeView = wasExpanded && expanded.length > 0
      ? expanded[expanded.length - 1]
      : view;
    this.state = { activeView, expanded };
    this.apply();
    if (!wasExpanded) this.scrollToView(view);
    this.emit();
    return this.getState();
  }

  private scrollToView(view: RightDockView) {
    const section = this.root.querySelector<HTMLElement>(`[data-right-panel="${view}"]`);
    section?.scrollIntoView({ block: "nearest" });
  }

  private apply() {
    this.root.querySelectorAll<HTMLElement>("[data-right-panel]").forEach((section) => {
      const view = section.dataset.rightPanel;
      if (!isView(view)) return;
      const expanded = this.state.expanded.includes(view);
      const body = section.querySelector<HTMLElement>("[data-right-body]");
      if (body) body.hidden = !expanded;
      section.classList.toggle("is-expanded", expanded);
      section.classList.toggle("is-active", view === this.state.activeView);
    });
    this.root.querySelectorAll<HTMLElement>("[data-right-view]").forEach((button) => {
      const view = button.dataset.rightView;
      if (!isView(view)) return;
      const expanded = this.state.expanded.includes(view);
      button.setAttribute("aria-expanded", String(expanded));
      button.classList.toggle("is-expanded", expanded);
      button.classList.toggle("is-active", view === this.state.activeView);
    });
    this.root.querySelectorAll<HTMLElement>("[data-right-switch]").forEach((button) => {
      const view = button.dataset.rightSwitch;
      if (!isView(view)) return;
      button.classList.toggle("is-active", view === this.state.activeView);
      button.setAttribute("aria-selected", String(view === this.state.activeView));
    });
  }

  private emit() {
    this.options.onChange?.(this.getState());
  }
}
