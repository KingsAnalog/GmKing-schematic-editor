import { WidgetType } from "@codemirror/view";
import { beforeAll, describe, expect, it } from "vitest";

import { Compartment, EditorState, Transaction } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { editorLivePreviewField } from "obsidian";
import {
  mockSyntaxTreeField,
  setMockSyntaxTree,
  type MockSyntaxTreeNode
} from "./codemirrorLanguageMock";
import {
  createEmptySchematicContent,
  serializeSchematicContent
} from "@edahelper/schematic/core";
import {
  collectFencedCodeRangesFromSyntaxNodes,
  collectSchematicBlockCandidates,
  createSchematicSessionField,
  currentSchematicBlockSession,
  schematicTransactionAnnotation,
  subscribeSchematicBlockSession,
  type SchematicBlockSession,
  type SchematicFencedCodeRange
} from "../src/sessionField";
import { parseSchematicFence } from "../src/fence";

class SessionWidget extends WidgetType {
  static domCreates = 0;
  static domUpdates = 0;

  constructor(readonly session: SchematicBlockSession) {
    super();
  }

  eq(other: SessionWidget) {
    return this.session.id === other.session.id;
  }

  updateDOM(element: HTMLElement) {
    SessionWidget.domUpdates += 1;
    element.dataset.revision = String(this.session.revision);
    return true;
  }

  toDOM() {
    SessionWidget.domCreates += 1;
    const element = document.createElement("div");
    element.dataset.session = this.session.id;
    return element;
  }
}

let nextId = 1;
const field = createSchematicSessionField({
  createId: () => `session-${nextId++}`,
  createWidget: (session) => new SessionWidget(session),
  forceLivePreview: true,
  collectFencedCodeRanges: testFencedCodeRanges
});

function block(text = "") {
  const content = createEmptySchematicContent();
  if (text) {
    content.notes.push({
      id: "note",
      x: 0,
      y: 0,
      text,
      format: "plain",
      fontSizePx: 16,
      width: 120,
      height: 40
    });
  }
  return `\`\`\`json\n${serializeSchematicContent(content)}\`\`\``;
}

