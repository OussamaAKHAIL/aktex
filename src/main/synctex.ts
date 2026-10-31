// AKTeX — SyncTeX Integration
// Codex: implement bidirectional sync between editor and PDF viewer.
// See AGENTS.md §SyncTeX for full spec.

import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export interface SyncTexViewResult {
  page: number;
  x: number;
  y: number;
}

export interface SyncTexEditResult {
  file: string;
  line: number;
  column: number;
}

// Editor → PDF: given a .tex file and line number, return page + coordinates in PDF
export async function viewInPdf(
  compilerBinDir: string,
  texFile: string,
  line: number,
  col: number,
  pdfFile?: string,
): Promise<SyncTexViewResult | null> {
  const targetPdf = pdfFile && fs.existsSync(pdfFile) ? pdfFile : texFile.replace(/\.tex$/i, '.pdf');
  const executable = process.platform === 'win32' ? 'synctex.exe' : 'synctex';
  const synctex = path.join(compilerBinDir, executable);

  return new Promise((resolve) => {
    let output = '';
    const proc = spawn(synctex, [
      'view',
      '-i', `${line}:${col}:${texFile}`,
      '-o', targetPdf,
    ], { cwd: path.dirname(targetPdf), windowsHide: true });

    proc.stdout?.on('data', (d: Buffer) => { output += d.toString(); });
    proc.stderr?.on('data', () => { /* ignore synctex warnings */ });
    proc.on('error', () => resolve(null));
    proc.on('close', () => {
      // Parse synctex output: look for "Page:N", "x:N", "y:N"
      const page = parseInt(output.match(/Page:(\d+)/i)?.[1] ?? '0', 10);
      const x = parseFloat(output.match(/x:([0-9.]+)/i)?.[1] ?? '0');
      const y = parseFloat(output.match(/y:([0-9.]+)/i)?.[1] ?? '0');
      resolve(page > 0 ? { page, x, y } : null);
    });
  });
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
      '-o', `${page}:${Math.round(x)}:${Math.round(y)}:${pdfFile}`,
    ], { cwd: path.dirname(pdfFile), windowsHide: true });

    proc.stdout?.on('data', (d: Buffer) => { output += d.toString(); });
    proc.stderr?.on('data', () => { /* ignore */ });
    proc.on('error', () => resolve(null));
    proc.on('close', () => {
      // Parse: "Input:<n>:<filepath>" or "Input:<filepath>", "Line:<n>", "Column:<n>"
      const fileMatch = output.match(/Input:(?:\d+:)?([^\r\n]+)/i);
      let file = fileMatch ? fileMatch[1].trim() : '';
      if (file) {
        file = path.isAbsolute(file) ? path.normalize(file) : path.resolve(path.dirname(pdfFile), file);
      }
      const line = parseInt(output.match(/Line:(\d+)/i)?.[1] ?? '0', 10);
      const column = parseInt(output.match(/Column:(-?\d+)/i)?.[1] ?? '0', 10);
      resolve(file && line > 0 ? { file, line, column: Math.max(0, column) } : null);
    });
  });
}
