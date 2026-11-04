// AKTeX — renderer orchestration. Electron is deliberately accessed only through preload.
import { EditorView } from '@codemirror/view';
import {
  getCursorLine,
  getEditorContent,
  getEditorSelection,
  getLineAtCoords,
  getLineText,
  initEditor,
  insertBlockAtCursor,
  insertTextAtCursor,
  openFind,
  redo,
  revealEditorLine,
  setEditorContent,
  undo,
} from './editor/editor';
import {
  clearSyncMarker,
  fitPage,
  fitWidth,
  getPdfState,
  loadPdf,
  PdfSyncPosition,
  PdfViewState,
  resetZoom,
  scrollToPosition,
  setPageChangeHandler,
  setSyncTexHandlers,
  setZoomChangeHandler,
  showSyncMarker,
  zoomIn,
  zoomOut,
} from './pdf/viewer';
import { escapeHtml, toast } from './ui/toast';
import { icon, installIconSprite } from './ui/icons';
import { initSplash } from './ui/splash';
import { initLayout, persistOutlineCollapsed, restoreCollapsedState } from './ui/layout';
import { initLogPanel, openLog, setLogTab } from './ui/logpanel';
import { OutlineEntry, buildProjectOutline, renderOutline, wireOutlineSelection } from './ui/outline';
import { extractFormula, hideFormulaHover, openFormulaEditor, openFormulaViewer, showFormulaHover } from './ui/formula';
import { openImageInserter } from './ui/image-insert';

type LogType = 'info' | 'error' | 'warning';

interface FileNode { name: string; path: string; isDirectory: boolean; children?: FileNode[]; }
interface ProjectPayload { path: string; files: FileNode[]; mainFile: string | null; }
interface ImagePickResult { path: string; name: string; }
interface ImageImportResult { absolutePath: string; relativePath: string; }

interface AKTeXApi {
  compile(mainFile: string): void;
  stopCompile(): void;
  onCompileLog(callback: (line: string, type: LogType) => void): void;
  onCompileDone(callback: (pdfPath: string | null, success: boolean) => void): void;
  onCompilerStatus(callback: (available: boolean, label: string) => void): void;
  getCompilerStatus(): Promise<{ available: boolean; label: string }>;
  syncToPdf(file: string, startLine: number, startCh: number, endLine: number, endCh: number): void;
  syncToEditor(pdfPath: string, page: number, x: number, y: number): void;
  onSyncToEditor(callback: (file: string, line: number) => void): void;
  onSyncTexFailed(callback: (message: string) => void): void;
  onPdfPosition(callback: (position: PdfSyncPosition) => void): void;
  openProject(): Promise<ProjectPayload | null>;
  refreshProject(): Promise<ProjectPayload | null>;
  getInitialProject(): Promise<ProjectPayload | null>;
  openFile(filePath: string): Promise<string>;
  readFile(filePath: string): Promise<string>;
  readBinaryFile(filePath: string): Promise<Uint8Array>;
  saveFile(filePath: string, content: string): Promise<void>;
  createFile(directory: string): Promise<string | null>;
  renameFile(filePath: string): Promise<string | null>;
  deleteFile(filePath: string): Promise<boolean>;
  pickImage(): Promise<ImagePickResult | null>;
  importImage(sourcePath: string, projectPath: string | null): Promise<ImageImportResult | null>;
  exportZip(): Promise<boolean>;
  importZip(): Promise<ProjectPayload | null>;
  openCompilerHelp(): void;
  closeWindow(): void;
  minimizeWindow(): void;
  maximizeWindow(): void;
}
declare global { interface Window { aktext: AKTeXApi; } }

const editorElement = required<HTMLElement>('editor');
const treeContent = required<HTMLElement>('tree-content');
const outlineContent = required<HTMLElement>('outline-content');
const logScroll = required<HTMLElement>('log-scroll');
const contextMenu = required<HTMLElement>('context-menu');

let editor: EditorView;
let project: ProjectPayload | null = null;
let activeFile: string | null = null;
let activePdf: string | null = null;
let suppressSave = false;
let saveTimer: number | null = null;
let outlineTimer: number | null = null;
let outlineEntries: OutlineEntry[] = [];
let errors = 0;
let contextFile: FileNode | null = null;
let pendingPdfTarget: { page: number; x: number; y: number } | null = null;
let pendingSyncText: string | null = null;