function testFencedCodeRanges(state: EditorState): SchematicFencedCodeRange[] {
  const source = state.doc.toString();
  const lines = [...source.matchAll(/.*?(?:\r\n|\n|$)/g)]
    .filter((match) => match[0].length > 0)
    .map((match) => ({
      from: match.index,
      to: match.index + match[0].length,
      text: match[0].replace(/\r?\n$/, "")
    }));
  const ranges: SchematicFencedCodeRange[] = [];
  let opening: { from: number; marker: string; length: number } | null = null;
  lines.forEach((line) => {
    if (!opening) {
      const match = line.text.match(/^ {0,3}(`{3,}|~{3,})/);
      if (match) opening = { from: line.from, marker: match[1][0], length: match[1].length };
      return;
    }
    const closing = line.text.match(/^ {0,3}(`{3,}|~{3,})[ \t]*$/);
    if (!closing || closing[1][0] !== opening.marker || closing[1].length < opening.length) return;
    ranges.push({ from: opening.from, to: line.to });
    opening = null;
  });
  return ranges;
}

describe("CM6 schematic session field", () => {
  beforeAll(() => {
    globalThis.ResizeObserver ??= class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  });

  it("keeps two identical blocks as distinct mapped sessions", () => {
    const source = `${block()}\ntext\n${block()}`;
    let state = EditorState.create({ doc: source, extensions: [field] });
    const initial = state.field(field).sessions;
    expect(initial).toHaveLength(2);
    expect(initial[0].id).not.toBe(initial[1].id);

    state = state.update({ changes: { from: 0, insert: "heading\n" } }).state;
    const mapped = state.field(field).sessions;
    expect(mapped.map((session) => session.id)).toEqual(initial.map((session) => session.id));
    expect(mapped[0].from).toBe(initial[0].from + 8);
  });

  it("does not recognize a schematic-looking inner fence inside a longer outer fence", () => {
    const source = `\`\`\`\`markdown\nLiteral example:\n${block()}\n\`\`\`\``;
    const state = EditorState.create({ doc: source });

    expect(testFencedCodeRanges(state)).toEqual([{ from: 0, to: source.length }]);
    expect(collectSchematicBlockCandidates(state, testFencedCodeRanges)).toEqual([]);
  });

  it("recognizes Obsidian HyperMD stream-language fence boundary nodes", () => {
    const source = block();
    const state = EditorState.create({ doc: source });
    const nodes = hyperMdFenceNodes(state);

    expect(collectFencedCodeRangesFromSyntaxNodes(state, nodes)).toEqual([
      { from: 0, to: source.length }
    ]);
    expect(collectSchematicBlockCandidates(
      state,
      (current) => collectFencedCodeRangesFromSyntaxNodes(current, nodes)
    )).toHaveLength(1);
  });

  it("rebuilds sessions when background parsing advances without a document change", () => {
    const source = block();
    const parseAwareField = createSchematicSessionField({
      createId: () => "async-parse-session",
      createWidget: (session) => new SessionWidget(session),
      forceLivePreview: true
    });
    let state = EditorState.create({
      doc: source,
      extensions: [mockSyntaxTreeField, parseAwareField]
    });
    expect(state.field(parseAwareField).sessions).toHaveLength(0);

    state = state.update({ effects: setMockSyntaxTree.of(hyperMdFenceNodes(state)) }).state;

    expect(state.field(parseAwareField).sessions).toHaveLength(1);
    expect(state.field(parseAwareField).decorations.size).toBe(1);
  });

  it("keeps mapped sessions during an annotated commit while the parser lags", () => {
    let parserReady = true;
    const laggingField = createSchematicSessionField({
      createId: () => "lagging-session",
      createWidget: (session) => new SessionWidget(session),
      forceLivePreview: true,
      collectFencedCodeRanges: (state) => parserReady ? testFencedCodeRanges(state) : []
    });
    let state = EditorState.create({
      doc: `${block("before")}\n\n${block("untouched")}`,
      extensions: [mockSyntaxTreeField, laggingField]
    });
    const initial = state.field(laggingField).sessions;
    const valueFrom = state.doc.toString().indexOf("before");
    parserReady = false;

    state = state.update({
      changes: { from: valueFrom, to: valueFrom + "before".length, insert: "after-change" },
      annotations: schematicTransactionAnnotation.of({
        sessionId: initial[0].id,
        origin: "editor",
        revision: 1
      })
    }).state;

    const committed = state.field(laggingField);
    expect(committed.sessions.map((session) => session.id)).toEqual(initial.map((session) => session.id));
    expect(committed.sessions[0].revision).toBe(1);
    expect(committed.sessions[0].projection.map.logicalBody).toContain("after-change");
    expect(committed.sessions[1].projection.map.logicalBody).toContain("untouched");
    expect(committed.decorations.size).toBe(2);

    state = state.update({
      effects: setMockSyntaxTree.of([{
        name: "HyperMD-codeblock_HyperMD-codeblock-begin",
        from: 0,
        to: state.doc.line(1).to
      }])
    }).state;
    expect(state.field(laggingField).sessions).toHaveLength(2);
    expect(state.field(laggingField).decorations.size).toBe(2);
  });

  it("keeps an annotated session through an empty parser result and reconciles the eventual fence", () => {
    const transientEmptyField = createSchematicSessionField({
      createId: () => "transient-empty-session",
      createWidget: (session) => new SessionWidget(session),
      forceLivePreview: true
    });
    let state = EditorState.create({
      doc: block("before"),
      extensions: [mockSyntaxTreeField, transientEmptyField]
    });
    state = state.update({ effects: setMockSyntaxTree.of(hyperMdFenceNodes(state)) }).state;

    SessionWidget.domCreates = 0;
    const parent = document.createElement("div");
    document.body.appendChild(parent);
    const view = new EditorView({ parent, state });
    const initial = view.state.field(transientEmptyField).sessions[0];
    const initialDom = parent.querySelector(`[data-session="${initial.id}"]`);
    const valueFrom = view.state.doc.toString().indexOf("before");

    view.dispatch({
      changes: { from: valueFrom, to: valueFrom + "before".length, insert: "after" },
      annotations: schematicTransactionAnnotation.of({
        sessionId: initial.id,
        origin: "editor",
        revision: 1
      })
    });
    view.dispatch({
      effects: setMockSyntaxTree.of([{
        name: "Document",
        from: 0,
        to: view.state.doc.length
      }])
    });

    const pending = view.state.field(transientEmptyField);
    expect(pending.sessions).toHaveLength(1);
    expect(pending.sessions[0].id).toBe(initial.id);
    expect(pending.sessions[0].revision).toBe(1);
    expect(pending.decorations.size).toBe(1);
    expect(pending.pendingSyntaxSessionIds).toEqual(new Set([initial.id]));
    expect(parent.querySelector(`[data-session="${initial.id}"]`)).toBe(initialDom);
    expect(SessionWidget.domCreates).toBe(1);

    view.dispatch({ effects: setMockSyntaxTree.of(hyperMdFenceNodes(view.state)) });
    const reconciled = view.state.field(transientEmptyField);
    expect(reconciled.sessions[0].id).toBe(initial.id);
    expect(reconciled.sessions[0].revision).toBe(1);
    expect(reconciled.pendingSyntaxSessionIds.size).toBe(0);
    expect(parent.querySelector(`[data-session="${initial.id}"]`)).toBe(initialDom);

    view.destroy();
    parent.remove();
  });

  it("does not preserve an old inner session after an ordinary edit wraps it in a longer fence", () => {
    const structuralField = createSchematicSessionField({
      createId: () => "structural-session",
      createWidget: (session) => new SessionWidget(session),
      forceLivePreview: true
    });
    const inner = block("literal-example");
    let state = EditorState.create({
      doc: inner,
      extensions: [mockSyntaxTreeField, structuralField]
    });
    state = state.update({ effects: setMockSyntaxTree.of(hyperMdFenceNodes(state)) }).state;
    expect(state.field(structuralField).sessions).toHaveLength(1);

    const opening = "````markdown\n";
    const closing = "\n````";
    const innerLength = state.doc.length;
    state = state.update({
      changes: [
        { from: 0, insert: opening },
        { from: innerLength, insert: closing }
      ]
    }).state;

    expect(parseSchematicFence(
      state.doc.toString(),
      opening.length,
      opening.length + inner.length
    )?.kind).toBe("schematic");

    expect(state.field(structuralField).sessions).toHaveLength(0);
    expect(state.field(structuralField).decorations.size).toBe(0);
    expect(state.field(structuralField).pendingSyntaxSessionIds.size).toBe(0);

    state = state.update({
      effects: setMockSyntaxTree.of([{
        name: "FencedCode",
        from: 0,
        to: state.doc.length
      }])
    }).state;
    expect(state.field(structuralField).sessions).toHaveLength(0);
    expect(state.field(structuralField).decorations.size).toBe(0);
  });

  it("allows a native history change to bridge the same parser lag", () => {
    let parserReady = true;
    const historyField = createSchematicSessionField({
      createId: () => "history-session",
      createWidget: (session) => new SessionWidget(session),
      forceLivePreview: true,
      collectFencedCodeRanges: (current) => parserReady ? testFencedCodeRanges(current) : []
    });
    let state = EditorState.create({
      doc: block("before"),
      extensions: [mockSyntaxTreeField, historyField]
    });
    const initial = state.field(historyField).sessions[0];
    const valueFrom = state.doc.toString().indexOf("before");
    parserReady = false;

    state = state.update({
      changes: { from: valueFrom, to: valueFrom + "before".length, insert: "after" },
      annotations: Transaction.userEvent.of("undo")
    }).state;

    expect(state.field(historyField).sessions[0].id).toBe(initial.id);
    expect(state.field(historyField).pendingSyntaxSessionIds).toEqual(new Set([initial.id]));

    parserReady = true;
    state = state.update({ effects: setMockSyntaxTree.of(hyperMdFenceNodes(state)) }).state;
    expect(state.field(historyField).sessions[0].id).toBe(initial.id);
    expect(state.field(historyField).pendingSyntaxSessionIds.size).toBe(0);
  });

  it("publishes session runtime changes only from the EditorView layer", () => {
    const runtimeField = createSchematicSessionField({
      createId: () => "runtime-session",
      createWidget: (session) => new SessionWidget(session),
      forceLivePreview: true,
      collectFencedCodeRanges: testFencedCodeRanges
    });
    let state = EditorState.create({ doc: block("before"), extensions: [runtimeField] });
    const initial = state.field(runtimeField).sessions[0];
    const observed: SchematicBlockSession[] = [];
    const unsubscribe = subscribeSchematicBlockSession(initial, (session) => observed.push(session));
    const valueFrom = state.doc.toString().indexOf("before");

    state = state.update({
      changes: { from: valueFrom, to: valueFrom + "before".length, insert: "after" },
      annotations: schematicTransactionAnnotation.of({
        sessionId: initial.id,
        origin: "test",
        revision: 1
      })
    }).state;

    expect(observed).toEqual([]);
    expect(currentSchematicBlockSession(initial)).toBe(initial);

    const parent = document.createElement("div");
    document.body.appendChild(parent);
    const view = new EditorView({ parent, state });
    const current = state.field(runtimeField).sessions[0];
    expect(observed).toEqual([current]);
    expect(currentSchematicBlockSession(initial)).toBe(current);

    unsubscribe();
    view.destroy();
    parent.remove();
  });

  it("preserves DOM and session identity through 100 long/short body updates", () => {
    SessionWidget.domCreates = 0;
    SessionWidget.domUpdates = 0;
    const parent = document.createElement("div");
    document.body.appendChild(parent);
    const view = new EditorView({
      parent,
      state: EditorState.create({ doc: block("short"), extensions: [field] })
    });
    const id = view.state.field(field).sessions[0].id;
    const firstDom = parent.querySelector<HTMLElement>(`[data-session="${id}"]`);
    expect(firstDom).not.toBeNull();

    for (let index = 1; index <= 100; index += 1) {
      const session = view.state.field(field).sessions[0];
      if (session.projection.kind !== "schematic") throw new Error("Expected schematic session.");
      const nextBlock = block(index % 2 ? "x".repeat(1000) : "tiny");
      view.dispatch({
        changes: { from: session.from, to: session.to, insert: nextBlock },
        annotations: schematicTransactionAnnotation.of({
          sessionId: id,
          origin: "test",
          revision: index
        })
      });
      expect(view.state.field(field).sessions[0].id).toBe(id);
    }

    expect(parent.querySelector(`[data-session="${id}"]`)).toBe(firstDom);
    expect(SessionWidget.domCreates).toBe(1);
    expect(SessionWidget.domUpdates).toBe(0);
    expect(view.state.field(field).sessions[0].revision).toBe(100);
    view.destroy();
    parent.remove();
  });

  it("tracks sessions but emits no replacement decorations in Source Mode", () => {
    const sourceField = createSchematicSessionField({
      createId: () => "source-session",
      createWidget: (session) => new SessionWidget(session),
      forceLivePreview: false,
      collectFencedCodeRanges: testFencedCodeRanges
    });
    const state = EditorState.create({ doc: block(), extensions: [sourceField] });
    expect(state.field(sourceField).sessions).toHaveLength(1);
    expect(state.field(sourceField).decorations.size).toBe(0);
  });

  it("switches decorations with Live Preview mode without changing session identity", () => {
    const mode = new Compartment();
    const modeField = createSchematicSessionField({
      createId: () => "mode-session",
      createWidget: (session) => new SessionWidget(session),
      collectFencedCodeRanges: testFencedCodeRanges
    });
    let state = EditorState.create({
      doc: block(),
      extensions: [
        mode.of(editorLivePreviewField.init(() => false)),
        modeField
      ]
    });
    const id = state.field(modeField).sessions[0].id;
    expect(state.field(modeField).decorations.size).toBe(0);

    state = state.update({
      effects: mode.reconfigure(editorLivePreviewField.init(() => true))
    }).state;
    expect(state.field(modeField).sessions[0].id).toBe(id);
    expect(state.field(modeField).decorations.size).toBe(1);

    state = state.update({
      effects: mode.reconfigure(editorLivePreviewField.init(() => false))
    }).state;
    expect(state.field(modeField).sessions[0].id).toBe(id);
    expect(state.field(modeField).decorations.size).toBe(0);
  });

  it("projects 20 schematic blocks in one note within the baseline budget", () => {
    let blockId = 1;
    const manyBlockField = createSchematicSessionField({
      createId: () => `many-${blockId++}`,
      createWidget: (session) => new SessionWidget(session),
      forceLivePreview: true,
      collectFencedCodeRanges: testFencedCodeRanges
    });
    const source = Array.from({ length: 20 }, (_, index) => (
      `section ${index + 1}\n${block(`block-${index + 1}`)}`
    )).join("\n\n");

    const started = performance.now();
    const state = EditorState.create({ doc: source, extensions: [manyBlockField] });
    const elapsedMs = performance.now() - started;
    const projected = state.field(manyBlockField);

    expect(projected.sessions).toHaveLength(20);
    expect(new Set(projected.sessions.map((session) => session.id)).size).toBe(20);
    expect(projected.decorations.size).toBe(20);
    expect(elapsedMs).toBeLessThan(2_000);
  });
});

function hyperMdFenceNodes(state: EditorState): MockSyntaxTreeNode[] {
  const opening = state.doc.line(1);
  const closing = state.doc.line(state.doc.lines);
  return [
    {
      name: "HyperMD-codeblock_HyperMD-codeblock-begin_HyperMD-codeblock-begin-bg",
      from: opening.from,
      to: opening.to
    },
    {
      name: "HyperMD-codeblock_HyperMD-codeblock-end_HyperMD-codeblock-end-bg",
      from: closing.from,
      to: closing.to
    }
  ];
}
