import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { history } from "@codemirror/commands";
import { createEmptySchematicContent, serializeSchematicContent } from "@edahelper/schematic/core";
import { SchematicActiveEditorCoordinator } from "../../src/activeEditorCoordinator";
import { SchematicBlockWidget } from "../../src/blockWidget";
import { createSchematicSessionField } from "../../src/sessionField";
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
const view = new EditorView({
  parent: document.querySelector("#app")!,
  state: EditorState.create({
    doc: "Header\n\x60\x60\x60json\n" + serializeSchematicContent(createEmptySchematicContent()) + "\x60\x60\x60\nOutside text",
    extensions: [history(), field]
  })
});
Object.assign(window, { noteSmoke: { coordinator, view } });