// ── Open files (multi-tab) ───────────────────────────────────────────────────
const openFiles: string[] = [];
const fileContents = new Map<string, string>();

function required<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`AKTeX could not find #${id}.`);
  return element as T;
}

function fileName(filePath: string): string {
  return filePath.split(/[\\/]/).pop() ?? filePath;
}

function timestamp(): string {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function messageFor(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function iconForFile(filePath: string): string {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.tex')) return 'file-tex';
  if (lower.endsWith('.bib')) return 'file-bib';
  if (lower.endsWith('.pdf')) return 'file-pdf';
  if (/\.(png|jpe?g|gif|webp|bmp|svg)$/.test(lower)) return 'file-image';
  return 'file';
}

// ── Logging ──────────────────────────────────────────────────────────────────

function addLog(line: string, type: LogType = 'info'): void {
  if (type === 'error') errors += 1;
  const row = document.createElement('div');
  row.className = 'log-line';
  const time = document.createElement('time');
  time.className = 'timestamp';
  time.textContent = timestamp();
  const message = document.createElement('span');
  message.className = `log-${type}`;
  message.textContent = line;
  row.dataset.type = type;
  row.append(time, message);
  logScroll.appendChild(row);
  logScroll.scrollTop = logScroll.scrollHeight;
  required<HTMLElement>('problem-count').textContent = errors ? `(${errors})` : '';
  if (type === 'error') openLog();
}

function clearLog(): void {
  logScroll.replaceChildren();
  errors = 0;
  required<HTMLElement>('problem-count').textContent = '';
}

// ── Tabs and file tree ───────────────────────────────────────────────────────

function setActivePath(label: string): void {
  required<HTMLElement>('active-path').textContent = label;
  document.title = label.includes('—') ? label : `${label} — AKTeX`;
}

function renderTabs(): void {
  const tabBar = required<HTMLElement>('tab-bar');
  tabBar.replaceChildren();

  if (openFiles.length === 0) {
    const welcome = document.createElement('div');
    welcome.className = 'tab active';
    welcome.innerHTML = `${icon('file-tex', 13)}<span>Welcome</span>`;
    tabBar.appendChild(welcome);
    return;
  }

  for (const filePath of openFiles) {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = `tab${filePath === activeFile ? ' active' : ''}`;
    tab.title = filePath;
    tab.innerHTML = `${icon(iconForFile(filePath), 13)}<span class="tab-name">${escapeHtml(fileName(filePath))}</span><span class="close-tab" title="Close file" role="button">×</span>`;
    tab.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      if (target.classList.contains('close-tab')) {
        event.stopPropagation();
        void closeFile(filePath);
        return;
      }
      if (filePath !== activeFile) void activateFile(filePath);
      else editor.focus();
    });
    tabBar.appendChild(tab);
  }
}

function renderTree(nodes: FileNode[], depth = 0): DocumentFragment {
  const fragment = document.createDocumentFragment();
  for (const node of nodes) {
    const item = document.createElement('div');
    item.className = `tree-item${node.isDirectory ? ' directory' : ''}${node.path === activeFile ? ' active' : ''}`;
    const indent = 16 + depth * 14;
    item.style.setProperty('--indent', `${indent}px`);
    item.style.paddingLeft = `${indent}px`;
    item.title = node.path;
    item.innerHTML = `${icon(node.isDirectory ? 'folder' : iconForFile(node.path), 13)}<span class="tree-label">${escapeHtml(node.name)}</span>`;
    if (!node.isDirectory) item.addEventListener('click', () => { void openFile(node.path); });
    item.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      showContextMenu(event.clientX, event.clientY, node);
    });
    fragment.appendChild(item);
    if (node.isDirectory && node.children) fragment.appendChild(renderTree(node.children, depth + 1));
  }
  return fragment;
}

function refreshTree(): void {
  treeContent.replaceChildren();
  if (!project) {
    treeContent.innerHTML = '<p class="tree-empty">Open a project to begin.</p>';
    return;
  }
  const root = document.createElement('div');
  root.className = 'tree-item directory';
  root.style.paddingLeft = '12px';
  root.innerHTML = `${icon('folder-open', 13)}<span class="tree-label">${escapeHtml(fileName(project.path))}</span>`;
  treeContent.append(root, renderTree(project.files));
}

