// AKTeX — PDF.js continuous scroll viewer (Overleaf-style).
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('./pdf.worker.min.mjs', window.location.href).toString();

let currentDocument: pdfjsLib.PDFDocumentProxy | null = null;
let currentScale = 1.25;
let renderVersion = 0; // cancel stale renders on reload

export interface PdfViewState { page: number; pages: number; scale: number; }

// ── helpers ──────────────────────────────────────────────────────────────────

function getContainer(): HTMLElement | null {
  return document.getElementById('pdf-scroll');
}

function clearContainer(): void {
  const container = getContainer();
  if (!container) return;
  // Remove all canvas wrappers, keep the pdf-empty placeholder
  container.querySelectorAll('.pdf-page-wrapper').forEach(el => el.remove());
}

async function renderAllPages(version: number): Promise<void> {
  if (!currentDocument) return;
  const container = getContainer();
  if (!container) return;

  const numPages = currentDocument.numPages;

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    // Abort if a newer render was triggered (e.g. user recompiled)
    if (version !== renderVersion) return;

    const page = await currentDocument.getPage(pageNum);
    const viewport = page.getViewport({ scale: currentScale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    canvas.className = 'pdf-page-canvas';
    canvas.dataset.page = String(pageNum);

    const wrapper = document.createElement('div');
    wrapper.className = 'pdf-page-wrapper';
    wrapper.appendChild(canvas);
    container.appendChild(wrapper);

    const context = canvas.getContext('2d');
    if (!context) continue;

    await page.render({ canvasContext: context, viewport }).promise;
  }
}

// ── public API ────────────────────────────────────────────────────────────────

export async function loadPdf(pdfPath: string): Promise<PdfViewState> {
  const data = await window.aktext.readBinaryFile(pdfPath);
  const loadingTask = pdfjsLib.getDocument({ data });
  currentDocument = await loadingTask.promise;

  renderVersion += 1;
  const version = renderVersion;

  clearContainer();

  // Hide empty placeholder, show scroll area
  const empty = getContainer()?.querySelector('.pdf-empty') as HTMLElement | null;
  if (empty) empty.style.display = 'none';

  await renderAllPages(version);

  // Attach SyncTeX click handlers to all canvases
  getContainer()?.querySelectorAll<HTMLCanvasElement>('canvas[data-page]').forEach(canvas => {
    canvas.addEventListener('click', handleCanvasClick);
  });

  return getPdfState();
}

export function getPdfState(): PdfViewState {
  return { page: 1, pages: currentDocument?.numPages ?? 0, scale: currentScale };
}

export async function changeScale(delta: number): Promise<PdfViewState> {
  currentScale = Math.max(0.5, Math.min(3.0, currentScale + delta));
  if (!currentDocument) return getPdfState();

  renderVersion += 1;
  const version = renderVersion;
  clearContainer();
  await renderAllPages(version);

  return getPdfState();
}

export async function scrollToPage(pageNumber: number): Promise<void> {
  const container = getContainer();
  if (!container) return;
  const canvas = container.querySelector<HTMLCanvasElement>(`canvas[data-page="${pageNumber}"]`);
  if (canvas) {
    canvas.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

export async function scrollToPosition(page: number, _x: number, y: number): Promise<void> {
  const container = getContainer();
  if (!container) return;
  const canvas = container.querySelector<HTMLCanvasElement>(`canvas[data-page="${page}"]`);
  if (!canvas) return;
  const wrapper = canvas.parentElement;
  if (!wrapper) return;

  const wrapperTop = wrapper.offsetTop;
  container.scrollTo({
    top: Math.max(0, wrapperTop + y * currentScale - container.clientHeight / 3),
    behavior: 'smooth',
  });
}

// ── SyncTeX click (PDF → Editor) ─────────────────────────────────────────────

let _onSyncClick: ((page: number, x: number, y: number) => void) | null = null;

export function setSyncTexClickHandler(handler: (page: number, x: number, y: number) => void): void {
  _onSyncClick = handler;
}

function handleCanvasClick(event: MouseEvent): void {
  if (!_onSyncClick) return;
  const canvas = event.currentTarget as HTMLCanvasElement;
  const page = Number(canvas.dataset.page);
  const rect = canvas.getBoundingClientRect();
  const x = (event.clientX - rect.left) / currentScale;
  const y = (event.clientY - rect.top) / currentScale;
  _onSyncClick(page, x, y);
}