// AKTeX — CodeMirror 6 editor setup.

import { EditorState } from '@codemirror/state';
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  drawSelection,
  dropCursor,
} from '@codemirror/view';
import {
  defaultKeymap,
  history,
  historyKeymap,
  redo as cmRedo,
  undo as cmUndo,
} from '@codemirror/commands';
import { autocompletion, completionKeymap } from '@codemirror/autocomplete';
import { openSearchPanel, search, searchKeymap } from '@codemirror/search';
import { latexCompletions, latexExtension } from './latex-lang';

export interface EditorSelection {
  fromLine: number;
  fromCh: number;
  toLine: number;
  toCh: number;
  text: string;
  empty: boolean;
}

export interface EditorCallbacks {
  onChange?: (content: string) => void;
  onSelectionChange?: (selection: EditorSelection) => void;
  onCursorMove?: (line: number) => void;
}

let view: EditorView | null = null;

export function initEditor(
  container: HTMLElement,
  initialContent: string = '',
  callbacks: EditorCallbacks = {},
): EditorView {
  const state = EditorState.create({
    doc: initialContent,
    extensions: [
      lineNumbers(),
      history(),
      highlightActiveLine(),
      EditorView.lineWrapping,
      drawSelection(),
      dropCursor(),
      search({ top: true }),
      keymap.of([...defaultKeymap, ...historyKeymap, ...completionKeymap, ...searchKeymap]),
      autocompletion({ override: [latexCompletions] }),
      latexExtension,
      EditorState.tabSize.of(2),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) callbacks.onChange?.(update.state.doc.toString());
        if (update.selectionSet || update.docChanged) {
          callbacks.onSelectionChange?.(readSelection(update.state));
          if (update.selectionSet) {
            callbacks.onCursorMove?.(update.state.doc.lineAt(update.state.selection.main.head).number);
          }
        }
      }),
      EditorView.theme({
        '&': { backgroundColor: '#1c1c1c', height: '100%', color: '#ede8dc' },
        '.cm-gutters': {
          backgroundColor: '#1c1c1c',
          color: '#4a4a4a',
          border: 'none',
          paddingRight: '4px',
        },
        '.cm-activeLine': { backgroundColor: 'rgba(200, 116, 42, .08)' },
        '.cm-activeLineGutter': { backgroundColor: 'rgba(200, 116, 42, .08)' },
        '.cm-scroller': {
          fontFamily: "'JetBrains Mono', 'Cascadia Code', Consolas, monospace",
          overflow: 'auto',
        },
        '.cm-content': { caretColor: '#e08535', padding: '6px 0' },
        '.cm-line': { padding: '0 10px 0 6px' },
        '.cm-lineWrapping': { whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowWrap: 'anywhere' },
        '.cm-cursor': { borderLeftColor: '#e08535' },
        '.cm-selectionBackground': { backgroundColor: 'rgba(200,116,42,0.25) !important' },
        '&.cm-focused .cm-selectionBackground': { backgroundColor: 'rgba(200,116,42,0.3) !important' },
        '.cm-panels': { backgroundColor: '#1c1c1c', color: '#ede8dc', borderColor: '#2f2f2f' },
        '.cm-panels.cm-panels-top': { borderBottom: '1px solid #2f2f2f' },
        '.cm-searchMatch': { backgroundColor: 'rgba(200,116,42,.3)', outline: '1px solid rgba(200,116,42,.5)' },
        '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: 'rgba(224,133,53,.45)' },
      }),
    ],
  });

  view = new EditorView({ state, parent: container });
  // Debug hook used by the screenshot/smoke tooling; it is not part of the
  // application's public IPC surface.
  (window as Window & { __aktexEditorView?: EditorView }).__aktexEditorView = view;
  return view;
}

