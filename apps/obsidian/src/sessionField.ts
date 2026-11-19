import { syntaxTree } from "@codemirror/language";
import {
  Annotation,
  StateField,
  type ChangeDesc,
  type EditorState
} from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  type DecorationSet,
  type WidgetType
} from "@codemirror/view";
import { editorLivePreviewField } from "obsidian";
import {
  parseSchematicFence,
  type SchematicFenceProjection
} from "./fence";

const HYPER_MD_CODE_BLOCK_BEGIN = /(?:^|_)(?:line-)?HyperMD-codeblock-begin(?:_|$)/;
const HYPER_MD_CODE_BLOCK_END = /(?:^|_)(?:line-)?HyperMD-codeblock-end(?:_|$)/;

export interface SchematicBlockSession {
  id: string;
  from: number;
  to: number;
  revision: number;
  projection: SchematicFenceProjection;
}

interface SchematicBlockSessionRuntime {
  current: SchematicBlockSession;
  listeners: Set<(session: SchematicBlockSession) => void>;
}

const SESSION_RUNTIME = Symbol("schematic-block-session-runtime");

type RuntimeBackedSchematicBlockSession = SchematicBlockSession & {
  readonly [SESSION_RUNTIME]?: SchematicBlockSessionRuntime;
};

const runtimeBySession = new WeakMap<SchematicBlockSession, SchematicBlockSessionRuntime>();

export function currentSchematicBlockSession(session: SchematicBlockSession) {
  return runtimeForSession(session).current;
}

export function schematicBlockSessionsShareRuntime(
  left: SchematicBlockSession,
  right: SchematicBlockSession
) {
  return runtimeForSession(left) === runtimeForSession(right);
}

export function subscribeSchematicBlockSession(
  session: SchematicBlockSession,
  listener: (current: SchematicBlockSession) => void
) {
  const runtime = runtimeForSession(session);
  runtime.listeners.add(listener);
  return () => runtime.listeners.delete(listener);
}

export interface SchematicTransactionMetadata {
  sessionId: string;
  origin: string;
  revision: number;
}

export const schematicTransactionAnnotation = Annotation.define<SchematicTransactionMetadata>();

export interface SchematicSessionFieldOptions {
  createId(): string;
  createWidget(session: SchematicBlockSession): WidgetType;
  forceLivePreview?: boolean;
  collectFencedCodeRanges?: SchematicFencedCodeRangeProvider;
}

export interface SchematicFencedCodeRange {
  from: number;
  to: number;
}

export type SchematicFencedCodeRangeProvider = (
  state: EditorState
) => readonly SchematicFencedCodeRange[];

export interface SchematicSessionFieldValue {
  sessions: readonly SchematicBlockSession[];
  decorations: DecorationSet;
  livePreview: boolean;
  syntaxTreeIdentity: object;
  pendingSyntaxSessionIds: ReadonlySet<string>;
}

export interface SchematicSyntaxNodeRange {
  name: string;
  from: number;
  to: number;
}

export function createSchematicSessionField(options: SchematicSessionFieldOptions) {
  return StateField.define<SchematicSessionFieldValue>({
    create(state) {
      return buildFieldValue(state, [], null, options, undefined, new Set(), false);
    },
    update(previous, transaction) {
      const livePreview = options.forceLivePreview ?? readLivePreview(transaction.state);
      const syntaxTreeIdentity = syntaxTree(
        transaction.state
      );
      if (
        !transaction.docChanged
        && !transaction.reconfigured
        && livePreview === previous.livePreview
        && syntaxTreeIdentity === previous.syntaxTreeIdentity
      ) return previous;
      const metadata = transaction.annotation(schematicTransactionAnnotation);
      const historyChange = transaction.docChanged && (
        transaction.isUserEvent("undo") || transaction.isUserEvent("redo")
      );
      const preservesPendingSessions = !!metadata || historyChange;
      const pendingSyntaxSessionIds = transaction.docChanged
        ? preservesPendingSessions
          ? new Set([
              ...previous.pendingSyntaxSessionIds,
              ...previous.sessions.map((session) => session.id)
            ])
          : new Set<string>()
        : new Set(previous.pendingSyntaxSessionIds);
      return buildFieldValue(
        transaction.state,
        previous.sessions,
        transaction.changes,
        options,
        metadata,
        pendingSyntaxSessionIds,
        !transaction.docChanged
      );
    },
    provide: (field) => [
      EditorView.decorations.from(field, (value) => value.decorations),
      ViewPlugin.fromClass(class {
        constructor(view: EditorView) {
          publishSchematicBlockSessions(view.state.field(field).sessions);
        }

        update(update: { state: EditorState }) {
          publishSchematicBlockSessions(update.state.field(field).sessions);
        }
      })
    ]
  });
}

