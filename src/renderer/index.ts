// AKTeX — renderer orchestration. Electron is deliberately accessed only through preload.
import { EditorView } from '@codemirror/view';
import { getCursorLine, getEditorContent, initEditor, scrollEditorToLine, setEditorContent, triggerFind } from './editor/editor';
import { changeScale, getPdfState, loadPdf, scrollToPosition, setSyncTexClickHandler } from './pdf/viewer';

type LogType = 'info' | 'error' | 'warning';
interface FileNode { name: string; path: string; isDirectory: boolean; children?: FileNode[]; }
interface ProjectPayload { path: string; files: FileNode[]; mainFile: string | null; }
interface AKTeXApi {
  compile(mainFile: string): void;
  stopCompile(): void;
  onCompileLog(callback: (line: string, type: LogType) => void): void;
  onCompileDone(callback: (pdfPath: string | null, success: boolean) => void): void;
  onCompilerStatus(callback: (available: boolean, label: string) => void): void;
  getCompilerStatus(): Promise<{ available: boolean; label: string }>;
  syncToPdf(file: string, line: number): void;
  syncToEditor(pdfPath: string, page: number, x: number, y: number): void;
  onSyncToEditor(callback: (file: string, line: number) => void): void;
  onPdfPosition(callback: (page: number, x: number, y: number) => void): void;
  openProject(): Promise<ProjectPayload | null>; refreshProject(): Promise<ProjectPayload | null>;
  openFile(filePath: string): Promise<string>;
  readFile(filePath: string): Promise<string>;
  readBinaryFile(filePath: string): Promise<Uint8Array>;
  saveFile(filePath: string, content: string): Promise<void>;
  createFile(directory: string): Promise<string | null>; renameFile(filePath: string): Promise<string | null>; deleteFile(filePath: string): Promise<boolean>;
  exportZip(): Promise<boolean>; importZip(): Promise<ProjectPayload | null>; openCompilerHelp(): void;
  closeWindow(): void; minimizeWindow(): void; maximizeWindow(): void;
}
declare global { interface Window { aktext: AKTeXApi; } }

const editorElement = required<HTMLElement>('editor');
const treeContent = required<HTMLElement>('tree-content');
const logScroll = required<HTMLElement>('log-scroll');
const contextMenu = required<HTMLElement>('context-menu');
let editor: EditorView;
let project: ProjectPayload | null = null;
let activeFile: string | null = null;
let activePdf: string | null = null;
let suppressSave = false;
let saveTimer: number | null = null;
let cursorTimer: number | null = null;
let errors = 0;
let contextFile: FileNode | null = null;

function required<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`AKTeX could not find #${id}.`);
  return element as T;
}

function fileName(filePath: string): string { return filePath.split(/[\\/]/).pop() ?? filePath; }
function timestamp(): string { return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }

function addLog(line: string, type: LogType = 'info'): void {
  if (type === 'error') errors += 1;
  const row = document.createElement('div'); row.className = 'log-line';
  const time = document.createElement('time'); time.className = 'timestamp'; time.textContent = timestamp();
  const message = document.createElement('span'); message.className = `log-${type}`; message.textContent = line;
  row.dataset.type = type; row.append(time, message); logScroll.appendChild(row); logScroll.scrollTop = logScroll.scrollHeight;
  required<HTMLElement>('problem-count').textContent = errors ? `(${errors})` : '';
}

function clearLog(): void { logScroll.replaceChildren(); errors = 0; required<HTMLElement>('problem-count').textContent = ''; }

