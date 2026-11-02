// AKTeX — PDF.js continuous scroll viewer (Overleaf-style).
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('./pdf.worker.min.mjs', window.location.href).toString();

let currentDocument: pdfjsLib.PDFDocumentProxy | null = null;
let currentScale = 1.25;
let currentPage = 1;
let renderVersion = 0; // cancel stale renders on reload

export interface PdfViewState { page: number; pages: number; scale: number; }

// ── helpers ──────────────────────────────────────────────────────────────────

function getContainer(): HTMLElement | null {
  return document.getElementById('pdf-scroll');
}

function clearContainer(): void {
  const container = getContainer();
  if (!container) return;
  container.querySelectorAll('.pdf-page-wrapper').forEach(el => el.remove());
}

async function renderAllPages(version: number): Promise<void> {
  if (!currentDocument) return;
  const container = getContainer();
  if (!container) return;

  const numPages = currentDocument.numPages;

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
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

// ── current page tracking (scroll-based) ─────────────────────────────────────

let _onPageChange: ((page: number, pages: number) => void) | null = null;

export function setPageChangeHandler(handler: (page: number, pages: number) => void): void {
  _onPageChange = handler;
}

function attachScrollPageTracker(): void {
  const container = getContainer();
  if (!container) return;

  container.addEventListener('scroll', () => {
    const canvases = container.querySelectorAll<HTMLCanvasElement>('canvas[data-page]');
    if (!canvases.length || !currentDocument) return;

    const containerMid = container.scrollTop + container.clientHeight / 2;
    let closestPage = 1;
    let closestDist = Infinity;

    canvases.forEach(canvas => {
      const wrapper = canvas.parentElement;
      if (!wrapper) return;
      const wrapperMid = wrapper.offsetTop + wrapper.offsetHeight / 2;
      const dist = Math.abs(wrapperMid - containerMid);
      if (dist < closestDist) {
        closestDist = dist;
        closestPage = Number(canvas.dataset.page);
      }
    });

    currentPage = closestPage;
    if (_onPageChange) _onPageChange(closestPage, currentDocument.numPages);
  }, { passive: true });
}

// ── pinch-to-zoom ─────────────────────────────────────────────────────────────

let _pinchStartDist = 0;
let _pinchStartScale = 1.25;
let _pinchPending = false;

function getPinchDist(touches: TouchList): number {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

function attachPinchZoom(): void {
  const container = getContainer();
  if (!container) return;

  // Trackpad pinch / Ctrl+scroll → wheel event with ctrlKey
  container.addEventListener('wheel', (e: WheelEvent) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    if (_pinchPending) return;

    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    const newScale = Math.max(0.5, Math.min(3.0, currentScale + delta));
    if (Math.abs(newScale - currentScale) < 0.01) return;

    _pinchPending = true;
    currentScale = newScale;
    renderVersion += 1;
    const version = renderVersion;
    clearContainer();
    void renderAllPages(version).then(() => {
      _pinchPending = false;
      if (_onPageChange && currentDocument) _onPageChange(currentPage, currentDocument.numPages);
    });
  }, { passive: false });

  // Touch screen pinch (two fingers)
  container.addEventListener('touchstart', (e: TouchEvent) => {
    if (e.touches.length === 2) {
      _pinchStartDist = getPinchDist(e.touches);
      _pinchStartScale = currentScale;
      _pinchPending = false;
    }
  }, { passive: true });

  container.addEventListener('touchmove', (e: TouchEvent) => {
    if (e.touches.length !== 2) return;
    const dist = getPinchDist(e.touches);
    const ratio = dist / _pinchStartDist;
    const newScale = Math.max(0.5, Math.min(3.0, _pinchStartScale * ratio));
    if (!_pinchPending && Math.abs(newScale - currentScale) > 0.04) {
      _pinchPending = true;
      currentScale = newScale;
      renderVersion += 1;
      const version = renderVersion;
      clearContainer();
      void renderAllPages(version).then(() => {
        _pinchPending = false;
        if (_onPageChange && currentDocument) _onPageChange(currentPage, currentDocument.numPages);
      });
    }
  }, { passive: true });
}

// ── public API ────────────────────────────────────────────────────────────────

export async function loadPdf(pdfPath: string): Promise<PdfViewState> {
  const data = await window.aktext.readBinaryFile(pdfPath);
  const loadingTask = pdfjsLib.getDocument({ data });
  currentDocument = await loadingTask.promise;

  renderVersion += 1;
  const version = renderVersion;
  currentPage = 1;

  clearContainer();

  const empty = getContainer()?.querySelector('.pdf-empty') as HTMLElement | null;
  if (empty) empty.style.display = 'none';

  await renderAllPages(version);

  getContainer()?.querySelectorAll<HTMLCanvasElement>('canvas[data-page]').forEach(canvas => {
    canvas.addEventListener('click', handleCanvasClick);
  });

  // Wire up scroll tracker and pinch zoom once (guards against double-attach)
  const container = getContainer();
  if (container && !container.dataset.listenersAttached) {
    container.dataset.listenersAttached = '1';
    attachScrollPageTracker();
    attachPinchZoom();
  }

  return getPdfState();
}

export function getPdfState(): PdfViewState {
  return { page: currentPage, pages: currentDocument?.numPages ?? 0, scale: currentScale };
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
  if (canvas) canvas.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export async function scrollToPosition(page: number, _x: number, y: number): Promise<void> {
  const container = getContainer();
  if (!container) return;
  const canvas = container.querySelector<HTMLCanvasElement>(`canvas[data-page="${page}"]`);
  if (!canvas) return;
  const wrapper = canvas.parentElement;
  if (!wrapper) return;

  container.scrollTo({
    top: Math.max(0, wrapper.offsetTop + y * currentScale - container.clientHeight / 3),
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