import { t } from "./schematicI18n";
import { localizeSchematicStatus } from "./schematicUiText";

export class SchematicNetLabelDialog {
  private dialog?: HTMLDialogElement;

  constructor(private readonly root: HTMLElement) {}

  open(value: string, confirm: (name: string) => string | undefined, cancel: () => void) {
    if (this.dialog?.open) return;
    const document = this.root.ownerDocument;
    const dialog = document.createElement("dialog");
    dialog.className = "schematic-dialog hierarchy-dialog";
    dialog.dataset.schematicNetLabelDialog = "";
    dialog.ariaLabel = t("netLabel.place", "Place Net Label");

    const form = document.createElement("form");
    const heading = document.createElement("h2");
    heading.textContent = dialog.ariaLabel;
    const field = document.createElement("label");
    field.className = "property-row";
    const caption = document.createElement("span");
    caption.textContent = t("netLabel.name", "Net name");
    const input = document.createElement("input");
    input.type = "text";
    input.dataset.netLabelName = "";
    input.spellcheck = false;
    input.autocomplete = "off";
    input.placeholder = "OUT, OUT<7:0>, OUT<3>";
    input.value = value;
    field.append(caption, input);

    const error = document.createElement("div");
    error.className = "property-error";
    error.setAttribute("role", "alert");
    error.hidden = true;
    const actions = document.createElement("div");
    actions.className = "hierarchy-actions";
    const submit = document.createElement("button");
    submit.type = "submit";
    submit.textContent = t("hierarchy.confirm", "Confirm");
    const dismiss = document.createElement("button");
    dismiss.type = "button";
    dismiss.textContent = t("export.cancel", "Cancel");
    dismiss.addEventListener("click", cancel);
    actions.append(submit, dismiss);
    form.append(heading, field, error, actions);
    const submitName = () => {
      const message = confirm(input.value);
      if (!message) return;
      error.textContent = localizeSchematicStatus(message);
      error.hidden = false;
      input.focus();
    };
    form.addEventListener("submit", event => {
      event.preventDefault();
      submitName();
    });
    dialog.addEventListener("keydown", event => {
      if (event.isComposing) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        cancel();
      } else if (event.key === "Enter" && event.target === input) {
        event.preventDefault();
        event.stopPropagation();
        if (!event.repeat) submitName();
      }
    });
    input.addEventListener("input", () => { error.hidden = true; });
    dialog.addEventListener("cancel", event => { event.preventDefault(); cancel(); });
    dialog.append(form);
    this.root.append(dialog);
    this.dialog = dialog;
    dialog.showModal();
    input.select();
  }

  close() {
    this.dialog?.close();
    this.dialog?.remove();
    this.dialog = undefined;
  }
}