function readSelection(state: EditorState): EditorSelection {
  const selection = state.selection.main;
  const from = state.doc.lineAt(selection.from);
  const to = state.doc.lineAt(selection.to);
  return {
    fromLine: from.number,
    fromCh: selection.from - from.from,
    toLine: to.number,
    toCh: selection.to - to.from,
    text: state.sliceDoc(selection.from, selection.to),
    empty: selection.empty,
  };
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

export function getEditorSelection(): EditorSelection {
  if (!view) return { fromLine: 1, fromCh: 0, toLine: 1, toCh: 0, text: '', empty: true };
  return readSelection(view.state);
}

export function getSelectedText(): string {
  return getEditorSelection().text;
}

export function getLineText(lineNumber: number): string {
  if (!view) return '';
  const total = view.state.doc.lines;
  const line = Math.max(1, Math.min(total, lineNumber));
  return view.state.doc.line(line).text;
}

export function getLineCount(): number {
  return view?.state.doc.lines ?? 0;
}

export function revealEditorRange(fromLine: number, fromCh: number, toLine: number, toCh: number): void {
  if (!view) return;
  const total = view.state.doc.lines;
  const startLine = view.state.doc.line(Math.max(1, Math.min(total, fromLine)));
  const endLine = view.state.doc.line(Math.max(1, Math.min(total, toLine)));
  const start = Math.max(0, Math.min(startLine.length, fromCh));
  const end = Math.max(0, Math.min(endLine.length, toCh));
  view.dispatch({
    selection: {
      anchor: startLine.from + start,
      head: endLine.from + end,
    },
    scrollIntoView: true,
  });
  view.focus();
}

export function revealEditorLine(line: number): void {
  if (!view) return;
  const total = view.state.doc.lines;
  const target = view.state.doc.line(Math.max(1, Math.min(total, line)));
  revealEditorRange(target.number, 0, target.number, target.length);
}

export function scrollEditorToLine(line: number): void {
  if (!view) return;
  const total = view.state.doc.lines;
  const pos = view.state.doc.line(Math.max(1, Math.min(total, line))).from;
  view.dispatch({ selection: { anchor: pos }, scrollIntoView: true });
}

export function getCursorLine(): number {
  if (!view) return 1;
  const pos = view.state.selection.main.head;
  return view.state.doc.lineAt(pos).number;
}

export function getCursorPosition(): { line: number; ch: number } {
  if (!view) return { line: 1, ch: 0 };
  const pos = view.state.selection.main.head;
  const line = view.state.doc.lineAt(pos);
  return { line: line.number, ch: pos - line.from };
}

export function getLineAtCoords(x: number, y: number): number | null {
  if (!view) return null;
  const pos = view.posAtCoords({ x, y });
  if (pos === null) return null;
  return view.state.doc.lineAt(pos).number;
}

export function insertTextAtCursor(text: string): void {
  if (!view) return;
  const selection = view.state.selection.main;
  view.dispatch({
    changes: { from: selection.from, to: selection.to, insert: text },
    selection: { anchor: selection.from + text.length },
  });
  view.focus();
}

export function insertBlockAtCursor(text: string): void {
  if (!view) return;
  const selection = view.state.selection.main;
  const line = view.state.doc.lineAt(selection.from);
  const atLineStart = selection.from === line.from;
  const before = atLineStart && line.number === 1 ? '' : '\n';
  const after = '\n';
  insertTextAtCursor(`${before}${text}${after}`);
}

export function replaceSelection(text: string): void {
  insertTextAtCursor(text);
}

export function deleteSelection(): void {
  if (!view) return;
  const selection = view.state.selection.main;
  if (selection.empty) return;
  view.dispatch({ changes: { from: selection.from, to: selection.to, insert: '' } });
  view.focus();
}

export function undo(): void {
  if (view) cmUndo(view);
}

export function redo(): void {
  if (view) cmRedo(view);
}

export function focusEditor(): void {
  view?.focus();
}

export function openFind(): void {
  if (!view) return;
  openSearchPanel(view);
}

/** Backwards-compatible name used by older callers. */
export function triggerFind(): void {
  openFind();
}
