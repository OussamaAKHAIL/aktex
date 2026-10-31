// AKTeX — local compiler discovery and non-blocking compilation.
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export type LogType = 'info' | 'error' | 'warning';

const MIKTEX_PATHS = [
  'C:\\Program Files\\MiKTeX\\miktex\\bin\\x64',
  'C:\\Program Files\\MiKTeX 2.9\\miktex\\bin\\x64',
];
const TEXLIVE_BASE = 'C:\\texlive';
let activeProcess: ReturnType<typeof spawn> | null = null;

function executableNames(name: string): string[] {
  return process.platform === 'win32' ? [`${name}.exe`, name] : [name];
}

function hasExecutable(directory: string, name: string): boolean {
  return executableNames(name).some((executable) => fs.existsSync(path.join(directory, executable)));
}

function canExecute(directory: string): Promise<boolean> {
  const executable = process.platform === 'win32' ? 'pdflatex.exe' : 'pdflatex';
  const pdflatex = path.join(directory, executable);
  if (!fs.existsSync(pdflatex)) return Promise.resolve(false);

  return new Promise((resolve) => {
    try {
      const delimiter = process.platform === 'win32' ? ';' : ':';
      const child = spawn(pdflatex, ['--version'], {
        windowsHide: true,
        env: {
          ...process.env,
          PATH: `${directory}${delimiter}${process.env.PATH ?? ''}`,
        },
      });
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          child.kill();
          resolve(false);
        }
      }, 2000);

      child.on('error', () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(false);
        }
      });
      child.on('close', (code) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(code === 0);
        }
      });
    } catch {
      resolve(false);
    }
  });
}

async function findCompilerCandidates(): Promise<string[]> {
  const delimiter = process.platform === 'win32' ? ';' : ':';
  const directories = (process.env.PATH ?? '').split(delimiter).filter(Boolean);
  const candidates: string[] = [];

  const add = (dir: string): void => {
    if (dir && !candidates.includes(dir) && hasExecutable(dir, 'pdflatex')) {
      candidates.push(dir);
    }
  };

  // Prioritize TeX Live first: it is a full, self-contained offline distribution
  try {
    const years = await fs.promises.readdir(TEXLIVE_BASE);
    for (const year of years.sort().reverse()) {
      for (const arch of ['windows', 'win64', 'win32']) {
        add(path.join(TEXLIVE_BASE, year, 'bin', arch));
      }
    }
  } catch {
    // TeX Live is not installed in its standard location.
  }

  for (const directory of directories) {
    add(directory);
  }

  if (process.env.LOCALAPPDATA) {
    add(path.join(process.env.LOCALAPPDATA, 'Programs', 'MiKTeX', 'miktex', 'bin', 'x64'));
  }

  for (const directory of MIKTEX_PATHS) {
    add(directory);
  }

  return candidates;
}

/** Locate a functional pdflatex without blocking Electron's main process. */
export async function detectCompiler(): Promise<string | null> {
  const candidates = await findCompilerCandidates();
  if (candidates.length === 0) return null;

  // Prefer a candidate that can successfully run `pdflatex --version`
  for (const candidate of candidates) {
    if (await canExecute(candidate)) {
      return candidate;
    }
  }

  // Fallback to the first detected candidate
  return candidates[0] ?? null;
}

export interface CompileOptions {
  mainFile: string;
  compilerBinDir: string;
  onLog: (line: string, type: LogType) => void;
  onDone: (pdfPath: string | null, success: boolean) => void;
  onCompilerSwitched?: (newDir: string) => void;
}

function classify(line: string): LogType {
  if (/^!|^Error|^Emergency stop|^! LaTeX Error/i.test(line)) return 'error';
  if (/warning/i.test(line)) return 'warning';
  return 'info';
}

function runProcess(
  command: string,
  args: string[],
  cwd: string,
  onLog: CompileOptions['onLog'],
  compilerBinDir?: string,
): Promise<number> {
  return new Promise((resolve) => {
    let settled = false;
    let child: ReturnType<typeof spawn>;
    const finish = (code: number): void => {
      if (!settled) {
        settled = true;
        if (activeProcess === child) activeProcess = null;
        resolve(code);
      }
    };
    const delimiter = process.platform === 'win32' ? ';' : ':';
    const env = {
      ...process.env,
      ...(compilerBinDir ? { PATH: `${compilerBinDir}${delimiter}${process.env.PATH ?? ''}` } : {}),
    };
    child = spawn(command, args, { cwd, env, windowsHide: true });
    activeProcess = child;
    const relay = (chunk: Buffer, forcedType?: LogType): void => {
      chunk.toString().split(/\r?\n/).filter(Boolean).forEach((line) => {
        onLog(line, forcedType ?? classify(line));
        if (/So far, you have not checked for MiKTeX updates/i.test(line)) {
          onLog('Fix: Open "MiKTeX Console" from your Start menu -> go to Updates -> click "Check for updates".', 'error');
          onLog('Alternatively, run "mpm --find-updates" in PowerShell.', 'info');
        }
      });
    };
    child.stdout?.on('data', (chunk: Buffer) => relay(chunk));
    child.stderr?.on('data', (chunk: Buffer) => relay(chunk, 'error'));
    child.on('error', (error: Error) => {
      onLog(`Could not start compiler: ${error.message}`, 'error');
      finish(1);
    });
    child.on('close', (code: number | null) => finish(code ?? 1));
  });
}