function renderTabs(): void {
  const tabBar = required<HTMLElement>('tab-bar'); tabBar.replaceChildren();
  const tab = document.createElement('button'); tab.className = 'tab active'; tab.type = 'button';
  tab.innerHTML = `<span>◇</span><span>${activeFile ? escapeHtml(fileName(activeFile)) : 'Welcome'}</span>${activeFile ? '<span class="close-tab" title="Close file">×</span>' : ''}`;
  tab.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target.classList.contains('close-tab')) {
      e.stopPropagation();
      void saveActiveFile().then(() => {
        activeFile = null;
        suppressSave = true;
        setEditorContent('% Welcome to AKTeX\n% Open a project folder to start writing.\n');
        suppressSave = false;
        document.title = 'AKTeX';
        required<HTMLElement>('active-path').textContent = 'AKTeX';
        renderTabs();
        refreshTree();
      });
      return;
    }
    editor.focus();
  });
  tabBar.appendChild(tab);
}

function escapeHtml(value: string): string { const node = document.createElement('span'); node.textContent = value; return node.innerHTML; }

function renderTree(nodes: FileNode[], depth = 0): DocumentFragment {
  const fragment = document.createDocumentFragment();
  for (const node of nodes) {
    const item = document.createElement('div');
    item.className = `tree-item${node.isDirectory ? ' directory' : ''}${node.path === activeFile ? ' active' : ''}`;
    item.style.setProperty('--indent', `${16 + depth * 14}px`); item.style.paddingLeft = `${16 + depth * 14}px`;
    const icon = document.createElement('span'); icon.className = 'tree-icon'; icon.textContent = node.isDirectory ? '▾' : node.name.endsWith('.tex') ? '◇' : node.name.endsWith('.bib') ? '▤' : '·';
    const label = document.createElement('span'); label.textContent = node.name; item.append(icon, label);
    if (!node.isDirectory) item.addEventListener('click', () => { void openFile(node.path); });
    item.addEventListener('contextmenu', (event) => { event.preventDefault(); showContextMenu(event.clientX, event.clientY, node); });
    fragment.appendChild(item);
    if (node.isDirectory && node.children) fragment.appendChild(renderTree(node.children, depth + 1));
  }
  return fragment;
}

function refreshTree(): void {
  treeContent.replaceChildren();
  if (!project) { treeContent.innerHTML = '<p class="tree-empty">Open a project to begin.</p>'; return; }
  const root = document.createElement('div'); root.className = 'tree-item directory'; root.style.paddingLeft = '12px'; root.innerHTML = '<span class="tree-icon">▾</span>';
  const label = document.createElement('span'); label.textContent = fileName(project.path); root.appendChild(label); treeContent.append(root, renderTree(project.files));
}

async function openFile(filePath: string): Promise<void> {
  if (!/\.(tex|bib|sty|cls|txt)$/i.test(filePath)) { addLog(`Cannot edit ${fileName(filePath)} in the text editor.`, 'warning'); return; }
  try {
    await saveActiveFile();
    const content = await window.aktext.readFile(filePath);
    activeFile = filePath; suppressSave = true; setEditorContent(content); suppressSave = false;
    document.title = `${fileName(filePath)} — AKTeX`; required<HTMLElement>('active-path').textContent = `${fileName(filePath)} — AKTeX`;
    renderTabs(); refreshTree(); editor.focus();
  } catch (error) { addLog(`Could not open ${fileName(filePath)}: ${messageFor(error)}`, 'error'); }
}

function queueSave(): void {
  if (!activeFile || suppressSave) return;
  if (saveTimer !== null) window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => { void saveActiveFile(); }, 550);
}

async function saveActiveFile(): Promise<void> {
  if (!activeFile || suppressSave) return;
  if (saveTimer !== null) { window.clearTimeout(saveTimer); saveTimer = null; }
  try { await window.aktext.saveFile(activeFile, getEditorContent()); } catch (error) { addLog(`Could not save ${fileName(activeFile)}: ${messageFor(error)}`, 'error'); }
}

async function acceptProject(payload: ProjectPayload): Promise<void> {
  project = payload; activeFile = null; activePdf = null; refreshTree();
  addLog(`Opened project: ${payload.path}`);
  if (payload.mainFile) await openFile(payload.mainFile); else { suppressSave = true; setEditorContent('% Create a main.tex file to begin.\n'); suppressSave = false; renderTabs(); }
}

