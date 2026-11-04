// AKTeX — PDF.js continuous-scroll viewer.
//
// Rendering notes:
//  • Pages are laid out immediately as lightweight placeholders so scrolling
//    and zooming never wait for a full document render.
//  • Only pages near the viewport are rendered (IntersectionObserver), and
//    distant pages are released to keep memory bounded.
//  • Canvas bitmaps are rendered at the display's device pixel ratio (and at
//    least 1.5×) then displayed at CSS size, which fixes the blurry output of
//    the old single-resolution viewer.
//  • Zoom is anchored: Ctrl+wheel / pinch keeps the point under the pointer,
//    and buttons keep the viewport centre stable.

import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('./pdf.worker.min.mjs', window.location.href).toString();

const MIN_SCALE = 0.25;
const MAX_SCALE = 5;
const DEFAULT_SCALE = 1.2;
const PAGE_GAP = 14;
const PAGE_PADDING = 18;
const MAX_RENDERED_PAGES = 14;

export interface PdfViewState {
  page: number;
  pages: number;
  scale: number;
}

export interface PdfSyncBox {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PdfSyncPosition {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  boxes: PdfSyncBox[];
}

type ZoomMode = 'custom' | 'fit-width' | 'fit-page';
type PositionHandler = (page: number, x: number, y: number) => void;

interface BaseSize {
  width: number;
  height: number;
}

interface ScrollAnchor {
  index: number;
  ratio: number;
  viewportY: number;
}

let currentDocument: PDFDocumentProxy | null = null;
let currentScale = DEFAULT_SCALE;
let zoomMode: ZoomMode = 'custom';
let currentPage = 1;
let renderEpoch = 0;
let loadEpoch = 0;
let baseSizes: BaseSize[] = [];
let wrappers: HTMLElement[] = [];
let observer: IntersectionObserver | null = null;
let listenersAttached = false;
let firstLoad = true;
let scrollRaf = 0;
let renderTimer: ReturnType<typeof setTimeout> | null = null;
let markerTimer: ReturnType<typeof setTimeout> | null = null;
let highlightTimer: ReturnType<typeof setTimeout> | null = null;

const renderTasks = new Map<number, RenderTask>();
const renderingPages = new Set<number>();

let _onPageChange: ((page: number, pages: number) => void) | null = null;
let _onZoomChange: ((state: PdfViewState) => void) | null = null;
let _onSyncClick: PositionHandler | null = null;
let _onSyncDoubleClick: PositionHandler | null = null;

// ── DOM helpers ──────────────────────────────────────────────────────────────

function getContainer(): HTMLElement | null {
  return document.getElementById('pdf-scroll');
}

function clampScale(value: number): number {
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, value));
}

function cssSize(width: number, height: number): { width: string; height: string } {
  return { width: `${Math.max(1, Math.round(width))}px`, height: `${Math.max(1, Math.round(height))}px` };
}

function clearOverlays(): void {
  const container = getContainer();
  if (!container) return;
  container.querySelectorAll('.pdf-synctex-highlight, .pdf-sync-marker').forEach((el) => el.remove());
  if (highlightTimer) { clearTimeout(highlightTimer); highlightTimer = null; }
  if (markerTimer) { clearTimeout(markerTimer); markerTimer = null; }
}

function clearPages(): void {
  const container = getContainer();
  cancelRenders();
  observer?.disconnect();
  observer = null;
  wrappers = [];
  if (container) {
    container.querySelectorAll('.pdf-page-wrapper').forEach((el) => el.remove());
  }
  clearOverlays();
}

function cancelRenders(): void {
  for (const task of renderTasks.values()) {
    try { task.cancel(); } catch { /* already finished */ }
  }
  renderTasks.clear();
  renderingPages.clear();
}

function setEmptyVisible(visible: boolean): void {
  const empty = getContainer()?.querySelector<HTMLElement>('.pdf-empty');
  if (empty) empty.style.display = visible ? '' : 'none';
}