async function openFile(filePath: string): Promise<void> {
  if (!/\.(tex|bib|sty|cls|txt)$/i.test(filePath)) {
    addLog(`Cannot edit ${fileName(filePath)} in the text editor.`, 'warning');
    return;
  }
  if (openFiles.includes(filePath)) {
    await activateFile(filePath);
    return;
  }
  try {
    const content = await window.aktext.readFile(filePath);
    fileContents.set(filePath, content);
  } catch (error) {
    addLog(`Could not open ${fileName(filePath)}: ${messageFor(error)}`, 'error');
    return;
  }

  await saveActiveFile();
  openFiles.push(filePath);
  activeFile = filePath;
  suppressSave = true;
  setEditorContent(fileContents.get(filePath) ?? '');
  suppressSave = false;
  setActivePath(`${fileName(filePath)} — AKTeX`);
  renderTabs();
  refreshTree();
  void refreshOutlineNow();
  editor.focus();
}

async function activateFile(filePath: string): Promise<void> {
  if (filePath === activeFile) return;
  await saveActiveFile();
  let content = fileContents.get(filePath);
  if (content === undefined) {
    try {
      content = await window.aktext.readFile(filePath);
      fileContents.set(filePath, content);
    } catch (error) {
      addLog(`Could not open ${fileName(filePath)}: ${messageFor(error)}`, 'error');
      void closeFile(filePath);
      return;
    }
  }
  activeFile = filePath;
  suppressSave = true;
  setEditorContent(content);
  suppressSave = false;
  setActivePath(`${fileName(filePath)} — AKTeX`);
  renderTabs();
  refreshTree();
  void refreshOutlineNow();
  editor.focus();
}

async function closeFile(filePath: string): Promise<void> {
  const index = openFiles.indexOf(filePath);
  if (index < 0) return;
  if (filePath === activeFile) await saveActiveFile();
  openFiles.splice(index, 1);
  fileContents.delete(filePath);

  if (filePath !== activeFile) {
    renderTabs();
    return;
  }

  const next = openFiles[Math.min(index, openFiles.length - 1)] ?? null;
  activeFile = null;
  if (next) {
    await activateFile(next);
  } else {
    suppressSave = true;
    setEditorContent('% Welcome to AKTeX\n% Open a project folder to start writing.\n');
    suppressSave = false;
    setActivePath('Untitled — AKTeX');
    renderTabs();
    refreshTree();
    void refreshOutlineNow();
    updateSyncButtons();
  }
}

function queueSave(): void {
  if (!activeFile || suppressSave) return;
  fileContents.set(activeFile, getEditorContent());
  if (saveTimer !== null) window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => { void saveActiveFile(); }, 550);
}

async function saveActiveFile(): Promise<void> {
  if (!activeFile || suppressSave) return;
  if (saveTimer !== null) {
    window.clearTimeout(saveTimer);
    saveTimer = null;
  }
  const content = getEditorContent();
  fileContents.set(activeFile, content);
  try {
    await window.aktext.saveFile(activeFile, content);
  } catch (error) {
    addLog(`Could not save ${fileName(activeFile)}: ${messageFor(error)}`, 'error');
  }
}

// ── Outline ──────────────────────────────────────────────────────────────────

function outlineCollapsed(): boolean {
  return document.getElementById('outline-section')?.classList.contains('collapsed') ?? false;
}

function setOutlineCollapsed(collapsed: boolean, persist = true): void {
  const section = document.getElementById('outline-section');
  const splitter = document.getElementById('outline-splitter');
  const button = document.getElementById('btn-outline-collapse');
  if (!section) return;
  section.classList.toggle('collapsed', collapsed);
  splitter?.classList.toggle('hidden', collapsed);
  if (button) {
    button.innerHTML = icon(collapsed ? 'chevron-right' : 'chevron-down', 13);
    button.title = collapsed ? 'Expand outline' : 'Collapse outline';
    button.setAttribute('aria-label', button.title);
    button.setAttribute('aria-expanded', String(!collapsed));
  }
  if (persist) persistOutlineCollapsed(collapsed);
}

