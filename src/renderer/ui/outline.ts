// AKTeX — document outline widget.
//
// The outline parses LaTeX source text instead of relying on the compiler: it
// updates while typing, works without a compiled PDF, and is cheap enough to
// run on every debounced edit.
//
// For a project it walks `\input` / `\include` / `\subfile` directives
// recursively, so the whole document structure (chapters, sections, …) shows
// up even when the content lives in separate `.tex` files.

export interface OutlineEntry {
  level: number;
  title: string;
  line: number;
  command: string;
  file: string;
}

const SECTION_RE = /^\s*\\(part|chapter|section|subsection|subsubsection|paragraph|subparagraph)\*?\s*(?:\[[^\]]*\])?\s*\{/;
const INCLUDE_RE = /^\s*\\(include|input|subfile)\s*\{([^{}]*)\}/;
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

function separatorOf(filePath: string): string {
  return filePath.includes('\\') ? '\\' : '/';
}

function dirOf(filePath: string): string {
  const separator = separatorOf(filePath);
  const index = filePath.lastIndexOf(separator);
  return index >= 0 ? filePath.slice(0, index) : '.';
}

function joinPath(baseDir: string, name: string): string {
  const separator = separatorOf(baseDir);
  return `${baseDir}${separator}${name.replace(/[\\/]/g, separator)}`;
}

function candidatesFor(baseDir: string, rawTarget: string): string[] {
  const target = rawTarget.trim();
  const hasExtension = /\.[a-zA-Z0-9]+$/.test(target);
  const names = hasExtension ? [target] : [`${target}.tex`, target];
  return names.map((name) => joinPath(baseDir, name));
}

function parseFileEntries(content: string, file: string): OutlineEntry[] {
  const entries: OutlineEntry[] = [];
  const lines = content.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = stripComment(lines[index]);
    const match = SECTION_RE.exec(line);
    if (!match) continue;
    const braceIndex = line.indexOf('{', match.index + match[0].length - 1);
    if (braceIndex < 0) continue;
    entries.push({
      level: LEVELS[match[1]] ?? 2,
      title: cleanTitle(readBraced(line, braceIndex)),
      line: index + 1,
      command: match[1],
      file,
    });
  }
  return entries;
}

export type OutlineReader = (filePath: string) => Promise<string>;

/** Build the full project outline, following `\input` / `\include` / `\subfile`. */
export async function buildProjectOutline(rootFile: string, readFile: OutlineReader): Promise<OutlineEntry[]> {
  const entries: OutlineEntry[] = [];
  const processed = new Set<string>();
  const keyOf = (file: string): string => file.replace(/[\\/]/g, '/').toLowerCase();

  const processContent = async (file: string, content: string): Promise<void> => {
    const lines = content.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const line = stripComment(lines[index]);

      const include = INCLUDE_RE.exec(line);
      if (include) {
        for (const candidate of candidatesFor(dirOf(file), include[2])) {
          const key = keyOf(candidate);
          if (processed.has(key)) continue;
          let included: string;
          try {
            included = await readFile(candidate);
          } catch {
            continue;
          }
          processed.add(key);
          await processContent(candidate, included);
          break; // Use the first candidate that actually exists.
        }
        continue;
      }

      const section = SECTION_RE.exec(line);
      if (!section) continue;
      const braceIndex = line.indexOf('{', section.index + section[0].length - 1);
      if (braceIndex < 0) continue;
      entries.push({
        level: LEVELS[section[1]] ?? 2,
        title: cleanTitle(readBraced(line, braceIndex)),
        line: index + 1,
        command: section[1],
        file,
      });
    }
  };

  let root: string;
  try {
    root = await readFile(rootFile);
  } catch {
    root = '';
  }
  processed.add(keyOf(rootFile));
  await processContent(rootFile, root);

  if (entries.length === 0) return entries;
  const minLevel = Math.min(...entries.map((entry) => entry.level));
  return entries.map((entry) => ({ ...entry, level: entry.level - minLevel }));
}

/** Single-file parse kept for callers that don't need include resolution. */
export function parseOutline(source: string): OutlineEntry[] {
  const entries = parseFileEntries(source, '');
  if (entries.length === 0) return entries;
  const minLevel = Math.min(...entries.map((entry) => entry.level));
  return entries.map((entry) => ({ ...entry, level: entry.level - minLevel }));
}

export function renderOutline(
  container: HTMLElement,
  entries: OutlineEntry[],
  onSelect: (entry: OutlineEntry) => void,
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
    item.title = `${entry.title} — ${entry.file}:${entry.line}`;
    item.dataset.file = entry.file;
    item.dataset.line = String(entry.line);

    const label = document.createElement('span');
    label.className = 'outline-title';
    label.textContent = entry.title;

    const line = document.createElement('span');
    line.className = 'outline-line';
    line.textContent = String(entry.line);

    item.append(label, line);
    item.addEventListener('click', () => onSelect(entry));
    fragment.appendChild(item);
  }
  container.appendChild(fragment);
}

/** Attach a delegated keyboard handler for the outline list. */
export function wireOutlineSelection(container: HTMLElement, onSelect: (entry: OutlineEntry) => void): void {
  container.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const target = event.target as HTMLElement;
    if (!target.classList.contains('outline-item')) return;
    event.preventDefault();
    onSelect({
      level: 0,
      title: target.querySelector('.outline-title')?.textContent ?? '',
      line: Number(target.dataset.line ?? '1'),
      command: '',
      file: target.dataset.file ?? '',
    });
  });
}