// ── Layout ───────────────────────────────────────────────────────────────────

function applyWrapperSize(index: number): void {
  const wrapper = wrappers[index];
  const base = baseSizes[index];
  if (!wrapper || !base) return;
  wrapper.style.width = `${Math.round(base.width * currentScale)}px`;
  wrapper.style.height = `${Math.round(base.height * currentScale)}px`;
}

function captureAnchor(clientY?: number): ScrollAnchor {
  const container = getContainer();
  if (!container || wrappers.length === 0) return { index: 0, ratio: 0, viewportY: 0 };

  const containerRect = container.getBoundingClientRect();
  const viewportY = clientY === undefined
    ? container.clientHeight / 2
    : Math.max(0, Math.min(container.clientHeight, clientY - containerRect.top));
  const absoluteY = container.scrollTop + viewportY;

  let index = 0;
  for (let i = 0; i < wrappers.length; i += 1) {
    const wrapper = wrappers[i];
    const top = wrapper.offsetTop;
    if (absoluteY >= top && absoluteY <= top + wrapper.offsetHeight) {
      index = i;
      break;
    }
    if (absoluteY > top) index = i;
  }

  const target = wrappers[index];
  const ratio = target.offsetHeight > 0
    ? Math.max(0, Math.min(1, (absoluteY - target.offsetTop) / target.offsetHeight))
    : 0;
  return { index, ratio, viewportY };
}

function restoreAnchor(anchor: ScrollAnchor): void {
  const container = getContainer();
  const target = wrappers[anchor.index];
  if (!container || !target) return;
  const top = target.offsetTop + anchor.ratio * target.offsetHeight;
  container.scrollTop = Math.max(0, top - anchor.viewportY);
}

function resizePages(anchor?: ScrollAnchor): void {
  const container = getContainer();
  if (!container) return;

  const resolvedAnchor = anchor ?? captureAnchor();
  const gap = PAGE_GAP;

  baseSizes.forEach((_base, index) => applyWrapperSize(index));
  // Keep the page gap stable when the scale changes.
  wrappers.forEach((wrapper, index) => {
    wrapper.style.marginBottom = index === wrappers.length - 1 ? '0' : `${gap}px`;
  });

  restoreAnchor(resolvedAnchor);

  renderEpoch += 1;
  cancelRenders();
  for (const wrapper of wrappers) {
    wrapper.dataset.rendered = wrapper.dataset.rendered === '1' ? '1' : '0';
    const canvas = wrapper.querySelector<HTMLCanvasElement>('canvas.pdf-page-canvas');
    if (canvas) {
      // Stretch the existing bitmap during the gesture; it is replaced by a
      // crisp re-render as soon as the gesture settles.
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      wrapper.classList.add('stale');
    }
    const textLayer = wrapper.querySelector<HTMLElement>('.textLayer');
    if (textLayer) textLayer.style.display = 'none';
  }

  scheduleVisibleRender(90);
  notifyZoom();
  if (currentDocument) _onPageChange?.(currentPage, currentDocument.numPages);
}

function setScale(nextScale: number, mode: ZoomMode, anchor?: ScrollAnchor): void {
  const clamped = clampScale(nextScale);
  if (Math.abs(clamped - currentScale) < 0.001 && zoomMode === mode) return;
  currentScale = clamped;
  zoomMode = mode;
  resizePages(anchor);
}

function fitWidthScale(): number {
  const container = getContainer();
  const base = baseSizes[0];
  if (!container || !base) return currentScale;
  return clampScale((container.clientWidth - PAGE_PADDING * 2) / base.width);
}

function fitPageScale(): number {
  const container = getContainer();
  const base = baseSizes[0];
  if (!container || !base) return currentScale;
  const widthScale = (container.clientWidth - PAGE_PADDING * 2) / base.width;
  const heightScale = (container.clientHeight - PAGE_PADDING * 2) / base.height;
  return clampScale(Math.min(widthScale, heightScale));
}

