// AKTeX — PDF.js canvas preview and PDF-coordinate interaction.
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('./pdf.worker.min.mjs', window.location.href).toString();

let currentDocument: pdfjsLib.PDFDocumentProxy | null = null;
let currentPage = 1;
let currentScale = 1.25;

export interface PdfViewState { page: number; pages: number; scale: number; }

export async function loadPdf(canvas: HTMLCanvasElement, pdfPath: string): Promise<PdfViewState> {
  const data = await window.aktext.readBinaryFile(pdfPath);
  const loadingTask = pdfjsLib.getDocument({ data });
  currentDocument = await loadingTask.promise;
  const targetPage = Math.min(Math.max(currentPage, 1), currentDocument.numPages);
  currentPage = targetPage;
  await renderPage(canvas, currentPage);
  return getPdfState();
}

export function getPdfState(): PdfViewState {
  return { page: currentPage, pages: currentDocument?.numPages ?? 0, scale: currentScale };
}

export async function renderPage(canvas: HTMLCanvasElement, pageNumber: number): Promise<void> {
  if (!currentDocument) return;
  currentPage = Math.min(Math.max(pageNumber, 1), currentDocument.numPages);
  const page = await currentDocument.getPage(currentPage);
  const viewport = page.getViewport({ scale: currentScale });
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not create the PDF preview canvas.');
  await page.render({ canvasContext: context, viewport }).promise;
}

export async function changePage(canvas: HTMLCanvasElement, delta: number): Promise<PdfViewState> {
  await renderPage(canvas, currentPage + delta);
  return getPdfState();
}

export async function changeScale(canvas: HTMLCanvasElement, delta: number): Promise<PdfViewState> {
  currentScale = Math.max(0.5, Math.min(2.5, currentScale + delta));
  await renderPage(canvas, currentPage);
  return getPdfState();
}

export function attachSyncTexClickHandler(canvas: HTMLCanvasElement, onSyncClick: (page: number, x: number, y: number) => void): void {
  canvas.addEventListener('click', (event) => {
    if (!currentDocument) return;
    const rectangle = canvas.getBoundingClientRect();
    onSyncClick(currentPage, (event.clientX - rectangle.left) / currentScale, (event.clientY - rectangle.top) / currentScale);
  });
}

export async function scrollToPosition(canvas: HTMLCanvasElement, page: number, _x: number, y: number): Promise<void> {
  if (currentPage !== page) {
    await renderPage(canvas, page);
  }
  const container = canvas.parentElement;
  if (container) {
    const targetTop = canvas.offsetTop + (y * currentScale);
    container.scrollTo({
      top: Math.max(0, targetTop - container.clientHeight / 3),
      behavior: 'smooth',
    });
  }
}