async function refreshOutlineNow(): Promise<void> {
  const rootFile = project?.mainFile ?? activeFile;
  if (!rootFile) {
    outlineEntries = [];
    const count = document.getElementById('outline-count');
    if (count) count.textContent = '';
    renderOutline(outlineContent, [], selectOutlineEntry);
    return;
  }
  // Prefer the in-memory buffer for any open (possibly unsaved) file so the
  // outline stays live while editing; fall back to disk for the rest.
  const reader = (filePath: string): Promise<string> => {
    const normalized = filePath.replace(/\\/g, '/').toLowerCase();
    const open = openFiles.find((candidate) => candidate.replace(/\\/g, '/').toLowerCase() === normalized);
    if (open && fileContents.has(open)) return Promise.resolve(fileContents.get(open) ?? '');
    return window.aktext.readFile(filePath);
  };
  try {
    outlineEntries = await buildProjectOutline(rootFile, reader);
  } catch {
    outlineEntries = [];
  }
  const count = document.getElementById('outline-count');
  if (count) count.textContent = outlineEntries.length ? String(outlineEntries.length) : '';
  renderOutline(outlineContent, outlineEntries, selectOutlineEntry);
}

async function selectOutlineEntry(entry: OutlineEntry): Promise<void> {
  if (!entry.file) return;
  await openFile(entry.file);
  revealEditorLine(entry.line);
  editor.focus();
}

function refreshOutlineDebounced(): void {
  if (outlineTimer !== null) window.clearTimeout(outlineTimer);
  outlineTimer = window.setTimeout(() => {
    outlineTimer = null;
    void refreshOutlineNow();
  }, 420);
}

function initOutline(): void {
  const state = restoreCollapsedState();
  setOutlineCollapsed(state.outline, false);
  const collapse = document.getElementById('btn-outline-collapse');
  collapse?.addEventListener('click', () => setOutlineCollapsed(!outlineCollapsed()));
  wireOutlineSelection(outlineContent, (entry) => { void selectOutlineEntry(entry); });
  void refreshOutlineNow();
}

// ── Workspace / project ──────────────────────────────────────────────────────

async function acceptProject(payload: ProjectPayload): Promise<void> {
  project = payload;
  activeFile = null;
  activePdf = null;
  pendingPdfTarget = null;
  openFiles.length = 0;
  fileContents.clear();
  refreshTree();
  addLog(`Opened project: ${payload.path}`);
  if (payload.mainFile) {
    await openFile(payload.mainFile);
  } else {
    suppressSave = true;
    setEditorContent('% Create a main.tex file to begin.\n');
    suppressSave = false;
    setActivePath(`${fileName(payload.path)} — AKTeX`);
    renderTabs();
    void refreshOutlineNow();
  }
  updateSyncButtons();
}

async function openProject(): Promise<void> {
  const payload = await window.aktext.openProject();
  if (payload) await acceptProject(payload);
}

async function importProject(): Promise<void> {
  const payload = await window.aktext.importZip();
  if (payload) {
    await acceptProject(payload);
    addLog('Imported project archive successfully.');
  }
}

async function refreshProject(): Promise<void> {
  const payload = await window.aktext.refreshProject();
  if (payload) {
    project = payload;
    refreshTree();
  }
}

// ── Compile / PDF ────────────────────────────────────────────────────────────

async function compileDocument(): Promise<void> {
  if (!activeFile || !activeFile.toLowerCase().endsWith('.tex')) {
    addLog('Open a .tex document before compiling.', 'error');
    return;
  }
  const target = project?.mainFile ?? activeFile;
  const mainFile = target.toLowerCase().endsWith('.tex') ? target : activeFile;
  await saveActiveFile();
  clearLog();
  openLog();
  setLogTab('output');
  addLog(`Compiling ${fileName(mainFile)}…`);
  required<HTMLButtonElement>('btn-compile').disabled = true;
  required<HTMLButtonElement>('btn-stop').disabled = false;
  window.aktext.compile(mainFile);
}

async function showPdf(pdfPath: string): Promise<void> {
  try {
    activePdf = pdfPath;
    const state = await loadPdf(pdfPath);
    updatePdfInfo(state);
    updateSyncButtons();
  } catch (error) {
    addLog(`Could not load PDF preview: ${messageFor(error)}`, 'error');
  }
}

function updatePdfInfo(state: PdfViewState): void {
  const pageInfo = document.getElementById('pdf-page-info');
  if (pageInfo) pageInfo.textContent = state.pages ? `${state.page} / ${state.pages}` : '';
  const zoom = document.getElementById('zoom-level');
  if (zoom) zoom.textContent = `${Math.round(state.scale * 100)}%`;
  const hint = document.getElementById('pdf-sync-hint');
  if (hint) {
    if (pendingPdfTarget) {
      hint.textContent = 'Position set — click “To code” or double-click';
      hint.classList.add('armed');
    } else {
      hint.textContent = activePdf ? 'Click PDF once, then “To code”' : '';
      hint.classList.remove('armed');
    }
  }
  updateSyncButtons();
}