function applyFitMode(): void {
  if (!currentDocument) return;
  if (zoomMode === 'fit-width') setScale(fitWidthScale(), 'fit-width');
  if (zoomMode === 'fit-page') setScale(fitPageScale(), 'fit-page');
}

// ── Rendering ────────────────────────────────────────────────────────────────

function outputScaleForDisplay(): number {
  // Supersample by at least 1.5× so PDF text remains sharp on 1× displays.
  return Math.min(2.5, Math.max(1.5, window.devicePixelRatio || 1));
}

function visiblePageNumbers(extra = 1): number[] {
  const container = getContainer();
  if (!container) return [];
  const containerRect = container.getBoundingClientRect();
  const numbers: number[] = [];
  wrappers.forEach((wrapper, index) => {
    const rect = wrapper.getBoundingClientRect();
    if (rect.bottom >= containerRect.top - container.clientHeight * extra
      && rect.top <= containerRect.bottom + container.clientHeight * extra) {
      numbers.push(index + 1);
    }
  });
  return numbers;
}

function scheduleVisibleRender(delay = 80): void {
  if (renderTimer) clearTimeout(renderTimer);
  renderTimer = setTimeout(() => {
    renderTimer = null;
    const pages = visiblePageNumbers(0.75);
    for (const pageNumber of pages) void ensureRendered(pageNumber);
  }, delay);
}

async function ensureRendered(pageNumber: number): Promise<void> {
  const wrapper = wrappers[pageNumber - 1];
  if (!wrapper || !currentDocument) return;
  const scaleTag = currentScale.toFixed(4);
  if (wrapper.dataset.rendered === '1' && wrapper.dataset.scale === scaleTag) return;
  if (renderingPages.has(pageNumber)) return;
  await renderPage(pageNumber, wrapper, scaleTag);
}

async function renderPage(pageNumber: number, wrapper: HTMLElement, scaleTag: string): Promise<void> {
  if (!currentDocument) return;
  const epoch = renderEpoch;
  const load = loadEpoch;
  renderingPages.add(pageNumber);
  try {
    const page = await currentDocument.getPage(pageNumber);
    if (epoch !== renderEpoch || load !== loadEpoch) return;

    const cssViewport = page.getViewport({ scale: currentScale });
    const outputScale = outputScaleForDisplay();
    const renderViewport = page.getViewport({ scale: currentScale * outputScale });

    const canvas = document.createElement('canvas');
    canvas.className = 'pdf-page-canvas';
    canvas.dataset.page = String(pageNumber);
    canvas.width = Math.max(1, Math.ceil(renderViewport.width));
    canvas.height = Math.max(1, Math.ceil(renderViewport.height));
    canvas.style.width = `${Math.round(cssViewport.width)}px`;
    canvas.style.height = `${Math.round(cssViewport.height)}px`;

    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Canvas 2D context is unavailable.');

    const task = page.render({ canvasContext: context, viewport: renderViewport });
    renderTasks.set(pageNumber, task);
    await task.promise;
    renderTasks.delete(pageNumber);
    if (epoch !== renderEpoch || load !== loadEpoch) return;

    // Replace the old canvas only once the new, crisp bitmap is ready.
    const textLayerDiv = document.createElement('div');
    textLayerDiv.className = 'textLayer';
    textLayerDiv.style.width = `${Math.round(cssViewport.width)}px`;
    textLayerDiv.style.height = `${Math.round(cssViewport.height)}px`;
    textLayerDiv.style.setProperty('--scale-factor', String(currentScale));

    wrapper.replaceChildren(canvas, textLayerDiv);
    wrapper.classList.add('rendered');
    wrapper.classList.remove('stale');
    wrapper.dataset.rendered = '1';
    wrapper.dataset.scale = scaleTag;

    try {
      const textContent = await page.getTextContent();
      if (epoch !== renderEpoch || load !== loadEpoch) return;
      const textLayer = new pdfjsLib.TextLayer({
        textContentSource: textContent,
        container: textLayerDiv,
        viewport: cssViewport,
      });
      await textLayer.render();
    } catch {
      // Text selection is a bonus; a failed text layer must not hide the page.
    }

    trimDistantPages();
  } catch (error) {
    // RenderingCancelledException is expected while zooming/reloading.
    const name = error instanceof Error ? error.name : '';
    if (name !== 'RenderingCancelledException' && epoch === renderEpoch) {
      wrapper.innerHTML = '<div class="pdf-page-error">This page could not be rendered.</div>';
    }
  } finally {
    renderingPages.delete(pageNumber);
  }
}