export function collectSchematicBlockCandidates(
  state: EditorState,
  collectFencedCodeRanges: SchematicFencedCodeRangeProvider = collectSyntaxTreeFencedCodeRanges
) {
  const source = state.doc.toString();
  const ranges = new Map<string, { from: number; to: number }>();
  collectFencedCodeRanges(state).forEach(({ from, to }) => {
    ranges.set(`${from}:${to}`, { from, to });
  });
  return [...ranges.values()]
    .map(({ from, to }) => ({ from, to, projection: parseSchematicFence(source, from, to) }))
    .filter((candidate): candidate is { from: number; to: number; projection: SchematicFenceProjection } => !!candidate.projection)
    .sort((left, right) => left.from - right.from || left.to - right.to);
}

export function collectSyntaxTreeFencedCodeRanges(state: EditorState): SchematicFencedCodeRange[] {
  const nodes: SchematicSyntaxNodeRange[] = [];
  syntaxTree(state).iterate({
    enter(node) {
      if (
        node.name === "FencedCode"
        || HYPER_MD_CODE_BLOCK_BEGIN.test(node.name)
        || HYPER_MD_CODE_BLOCK_END.test(node.name)
      ) {
        nodes.push({ name: node.name, from: node.from, to: node.to });
      }
    }
  });
  return collectFencedCodeRangesFromSyntaxNodes(state, nodes);
}

export function collectFencedCodeRangesFromSyntaxNodes(
  state: EditorState,
  nodes: readonly SchematicSyntaxNodeRange[]
): SchematicFencedCodeRange[] {
  const ranges = new Map<string, SchematicFencedCodeRange>();
  let streamFenceFrom: number | null = null;

  nodes.forEach((node) => {
    if (node.name === "FencedCode") {
      const range = expandedLineRange(state, node.from, node.to);
      ranges.set(`${range.from}:${range.to}`, range);
    }

    if (hasHyperMdCodeBlockClass(node.name, "begin")) {
      streamFenceFrom ??= state.doc.lineAt(node.from).from;
      return;
    }
    if (streamFenceFrom === null || !hasHyperMdCodeBlockClass(node.name, "end")) return;
    const endLine = state.doc.lineAt(Math.max(node.from, node.to - 1));
    const to = endLine.to < state.doc.length ? endLine.to + 1 : endLine.to;
    const range = { from: streamFenceFrom, to };
    ranges.set(`${range.from}:${range.to}`, range);
    streamFenceFrom = null;
  });

  return [...ranges.values()].sort((left, right) => left.from - right.from || left.to - right.to);
}

export function reconcileSchematicSessions(
  previous: readonly SchematicBlockSession[],
  candidates: readonly { from: number; to: number; projection: SchematicFenceProjection }[],
  changes: ChangeDesc | null,
  createId: () => string,
  metadata?: SchematicTransactionMetadata
) {
  const mapped = previous.map((session) => ({
    session,
    from: changes ? changes.mapPos(session.from, 1) : session.from,
    to: changes ? changes.mapPos(session.to, -1) : session.to,
    used: false
  }));
  return candidates.map((candidate) => {
    const match = mapped
      .filter((entry) => !entry.used && rangesCorrespond(entry, candidate))
      .sort((left, right) => rangeDistance(left, candidate) - rangeDistance(right, candidate))[0];
    if (match) match.used = true;
    const id = match?.session.id ?? createId();
    const priorRevision = match?.session.revision ?? 0;
    const revision = metadata?.sessionId === id
      ? Math.max(priorRevision, metadata.revision)
      : priorRevision + (match && projectionFingerprint(match.session.projection) !== projectionFingerprint(candidate.projection) ? 1 : 0);
    const next = createRuntimeBackedSession({
      id,
      from: candidate.from,
      to: candidate.to,
      revision,
      projection: candidate.projection
    }, match?.session);
    return next;
  });
}

function buildFieldValue(
  state: EditorState,
  previous: readonly SchematicBlockSession[],
  changes: ChangeDesc | null,
  options: SchematicSessionFieldOptions,
  metadata: SchematicTransactionMetadata | undefined,
  pendingSyntaxSessionIds: ReadonlySet<string>,
  canResolvePendingSyntax: boolean
): SchematicSessionFieldValue {
  const collected = collectBuildCandidates(
    state,
    previous,
    changes,
    options,
    pendingSyntaxSessionIds,
    canResolvePendingSyntax
  );
  const candidates = collected.candidates;
  const sessions = reconcileSchematicSessions(
    previous,
    candidates,
    changes,
    options.createId,
    metadata
  );
  const livePreview = options.forceLivePreview ?? readLivePreview(state);
  const syntaxTreeIdentity = syntaxTree(
    state
  );
  const reconciledIds = new Set(sessions.map((session) => session.id));
  const nextPendingSyntaxSessionIds = new Set(
    [...collected.pendingSyntaxSessionIds].filter((id) => reconciledIds.has(id))
  );
  if (!livePreview) return {
    sessions,
    decorations: Decoration.none,
    livePreview,
    syntaxTreeIdentity,
    pendingSyntaxSessionIds: nextPendingSyntaxSessionIds
  };
  const ranges = sessions.map((session) => Decoration.replace({
    widget: options.createWidget(session),
    block: true,
    inclusive: false
  }).range(session.from, session.to));
  return {
    sessions,
    decorations: Decoration.set(ranges, true),
    livePreview,
    syntaxTreeIdentity,
    pendingSyntaxSessionIds: nextPendingSyntaxSessionIds
  };
}

