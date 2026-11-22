import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { applySchematicMessage, message } from "../schematicI18n";
import {
  defaultHighlightStyle,
  bracketMatching,
  StreamLanguage,
  syntaxHighlighting
} from "@codemirror/language";
import { stex } from "@codemirror/legacy-modes/mode/stex";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab
} from "@codemirror/commands";
import {
  EditorSelection,
  EditorState,
  type Extension
} from "@codemirror/state";
import {
  drawSelection,
  EditorView,
  keymap,
  type KeyBinding
} from "@codemirror/view";

export type FormulaSourceMode = "inline" | "block";
export type FormulaBoundaryDirection = "before" | "after";
export type FormulaSourceCommitReason = "keyboard" | "blur" | "api";

export interface FormulaSourceEditorOptions {
  host: HTMLElement;
  mode: FormulaSourceMode;
  value: string;
  ariaLabel?: string;
  onChange: (value: string) => void;
  onCommit: (value: string, reason: FormulaSourceCommitReason) => void;
  onCancel: () => void;
  onBoundaryEscape: (direction: FormulaBoundaryDirection, value: string) => void;
  onDeleteEmptyBlock: () => void;
}

export interface FormulaSourceEditor {
  readonly dom: HTMLElement;
  focus(): void;
  read(): string;
  commit(): boolean;
  cancel(): boolean;
  destroy(): void;
}

export type FormulaSourceKeyAction =
  | "commit"
  | "cancel"
  | "delete-empty-block"
  | "escape-before"
  | "escape-after";

export interface FormulaSourceKeyContext {
  mode: FormulaSourceMode;
  key: "Escape" | "Enter" | "Backspace" | "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown";
  modKey?: boolean;
  docLength: number;
  selectionFrom: number;
  selectionTo: number;
  lineNumber: number;
  lineCount: number;
}

export function resolveFormulaSourceKeyAction(context: FormulaSourceKeyContext): FormulaSourceKeyAction | null {
  if (context.key === "Escape") return "cancel";
  if (context.mode === "inline" && context.key === "Enter") return "commit";
  if (context.mode === "block" && context.key === "Enter" && context.modKey) return "commit";
  if (context.mode === "block" && context.key === "Backspace" && context.docLength === 0) {
    return "delete-empty-block";
  }
  if (context.selectionFrom !== context.selectionTo) return null;
  if (context.mode === "inline") {
    if (context.key === "ArrowLeft" && context.selectionFrom === 0) return "escape-before";
    if (context.key === "ArrowRight" && context.selectionFrom === context.docLength) return "escape-after";
    return null;
  }
  if (context.key === "ArrowUp" && context.lineNumber === 1) return "escape-before";
  if (context.key === "ArrowDown" && context.lineNumber === context.lineCount) return "escape-after";
  return null;
}

const formulaSourceTheme = EditorView.theme({
  "&": {
    backgroundColor: "transparent",
    color: "inherit",
    fontSize: "0.85em",
    minHeight: "0"
  },
  "&.cm-focused": {
    outline: "none"
  },
  ".cm-scroller": {
    fontFamily: "'Cascadia Mono', Consolas, monospace",
    lineHeight: "1.35",
    overflowX: "auto",
    overflowY: "hidden"
  },
  ".cm-content": {
    caretColor: "currentColor",
    minHeight: "0",
    padding: "2px 4px"
  },
  ".cm-line": {
    padding: "0"
  },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection": {
    backgroundColor: "rgba(17, 17, 17, 0.14)"
  }
});

function keyContext(
  view: EditorView,
  mode: FormulaSourceMode,
  key: FormulaSourceKeyContext["key"],
  modKey = false
): FormulaSourceKeyContext {
  const { from, to, head } = view.state.selection.main;
  const line = view.state.doc.lineAt(head);
  return {
    mode,
    key,
    modKey,
    docLength: view.state.doc.length,
    selectionFrom: from,
    selectionTo: to,
    lineNumber: line.number,
    lineCount: view.state.doc.lines
  };
}

export function createFormulaSourceEditor(options: FormulaSourceEditorOptions): FormulaSourceEditor {
  const initialValue = options.mode === "inline" ? options.value.replace(/[\r\n]+/g, "") : options.value;
  let destroyed = false;
  let finished = false;
  let lastValue = initialValue;
  let view: EditorView;

  const read = () => destroyed ? lastValue : view.state.doc.toString();
  const finish = (action: FormulaSourceKeyAction, commitReason: FormulaSourceCommitReason = "keyboard") => {
    if (destroyed || finished) return false;
    finished = true;
    if (action === "commit") options.onCommit(read(), commitReason);
    else if (action === "cancel") options.onCancel();
    else if (action === "delete-empty-block") options.onDeleteEmptyBlock();
    else options.onBoundaryEscape(action === "escape-before" ? "before" : "after", read());
    return true;
  };

  const run = (
    key: FormulaSourceKeyContext["key"],
    modKey = false
  ) => (currentView: EditorView) => {
    const action = resolveFormulaSourceKeyAction(keyContext(currentView, options.mode, key, modKey));
    return action ? finish(action) : false;
  };

  const customKeymap: KeyBinding[] = [
    { key: "Escape", run: run("Escape") },
    { key: "Backspace", run: run("Backspace") },
    { key: "ArrowLeft", run: run("ArrowLeft") },
    { key: "ArrowRight", run: run("ArrowRight") },
    { key: "ArrowUp", run: run("ArrowUp") },
    { key: "ArrowDown", run: run("ArrowDown") }
  ];
  if (options.mode === "inline") {
    customKeymap.push(
      { key: "Enter", run: run("Enter") },
      { key: "Mod-Enter", run: run("Enter", true) }
    );
  } else {
    customKeymap.push({ key: "Mod-Enter", run: run("Enter", true) });
  }

  const extensions: Extension[] = [
    StreamLanguage.define(stex),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    bracketMatching(),
    closeBrackets(),
    history(),
    drawSelection(),
    formulaSourceTheme,
    keymap.of([
      ...customKeymap,
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...historyKeymap,
      indentWithTab
    ]),
    EditorView.updateListener.of((update) => {
      if (!update.docChanged) return;
      lastValue = update.state.doc.toString();
      if (!destroyed && !finished) options.onChange(lastValue);
    }),
    EditorView.domEventHandlers({
      blur: () => {
        finish("commit", "blur");
        return false;
      }
    })
  ];
  if (options.mode === "block") {
    extensions.push(EditorView.lineWrapping);
  } else {
    extensions.push(EditorState.changeFilter.of((transaction) => transaction.newDoc.lines === 1));
  }

  view = new EditorView({
    parent: options.host,
    state: EditorState.create({
      doc: initialValue,
      selection: EditorSelection.cursor(initialValue.length),
      extensions
    })
  });
  view.dom.dataset.mathSourceEditor = "";
  if (options.ariaLabel) view.dom.setAttribute("aria-label", options.ariaLabel);
  else applySchematicMessage(
    view.dom,
    options.mode === "block"
      ? message("note.editBlockFormula", "Edit block formula")
      : message("note.editInlineFormula", "Edit inline formula"),
    "aria-label"
  );

  return {
    dom: view.dom,
    focus() {
      if (!destroyed) view.focus();
    },
    read() {
      return read();
    },
    commit() {
      return finish("commit", "api");
    },
    cancel() {
      return finish("cancel");
    },
    destroy() {
      if (destroyed) return;
      lastValue = view.state.doc.toString();
      destroyed = true;
      view.destroy();
    }
  };
}
