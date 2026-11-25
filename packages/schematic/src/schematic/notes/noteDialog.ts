import { t } from "../schematicI18n";
import { NOTE_ANCHORS, type SchematicNoteAnchor } from "../types";
import { DEFAULT_NOTE_ANCHOR } from "./noteGeometry";
import { DEFAULT_NOTE_FONT_SIZE_PX, MAX_NOTE_FONT_SIZE_PX, MIN_NOTE_FONT_SIZE_PX } from "./noteSizing";

export const NOTE_ANCHOR_LABELS: Record<SchematicNoteAnchor, string> = {
  upperLeft: "Upper left", centerLeft: "Center left", lowerLeft: "Lower left",
  upperCenter: "Upper center", centerCenter: "Center", lowerCenter: "Lower center",
  upperRight: "Upper right", centerRight: "Center right", lowerRight: "Lower right"
};

export interface NoteDraft {
  text: string;
  fontSizePx: number;
  anchor: SchematicNoteAnchor;
}

export class SchematicNoteDialog {
  private dialog?: HTMLDialogElement;

  constructor(private readonly root: HTMLElement) {}

  open(confirm: (draft: NoteDraft) => void, cancel: () => void) {
    if (this.dialog?.open) return;
    const doc = this.root.ownerDocument;
    const dialog = doc.createElement("dialog");
    dialog.className = "schematic-dialog schematic-note-dialog";
    dialog.dataset.schematicNoteDialog = "";
    dialog.setAttribute("aria-label", t("note.place", "Place Note"));
    const form = doc.createElement("form");
    const text = doc.createElement("textarea");
    text.dataset.noteText = "";
    text.rows = 5;
    text.required = true;
    text.spellcheck = false;
    const font = doc.createElement("input");
    font.dataset.noteFontSize = "";
    font.type = "number";
    font.min = String(MIN_NOTE_FONT_SIZE_PX);
    font.max = String(MAX_NOTE_FONT_SIZE_PX);
    font.step = "1";
    font.value = String(DEFAULT_NOTE_FONT_SIZE_PX);
    font.required = true;
    const anchor = doc.createElement("select");
    anchor.dataset.noteAnchor = "";
    for (const name of NOTE_ANCHORS) {
      const option = doc.createElement("option");
      option.value = name;
      option.textContent = t(`note.anchor.${name}`, NOTE_ANCHOR_LABELS[name]);
      anchor.append(option);
    }
    anchor.value = DEFAULT_NOTE_ANCHOR;
    const field = (caption: string, control: HTMLElement) => {
      const label = doc.createElement("label");
      const span = doc.createElement("span");
      span.textContent = caption;
      label.append(span, control);
      return label;
    };
    const help = doc.createElement("p");
    help.textContent = t("note.help", "Shift+Enter adds a line. Use \\(…\\) for inline TeX or \\[…\\] for a displayed formula.");
    const buttons = doc.createElement("div");
    buttons.className = "hierarchy-actions";
    const accept = doc.createElement("button");
    accept.type = "submit";
    accept.textContent = t("hierarchy.confirm", "Confirm");
    const dismiss = doc.createElement("button");
    dismiss.type = "button";
    dismiss.textContent = t("export.cancel", "Cancel");
    dismiss.addEventListener("click", cancel);
    buttons.append(accept, dismiss);
    form.append(field(t("note.text", "Text"), text), help, field(t("note.fontSize", "Font size"), font),
      field(t("note.anchor", "Anchor"), anchor), buttons);
    form.addEventListener("submit", event => {
      event.preventDefault();
      if (!text.value.trim()) { text.focus(); return; }
      confirm({ text: text.value, fontSizePx: font.valueAsNumber, anchor: anchor.value as SchematicNoteAnchor });
    });
    dialog.addEventListener("keydown", event => {
      if (event.isComposing || event.shiftKey || event.key !== "Enter" || event.target === dismiss || event.target === anchor) return;
      event.preventDefault();
      if (!event.repeat) form.requestSubmit();
    });
    dialog.addEventListener("cancel", event => { event.preventDefault(); cancel(); });
    dialog.append(form);
    this.root.append(dialog);
    this.dialog = dialog;
    dialog.showModal();
    text.focus();
  }

  close() {
    this.dialog?.close();
    this.dialog?.remove();
    this.dialog = undefined;
  }
}
