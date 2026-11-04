// AKTeX — resizable pane layout.
//
// Sizes are stored as CSS variables and persisted in localStorage. The
// splitters support mouse/pen, touch and arrow-key resizing.

type Axis = 'x' | 'y';

interface SplitterOptions {
  element: HTMLElement;
  axis: Axis;
  get: () => number;
  set: (value: number) => void;
  min: number;
  max: () => number;
  /** True when dragging towards the negative direction grows the pane. */
  invert?: boolean;
  onEnd?: () => void;
  reset: () => void;
}

function installSplitter(options: SplitterOptions): void {
  const { element, axis, get, set, min, max, invert = false, onEnd, reset } = options;
  let dragging = false;
  let startPosition = 0;
  let startValue = 0;

  const positionOf = (event: PointerEvent): number => (axis === 'x' ? event.clientX : event.clientY);
  const clamp = (value: number): number => Math.max(min, Math.min(max(), value));

  element.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    dragging = true;
    startPosition = positionOf(event);
    startValue = get();
    element.classList.add('dragging');
    element.setPointerCapture(event.pointerId);
    document.body.style.cursor = axis === 'x' ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';
  });

  element.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    const delta = positionOf(event) - startPosition;
    const next = startValue + (invert ? -delta : delta);
    set(clamp(next));
  });

  const finish = (event: PointerEvent): void => {
    if (!dragging) return;
    dragging = false;
    element.classList.remove('dragging');
    try { element.releasePointerCapture(event.pointerId); } catch { /* already released */ }
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    onEnd?.();
  };

  element.addEventListener('pointerup', finish);
  element.addEventListener('pointercancel', finish);

  element.addEventListener('dblclick', () => {
    reset();
    onEnd?.();
  });

  element.addEventListener('keydown', (event) => {
    const step = event.shiftKey ? 32 : 10;
    let delta = 0;
    if (axis === 'x' && event.key === 'ArrowLeft') delta = -step;
    if (axis === 'x' && event.key === 'ArrowRight') delta = step;
    if (axis === 'y' && event.key === 'ArrowUp') delta = -step;
    if (axis === 'y' && event.key === 'ArrowDown') delta = step;
    if (delta === 0) return;
    event.preventDefault();
    set(clamp(get() + delta));
    onEnd?.();
  });
}

const STORAGE_KEYS = {
  sidebar: 'aktex.layout.sidebar',
  pdf: 'aktex.layout.pdf',
  log: 'aktex.layout.log',
  project: 'aktex.layout.project',
  logCollapsed: 'aktex.layout.logCollapsed',
  outlineCollapsed: 'aktex.layout.outlineCollapsed',
} as const;