function trimDistantPages(): void {
  const renderedIndexes = wrappers
    .map((wrapper, index) => ({ wrapper, index }))
    .filter(({ wrapper }) => wrapper.dataset.rendered === '1' && wrapper.querySelector('canvas.pdf-page-canvas'));
  if (renderedIndexes.length <= MAX_RENDERED_PAGES) return;

  const keepFrom = Math.max(0, currentPage - 5);
  const keepTo = Math.min(wrappers.length - 1, currentPage + 4);
  for (const { wrapper, index } of renderedIndexes) {
    if (index >= keepFrom && index <= keepTo) continue;
    wrapper.replaceChildren();
    wrapper.classList.remove('rendered', 'stale');
    wrapper.dataset.rendered = '0';
    delete wrapper.dataset.scale;
    const placeholder = document.createElement('div');
    placeholder.className = 'pdf-page-placeholder';
    placeholder.textContent = `Page ${index + 1}`;
    wrapper.appendChild(placeholder);
  }
}

// ── Page tracking ────────────────────────────────────────────────────────────

function updateCurrentPageFromScroll(): void {
  if (!currentDocument || wrappers.length === 0) return;
  const container = getContainer();
  if (!container) return;

  const mid = container.scrollTop + container.clientHeight * 0.42;
  let closest = 0;
  let closestDistance = Number.POSITIVE_INFINITY;
  wrappers.forEach((wrapper, index) => {
    const wrapperMid = wrapper.offsetTop + wrapper.offsetHeight / 2;
    const distance = Math.abs(wrapperMid - mid);
    if (distance < closestDistance) {
      closestDistance = distance;
      closest = index;
    }
  });

  const page = closest + 1;
  if (page !== currentPage) {
    currentPage = page;
    _onPageChange?.(page, currentDocument.numPages);
    trimDistantPages();
  }
}