async function openProject(): Promise<void> { const payload = await window.aktext.openProject(); if (payload) await acceptProject(payload); }
async function importProject(): Promise<void> { const payload = await window.aktext.importZip(); if (payload) { await acceptProject(payload); addLog('Imported project archive successfully.'); } }
async function refreshProject(): Promise<void> { const payload = await window.aktext.refreshProject(); if (payload) { project = payload; refreshTree(); } }

async function compileDocument(): Promise<void> {
  if (!activeFile || !activeFile.toLowerCase().endsWith('.tex')) { addLog('Open a .tex document before compiling.', 'error'); return; }
  const mainFile = project?.mainFile ?? activeFile;
  await saveActiveFile(); clearLog(); addLog(`Compiling ${fileName(mainFile)}…`); required<HTMLButtonElement>('btn-compile').disabled = true; required<HTMLButtonElement>('btn-stop').disabled = false;
  window.aktext.compile(mainFile);
}

async function showPdf(pdfPath: string): Promise<void> {
  try {
    activePdf = pdfPath;
    const state = await loadPdf(pdfPath);
    updatePdfInfo(state);
  } catch (error) { addLog(`Could not load PDF preview: ${messageFor(error)}`, 'error'); }
}

function updatePdfInfo(state: { page: number; pages: number; scale: number }): void {
  required<HTMLElement>('pdf-page-info').textContent = state.pages ? `${state.pages} pages` : '';
  required<HTMLElement>('zoom-level').textContent = `${Math.round(state.scale * 100)}%`;
}

function messageFor(error: unknown): string { return error instanceof Error ? error.message : String(error); }

function showContextMenu(x: number, y: number, node: FileNode): void { contextFile = node; contextMenu.style.left = `${x}px`; contextMenu.style.top = `${y}px`; contextMenu.style.display = 'block'; }
function hideContextMenu(): void { contextMenu.style.display = 'none'; contextFile = null; }

async function executeContextAction(action: string): Promise<void> {
  const node = contextFile; hideContextMenu(); if (!node || !project) return;
  if (action === 'new') { const file = await window.aktext.createFile(node.isDirectory ? node.path : project.path); await refreshProject(); if (file) await openFile(file); }
  if (action === 'rename') { const file = await window.aktext.renameFile(node.path); await refreshProject(); if (file && node.path === activeFile) await openFile(file); }
  if (action === 'delete' && await window.aktext.deleteFile(node.path)) { if (node.path === activeFile) { activeFile = null; suppressSave = true; setEditorContent(''); suppressSave = false; renderTabs(); } await refreshProject(); }
}