function readNumber(key: string, fallback: number): number {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const value = Number(raw);
    return Number.isFinite(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

function saveNumber(key: string, value: number): void {
  try { localStorage.setItem(key, String(Math.round(value))); } catch { /* storage disabled */ }
}

function cssVar(name: string, value: number): void {
  document.documentElement.style.setProperty(name, `${Math.round(value)}px`);
}

export function initLayout(): void {
  const sidebar = document.getElementById('filetree');
  const pdfPane = document.getElementById('pdf-pane');
  const logPanel = document.getElementById('log-panel');
  const projectSection = document.getElementById('project-section');
  const workspace = document.getElementById('workspace');

  if (!sidebar || !pdfPane || !logPanel || !projectSection || !workspace) return;

  const sidebarMin = 170;
  const sidebarMax = (): number => Math.max(sidebarMin, Math.min(480, workspace.clientWidth - 360));
  let sidebarWidth = readNumber(STORAGE_KEYS.sidebar, 224);
  sidebarWidth = Math.max(sidebarMin, Math.min(sidebarMax(), sidebarWidth));

  const pdfMin = 280;
  const pdfMax = (): number => Math.max(pdfMin, workspace.clientWidth - sidebarWidth - 300);
  let pdfWidth = readNumber(STORAGE_KEYS.pdf, 620);
  pdfWidth = Math.max(pdfMin, Math.min(pdfMax(), pdfWidth));

  const logMin = 80;
  const logMax = (): number => Math.max(logMin, window.innerHeight - 260);
  let logHeight = readNumber(STORAGE_KEYS.log, 148);
  logHeight = Math.max(logMin, Math.min(logMax(), logHeight));

  const projectMin = 90;
  const projectMax = (): number => Math.max(projectMin, sidebar.clientHeight - 110);
  let projectHeight = readNumber(STORAGE_KEYS.project, 320);
  projectHeight = Math.max(projectMin, Math.min(projectMax(), projectHeight));

  const applySidebar = (): void => {
    sidebarWidth = Math.max(sidebarMin, Math.min(sidebarMax(), sidebarWidth));
    cssVar('--sidebar-width', sidebarWidth);
    if (pdfWidth > pdfMax()) {
      pdfWidth = pdfMax();
      cssVar('--pdf-width', pdfWidth);
    }
  };
  const applyPdf = (): void => {
    pdfWidth = Math.max(pdfMin, Math.min(pdfMax(), pdfWidth));
    cssVar('--pdf-width', pdfWidth);
  };
  const applyLog = (): void => {
    logHeight = Math.max(logMin, Math.min(logMax(), logHeight));
    cssVar('--log-height', logHeight);
  };
  const applyProject = (): void => {
    projectHeight = Math.max(projectMin, Math.min(projectMax(), projectHeight));
    cssVar('--project-height', projectHeight);
  };

  applySidebar();
  applyPdf();
  applyLog();
  applyProject();

  const sidebarSplitter = document.getElementById('sidebar-splitter');
  if (sidebarSplitter) {
    installSplitter({
      element: sidebarSplitter,
      axis: 'x',
      get: () => sidebarWidth,
      set: (value) => { sidebarWidth = value; applySidebar(); },
      min: sidebarMin,
      max: sidebarMax,
      onEnd: () => saveNumber(STORAGE_KEYS.sidebar, sidebarWidth),
      reset: () => { sidebarWidth = 224; applySidebar(); saveNumber(STORAGE_KEYS.sidebar, sidebarWidth); },
    });
  }

  const pdfSplitter = document.getElementById('editor-pdf-splitter');
  if (pdfSplitter) {
    installSplitter({
      element: pdfSplitter,
      axis: 'x',
      get: () => pdfWidth,
      set: (value) => { pdfWidth = value; applyPdf(); },
      min: pdfMin,
      // Dragging the splitter to the left makes the PDF pane wider.
      invert: true,
      max: () => pdfMax(),
      onEnd: () => saveNumber(STORAGE_KEYS.pdf, pdfWidth),
      reset: () => { pdfWidth = Math.min(620, pdfMax()); applyPdf(); saveNumber(STORAGE_KEYS.pdf, pdfWidth); },
    });
  }

  const logSplitter = document.getElementById('log-splitter');
  if (logSplitter) {
    installSplitter({
      element: logSplitter,
      axis: 'y',
      get: () => logHeight,
      set: (value) => { logHeight = value; applyLog(); },
      min: logMin,
      max: logMax,
      invert: true,
      onEnd: () => saveNumber(STORAGE_KEYS.log, logHeight),
      reset: () => { logHeight = 148; applyLog(); saveNumber(STORAGE_KEYS.log, logHeight); },
    });
  }

  const projectSplitter = document.getElementById('outline-splitter');
  if (projectSplitter) {
    installSplitter({
      element: projectSplitter,
      axis: 'y',
      get: () => projectHeight,
      set: (value) => { projectHeight = value; applyProject(); },
      min: projectMin,
      max: projectMax,
      onEnd: () => saveNumber(STORAGE_KEYS.project, projectHeight),
      reset: () => { projectHeight = 320; applyProject(); saveNumber(STORAGE_KEYS.project, projectHeight); },
    });
  }

  window.addEventListener('resize', () => {
    applySidebar();
    applyPdf();
    applyLog();
    applyProject();
  });
}

export function restoreCollapsedState(): { log: boolean; outline: boolean } {
  try {
    return {
      log: localStorage.getItem(STORAGE_KEYS.logCollapsed) === '1',
      outline: localStorage.getItem(STORAGE_KEYS.outlineCollapsed) === '1',
    };
  } catch {
    return { log: false, outline: false };
  }
}

export function persistLogCollapsed(value: boolean): void {
  try { localStorage.setItem(STORAGE_KEYS.logCollapsed, value ? '1' : '0'); } catch { /* storage disabled */ }
}

export function persistOutlineCollapsed(value: boolean): void {
  try { localStorage.setItem(STORAGE_KEYS.outlineCollapsed, value ? '1' : '0'); } catch { /* storage disabled */ }
}