function attachListeners(): void {
  if (listenersAttached) return;
  const container = getContainer();
  if (!container) return;
  listenersAttached = true;

  container.addEventListener('scroll', () => {
    if (scrollRaf) return;
    scrollRaf = requestAnimationFrame(() => {
      scrollRaf = 0;
      updateCurrentPageFromScroll();
      scheduleVisibleRender(220);
    });
  }, { passive: true });

  // Delegated click / double-click on pages (including the text layer).
  let downPoint: { x: number; y: number } | null = null;
  container.addEventListener('mousedown', (event) => {
    downPoint = { x: event.clientX, y: event.clientY };
  });

  container.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    if (target.closest('.pdf-synctex-highlight, .pdf-sync-marker')) return;
    const wrapper = target.closest<HTMLElement>('.pdf-page-wrapper');
    if (!wrapper) return;

    // A drag that selects text also fires `click` on mouseup. Do not treat a
    // selection gesture as a sync anchor: the user is selecting/copying text,
    // not asking the app to wait for the PDF→code second click.
    const movement = downPoint
      ? Math.hypot(event.clientX - downPoint.x, event.clientY - downPoint.y)
      : 0;
    downPoint = null;
    if (movement > 5) return;
    const selection = window.getSelection();
    if (selection && selection.toString().length > 0) return;

    const position = positionFromEvent(wrapper, event);
    if (!position) return;
    // A single click only drops an anchor; it never jumps by itself.
    showSyncMarker(position.page, position.x, position.y, 6500);
    _onSyncClick?.(position.page, position.x, position.y);
  });

  container.addEventListener('dblclick', (event) => {
    const target = event.target as HTMLElement;
    const wrapper = target.closest<HTMLElement>('.pdf-page-wrapper');
    if (!wrapper) return;
    const position = positionFromEvent(wrapper, event);
    if (!position) return;
    _onSyncDoubleClick?.(position.page, position.x, position.y);
  });

  // Ctrl + wheel / trackpad pinch.
  container.addEventListener('wheel', (event) => {
    if (!currentDocument) return;
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    const anchor = captureAnchor(event.clientY);
    const factor = Math.exp(-event.deltaY * 0.0024);
    setScale(clampScale(currentScale * factor), 'custom', anchor);
  }, { passive: false });

  // Touch pinch.
  let pinchStartDistance = 0;
  let pinchStartScale = currentScale;
  let pinchAnchor: ScrollAnchor | null = null;

  const distance = (touches: TouchList): number => {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  container.addEventListener('touchstart', (event) => {
    if (event.touches.length !== 2) return;
    event.preventDefault();
    pinchStartDistance = distance(event.touches);
    pinchStartScale = currentScale;
    const midY = (event.touches[0].clientY + event.touches[1].clientY) / 2;
    pinchAnchor = captureAnchor(midY);
  }, { passive: false });

  container.addEventListener('touchmove', (event) => {
    if (event.touches.length !== 2) return;
    event.preventDefault();
    if (pinchStartDistance <= 0) return;
    const next = clampScale(pinchStartScale * (distance(event.touches) / pinchStartDistance));
    if (Math.abs(next - currentScale) > 0.005) {
      setScale(next, 'custom', pinchAnchor ?? undefined);
    }
  }, { passive: false });

  container.addEventListener('touchend', () => {
    pinchStartDistance = 0;
    pinchAnchor = null;
  }, { passive: true });

  const resizeObserver = new ResizeObserver(() => {
    if (zoomMode === 'fit-width' || zoomMode === 'fit-page') {
      applyFitMode();
    } else {
      scheduleVisibleRender(220);
    }
  });
  resizeObserver.observe(container);
}

function positionFromEvent(wrapper: HTMLElement, event: MouseEvent): { page: number; x: number; y: number } | null {
  const page = Number(wrapper.dataset.page);
  if (!page) return null;
  const rect = wrapper.getBoundingClientRect();
  return {
    page,
    x: Math.max(0, (event.clientX - rect.left) / currentScale),
    y: Math.max(0, (event.clientY - rect.top) / currentScale),
  };
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function loadPdf(pdfPath: string): Promise<PdfViewState> {
  const data = await window.aktext.readBinaryFile(pdfPath);
  loadEpoch += 1;
  const epoch = loadEpoch;
  const loadingTask = pdfjsLib.getDocument({ data });
  const nextDocument = await loadingTask.promise;
  if (epoch !== loadEpoch) {
    await nextDocument.destroy();
    return getPdfState();
  }

  const previous = currentDocument;
  currentDocument = nextDocument;
  if (previous) void previous.destroy();

  baseSizes = await Promise.all(
    Array.from({ length: nextDocument.numPages }, async (_value, index) => {
      const page = await nextDocument.getPage(index + 1);
      const viewport = page.getViewport({ scale: 1 });
      return { width: viewport.width, height: viewport.height };
    }),
  );
  if (epoch !== loadEpoch) return getPdfState();

  clearPages();
  setEmptyVisible(false);
  currentPage = 1;

  const container = getContainer();
  if (!container) return getPdfState();

  wrappers = baseSizes.map((_size, index) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'pdf-page-wrapper';
    wrapper.dataset.page = String(index + 1);
    wrapper.dataset.rendered = '0';
    const placeholder = document.createElement('div');
    placeholder.className = 'pdf-page-placeholder';
    placeholder.textContent = `Page ${index + 1}`;
    wrapper.appendChild(placeholder);
    container.appendChild(wrapper);
    return wrapper;
  });

  if (!observer) {
    observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const wrapper = entry.target as HTMLElement;
        void ensureRendered(Number(wrapper.dataset.page));
      }
    }, { root: container, rootMargin: '140% 0px', threshold: 0 });
  }
  wrappers.forEach((wrapper) => observer?.observe(wrapper));

  attachListeners();
  container.scrollTop = 0;

  if (firstLoad) {
    firstLoad = false;
    currentScale = fitWidthScale();
    zoomMode = 'fit-width';
  }

  // Size everything before the first paint.
  baseSizes.forEach((base, index) => {
    const wrapper = wrappers[index];
    wrapper.style.width = `${Math.round(base.width * currentScale)}px`;
    wrapper.style.height = `${Math.round(base.height * currentScale)}px`;
    wrapper.style.marginBottom = index === wrappers.length - 1 ? '0' : `${PAGE_GAP}px`;
  });

  notifyZoom();
  _onPageChange?.(1, nextDocument.numPages);
  await ensureRendered(1);
  scheduleVisibleRender(60);
  return getPdfState();
}

