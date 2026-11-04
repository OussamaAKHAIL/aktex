// AKTeX — document outline widget.
//
// The outline deliberately parses LaTeX source text instead of relying on the
// compiler: it updates while typing, works without a compiled PDF, and is
// cheap enough to run on every debounced edit.

export interface OutlineEntry {
  level: number;
  title: string;
  line: number;
  command: string;
}

const SECTION_RE = /^\s*\\(part|chapter|section|subsection|subsubsection|paragraph|subparagraph)\*?\s*(?:\[[^\]]*\])?\s*\{/;
const LEVELS: Record<string, number> = {
  part: 0,
  chapter: 1,
  section: 2,
  subsection: 3,
  subsubsection: 4,
  paragraph: 5,
  subparagraph: 6,
};

function stripComment(line: string): string {
  let result = '';
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '%' && line[index - 1] !== '\\') break;
    result += char;
  }
  return result;
}

function readBraced(text: string, openIndex: number): string {
  let depth = 0;
  for (let index = openIndex; index < text.length; index += 1) {
    const char = text[index];
    if (char === '\\') { index += 1; continue; }
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(openIndex + 1, index);
    }
  }
  return '';
}

/** Reduce simple LaTeX markup to something readable in a narrow sidebar. */
export function cleanTitle(raw: string): string {
  let title = raw;
  title = title.replace(/\\label\{[^}]*\}/g, '');
  title = title.replace(/\\(?:textbf|textit|textsc|texttt|textrm|textsf|emph|underline|mbox)\s*\{([^{}]*)\}/g, '$1');
  title = title.replace(/\\(?:cite|ref|eqref|pageref)\*?\s*\{[^{}]*\}/g, '');
  title = title.replace(/\\([a-zA-Z]+)\s*/g, '$1');
  title = title.replace(/[{}]/g, '');
  title = title.replace(/\\/g, '');
  title = title.replace(/\s+/g, ' ').trim();
  return title || 'Untitled section';
}

export function parseOutline(source: string): OutlineEntry[] {
  const entries: OutlineEntry[] = [];
  const lines = source.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = stripComment(lines[index]);
    const match = SECTION_RE.exec(line);
    if (!match) continue;
    const command = match[1];
    const braceIndex = line.indexOf('{', match.index + match[0].length - 1);
    if (braceIndex < 0) continue;
    const rawTitle = readBraced(line, braceIndex);
    entries.push({
      level: LEVELS[command] ?? 2,
      title: cleanTitle(rawTitle),
      line: index + 1,
      command,
    });
  }

  if (entries.length === 0) return entries;
  // Normalise against the shallowest heading in this document so a file that
  // starts at \section does not render with four empty indentation levels.
  const minLevel = Math.min(...entries.map((entry) => entry.level));
  return entries.map((entry) => ({ ...entry, level: entry.level - minLevel }));
}

export function renderOutline(
  container: HTMLElement,
  entries: OutlineEntry[],
  onSelect: (line: number) => void,
): void {
  container.replaceChildren();
  if (entries.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'outline-empty';
    empty.textContent = 'No sections yet. Add \\section{…} headings to navigate.';
    container.appendChild(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const entry of entries) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = `outline-item level-${entry.level}`;
    item.style.paddingLeft = `${10 + entry.level * 11}px`;
    item.title = `${entry.title} — line ${entry.line}`;
    item.dataset.line = String(entry.line);

    const label = document.createElement('span');
    label.className = 'outline-title';
    label.textContent = entry.title;

    const line = document.createElement('span');
    line.className = 'outline-line';
    line.textContent = String(entry.line);

    item.append(label, line);
    item.addEventListener('click', () => onSelect(entry.line));
    fragment.appendChild(item);
  }
  container.appendChild(fragment);
}

/** Attach a delegated keyboard handler for the outline list. */
export function wireOutlineSelection(container: HTMLElement, onSelect: (line: number) => void): void {
  container.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const target = event.target as HTMLElement;
    if (!target.classList.contains('outline-item')) return;
    event.preventDefault();
    onSelect(Number(target.dataset.line ?? '1'));
  });
}
