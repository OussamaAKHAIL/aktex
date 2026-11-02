// AKTeX — LaTeX language support: syntax highlighting + autocomplete.

import { CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { StreamLanguage } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import { Extension } from '@codemirror/state';

// ── StreamLanguage tokenizer ──────────────────────────────────────────────────

const latexLanguage = StreamLanguage.define({
  name: 'latex',
  token(stream) {
    // Comment
    if (stream.match(/^%.*$/)) return 'comment';

    // Math mode: $...$ or $$...$$
    if (stream.match('$$')) return 'string';
    if (stream.match('$')) return 'string';

    // Command: \word or \( \) \[ \]
    if (stream.match(/^\\[a-zA-Z]+\*?/)) return 'keyword';
    if (stream.match(/^\\[^a-zA-Z]/)) return 'keyword';

    // Braces — highlight { and } as bracket
    if (stream.match('{') || stream.match('}')) return 'bracket';

    // Optional args [ ]
    if (stream.match('[') || stream.match(']')) return 'meta';

    stream.next();
    return null;
  },
  languageData: {},
});

// ── Highlight style — maps token names to colors ──────────────────────────────

export const latexHighlightStyle = HighlightStyle.define([
  { tag: t.keyword, color: '#c8742a', fontWeight: '600' },  // commands  — accent orange
  { tag: t.comment, color: '#5a7a5a', fontStyle: 'italic' }, // %comments — muted green
  { tag: t.string, color: '#6fa8d0' },                      // $math$    — soft blue
  { tag: t.bracket, color: '#d4a017' },                      // { }       — warm yellow
  { tag: t.meta, color: '#9a8a6a' },                      // [ ]       — dim tan
]);

// Single extension that combines language + highlighting
export const latexExtension: Extension = [
  latexLanguage,
  syntaxHighlighting(latexHighlightStyle),
];

// ── Autocomplete ──────────────────────────────────────────────────────────────

const LATEX_COMMANDS = [
  // Document structure
  '\\documentclass', '\\usepackage', '\\begin', '\\end',
  '\\section', '\\subsection', '\\subsubsection',
  '\\chapter', '\\part', '\\paragraph', '\\subparagraph',
  '\\label', '\\ref', '\\cite', '\\bibliography', '\\bibliographystyle',
  '\\input', '\\include', '\\tableofcontents',
  // Text formatting
  '\\textbf', '\\textit', '\\underline', '\\emph',
  '\\texttt', '\\textrm', '\\textsf', '\\textsc',
  // Math & symbols
  '\\frac', '\\sqrt', '\\sum', '\\int', '\\prod', '\\lim',
  '\\alpha', '\\beta', '\\gamma', '\\delta', '\\epsilon', '\\zeta', '\\eta',
  '\\theta', '\\iota', '\\kappa', '\\lambda', '\\mu', '\\nu', '\\xi',
  '\\pi', '\\rho', '\\sigma', '\\tau', '\\upsilon', '\\phi', '\\chi', '\\psi', '\\omega',
  '\\Gamma', '\\Delta', '\\Theta', '\\Lambda', '\\Xi', '\\Pi', '\\Sigma', '\\Phi', '\\Psi', '\\Omega',
  '\\infty', '\\partial', '\\nabla', '\\forall', '\\exists',
  '\\mathbb', '\\mathbf', '\\mathcal', '\\mathit', '\\mathrm',
  '\\leq', '\\geq', '\\neq', '\\approx', '\\equiv', '\\times', '\\cdot',
  // Environments
  '\\begin{document}', '\\begin{abstract}', '\\begin{figure}',
  '\\begin{table}', '\\begin{tabular}', '\\begin{itemize}',
  '\\begin{enumerate}', '\\begin{equation}', '\\begin{align}',
  '\\begin{gather}', '\\begin{pmatrix}', '\\begin{bmatrix}',
  '\\begin{matrix}', '\\begin{cases}', '\\begin{proof}',
  '\\begin{lstlisting}', '\\item',
  // Layout
  '\\newline', '\\linebreak', '\\pagebreak', '\\newpage',
  '\\hspace', '\\vspace', '\\hfill', '\\vfill',
  '\\centering', '\\raggedright', '\\raggedleft',
  // Misc
  '\\maketitle', '\\listoffigures', '\\listoftables',
  '\\includegraphics', '\\caption', '\\footnote',
  '\\title', '\\author', '\\date', '\\today',
  '\\addbibresource', '\\printbibliography',
];

export function latexCompletions(context: CompletionContext): CompletionResult | null {
  const word = context.matchBefore(/\\[a-zA-Z]*/);
  if (!word || (word.from === word.to && !context.explicit)) return null;

  return {
    from: word.from,
    options: LATEX_COMMANDS
      .filter(cmd => cmd.startsWith(word.text))
      .map(cmd => ({ label: cmd, type: 'keyword' })),
  };
}