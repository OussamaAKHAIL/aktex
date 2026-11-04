// AKTeX — PDF.js continuous scroll viewer (Overleaf-style).
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('./pdf.worker.min.mjs', window.location.href).toString();

let currentDocument: pdfjsLib.PDFDocumentProxy | null = null;
let currentScale = 1.25;
let _renderedScale = 1.25; // scale at which pages are currently drawn on canvas
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

/**
 * Apply a CSS scale transform to all page wrappers so the viewer gives
 * instant visual feedback during a pinch gesture, without waiting for a
 * full re-render.  The ratio is (target scale) / (last rendered scale).
 */
function applyVisualScale(): void {
  const container = getContainer();
  if (!container) return;
  const ratio = currentScale / _renderedScale;
  container.querySelectorAll<HTMLElement>('.pdf-page-wrapper').forEach(wrapper => {
    wrapper.style.transformOrigin = 'top center';
    wrapper.style.transform = ratio === 1 ? '' : `scale(${ratio})`;
  });
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

    // Start fetching text content in parallel with canvas render
    const textContentPromise = page.getTextContent();

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

    // Render the PDF page onto the canvas
    await page.render({ canvasContext: context, viewport }).promise;

    if (version !== renderVersion) return;

    // ── Text layer (enables native text selection & copy) ────────────────────
    const textLayerDiv = document.createElement('div');
    textLayerDiv.className = 'textLayer';
    wrapper.appendChild(textLayerDiv);

    // Forward clicks on the text layer to the SyncTeX handler so that
    // clicking on selectable text still jumps to the source line.
    textLayerDiv.addEventListener('click', (e: MouseEvent) => {
      if (!_onSyncClick) return;
      const rect = canvas.getBoundingClientRect();
      _onSyncClick(
        pageNum,
        (e.clientX - rect.left) / currentScale,
        (e.clientY - rect.top) / currentScale,
      );
    });

    // Resolve the text content (fetched in parallel above) and render spans.
    const textContent = await textContentPromise;
    if (version !== renderVersion) return;

    const textLayer = new pdfjsLib.TextLayer({
      textContentSource: textContent,
      container: textLayerDiv,
      viewport: viewport
    });

    await textLayer.render();
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

function getPinchDist(touches: TouchList): number {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

function attachPinchZoom(): void {
  const container = getContainer();
  if (!container) return;

  let _zoomTimer: ReturnType<typeof setTimeout> | null = null;

  /** Perform the actual high-quality re-render after the gesture settles. */
  async function commitZoom(): Promise<void> {
    _zoomTimer = null;
    _renderedScale = currentScale;
    renderVersion += 1;
    const version = renderVersion;
    clearContainer(); // removes old wrappers (and their CSS transforms)
    await renderAllPages(version);
    // Re-attach SyncTeX click listeners to the freshly created canvases
    container!.querySelectorAll<HTMLCanvasElement>('canvas[data-page]').forEach(c => {
      c.addEventListener('click', handleCanvasClick);
    });
    if (_onPageChange && currentDocument) _onPageChange(currentPage, currentDocument.numPages);
  }

  function scheduleCommit(): void {
    if (_zoomTimer) clearTimeout(_zoomTimer);
    _zoomTimer = setTimeout(() => void commitZoom(), 250);
  }

  // ── Trackpad pinch / Ctrl+wheel ──────────────────────────────────────────
  // macOS trackpad pinch generates wheel events with ctrlKey=true.
  // We apply an instant CSS scale for responsiveness, then re-render after
  // the gesture settles (debounced at 250 ms).
  container.addEventListener('wheel', (e: WheelEvent) => {
    if (!e.ctrlKey) return;
    e.preventDefault();

    const step = e.deltaY < 0 ? 0.08 : -0.08;
    currentScale = Math.max(0.5, Math.min(3.0, currentScale + step));

    applyVisualScale(); // instant CSS feedback — no re-render yet
    scheduleCommit();   // debounced full re-render
  }, { passive: false });

  // ── Touch screen two-finger pinch ────────────────────────────────────────
  container.addEventListener('touchstart', (e: TouchEvent) => {
    if (e.touches.length === 2) {
      _pinchStartDist = getPinchDist(e.touches);
      _pinchStartScale = currentScale;
    }
  }, { passive: true });

  container.addEventListener('touchmove', (e: TouchEvent) => {
    if (e.touches.length !== 2) return;
    const dist = getPinchDist(e.touches);
    const newScale = Math.max(0.5, Math.min(3.0, _pinchStartScale * (dist / _pinchStartDist)));
    if (Math.abs(newScale - currentScale) > 0.01) {
      currentScale = newScale;
      applyVisualScale();
      scheduleCommit();
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
  _renderedScale = currentScale;

  clearContainer();

  const empty = getContainer()?.querySelector('.pdf-empty') as HTMLElement | null;
  if (empty) empty.style.display = 'none';

  await renderAllPages(version);

  getContainer()?.querySelectorAll<HTMLCanvasElement>('canvas[data-page]').forEach(canvas => {
    canvas.addEventListener('click', handleCanvasClick);
  });

  // Wire up scroll tracker and pinch zoom once (guard against double-attach)
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

  _renderedScale = currentScale;
  renderVersion += 1;
  const version = renderVersion;
  clearContainer();
  await renderAllPages(version);

  // Re-attach SyncTeX click listeners after re-render
  getContainer()?.querySelectorAll<HTMLCanvasElement>('canvas[data-page]').forEach(canvas => {
    canvas.addEventListener('click', handleCanvasClick);
  });

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