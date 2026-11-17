import { StateEffect, StateField, type EditorState } from "@codemirror/state";

export interface MockSyntaxTreeNode {
  name: string;
  from: number;
  to: number;
}

interface MockSyntaxTree {
  availableTo: number;
  iterate(options: { enter(node: MockSyntaxTreeNode): void }): void;
}

const emptyTree = createTree([]);

export const setMockSyntaxTree = StateEffect.define<readonly MockSyntaxTreeNode[]>();

export const mockSyntaxTreeField = StateField.define<MockSyntaxTree>({
  create: () => emptyTree,
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setMockSyntaxTree)) return createTree(effect.value);
    }
    return value;
  }
});

export function syntaxTree(state: EditorState) {
  return state.field(mockSyntaxTreeField, false) ?? emptyTree;
}

export function syntaxTreeAvailable(state: EditorState, upto = state.doc.length) {
  return syntaxTree(state).availableTo >= upto;
}

function createTree(nodes: readonly MockSyntaxTreeNode[]): MockSyntaxTree {
  return {
    availableTo: nodes.reduce((maximum, node) => Math.max(maximum, node.to), 0),
    iterate(options) {
      nodes.forEach((node) => options.enter(node));
    }
  };
}
