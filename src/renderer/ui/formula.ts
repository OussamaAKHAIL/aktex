// AKTeX — offline formula editor and formula viewer, powered by KaTeX.

import katex from 'katex';
import { escapeHtml, toast } from './toast';

export interface FormulaToolsOptions {
  onInsert: (latex: string) => void;
}

interface Snippet {
  latex: string;
  label?: string;
}

interface Category {
  id: string;
  label: string;
  preview: string;
  snippets: Snippet[];
}

interface SavedFormula {
  name: string;
  latex: string;
}

const MINE_KEY = 'aktex.formulas.mine';

const CATEGORIES: Category[] = [
  {
    id: 'symbols',
    label: 'Symbols',
    preview: '\\times\\cap',
    snippets: [
      { latex: '\\times' }, { latex: '\\div' }, { latex: '\\pm' }, { latex: '\\mp' },
      { latex: '\\cdot' }, { latex: '\\ast' }, { latex: '\\star' }, { latex: '\\circ' },
      { latex: '\\bullet' }, { latex: '\\cap' }, { latex: '\\cup' }, { latex: '\\subseteq' },
      { latex: '\\in' }, { latex: '\\notin' }, { latex: '\\forall' }, { latex: '\\exists' },
      { latex: '\\infty' }, { latex: '\\partial' }, { latex: '\\nabla' }, { latex: '\\emptyset' },
      { latex: '\\neg' }, { latex: '\\land' }, { latex: '\\lor' }, { latex: '\\implies' },
      { latex: '\\iff' }, { latex: '\\therefore' }, { latex: '\\because' }, { latex: '\\ldots' },
    ],
  },
  {
    id: 'greeks',
    label: 'Greeks',
    preview: '\\alpha\\beta',
    snippets: [
      { latex: '\\alpha' }, { latex: '\\beta' }, { latex: '\\gamma' }, { latex: '\\delta' },
      { latex: '\\epsilon' }, { latex: '\\varepsilon' }, { latex: '\\zeta' }, { latex: '\\eta' },
      { latex: '\\theta' }, { latex: '\\vartheta' }, { latex: '\\iota' }, { latex: '\\kappa' },
      { latex: '\\lambda' }, { latex: '\\mu' }, { latex: '\\nu' }, { latex: '\\xi' },
      { latex: '\\pi' }, { latex: '\\varpi' }, { latex: '\\rho' }, { latex: '\\varrho' },
      { latex: '\\sigma' }, { latex: '\\varsigma' }, { latex: '\\tau' }, { latex: '\\upsilon' },
      { latex: '\\phi' }, { latex: '\\varphi' }, { latex: '\\chi' }, { latex: '\\psi' },
      { latex: '\\omega' }, { latex: '\\Gamma' }, { latex: '\\Delta' }, { latex: '\\Theta' },
      { latex: '\\Lambda' }, { latex: '\\Xi' }, { latex: '\\Pi' }, { latex: '\\Sigma' },
      { latex: '\\Upsilon' }, { latex: '\\Phi' }, { latex: '\\Psi' }, { latex: '\\Omega' },
    ],
  },
  {
    id: 'exp',
    label: 'Exp & Script',
    preview: '\\sqrt{x^n}',
    snippets: [
      { latex: 'x^{2}' }, { latex: 'x_{n}' }, { latex: 'x_{n}^{2}' },
      { latex: '\\sqrt{}' }, { latex: '\\sqrt[n]{}' }, { latex: 'e^{}' },
      { latex: '\\exp\\left({}\\right)' }, { latex: '\\ln\\left({}\\right)' },
      { latex: '\\log_{}\\left({}\\right)' }, { latex: '\\left({}\\right)^{}' },
      { latex: '\\overline{}' }, { latex: '\\underline{}' }, { latex: '\\widehat{}' },
      { latex: '\\widetilde{}' }, { latex: '\\vec{}' }, { latex: '\\dot{}' },
      { latex: '\\ddot{}' }, { latex: '\\overbrace{}^{}' }, { latex: '\\underbrace{}_{}' },
    ],
  },
  {
    id: 'frac',
    label: 'Frac & Del',
    preview: '\\frac{a}{b}',
    snippets: [
      { latex: '\\frac{}{}' }, { latex: '\\dfrac{}{}' }, { latex: '\\tfrac{}{}' },
      { latex: '\\cfrac{}{}' }, { latex: '\\binom{}{}' }, { latex: '\\partial' },
      { latex: '\\nabla' }, { latex: '\\left({}\\right)' }, { latex: '\\left[{}\\right]' },
      { latex: '\\left\\{{}\\right\\}' }, { latex: '\\left|{}\\right|' },
      { latex: '\\langle{}\\rangle' }, { latex: '\\left\\lfloor{}\\right\\rfloor' },
      { latex: '\\left\\lceil{}\\right\\rceil' },
    ],
  },
  {
    id: 'integral',
    label: 'Integral',
    preview: '\\int_a^b',
    snippets: [
      { latex: '\\int_{}^{}' }, { latex: '\\iint_{}^{}' }, { latex: '\\iiint_{}^{}' },
      { latex: '\\oint_{}^{}' }, { latex: '\\sum_{}^{}' }, { latex: '\\prod_{}^{}' },
      { latex: '\\coprod_{}^{}' }, { latex: '\\bigcap_{}^{}' }, { latex: '\\bigcup_{}^{}' },
      { latex: '\\int_{a}^{b} {}\\,dx' }, { latex: '\\sum_{i=1}^{n} {}' },
      { latex: '\\prod_{i=1}^{n} {}' }, { latex: '\\lim_{x \\to \\infty} {}' },
    ],
  },
  {
    id: 'limtrig',
    label: 'Lim & Trig',
    preview: '\\lim_{x\\to 0}',
    snippets: [
      { latex: '\\lim_{x \\to 0} {}' }, { latex: '\\lim_{x \\to \\infty} {}' },
      { latex: '\\lim_{n \\to \\infty} {}' }, { latex: '\\sin\\left({}\\right)' },
      { latex: '\\cos\\left({}\\right)' }, { latex: '\\tan\\left({}\\right)' },
      { latex: '\\cot\\left({}\\right)' }, { latex: '\\sec\\left({}\\right)' },
      { latex: '\\csc\\left({}\\right)' }, { latex: '\\arcsin\\left({}\\right)' },
      { latex: '\\arccos\\left({}\\right)' }, { latex: '\\arctan\\left({}\\right)' },
      { latex: '\\sinh\\left({}\\right)' }, { latex: '\\cosh\\left({}\\right)' },
      { latex: '\\tanh\\left({}\\right)' },
    ],
  },
  {
    id: 'sets',
    label: 'Set',
    preview: '\\mathbb{R}',
    snippets: [
      { latex: '\\mathbb{R}' }, { latex: '\\mathbb{N}' }, { latex: '\\mathbb{Z}' },
      { latex: '\\mathbb{Q}' }, { latex: '\\mathbb{C}' }, { latex: '\\mathcal{P}' },
      { latex: '\\in' }, { latex: '\\notin' }, { latex: '\\subset' }, { latex: '\\subseteq' },
      { latex: '\\supset' }, { latex: '\\supseteq' }, { latex: '\\cup' }, { latex: '\\cap' },
      { latex: '\\setminus' }, { latex: '\\emptyset' }, { latex: '\\varnothing' },
      { latex: '\\{ \\}' }, { latex: '\\left\\{ x \\mid x \\in \\mathbb{R} \\right\\}' },
    ],
  },
  {
    id: 'matrix',
    label: 'Brackets & Matrix',
    preview: '\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}',
    snippets: [
      { latex: '\\begin{pmatrix}\n{}\n\\end{pmatrix}' },
      { latex: '\\begin{bmatrix}\n{}\n\\end{bmatrix}' },
      { latex: '\\begin{vmatrix}\n{}\n\\end{vmatrix}' },
      { latex: '\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}' },
      { latex: '\\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix}' },
      { latex: '\\begin{cases}\n{}\n\\end{cases}' },
      { latex: '\\left( {}\\right)' }, { latex: '\\left[ {}\\right]' },
      { latex: '\\left\\{ {}\\right\\}' }, { latex: '\\langle {}\\rangle' },
      { latex: '\\left\\lfloor {}\\right\\rfloor' }, { latex: '\\left\\lceil {}\\right\\rceil' },
    ],
  },
  {
    id: 'multiline',
    label: 'Multiline',
    preview: '\\begin{aligned}a&=b\\\\c&=d\\end{aligned}',
    snippets: [
      { latex: '\\begin{aligned}\n{}\n\\end{aligned}' },
      { latex: '\\begin{align}\n{}\n\\end{align}' },
      { latex: '\\begin{gather}\n{}\n\\end{gather}' },
      { latex: '\\begin{cases}\n{}\n\\end{cases}' },
      { latex: '\\\\' }, { latex: '&' }, { latex: '\\newline' },
      { latex: '\\begin{matrix}\n{}\n\\end{matrix}' },
    ],
  },
  {
    id: 'font',
    label: 'Font',
    preview: '\\mathbb{A}\\mathcal{A}',
    snippets: [
      { latex: '\\mathbb{}' }, { latex: '\\mathcal{}' }, { latex: '\\mathfrak{}' },
      { latex: '\\mathbf{}' }, { latex: '\\mathrm{}' }, { latex: '\\mathit{}' },
      { latex: '\\mathsf{}' }, { latex: '\\mathtt{}' }, { latex: '\\text{}' },
      { latex: '\\operatorname{}' }, { latex: '\\boldsymbol{}' }, { latex: '\\pmb{}' },
    ],
  },
  {
    id: 'sizespace',
    label: 'Size & Space',
    preview: '\\quad\\Bigg|',
    snippets: [
      { latex: '\\quad' }, { latex: '\\qquad' }, { latex: '\\,' }, { latex: '\\;' },
      { latex: '\\:' }, { latex: '\\!' }, { latex: '\\hspace{}' }, { latex: '\\vspace{}' },
      { latex: '\\big' }, { latex: '\\Big' }, { latex: '\\bigg' }, { latex: '\\Bigg' },
      { latex: '\\displaystyle' }, { latex: '\\textstyle' }, { latex: '\\scriptstyle' },
    ],
  },
  {
    id: 'mine',
    label: 'Mine',
    preview: 'f(x)',
    snippets: [],
  },
];

