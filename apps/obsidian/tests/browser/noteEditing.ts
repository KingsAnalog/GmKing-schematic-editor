import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { history } from "@codemirror/commands";
import { createEmptySchematicContent, serializeSchematicContent } from "@edahelper/schematic/core";
import { SchematicActiveEditorCoordinator } from "../../src/activeEditorCoordinator";
import { SchematicBlockWidget } from "../../src/blockWidget";
import { createSchematicSessionField, schematicTransactionAnnotation } from "../../src/sessionField";
import "../../src/styles.css";

const coordinator = new SchematicActiveEditorCoordinator(window);
let id = 0;
const field = createSchematicSessionField({
  createId: () => "block-" + ++id,
  createWidget: session => new SchematicBlockWidget(session, () => coordinator),
  forceLivePreview: true,
  collectFencedCodeRanges: state => [...state.doc.toString().matchAll(/\x60\x60\x60json\n[\s\S]*?\x60\x60\x60/g)]
    .map(match => ({ from: match.index!, to: match.index! + match[0].length }))
});
let ownCommits = 0;
const view = new EditorView({
  dispatchTransactions(transactions, view) {
    view.update(transactions);
    // Obsidian may restore the Markdown view focus during a document redraw.
    if (transactions.some(transaction => transaction.annotation(schematicTransactionAnnotation)) && ++ownCommits >= 3) {
      view.contentDOM.focus();
    }
  },
  parent: document.querySelector("#app")!,
  state: EditorState.create({
    doc: "Header\n\x60\x60\x60json\n" + serializeSchematicContent(createEmptySchematicContent()) + "\x60\x60\x60\nOutside text",
    extensions: [history(), field]
  })
});
const events: string[] = [];
for (const type of ["focusin", "focusout", "input"]) document.addEventListener(type, event => {
  const target = event.target as HTMLElement;
  events.push(type + ":" + target.tagName + ":" + target.getAttribute("data-note-editor"));
}, true);
Object.assign(window, {
  noteSmoke: {
    coordinator, view, events,
    snapshot: () => {
      const root = coordinator.activeRoot();
      const input = root?.querySelector<HTMLTextAreaElement>("[data-note-editor]");
      return {
        text: coordinator.activeEditor()?.getContent().notes[0]?.text,
        markdown: view.state.doc.toString(),
        editing: !!root?.querySelector(".schematic-note.is-editing"),
        focused: !!input && input === document.activeElement,
        caret: input?.selectionStart,
        textarea: input?.value,
        events: events.slice(-12)
      };
    }
  }
});
