import {
  projectSchematicToolbarCommand,
  type ToolbarCommandProjection,
  type ToolbarProjectionInput
} from "./toolState";

type ToolbarButtonProjection = (state: ToolbarProjectionInput, button: { command?: string; kind?: string }) => ToolbarCommandProjection;

export interface SchematicToolbarControllerOptions {
  onCommand: (command: string) => void;
  projectCommand?: ToolbarButtonProjection;
}

export class SchematicToolbarController {
  private readonly projectCommand: ToolbarButtonProjection;
  private bound = false;

  constructor(
    private readonly root: Element,
    private readonly options: SchematicToolbarControllerOptions
  ) {
    this.projectCommand = options.projectCommand ?? projectSchematicToolbarCommand;
  }

  bind() {
    if (this.bound) return;
    this.root.addEventListener("click", this.handleClick);
    this.bound = true;
  }

  destroy() {
    if (!this.bound) return;
    this.root.removeEventListener("click", this.handleClick);
    this.bound = false;
  }

  sync(state: ToolbarProjectionInput) {
    this.root.querySelectorAll<HTMLButtonElement>("[data-command]").forEach((button) => {
      const projection = this.projectCommand(state, { command: button.dataset.command, kind: button.dataset.commandKind });
      this.applyProjection(button, projection);
    });
  }

  private readonly handleClick = (event: Event) => {
    const button = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>("[data-command]");
    if (!button || !this.root.contains(button)) return;
    this.options.onCommand(button.dataset.command ?? "");
  };

  private applyProjection(button: HTMLButtonElement, projection: ToolbarCommandProjection) {
    button.classList.toggle("is-active", projection.active);
    if (projection.ariaPressed !== null) {
      button.setAttribute("aria-pressed", String(projection.ariaPressed));
    } else {
      button.removeAttribute("aria-pressed");
    }
    if (projection.disabled !== undefined) button.disabled = projection.disabled;
  }
}