export function getPdfState(): PdfViewState {
  return { page: currentPage, pages: currentDocument?.numPages ?? 0, scale: currentScale };
}

export function setPageChangeHandler(handler: (page: number, pages: number) => void): void {
  _onPageChange = handler;
}

export function setZoomChangeHandler(handler: (state: PdfViewState) => void): void {
  _onZoomChange = handler;
}

export function setSyncTexHandlers(handlers: {
  onClick?: (page: number, x: number, y: number) => void;
  onDoubleClick?: (page: number, x: number, y: number) => void;
}): void {
  _onSyncClick = handlers.onClick ?? null;
  _onSyncDoubleClick = handlers.onDoubleClick ?? null;
}

function notifyZoom(): void {
  _onZoomChange?.(getPdfState());
}

export function zoomIn(): PdfViewState {
  setScale(currentScale * 1.2, 'custom');
  return getPdfState();
}

export function zoomOut(): PdfViewState {
  setScale(currentScale / 1.2, 'custom');
  return getPdfState();
}

export function setZoom(scale: number): PdfViewState {
  setScale(scale, 'custom');
  return getPdfState();
}

export function fitWidth(): PdfViewState {
  if (!currentDocument) return getPdfState();
  setScale(fitWidthScale(), 'fit-width');
  return getPdfState();
}

export function fitPage(): PdfViewState {
  if (!currentDocument) return getPdfState();
  setScale(fitPageScale(), 'fit-page');
  return getPdfState();
}

export function resetZoom(): PdfViewState {
  setScale(1, 'custom');
  return getPdfState();
}

/** Backwards-compatible additive zoom used by older callers. */
export function changeScale(delta: number): Promise<PdfViewState> {
  setScale(currentScale + delta, 'custom');
  return Promise.resolve(getPdfState());
}

export async function scrollToPage(pageNumber: number): Promise<void> {
  const container = getContainer();
  const wrapper = wrappers[pageNumber - 1];
  if (!container || !wrapper) return;
  void ensureRendered(pageNumber);
  container.scrollTo({
    top: Math.max(0, wrapper.offsetTop - PAGE_PADDING),
    behavior: 'smooth',
  });
}