function safeRender(tex: string, displayMode = false): string {
  try {
    return katex.renderToString(tex, {
      displayMode,
      throwOnError: false,
      strict: 'ignore',
      trust: false,
      output: 'html',
    });
  } catch {
    return escapeHtml(tex);
  }
}

function savedFormulas(): SavedFormula[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(MINE_KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is SavedFormula =>
      typeof item === 'object' && item !== null
      && typeof (item as SavedFormula).name === 'string'
      && typeof (item as SavedFormula).latex === 'string');
  } catch {
    return [];
  }
}

function saveFormula(formula: SavedFormula): void {
  const formulas = savedFormulas();
  formulas.unshift(formula);
  try { localStorage.setItem(MINE_KEY, JSON.stringify(formulas.slice(0, 60))); } catch { /* storage disabled */ }
}

/**
 * Electron does not implement `window.prompt`, so the “Add to My Formula”
 * action uses this small modal instead.
 */
function askFormulaName(defaultValue: string): Promise<string | null> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.id = 'formula-name-prompt';
    overlay.style.zIndex = '720';
    overlay.innerHTML = `
      <div class="dialog" style="width:min(360px,92vw)" role="dialog" aria-modal="true" aria-labelledby="formula-name-title">
        <div class="dialog-head">
          <h2 id="formula-name-title">Save formula</h2>
        </div>
        <div class="dialog-body">
          <div class="field">
            <label for="formula-name-input">Name</label>
            <input id="formula-name-input" type="text" spellcheck="false" />
          </div>
          <p class="hint" style="margin-top:8px">Saved formulas appear in the “Mine” category.</p>
        </div>
        <div class="dialog-foot">
          <span class="foot-spacer"></span>
          <button class="btn secondary" type="button" data-prompt-cancel>Cancel</button>
          <button class="btn primary" type="button" data-prompt-save>Save</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const input = overlay.querySelector<HTMLInputElement>('#formula-name-input');
    if (!input) {
      overlay.remove();
      resolve(null);
      return;
    }
    input.value = defaultValue;

    const finish = (value: string | null): void => {
      overlay.remove();
      resolve(value);
    };

    overlay.querySelector('[data-prompt-cancel]')?.addEventListener('click', () => finish(null));
    overlay.querySelector('[data-prompt-save]')?.addEventListener('click', () => finish(input.value.trim() || null));
    overlay.addEventListener('mousedown', (event) => {
      if (event.target === overlay) finish(null);
    });
    input.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Enter') {
        event.preventDefault();
        finish(input.value.trim() || null);
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        finish(null);
      }
    });
    input.focus();
    input.select();
  });
}

function wrappedLatex(raw: string, block: boolean, environment: string | null): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (environment) {
    if (environment === 'display') return `\\[\n${trimmed}\n\\]`;
    return `\\begin{${environment}}\n${trimmed}\n\\end{${environment}}`;
  }
  return block ? `\\[\n${trimmed}\n\\]` : `$${trimmed}$`;
}

// ── Formula editor ───────────────────────────────────────────────────────────

export function openFormulaEditor(options: FormulaToolsOptions): void {
  const existing = document.getElementById('formula-editor-overlay');
  if (existing) {
    (existing.querySelector<HTMLTextAreaElement>('.formula-input'))?.focus();
    return;
  }

  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.id = 'formula-editor-overlay';
  overlay.innerHTML = `
    <div class="dialog wide" role="dialog" aria-modal="true" aria-labelledby="formula-editor-title">
      <div class="dialog-head">
        <h2 id="formula-editor-title">Formula Editor</h2>
        <span class="dialog-sub">KaTeX live preview · offline</span>
        <button class="dialog-close" type="button" aria-label="Close formula editor">
          <svg class="ak-icon" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><use href="#ak-icon-close"></use></svg>
        </button>
      </div>
      <div class="dialog-body">
        <div class="tabs" role="tablist">
          <button class="tab-btn active" type="button" data-formula-tab="edit" role="tab" aria-selected="true">Edit Formula</button>
          <button class="tab-btn" type="button" data-formula-tab="recognize" role="tab" aria-selected="false">Recognize from Image</button>
        </div>
        <div data-formula-panel="edit">
          <div class="formula-cats" id="formula-cats"></div>
          <div class="formula-palette" id="formula-palette"></div>
          <textarea class="formula-input" spellcheck="false" aria-label="LaTeX formula input" placeholder="Type LaTeX here, for example: \\frac{a}{b} = \\sqrt{x}"></textarea>
          <div class="formula-preview-box" aria-live="polite"><span class="hint">Formula preview</span></div>
          <div class="formula-error"></div>
          <div class="formula-options">
            <label><input type="radio" name="formula-style" value="block" checked /> Block Style</label>
            <label><input type="radio" name="formula-style" value="inline" /> Inline Style</label>
            <label><input type="checkbox" id="formula-environment" /> Environment</label>
            <select id="formula-environment-select" disabled>
              <option value="display">\\[ … \\]</option>
              <option value="equation">equation</option>
              <option value="align">align</option>
              <option value="gather">gather</option>
              <option value="multline">multline</option>
              <option value="cases">cases</option>
              <option value="pmatrix">pmatrix</option>
              <option value="bmatrix">bmatrix</option>
            </select>
          </div>
        </div>
        <div data-formula-panel="recognize" hidden>
          <div class="image-drop" style="cursor:default">
            <svg class="ak-icon" width="30" height="30" viewBox="0 0 16 16" aria-hidden="true"><use href="#ak-icon-image"></use></svg>
            <strong>Recognize from image</strong>
            <span class="hint">Offline OCR is not bundled with this build. Image recognition will arrive in a future update; use the editor above to type or paste LaTeX.</span>
          </div>
        </div>
      </div>
      <div class="dialog-foot">
        <button class="btn tertiary" type="button" data-formula-action="save">Add to My Formula</button>
        <button class="btn secondary" type="button" data-formula-action="copy">Copy</button>
        <span class="foot-spacer"></span>
        <button class="btn secondary" type="button" data-formula-action="cancel">Cancel</button>
        <button class="btn primary" type="button" data-formula-action="insert">Insert</button>
      </div>
    </div>`;

  document.getElementById('overlay-root')?.appendChild(overlay);

  const textarea = overlay.querySelector<HTMLTextAreaElement>('.formula-input');
  const preview = overlay.querySelector<HTMLElement>('.formula-preview-box');
  const errorBox = overlay.querySelector<HTMLElement>('.formula-error');
  const cats = overlay.querySelector<HTMLElement>('#formula-cats');
  const palette = overlay.querySelector<HTMLElement>('#formula-palette');
  const envCheck = overlay.querySelector<HTMLInputElement>('#formula-environment');
  const envSelect = overlay.querySelector<HTMLSelectElement>('#formula-environment-select');
  if (!textarea || !preview || !errorBox || !cats || !palette || !envCheck || !envSelect) return;

  let previewTimer: number | null = null;
  let styleBlock = true;
  let activeCategory = 'symbols';

  const close = (): void => {
    if (previewTimer !== null) window.clearTimeout(previewTimer);
    overlay.remove();
    document.querySelector('#btn-formula-editor')?.classList.remove('active');
    document.removeEventListener('keydown', onKeyDown, true);
  };

  const updatePreview = (): void => {
    const raw = textarea.value.trim();
    errorBox.textContent = '';
    if (!raw) {
      preview.innerHTML = '<span class="hint">Formula preview</span>';
      return;
    }
    try {
      katex.render(raw, preview, {
        displayMode: styleBlock,
        throwOnError: true,
        strict: 'ignore',
        trust: false,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errorBox.textContent = message;
      preview.innerHTML = safeRender(raw, styleBlock);
    }
  };

  const schedulePreview = (): void => {
    if (previewTimer !== null) window.clearTimeout(previewTimer);
    previewTimer = window.setTimeout(updatePreview, 180);
  };

  const insertSnippet = (snippet: Snippet): void => {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = textarea.value.slice(start, end);
    let insertion = snippet.latex;
    let nextCaret: number | null = null;

    if (selected) {
      const emptyGroup = insertion.indexOf('{}');
      if (emptyGroup >= 0) {
        insertion = `${insertion.slice(0, emptyGroup + 1)}${selected}${insertion.slice(emptyGroup + 1)}`;
      } else {
        insertion = `${insertion}${selected}`;
      }
    }

    const remaining = insertion.indexOf('{}');
    if (remaining >= 0) nextCaret = start + remaining + 1;

    textarea.setRangeText(insertion, start, end, 'end');
    if (nextCaret !== null) {
      textarea.setSelectionRange(nextCaret, nextCaret);
    }
    textarea.focus();
    schedulePreview();
  };

  const buildPalette = (category: Category): void => {
    palette.replaceChildren();
    let snippets = category.snippets;
    if (category.id === 'mine') {
      snippets = savedFormulas().map((formula) => ({ latex: formula.latex, label: formula.name }));
      if (snippets.length === 0) {
        const empty = document.createElement('span');
        empty.className = 'hint';
        empty.textContent = 'No saved formulas yet. Use “Add to My Formula” to build your collection.';
        palette.appendChild(empty);
        palette.classList.add('open');
        return;
      }
    }

    const grid = document.createElement('div');
    grid.className = 'palette-grid';
    for (const snippet of snippets) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'snippet-btn';
      button.title = snippet.label ? `${snippet.label} — ${snippet.latex}` : snippet.latex;
      if (snippet.label) {
        button.textContent = snippet.label;
      } else {
        button.innerHTML = safeRender(snippet.latex.replace(/\{\}/g, '\\square'));
      }
      button.addEventListener('click', () => insertSnippet(snippet));
      grid.appendChild(button);
    }
    palette.appendChild(grid);
    palette.classList.add('open');
  };

  const renderCategories = (): void => {
    cats.replaceChildren();
    for (const category of CATEGORIES) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `formula-cat${category.id === activeCategory ? ' active' : ''}`;
      button.dataset.category = category.id;
      button.title = category.label;
      const previewSpan = document.createElement('span');
      previewSpan.className = 'cat-preview';
      previewSpan.innerHTML = safeRender(category.preview);
      const label = document.createElement('span');
      label.textContent = category.label;
      button.append(previewSpan, label);
      button.addEventListener('click', () => {
        if (activeCategory === category.id && palette.classList.contains('open')) {
          palette.classList.remove('open');
          return;
        }
        activeCategory = category.id;
        cats.querySelectorAll('.formula-cat').forEach((other) => other.classList.toggle('active', other === button));
        buildPalette(category);
      });
      cats.appendChild(button);
    }
    const initial = CATEGORIES.find((category) => category.id === activeCategory);
    if (initial) buildPalette(initial);
  };

  const finalLatex = (): string => wrappedLatex(textarea.value, styleBlock, envCheck.checked ? envSelect.value : null);

  const copy = async (): Promise<void> => {
    const text = finalLatex();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      textarea.select();
      document.execCommand('copy');
    }
    const button = overlay.querySelector<HTMLButtonElement>('[data-formula-action="copy"]');
    if (button) {
      const previous = button.textContent;
      button.textContent = 'Copied!';
      window.setTimeout(() => { button.textContent = previous; }, 1200);
    }
  };

  const insert = (): void => {
    const text = finalLatex();
    if (!text) {
      textarea.focus();
      return;
    }
    options.onInsert(text);
    close();
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    // The nested save-name prompt owns keyboard input while it is open.
    if (document.getElementById('formula-name-prompt')) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      insert();
    }
  };

  overlay.querySelector('.dialog-close')?.addEventListener('click', close);
  overlay.addEventListener('mousedown', (event) => {
    if (event.target === overlay) close();
  });

  overlay.querySelectorAll<HTMLButtonElement>('[data-formula-tab]').forEach((tab) => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.formulaTab;
      overlay.querySelectorAll<HTMLButtonElement>('[data-formula-tab]').forEach((other) => {
        const active = other === tab;
        other.classList.toggle('active', active);
        other.setAttribute('aria-selected', String(active));
      });
      overlay.querySelectorAll<HTMLElement>('[data-formula-panel]').forEach((panel) => {
        panel.hidden = panel.dataset.formulaPanel !== target;
      });
    });
  });

  overlay.querySelectorAll<HTMLInputElement>('input[name="formula-style"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      styleBlock = radio.value === 'block';
      schedulePreview();
    });
  });

  envCheck.addEventListener('change', () => {
    envSelect.disabled = !envCheck.checked;
    schedulePreview();
  });
  envSelect.addEventListener('change', schedulePreview);

  overlay.querySelector('[data-formula-action="save"]')?.addEventListener('click', () => {
    const raw = textarea.value.trim();
    if (!raw) { textarea.focus(); return; }
    void askFormulaName('My formula').then((name) => {
      if (!name) return;
      const trimmed = name.trim().slice(0, 80);
      saveFormula({ name: trimmed, latex: raw });
      toast(`Saved “${trimmed}” to My Formula.`);
    });
  });
  overlay.querySelector('[data-formula-action="copy"]')?.addEventListener('click', () => { void copy(); });
  overlay.querySelector('[data-formula-action="cancel"]')?.addEventListener('click', close);
  overlay.querySelector('[data-formula-action="insert"]')?.addEventListener('click', insert);

  textarea.addEventListener('input', schedulePreview);
  document.addEventListener('keydown', onKeyDown, true);

  renderCategories();
  textarea.value = '';
  updatePreview();
  textarea.focus();
  document.querySelector('#btn-formula-editor')?.classList.add('active');
}

// ── Formula viewer ───────────────────────────────────────────────────────────

interface ExtractedFormula {
  latex: string;
  display: boolean;
}

export function extractFormula(selection: string): ExtractedFormula | null {
  let text = selection.trim();
  if (!text) return null;

  let match = /^\\begin\{(equation\*?|align\*?|gather\*?|multline\*?|displaymath)\}([\s\S]*)\\end\{\1\}$/.exec(text);
  if (match) return { latex: match[2].trim(), display: true };

  if (/^\$\$[\s\S]*\$\$$/.test(text)) return { latex: text.slice(2, -2).trim(), display: true };
  if (/^\\\[[\s\S]*\\\]$/.test(text)) return { latex: text.slice(2, -2).trim(), display: true };
  if (/^\$[\s\S]*\$$/.test(text)) return { latex: text.slice(1, -1).trim(), display: false };
  if (/^\\\([\s\S]*\\\)$/.test(text)) return { latex: text.slice(2, -2).trim(), display: false };

  // Inline math inside a larger selection: preview the first math group.
  match = /\\\[([\s\S]*?)\\\]/.exec(text);
  if (match) return { latex: match[1].trim(), display: true };
  match = /\$([^$]+)\$/.exec(text);
  if (match) return { latex: match[1].trim(), display: false };
  match = /\\\(([\s\S]*?)\\\)/.exec(text);
  if (match) return { latex: match[1].trim(), display: false };

  // Raw LaTeX selection (no delimiters).
  if (/\\[a-zA-Z]+|\^|_|\{|\}/.test(text)) return { latex: text, display: false };
  return null;
}

let viewerElement: HTMLElement | null = null;

export function closeFormulaViewer(): void {
  viewerElement?.remove();
  viewerElement = null;
}

export function openFormulaViewer(selection: string, anchor: HTMLElement | null): void {
  closeFormulaViewer();
  const formula = extractFormula(selection);
  if (!formula) {
    toast('Select some LaTeX math in the editor first.', 'error');
    return;
  }

  const popover = document.createElement('div');
  popover.className = 'formula-popover';
  popover.innerHTML = `
    <div class="formula-popover-head">
      <svg class="ak-icon" width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><use href="#ak-icon-formula-view"></use></svg>
      <span>Formula preview</span>
      <button class="dialog-close" type="button" aria-label="Close formula preview">
        <svg class="ak-icon" width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><use href="#ak-icon-close"></use></svg>
      </button>
    </div>
    <div class="formula-popover-body"></div>
    <div class="formula-popover-code"></div>
    <div class="formula-popover-foot">
      <button class="btn secondary" type="button" data-viewer-copy>Copy LaTeX</button>
      <button class="btn tertiary" type="button" data-viewer-close>Close</button>
    </div>`;
  document.body.appendChild(popover);
  viewerElement = popover;

  const body = popover.querySelector<HTMLElement>('.formula-popover-body');
  const code = popover.querySelector<HTMLElement>('.formula-popover-code');
  if (body) {
    try {
      katex.render(formula.latex, body, {
        displayMode: formula.display,
        throwOnError: true,
        strict: 'ignore',
        trust: false,
      });
    } catch (error) {
      body.textContent = error instanceof Error ? error.message : String(error);
      body.style.color = 'var(--log-error)';
      body.style.fontSize = '11px';
    }
  }
  if (code) code.textContent = formula.latex;

  const rect = anchor?.getBoundingClientRect();
  if (rect) {
    const width = Math.min(440, window.innerWidth - 24);
    popover.style.width = `${width}px`;
    const left = Math.max(10, Math.min(window.innerWidth - width - 10, rect.left));
    const top = Math.min(window.innerHeight - 200, rect.bottom + 8);
    popover.style.left = `${left}px`;
    popover.style.top = `${Math.max(10, top)}px`;
  } else {
    popover.style.left = '50%';
    popover.style.top = '30%';
    popover.style.transform = 'translateX(-50%)';
  }

  popover.querySelector('.dialog-close')?.addEventListener('click', closeFormulaViewer);
  popover.querySelector('[data-viewer-close]')?.addEventListener('click', closeFormulaViewer);
  popover.querySelector('[data-viewer-copy]')?.addEventListener('click', () => {
    void navigator.clipboard.writeText(formula.latex).then(() => toast('LaTeX copied.')).catch(() => toast('Could not copy LaTeX.', 'error'));
  });

  const dismiss = (event: MouseEvent): void => {
    if (viewerElement && !viewerElement.contains(event.target as Node)) {
      closeFormulaViewer();
      document.removeEventListener('mousedown', dismiss, true);
    }
  };
  window.setTimeout(() => document.addEventListener('mousedown', dismiss, true), 0);

  const onKey = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return;
    closeFormulaViewer();
    document.removeEventListener('keydown', onKey, true);
  };
  document.addEventListener('keydown', onKey, true);
}
