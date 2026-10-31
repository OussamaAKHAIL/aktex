// AKTeX — CodeMirror 6 Editor Setup
// Codex: initialize CodeMirror with LaTeX support, dark theme, and autocomplete.

import { EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { autocompletion, completionKeymap } from '@codemirror/autocomplete';
import { openSearchPanel, search, searchKeymap } from '@codemirror/search';
import { oneDark } from '@codemirror/theme-one-dark';
import { latexCompletions } from './latex-lang';

let view: EditorView | null = null;

export function initEditor(
  container: HTMLElement,
  initialContent: string = '',
  onChange?: (content: string) => void,
  onCursorMove?: (line: number) => void,
): EditorView {
  const state = EditorState.create({
    doc: initialContent,
    extensions: [
      lineNumbers(),
      history(),
      highlightActiveLine(),
      search({ top: true }),
      keymap.of([...defaultKeymap, ...historyKeymap, ...completionKeymap, ...searchKeymap]),
      autocompletion({ override: [latexCompletions] }),
      oneDark,
      EditorView.updateListener.of((update) => {
        if (update.docChanged && onChange) {
          onChange(update.state.doc.toString());
        }
        if (update.selectionSet && onCursorMove) {
          onCursorMove(update.state.doc.lineAt(update.state.selection.main.head).number);
        }
      }),
      EditorView.theme({
        '&': { backgroundColor: '#1c1c1c', height: '100%', color: '#ede8dc' },
        '.cm-gutters': { backgroundColor: '#1c1c1c', color: '#4a4a4a', border: 'none' },
        '.cm-activeLine': { backgroundColor: 'rgba(200, 116, 42, .08)' },
        '.cm-activeLineGutter': { backgroundColor: 'rgba(200, 116, 42, .08)' },
        '.cm-scroller': { fontFamily: 'JetBrains Mono, Fira Code, Consolas, monospace' },
        '.cm-content': { caretColor: '#e08535' },
        '.cm-cursor': { borderLeftColor: '#e08535' },
      }),
    ],
  });

  view = new EditorView({ state, parent: container });
  return view;
}

export function getEditorContent(): string {
  return view?.state.doc.toString() ?? '';
}

export function setEditorContent(content: string): void {
  if (!view) return;
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: content },
  });
}

export function scrollEditorToLine(line: number): void {
  if (!view) return;
  const pos = view.state.doc.line(Math.max(1, line)).from;
  view.dispatch({ selection: { anchor: pos }, scrollIntoView: true });
}

export function getCursorLine(): number {
  if (!view) return 1;
  const pos = view.state.selection.main.head;
  return view.state.doc.lineAt(pos).number;
}

export function triggerFind(): void {
  if (!view) return;
  openSearchPanel(view);
}