export async function scrollToPosition(
  page: number,
  x: number,
  y: number,
  boxes?: PdfSyncBox[],
  sourceText?: string,
): Promise<void> {
  const container = getContainer();
  const wrapper = wrappers[page - 1];
  if (!container || !wrapper) return;
  void ensureRendered(page);
  container.scrollTo({
    top: Math.max(0, wrapper.offsetTop + y * currentScale - container.clientHeight * 0.32),
    behavior: 'smooth',
  });

  // Prefer an exact highlight over the text layer when the source text can be
  // found on the page. SyncTeX's enclosing box is often the full paragraph
  // width, which would otherwise place a short selection too far to the right.
  // Multi-line selections are handled by the per-line SyncTeX boxes instead,
  // because the text layer cannot reliably map a selection that crosses lines.
  if (sourceText && !sourceText.includes('\n')) {
    try {
      if (await highlightTextInPdf(page, sourceText, y)) return;
    } catch {
      // Fall through to the box-based highlight on any text-layer failure.
    }
  }
  if (boxes && boxes.length > 0) showSyncHighlights(boxes);
  else showSyncMarker(page, x, y, 4500);
}

function plainTextFromLatex(raw: string): string {
  let text = raw.replace(/(^|[^\\])%.*$/gm, '$1');
  text = text.replace(/\\(?:textbf|textit|textsc|texttt|textrm|textsf|emph|underline|mbox)\s*\{([^{}]*)\}/g, '$1');
  text = text.replace(/\\(?:label|cite|ref|eqref|pageref)\*?\s*\{[^{}]*\}/g, '');
  text = text.replace(/\\(?:begin|end)\s*\{[^{}]*\}/g, '');
  text = text.replace(/\\[a-zA-Z]+\*?/g, ' ');
  text = text.replace(/[$^_{}&\\]/g, '');
  return text.replace(/\s+/g, ' ').trim();
}

interface TextNodeInfo {
  node: Text;
  start: number;
  end: number;
}

function collectTextNodes(layer: HTMLElement): { nodes: TextNodeInfo[]; text: string } {
  const nodes: TextNodeInfo[] = [];
  const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT);
  let text = '';
  let current = walker.nextNode();
  while (current) {
    const node = current as Text;
    if (node.data.length > 0) {
      nodes.push({ node, start: text.length, end: text.length + node.data.length });
      text += node.data;
    }
    current = walker.nextNode();
  }
  return { nodes, text };
}

/** Normalize whitespace but remember where every normalized character came from. */
function normalizeWithMap(input: string): { text: string; map: number[] } {
  let text = '';
  const map: number[] = [];
  let previousSpace = false;
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const space = /\s/.test(char);
    if (space) {
      if (previousSpace || text.length === 0) continue;
      text += ' ';
      map.push(index);
      previousSpace = true;
    } else {
      text += char;
      map.push(index);
      previousSpace = false;
    }
  }
  return { text, map };
}

function rangeForOffsets(layer: HTMLElement, nodes: TextNodeInfo[], start: number, end: number): Range | null {
  let startInfo: TextNodeInfo | null = null;
  let endInfo: TextNodeInfo | null = null;
  for (const info of nodes) {
    if (!startInfo && start >= info.start && start < info.end) startInfo = info;
    if (!endInfo && end > info.start && end <= info.end) endInfo = info;
  }
  if (!startInfo || !endInfo) return null;
  const range = document.createRange();
  try {
    range.setStart(startInfo.node, start - startInfo.start);
    range.setEnd(endInfo.node, end - endInfo.start);
    return range;
  } catch {
    return null;
  }
}

