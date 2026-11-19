import type {
  SchematicNoteRuntime,
  SchematicNoteRuntimeAdapter,
  SchematicNoteRuntimeOptions
} from "./noteRuntimeAdapter";

function normalizeText(value: string) {
  return value.replace(/\r\n?/g, "\n");
}

class RawTextNoteRuntime implements SchematicNoteRuntime {
  private text: string;
  private editable: boolean;
  private textarea: HTMLTextAreaElement | null = null;
  private destroyed = false;
  private readonly previousWhiteSpace: string;
  private readonly hadRawMarkdownClass: boolean;

  constructor(private readonly options: SchematicNoteRuntimeOptions) {
    this.text = normalizeText(options.markdown);
    this.editable = options.editable;
    this.previousWhiteSpace = options.host.style.whiteSpace;
    this.hadRawMarkdownClass = options.host.classList.contains("schematic-note-raw-markdown-content");
    options.host.classList.add("schematic-note-raw-markdown-content");
    options.host.style.removeProperty("white-space");
    options.signal?.addEventListener("abort", this.handleAbort, { once: true });
    this.render();
  }

  get isEditable() {
    return this.editable && !this.destroyed;
  }

  read() {
    if (this.textarea) this.text = normalizeText(this.textarea.value);
    return this.text;
  }

  flushTransientEdits() {}

  setEditable(editable: boolean) {
    if (this.destroyed || this.editable === editable) return;
    this.text = this.read();
    this.editable = editable;
    this.render();
  }

  setMarkdown(markdown: string) {
    if (this.destroyed) return;
    const next = normalizeText(markdown);
    if (next === this.read()) return;
    this.text = next;
    if (this.textarea) this.textarea.value = next;
    else this.options.host.textContent = next || " ";
    this.reportSize();
  }

  focus() {
    if (!this.isEditable || !this.textarea) return;
    this.textarea.focus({ preventScroll: true });
    this.textarea.setSelectionRange(this.textarea.value.length, this.textarea.value.length);
  }

  insertText(text: string) {
    if (!text || !this.isEditable || !this.textarea) return false;
    const start = this.textarea.selectionStart ?? this.textarea.value.length;
    const end = this.textarea.selectionEnd ?? start;
    this.textarea.setRangeText(text, start, end, "end");
    this.handleInput();
    this.focus();
    return true;
  }

  cloneStaticContent() {
    if (this.destroyed) return null;
    const clone = this.options.host.ownerDocument.createElement("div");
    clone.className = "schematic-note-plain-content schematic-note-raw-markdown-content";
    const whiteSpace = this.options.host.ownerDocument.defaultView?.getComputedStyle(this.options.host).whiteSpace;
    if (whiteSpace) clone.style.whiteSpace = whiteSpace;
    clone.textContent = this.read() || " ";
    return clone;
  }

  staticTextContent() {
    return this.read();
  }

  staticTextStyle() {
    return {};
  }

  async waitForRendering() {}

  async destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.options.signal?.removeEventListener("abort", this.handleAbort);
    this.textarea?.removeEventListener("input", this.handleInput);
    this.textarea = null;
    this.options.host.classList.remove("is-markdown-editable");
    this.options.host.classList.toggle("schematic-note-raw-markdown-content", this.hadRawMarkdownClass);
    this.options.host.style.whiteSpace = this.previousWhiteSpace;
    this.options.host.replaceChildren();
  }

  private readonly handleAbort = () => {
    void this.destroy();
  };

  private readonly handleInput = () => {
    if (this.destroyed || !this.textarea) return;
    this.text = normalizeText(this.textarea.value);
    this.options.onChange(this.text);
    this.reportSize();
  };

  private render() {
    this.textarea?.removeEventListener("input", this.handleInput);
    this.textarea = null;
    this.options.host.classList.toggle("is-markdown-editable", this.editable);
    if (!this.editable) {
      this.options.host.textContent = this.text || " ";
      this.reportSize();
      return;
    }

    const textarea = this.options.host.ownerDocument.createElement("textarea");
    textarea.dataset.noteEditor = "";
    textarea.value = this.text;
    textarea.wrap = "off";
    textarea.spellcheck = false;
    textarea.setAttribute("aria-label", "Edit schematic note source");
    textarea.addEventListener("input", this.handleInput);
    this.textarea = textarea;
    this.options.host.replaceChildren(textarea);
    this.reportSize();
  }

  private reportSize() {
    this.options.onResize(this.options.host.scrollHeight);
  }
}

export const rawTextNoteRuntimeAdapter: SchematicNoteRuntimeAdapter = {
  async create(options) {
    if (options.signal?.aborted) throw new DOMException("Note runtime creation was aborted", "AbortError");
    return new RawTextNoteRuntime(options);
  }
};