function collectBuildCandidates(
  state: EditorState,
  previous: readonly SchematicBlockSession[],
  changes: ChangeDesc | null,
  options: SchematicSessionFieldOptions,
  pendingSyntaxSessionIds: ReadonlySet<string>,
  canResolvePendingSyntax: boolean
) {
  let candidates = collectSchematicBlockCandidates(
    state,
    options.collectFencedCodeRanges ?? collectSyntaxTreeFencedCodeRanges
  );
  const pending = new Set(pendingSyntaxSessionIds);
  const source = state.doc.toString();
  previous.forEach((session) => {
    const from = changes ? changes.mapPos(session.from, 1) : session.from;
    const to = changes ? changes.mapPos(session.to, -1) : session.to;
    const hasSyntaxCandidate = candidates.some((candidate) => (
      candidate.from < to && from < candidate.to
    ));
    if (hasSyntaxCandidate) {
      if (canResolvePendingSyntax) pending.delete(session.id);
      return;
    }
    if (!pending.has(session.id)) return;
    const projection = parseSchematicFence(source, from, to);
    if (!projection) {
      pending.delete(session.id);
      return;
    }
    candidates = candidates.filter((candidate) => (
      candidate.to <= from || candidate.from >= to
    ));
    candidates.push({ from, to, projection });
  });
  return {
    candidates: candidates.sort((left, right) => left.from - right.from || left.to - right.to),
    pendingSyntaxSessionIds: pending
  };
}

function expandedLineRange(state: EditorState, from: number, to: number) {
  const expandedFrom = state.doc.lineAt(from).from;
  const endLine = state.doc.lineAt(Math.max(from, to - 1));
  const expandedTo = endLine.to < state.doc.length ? endLine.to + 1 : endLine.to;
  return { from: expandedFrom, to: expandedTo };
}

function hasHyperMdCodeBlockClass(name: string, edge: "begin" | "end") {
  return (edge === "begin" ? HYPER_MD_CODE_BLOCK_BEGIN : HYPER_MD_CODE_BLOCK_END).test(name);
}

function readLivePreview(state: EditorState) {
  try {
    return state.field(editorLivePreviewField, false) === true;
  } catch {
    return false;
  }
}

function rangesCorrespond(
  previous: { from: number; to: number },
  next: { from: number; to: number }
) {
  if (previous.from === next.from && previous.to === next.to) return true;
  return previous.from < next.to && next.from < previous.to;
}

function rangeDistance(previous: { from: number; to: number }, next: { from: number; to: number }) {
  return Math.abs(previous.from - next.from) + Math.abs(previous.to - next.to);
}

function projectionFingerprint(projection: SchematicFenceProjection) {
  return projection.kind === "schematic"
    ? `schematic:${projection.map.logicalBody}`
    : `diagnostic:${projection.message}:${projection.map.logicalBody}`;
}

function runtimeForSession(session: SchematicBlockSession) {
  const existing = attachedRuntime(session) ?? runtimeBySession.get(session);
  if (existing) return existing;
  const runtime = {
    current: session,
    listeners: new Set<(current: SchematicBlockSession) => void>()
  };
  runtimeBySession.set(session, runtime);
  return runtime;
}

function attachedRuntime(session: SchematicBlockSession) {
  return (session as RuntimeBackedSchematicBlockSession)[SESSION_RUNTIME];
}

function createRuntimeBackedSession(
  session: SchematicBlockSession,
  previous?: SchematicBlockSession
) {
  const next = { ...session } as RuntimeBackedSchematicBlockSession;
  const runtime = previous ? attachedRuntime(previous) ?? runtimeBySession.get(previous) : undefined;
  const nextRuntime = runtime ?? {
    current: next,
    listeners: new Set<(current: SchematicBlockSession) => void>()
  };
  Object.defineProperty(next, SESSION_RUNTIME, {
    configurable: false,
    enumerable: false,
    value: nextRuntime,
    writable: false
  });
  return next;
}

function publishSchematicBlockSessions(sessions: readonly SchematicBlockSession[]) {
  sessions.forEach((session) => {
    const runtime = runtimeForSession(session);
    if (runtime.current === session) return;
    runtime.current = session;
    runtime.listeners.forEach((listener) => listener(session));
  });
}
