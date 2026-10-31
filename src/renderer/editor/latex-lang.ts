// AKTeX — LaTeX Autocomplete Definitions
// Codex: expand this list with more LaTeX commands as needed.

import { CompletionContext, CompletionResult } from '@codemirror/autocomplete';

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
  '\\maketitle', '\\tableofcontents', '\\listoffigures', '\\listoftables',
  '\\includegraphics', '\\caption', '\\footnote',
  '\\title', '\\author', '\\date', '\\today',
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