/** Stop the currently running compiler process, if one exists. */
export function stopCompilation(): void {
  activeProcess?.kill();
}

export async function compile(options: CompileOptions): Promise<void> {
  const projectDir = path.dirname(options.mainFile);
  const baseName = path.basename(options.mainFile, path.extname(options.mainFile));
  const executable = process.platform === 'win32' ? 'pdflatex.exe' : 'pdflatex';
  let activeCompilerDir = options.compilerBinDir;
  let pdflatex = path.join(activeCompilerDir, executable);

  const buildArgs = (dir: string): string[] => {
    const isMiktex = /miktex/i.test(dir);
    const extraArgs = isMiktex ? ['--miktex-disable-installer', '--c-style-errors'] : [];
    return ['-synctex=1', '-interaction=nonstopmode', ...extraArgs, `-output-directory=${projectDir}`, options.mainFile];
  };

  let latexArgs = buildArgs(activeCompilerDir);
  options.onLog(`Running pdflatex -synctex=1 -interaction=nonstopmode ${path.basename(options.mainFile)} …`, 'info');
  let exitCode = await runProcess(pdflatex, latexArgs, projectDir, options.onLog, activeCompilerDir);

  // If compilation failed with current compiler, attempt automatic recovery using an alternate working compiler
  if (exitCode !== 0) {
    if (/miktex/i.test(activeCompilerDir) && process.env.LOCALAPPDATA) {
      const logFile = path.join(process.env.LOCALAPPDATA, 'MiKTeX', 'miktex', 'log', 'pdflatex.log');
      try {
        if (fs.existsSync(logFile)) {
          const content = await fs.promises.readFile(logFile, 'utf8');
          const errorLines = content.split(/\r?\n/).filter(Boolean).filter((l) => /error|fatal|denied|cannot/i.test(l)).slice(-3);
          for (const line of errorLines) {
            options.onLog(`[MiKTeX log] ${line}`, 'error');
          }
        }
      } catch {
        // Ignore log read errors
      }
    }

    const candidates = await findCompilerCandidates();
    const alternate = candidates.find((c) => path.normalize(c).toLowerCase() !== path.normalize(activeCompilerDir).toLowerCase());
    if (alternate && await canExecute(alternate)) {
      options.onLog(`Primary compiler did not succeed. Automatically switching to: ${alternate} …`, 'warning');
      activeCompilerDir = alternate;
      pdflatex = path.join(activeCompilerDir, executable);
      latexArgs = buildArgs(activeCompilerDir);
      exitCode = await runProcess(pdflatex, latexArgs, projectDir, options.onLog, activeCompilerDir);
      if (exitCode === 0 && options.onCompilerSwitched) {
        options.onCompilerSwitched(alternate);
      }
    }
  }

  if (exitCode !== 0) {
    options.onDone(null, false);
    return;
  }

  const containsBibliography = (await fs.promises.readdir(projectDir)).some((file) => file.toLowerCase().endsWith('.bib'));
  if (containsBibliography) {
    const bcfFile = path.join(projectDir, `${baseName}.bcf`);
    const usesBiber = fs.existsSync(bcfFile);
    const biber = path.join(activeCompilerDir, process.platform === 'win32' ? 'biber.exe' : 'biber');
    const bibtex = path.join(activeCompilerDir, process.platform === 'win32' ? 'bibtex.exe' : 'bibtex');
    const bibliographyTool = usesBiber && fs.existsSync(biber) ? biber : (fs.existsSync(bibtex) ? bibtex : biber);
    if (fs.existsSync(bibliographyTool)) {
      options.onLog(`Running ${path.basename(bibliographyTool, path.extname(bibliographyTool))} ${baseName} …`, 'info');
      await runProcess(bibliographyTool, [baseName], projectDir, options.onLog, activeCompilerDir);
      for (let pass = 0; pass < 2; pass += 1) {
        if (await runProcess(pdflatex, latexArgs, projectDir, options.onLog, activeCompilerDir) !== 0) {
          options.onDone(null, false);
          return;
        }
      }
    }
  }

  const pdfPath = path.join(projectDir, `${baseName}.pdf`);
  const success = fs.existsSync(pdfPath);
  options.onDone(success ? pdfPath : null, success);
}
