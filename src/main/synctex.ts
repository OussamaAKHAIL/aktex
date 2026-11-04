// AKTeX — bidirectional SyncTeX integration.

import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export interface SyncTexBox {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SyncTexViewResult {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  boxes: SyncTexBox[];
}

export interface SyncTexEditResult {
  file: string;
  line: number;
  column: number;
}

/** SyncTeX treats `C:\…` poorly inside its colon-separated arguments. */
function portablePath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

function parseViewOutput(output: string): SyncTexBox[] {
  const boxes: SyncTexBox[] = [];
  const blocks = output.split(/(?=^\s*Page:)/m);
  for (const block of blocks) {
    const pageMatch = /^\s*Page:(\d+)/m.exec(block);
    if (!pageMatch) continue;
    const values: Record<string, number> = {};
    const valueRegex = /^\s*([xyWH]):(-?[0-9.]+)/gm;
    let match: RegExpExecArray | null;
    while ((match = valueRegex.exec(block)) !== null) {
      values[match[1]] = Number(match[2]);
    }
    if (!Number.isFinite(values.x) || !Number.isFinite(values.y)) continue;
    const width = Math.abs(values.W ?? 0);
    const height = Math.abs(values.H ?? 0);
    boxes.push({
      page: Number(pageMatch[1]),
      x: Math.max(0, values.x),
      y: Math.max(0, values.y),
      width: Math.max(1, width),
      height: Math.max(1, height),
    });
  }
  return boxes;
}

function queryView(
  compilerBinDir: string,
  texFile: string,
  line: number,
  column: number,
  pdfFile: string,
): Promise<SyncTexBox[]> {
  const executable = process.platform === 'win32' ? 'synctex.exe' : 'synctex';
  const synctex = path.join(compilerBinDir, executable);

  return new Promise((resolve) => {
    let output = '';
    const proc = spawn(synctex, [
      'view',
      '-i', `${Math.max(1, line)}:${Math.max(0, column)}:${portablePath(texFile)}`,
      '-o', portablePath(pdfFile),
    ], { cwd: path.dirname(pdfFile), windowsHide: true });

    proc.stdout?.on('data', (chunk: Buffer) => { output += chunk.toString(); });
    proc.stderr?.on('data', () => { /* SyncTeX warnings are not fatal */ });
    proc.on('error', () => resolve([]));
    proc.on('close', () => resolve(parseViewOutput(output)));
  });
}

function readLines(source: string): string[] {
  return source.split(/\r?\n/);
}

/**
 * Editor → PDF for a selection.
 *
 * SyncTeX returns the enclosing box of a source line. To highlight the part of
 * the line that is actually selected, we map the selected code-point range onto
 * that box proportionally. This is an approximation (LaTeX commands have no
 * 1:1 visual width) but it makes selections visibly precise rather than always
 * highlighting the entire line.
 */
export async function viewRangeInPdf(
  compilerBinDir: string,
  texFile: string,
  startLine: number,
  startCh: number,
  endLine: number,
  endCh: number,
  pdfFile?: string,
): Promise<SyncTexViewResult | null> {
  const targetPdf = pdfFile && fs.existsSync(pdfFile) ? pdfFile : texFile.replace(/\.tex$/i, '.pdf');
  if (!fs.existsSync(targetPdf)) return null;

  let source = '';
  try {
    source = await fs.promises.readFile(texFile, 'utf8');
  } catch {
    // The compiler can still resolve the line box even if we cannot read the
    // source for proportional columns.
  }
  const lines = source ? readLines(source) : [];

  let fromLine = Math.max(1, Math.min(startLine, endLine));
  let toLine = Math.max(fromLine, Math.max(startLine, endLine));
  if (toLine - fromLine > 60) toLine = fromLine + 60;

  const boxes: SyncTexBox[] = [];
  for (let line = fromLine; line <= toLine; line += 1) {
    const lineBoxes = await queryView(compilerBinDir, texFile, line, 1, targetPdf);
    if (lineBoxes.length === 0) continue;

    const text = lines[line - 1] ?? '';
    const length = Math.max(1, text.length);
    const fromChOnLine = line === startLine ? Math.max(0, Math.min(length, startCh)) : 0;
    const toChOnLine = line === endLine ? Math.max(0, Math.min(length, endCh)) : length;

    // SyncTeX can return several enclosing boxes; the first record is the most
    // accurate one. Using later records produces highlights that spill off the
    // page, so only the first box per source line is used.
    const box = lineBoxes[0];
    const startFraction = fromChOnLine / length;
    const endFraction = toChOnLine / length;
    if (endFraction <= startFraction) {
      boxes.push(box);
    } else {
      boxes.push({
        page: box.page,
        x: box.x + box.width * startFraction,
        y: box.y,
        width: Math.max(2, box.width * (endFraction - startFraction)),
        height: box.height,
      });
    }
  }

  // If the selected lines produced no typeset output (comments, preamble, …)
  // fall back to querying the exact cursor points.
  if (boxes.length === 0) {
    const direct = await queryView(compilerBinDir, texFile, startLine, Math.max(1, startCh + 1), targetPdf);
    boxes.push(...direct.slice(0, 4));
  }

  if (boxes.length === 0) return null;

  const first = boxes[0];
  return {
    page: first.page,
    x: first.x,
    y: first.y,
    width: first.width,
    height: first.height,
    boxes,
  };
}

/** Single-point forward sync (kept for the smoke test and external callers). */
export async function viewInPdf(
  compilerBinDir: string,
  texFile: string,
  line: number,
  col: number,
  pdfFile?: string,
): Promise<SyncTexViewResult | null> {
  const targetPdf = pdfFile && fs.existsSync(pdfFile) ? pdfFile : texFile.replace(/\.tex$/i, '.pdf');
  if (!fs.existsSync(targetPdf)) return null;
  const boxes = await queryView(compilerBinDir, texFile, line, col, targetPdf);
  if (boxes.length === 0) return null;
  const first = boxes[0];
  return { ...first, boxes };
}

// PDF → Editor: given a click position in PDF, return source file + line
export async function editFromPdf(
  compilerBinDir: string,
  pdfFile: string,
  page: number,
  x: number,
  y: number,
): Promise<SyncTexEditResult | null> {
  const executable = process.platform === 'win32' ? 'synctex.exe' : 'synctex';
  const synctex = path.join(compilerBinDir, executable);

  return new Promise((resolve) => {
    let output = '';
    const proc = spawn(synctex, [
      'edit',
      '-o', `${page}:${Math.round(x)}:${Math.round(y)}:${portablePath(pdfFile)}`,
    ], { cwd: path.dirname(pdfFile), windowsHide: true });

    proc.stdout?.on('data', (chunk: Buffer) => { output += chunk.toString(); });
    proc.stderr?.on('data', () => { /* ignore */ });
    proc.on('error', () => resolve(null));
    proc.on('close', () => {
      // Parse: "Input:<n>:<filepath>" or "Input:<filepath>", "Line:<n>", "Column:<n>"
      const fileMatch = /Input:(?:\d+:)?([^\r\n]+)/i.exec(output);
      let file = fileMatch ? fileMatch[1].trim() : '';
      if (file) {
        file = path.isAbsolute(file) ? path.normalize(file) : path.resolve(path.dirname(pdfFile), file);
      }
      const line = parseInt(/Line:(\d+)/i.exec(output)?.[1] ?? '0', 10);
      const column = parseInt(/Column:(-?\d+)/i.exec(output)?.[1] ?? '0', 10);
      resolve(file && line > 0 ? { file, line, column: Math.max(0, column) } : null);
    });
  });
}