function updateSyncButtons(): void {
  const codeToPdf = document.getElementById('btn-code-to-pdf') as HTMLButtonElement | null;
  if (codeToPdf) codeToPdf.disabled = !(activeFile && activeFile.toLowerCase().endsWith('.tex') && activePdf);
  const pdfToCode = document.getElementById('btn-pdf-to-code') as HTMLButtonElement | null;
  if (pdfToCode) pdfToCode.disabled = !(pendingPdfTarget && activePdf);
}

// ── SyncTeX ──────────────────────────────────────────────────────────────────

function syncSelectionToPdf(): void {
  if (!activeFile || !activeFile.toLowerCase().endsWith('.tex')) {
    toast('Open a .tex file before syncing to the PDF.', 'error');
    return;
  }
  if (!activePdf) {
    toast('Compile the document first, then sync to the PDF.', 'error');
    return;
  }

  const selection = getEditorSelection();
  let target = selection;
  if (selection.empty) {
    // A bare cursor highlights its whole source line.
    const line = selection.fromLine;
    target = { ...selection, fromCh: 0, toCh: getLineText(line).length };
  }
  pendingSyncText = target.text || getLineText(target.fromLine);
  window.aktext.syncToPdf(activeFile, target.fromLine, target.fromCh, target.toLine, target.toCh);
}

function syncPdfToCode(): void {
  if (!pendingPdfTarget) {
    toast('Click once in the PDF to set the target, then click “To code”.');
    return;
  }
  if (!activePdf) {
    toast('Compile the document first.', 'error');
    return;
  }
  window.aktext.syncToEditor(activePdf, pendingPdfTarget.page, pendingPdfTarget.x, pendingPdfTarget.y);
}

function handlePdfClick(page: number, x: number, y: number): void {
  pendingPdfTarget = { page, x, y };
  showSyncMarker(page, x, y, 0);
  updatePdfInfo(getPdfState());
}

function handlePdfDoubleClick(page: number, x: number, y: number): void {
  pendingPdfTarget = { page, x, y };
  updatePdfInfo(getPdfState());
  syncPdfToCode();
}

// ── Context menu ─────────────────────────────────────────────────────────────

function showContextMenu(x: number, y: number, node: FileNode): void {
  contextFile = node;
  contextMenu.style.left = `${x}px`;
  contextMenu.style.top = `${y}px`;
  contextMenu.style.display = 'block';
}

function hideContextMenu(): void {
  contextMenu.style.display = 'none';
  contextFile = null;
}

async function executeContextAction(action: string): Promise<void> {
  const node = contextFile;
  hideContextMenu();
  if (!node || !project) return;
  if (action === 'new') {
    const file = await window.aktext.createFile(node.isDirectory ? node.path : project.path);
    await refreshProject();
    if (file) await openFile(file);
  }
  if (action === 'rename') {
    const file = await window.aktext.renameFile(node.path);
    if (file) {
      const index = openFiles.indexOf(node.path);
      if (index >= 0) {
        openFiles[index] = file;
        const content = fileContents.get(node.path);
        if (content !== undefined) {
          fileContents.set(file, content);
          fileContents.delete(node.path);
        }
        if (activeFile === node.path) {
          activeFile = file;
          setActivePath(`${fileName(file)} — AKTeX`);
          renderTabs();
          refreshTree();
        }
      } else if (activeFile === node.path) {
        await openFile(file);
      }
    }
    await refreshProject();
  }
  if (action === 'delete' && await window.aktext.deleteFile(node.path)) {
    await closeFile(node.path);
    await refreshProject();
  }
}

async function executeNewFile(directory: string): Promise<void> {
  const file = await window.aktext.createFile(directory);
  await refreshProject();
  if (file) await openFile(file);
}

// ── Tool actions ─────────────────────────────────────────────────────────────

function insertFormula(latex: string): void {
  if (latex.startsWith('\\[') || latex.startsWith('\\begin{')) insertBlockAtCursor(latex);
  else insertTextAtCursor(latex);
  editor.focus();
}

function hasGraphicx(): boolean {
  return /\\usepackage(?:\[[^\]]*\])?\{[^}]*graphicx[^}]*\}/.test(getEditorContent());
}