async function waitForTextLayer(wrapper: HTMLElement, timeout = 800): Promise<HTMLElement | null> {
  const started = performance.now();
  while (performance.now() - started < timeout) {
    const layer = wrapper.querySelector<HTMLElement>('.textLayer');
    if (layer && layer.querySelector('span')) return layer;
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  return wrapper.querySelector<HTMLElement>('.textLayer');
}

async function highlightTextInPdf(page: number, sourceText: string, yHint: number): Promise<boolean> {
  const wrapper = wrappers[page - 1];
  const container = getContainer();
  if (!wrapper || !container) return false;
  await ensureRendered(page);
  const layer = await waitForTextLayer(wrapper);
  if (!layer) return false;

  const needle = plainTextFromLatex(sourceText);
  if (needle.length < 1) return false;

  const { nodes, text } = collectTextNodes(layer);
  if (nodes.length === 0) return false;
  const { text: haystack, map } = normalizeWithMap(text);
  const wrapperRect = wrapper.getBoundingClientRect();
  const targetTop = wrapperRect.top + yHint * currentScale;

  let bestRange: Range | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  let index = haystack.indexOf(needle);
  while (index >= 0) {
    const start = map[index];
    const lastIndex = Math.min(index + needle.length - 1, map.length - 1);
    const end = map[lastIndex] + 1;
    const range = rangeForOffsets(layer, nodes, start, end);
    if (range) {
      const rects = Array.from(range.getClientRects());
      const first = rects.find((rect) => rect.width > 0);
      if (first) {
        const distance = Math.abs(first.top - targetTop);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestRange = range;
        }
      }
    }
    index = haystack.indexOf(needle, index + 1);
  }

  if (!bestRange) return false;
  const rects = Array.from(bestRange.getClientRects()).filter((rect) => rect.width > 0 && rect.height > 0);
  if (rects.length === 0) return false;

  clearOverlays();
  for (const rect of rects) {
    const element = document.createElement('div');
    element.className = 'pdf-synctex-highlight';
    element.style.left = `${rect.left - wrapperRect.left}px`;
    element.style.top = `${rect.top - wrapperRect.top}px`;
    element.style.width = `${rect.width}px`;
    element.style.height = `${rect.height}px`;
    wrapper.appendChild(element);
  }
  highlightTimer = setTimeout(() => {
    container.querySelectorAll('.pdf-synctex-highlight').forEach((element) => element.remove());
    highlightTimer = null;
  }, 6500);
  return true;
}

export function showSyncHighlights(boxes: PdfSyncBox[]): void {
  const container = getContainer();
  if (!container) return;
  clearOverlays();

  for (const box of boxes) {
    const wrapper = wrappers[box.page - 1];
    if (!wrapper) continue;
    const element = document.createElement('div');
    element.className = 'pdf-synctex-highlight';
    const left = Math.max(0, Math.min(wrapper.clientWidth, box.x * currentScale));
    const top = Math.max(0, Math.min(wrapper.clientHeight, box.y * currentScale));
    const width = Math.max(4, Math.min(box.width * currentScale, wrapper.clientWidth - left));
    const height = Math.max(4, Math.min(box.height * currentScale, wrapper.clientHeight - top));
    element.style.left = `${left}px`;
    element.style.top = `${top}px`;
    element.style.width = `${width}px`;
    element.style.height = `${height}px`;
    wrapper.appendChild(element);
  }

  highlightTimer = setTimeout(() => {
    container.querySelectorAll('.pdf-synctex-highlight').forEach((el) => el.remove());
    highlightTimer = null;
  }, 6500);
}

export function showSyncMarker(page: number, x: number, y: number, timeout = 0): void {
  const container = getContainer();
  const wrapper = wrappers[page - 1];
  if (!container || !wrapper) return;
  container.querySelectorAll('.pdf-sync-marker').forEach((el) => el.remove());
  if (markerTimer) { clearTimeout(markerTimer); markerTimer = null; }

  const marker = document.createElement('div');
  marker.className = 'pdf-sync-marker';
  marker.style.left = `${Math.max(0, Math.min(wrapper.clientWidth, x * currentScale))}px`;
  marker.style.top = `${Math.max(0, Math.min(wrapper.clientHeight, y * currentScale))}px`;
  wrapper.appendChild(marker);

  if (timeout > 0) {
    markerTimer = setTimeout(() => {
      marker.remove();
      markerTimer = null;
    }, timeout);
  }
}

export function clearSyncMarker(): void {
  const container = getContainer();
  container?.querySelectorAll('.pdf-sync-marker').forEach((el) => el.remove());
  if (markerTimer) { clearTimeout(markerTimer); markerTimer = null; }
}