function wireUi(): void {
  required<HTMLButtonElement>('btn-open-project').addEventListener('click', () => { void openProject(); });
  required<HTMLButtonElement>('btn-import-zip').addEventListener('click', () => { void importProject(); });
  required<HTMLButtonElement>('btn-export-zip').addEventListener('click', () => { void window.aktext.exportZip().then((exported) => { if (exported) addLog('Project exported as a ZIP archive.', 'info'); }); });
  required<HTMLButtonElement>('btn-save').addEventListener('click', () => { void saveActiveFile(); });
  required<HTMLButtonElement>('btn-compile').addEventListener('click', () => { void compileDocument(); });
  required<HTMLButtonElement>('btn-stop').addEventListener('click', () => window.aktext.stopCompile());
  required<HTMLButtonElement>('btn-new').addEventListener('click', () => { if (project) void executeNewFile(project.path); else void openProject(); });
  required<HTMLButtonElement>('btn-tree-new').addEventListener('click', () => { if (project) void executeNewFile(project.path); });
  required<HTMLButtonElement>('btn-find').addEventListener('click', () => triggerFind());
  required<HTMLButtonElement>('btn-compiler-help').addEventListener('click', () => window.aktext.openCompilerHelp());
  required<HTMLButtonElement>('btn-zoom-out').addEventListener('click', () => { void changeScale(-.1).then(updatePdfInfo); });
  required<HTMLButtonElement>('btn-zoom-in').addEventListener('click', () => { void changeScale(.1).then(updatePdfInfo); });
  document.querySelector('.traffic.close')?.addEventListener('click', () => window.aktext.closeWindow());
  document.querySelector('.traffic.min')?.addEventListener('click', () => window.aktext.minimizeWindow());
  document.querySelector('.traffic.max')?.addEventListener('click', () => window.aktext.maximizeWindow());
  contextMenu.addEventListener('click', (event) => { const target = event.target; if (target instanceof HTMLButtonElement) void executeContextAction(target.dataset.action ?? ''); });
  document.querySelectorAll<HTMLButtonElement>('.log-tab').forEach((tab) => tab.addEventListener('click', () => {
    document.querySelectorAll<HTMLButtonElement>('.log-tab').forEach((other) => other.classList.toggle('active', other === tab));
    const problemsOnly = tab.dataset.log === 'problems';
    logScroll.querySelectorAll<HTMLElement>('.log-line').forEach((line) => { line.hidden = problemsOnly && line.dataset.type === 'info'; });
  }));
  document.addEventListener('click', hideContextMenu);
  document.addEventListener('keydown', (event) => {
    if (event.ctrlKey && event.key === 'Enter') { event.preventDefault(); void compileDocument(); }
    if (event.ctrlKey && event.key.toLowerCase() === 's') { event.preventDefault(); void saveActiveFile(); }
    if (event.ctrlKey && event.key.toLowerCase() === 'f') { event.preventDefault(); triggerFind(); }
    if (event.key === 'Escape') hideContextMenu();
  });
}

async function executeNewFile(directory: string): Promise<void> { const file = await window.aktext.createFile(directory); await refreshProject(); if (file) await openFile(file); }

function initialise(): void {
  editor = initEditor(editorElement, '% Welcome to AKTeX\n% Open a project folder to start writing.\n', queueSave, (line) => {
    if (!activeFile) return;
    if (cursorTimer !== null) window.clearTimeout(cursorTimer);
    cursorTimer = window.setTimeout(() => window.aktext.syncToPdf(activeFile as string, line), 350);
  });
  renderTabs(); wireUi();

  // SyncTeX: PDF click → editor (uses new API, no canvas arg needed)
  setSyncTexClickHandler((page, x, y) => { if (activePdf) window.aktext.syncToEditor(activePdf, page, x, y); });

  window.aktext.onCompileLog(addLog);
  window.aktext.onCompileDone((pdfPath, success) => {
    required<HTMLButtonElement>('btn-compile').disabled = false;
    required<HTMLButtonElement>('btn-stop').disabled = true;
    if (success && pdfPath) { addLog(`✓ Compilation successful — Output: ${fileName(pdfPath)}`, 'info'); void showPdf(pdfPath); }
    else addLog('✗ Compilation failed. See errors above.', 'error');
  });
  const setCompilerStatus = (available: boolean, label: string): void => { required<HTMLElement>('compiler-label').textContent = label; required<HTMLElement>('status-dot').className = `status-dot ${available ? 'ready' : 'error'}`; };
  window.aktext.onCompilerStatus(setCompilerStatus);
  void window.aktext.getCompilerStatus().then((status) => setCompilerStatus(status.available, status.label));
  window.aktext.onSyncToEditor((file, line) => {
    const norm = (p: string | null): string => (p ?? '').replace(/\\/g, '/').toLowerCase();
    if (norm(file) === norm(activeFile)) { scrollEditorToLine(line); }
    else { void openFile(file).then(() => scrollEditorToLine(line)); }
  });
  window.aktext.onPdfPosition((page, x, y) => { void scrollToPosition(page, x, y).then(() => updatePdfInfo(getPdfState())); });
}

initialise();