function openInsertImage(): void {
  openImageInserter({
    projectPath: project?.path ?? null,
    hasGraphicx,
    onInsert: (latex) => {
      insertBlockAtCursor(latex);
      editor.focus();
    },
  });
}

// ── UI wiring ────────────────────────────────────────────────────────────────

function wireUi(): void {
  required<HTMLButtonElement>('btn-open-project').addEventListener('click', () => { void openProject(); });
  required<HTMLButtonElement>('btn-import-zip').addEventListener('click', () => { void importProject(); });
  required<HTMLButtonElement>('btn-export-zip').addEventListener('click', () => {
    void window.aktext.exportZip().then((exported) => {
      if (exported) addLog('Project exported as a ZIP archive.', 'info');
    });
  });
  required<HTMLButtonElement>('btn-save').addEventListener('click', () => { void saveActiveFile(); });
  required<HTMLButtonElement>('btn-compile').addEventListener('click', () => { void compileDocument(); });
  required<HTMLButtonElement>('btn-stop').addEventListener('click', () => window.aktext.stopCompile());
  required<HTMLButtonElement>('btn-new').addEventListener('click', () => {
    if (project) void executeNewFile(project.path);
    else void openProject();
  });
  required<HTMLButtonElement>('btn-tree-new').addEventListener('click', () => {
    if (project) void executeNewFile(project.path);
  });
  required<HTMLButtonElement>('btn-find').addEventListener('click', () => openFind());
  required<HTMLButtonElement>('btn-compiler-help').addEventListener('click', () => window.aktext.openCompilerHelp());

  required<HTMLButtonElement>('btn-zoom-out').addEventListener('click', () => updatePdfInfo(zoomOut()));
  required<HTMLButtonElement>('btn-zoom-in').addEventListener('click', () => updatePdfInfo(zoomIn()));
  required<HTMLElement>('zoom-level').addEventListener('click', () => updatePdfInfo(resetZoom()));
  required<HTMLButtonElement>('btn-fit-width').addEventListener('click', () => updatePdfInfo(fitWidth()));
  required<HTMLButtonElement>('btn-fit-page').addEventListener('click', () => updatePdfInfo(fitPage()));

  required<HTMLButtonElement>('btn-code-to-pdf').addEventListener('click', syncSelectionToPdf);
  required<HTMLButtonElement>('btn-pdf-to-code').addEventListener('click', syncPdfToCode);

  required<HTMLButtonElement>('btn-editor-undo').addEventListener('click', () => { undo(); editor.focus(); });
  required<HTMLButtonElement>('btn-editor-redo').addEventListener('click', () => { redo(); editor.focus(); });
  required<HTMLButtonElement>('btn-formula-editor').addEventListener('click', () => {
    openFormulaEditor({ onInsert: insertFormula });
  });
  required<HTMLButtonElement>('btn-formula-viewer').addEventListener('click', (event) => {
    const selection = getEditorSelection();
    const text = selection.empty ? getLineText(getCursorLine()) : selection.text;
    openFormulaViewer(text, event.currentTarget as HTMLElement);
  });
  required<HTMLButtonElement>('btn-image').addEventListener('click', openInsertImage);

  document.querySelector('.traffic.close')?.addEventListener('click', () => window.aktext.closeWindow());
  document.querySelector('.traffic.min')?.addEventListener('click', () => window.aktext.minimizeWindow());
  document.querySelector('.traffic.max')?.addEventListener('click', () => window.aktext.maximizeWindow());

  contextMenu.addEventListener('click', (event) => {
    const target = event.target;
    if (target instanceof HTMLButtonElement) void executeContextAction(target.dataset.action ?? '');
  });

  document.addEventListener('click', hideContextMenu);
  document.addEventListener('keydown', (event) => {
    if (event.ctrlKey && event.key === 'Enter') { event.preventDefault(); void compileDocument(); }
    if (event.ctrlKey && event.key.toLowerCase() === 's') { event.preventDefault(); void saveActiveFile(); }
    if (event.ctrlKey && event.key.toLowerCase() === 'f') { event.preventDefault(); openFind(); }
    if (event.ctrlKey && (event.key === '=' || event.key === '+')) { event.preventDefault(); updatePdfInfo(zoomIn()); }
    if (event.ctrlKey && event.key === '-') { event.preventDefault(); updatePdfInfo(zoomOut()); }
    if (event.ctrlKey && event.key === '0') { event.preventDefault(); updatePdfInfo(resetZoom()); }
    if (event.ctrlKey && event.altKey && event.key.toLowerCase() === 'j') { event.preventDefault(); syncSelectionToPdf(); }
    if (event.ctrlKey && event.altKey && event.key.toLowerCase() === 'k') { event.preventDefault(); syncPdfToCode(); }
    if (event.key === 'Escape') hideContextMenu();
  });
}

// ── Initialisation ───────────────────────────────────────────────────────────

async function initialise(): Promise<void> {
  installIconSprite();
  initSplash();
  initLayout();
  initLogPanel();

  editor = initEditor(
    editorElement,
    '% Welcome to AKTeX\n% Open a project folder to start writing.\n',
    {
      onChange: () => {
        queueSave();
        refreshOutlineDebounced();
      },
      onSelectionChange: () => updateSyncButtons(),
    },
  );

  // Hover-to-preview inline math in the editor.
  let hoverTimer: number | null = null;
  let hoverLine: number | null = null;
  editorElement.addEventListener('mousemove', (event) => {
    if (hoverTimer !== null) window.clearTimeout(hoverTimer);
    hoverTimer = window.setTimeout(() => {
      const lineNumber = getLineAtCoords(event.clientX, event.clientY);
      if (lineNumber === null) {
        hideFormulaHover();
        hoverLine = null;
        return;
      }
      if (lineNumber === hoverLine) return;
      hoverLine = lineNumber;
      const formula = extractFormula(getLineText(lineNumber));
      if (formula) showFormulaHover(formula.latex, formula.display, event.clientX, event.clientY);
      else hideFormulaHover();
    }, 280);
  });
  editorElement.addEventListener('mouseleave', () => {
    if (hoverTimer !== null) window.clearTimeout(hoverTimer);
    hoverTimer = null;
    hoverLine = null;
    hideFormulaHover();
  });
  editorElement.addEventListener('wheel', hideFormulaHover, { passive: true });

  initOutline();
  wireUi();

  setPageChangeHandler((page, pages) => updatePdfInfo({ page, pages, scale: getPdfState().scale }));
  setZoomChangeHandler((state) => updatePdfInfo(state));
  setSyncTexHandlers({
    onClick: handlePdfClick,
    onDoubleClick: handlePdfDoubleClick,
  });

  window.aktext.onCompileLog(addLog);
  window.aktext.onCompileDone((pdfPath, success) => {
    required<HTMLButtonElement>('btn-compile').disabled = false;
    required<HTMLButtonElement>('btn-stop').disabled = true;
    if (success && pdfPath) {
      addLog(`✓ Compilation successful — Output: ${fileName(pdfPath)}`, 'info');
      void showPdf(pdfPath);
    } else {
      addLog('✗ Compilation failed. See errors above.', 'error');
      openLog();
      setLogTab('problems');
    }
  });

  const setCompilerStatus = (available: boolean, label: string): void => {
    required<HTMLElement>('compiler-label').textContent = label;
    required<HTMLElement>('status-dot').className = `status-dot ${available ? 'ready' : 'error'}`;
  };
  window.aktext.onCompilerStatus(setCompilerStatus);
  void window.aktext.getCompilerStatus().then((status) => setCompilerStatus(status.available, status.label));

  window.aktext.onSyncToEditor((file, line) => {
    const norm = (value: string | null): string => (value ?? '').replace(/\\/g, '/').toLowerCase();
    pendingPdfTarget = null;
    clearSyncMarker();
    if (norm(file) === norm(activeFile)) {
      revealEditorLine(line);
      editor.focus();
    } else {
      void openFile(file).then(() => {
        revealEditorLine(line);
        editor.focus();
      });
    }
    updatePdfInfo(getPdfState());
  });

  window.aktext.onSyncTexFailed((message) => toast(message, 'error'));

  window.aktext.onPdfPosition((position: PdfSyncPosition) => {
    const sourceText = pendingSyncText ?? undefined;
    pendingSyncText = null;
    void scrollToPosition(position.page, position.x, position.y, position.boxes, sourceText)
      .then(() => updatePdfInfo(getPdfState()));
  });

  renderTabs();
  updateSyncButtons();

  try {
    const initial = await window.aktext.getInitialProject();
    if (initial) await acceptProject(initial);
  } catch (error) {
    addLog(`Could not open the startup project: ${messageFor(error)}`, 'error');
  }
}

void initialise();
