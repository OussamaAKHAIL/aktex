import { execFileSync, spawn } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rendererOutput = resolve(root, 'dist', 'renderer');
const katexDist = resolve(root, 'node_modules', 'katex', 'dist');

function copyRendererAssets() {
  // Remove stale tsc output from older builds so the packaged app only ships
  // the bundled renderer and its runtime assets. In watch mode the normal
  // build already cleaned the directory, and deleting it again would race the
  // Electron process started by `npm run dev`.
  if (!process.argv.includes('--watch')) {
    rmSync(rendererOutput, { recursive: true, force: true });
  }
  mkdirSync(rendererOutput, { recursive: true });
  copyFileSync(resolve(root, 'src', 'renderer', 'index.html'), resolve(rendererOutput, 'index.html'));
  copyFileSync(
    resolve(root, 'node_modules', 'pdfjs-dist', 'build', 'pdf.worker.min.mjs'),
    resolve(rendererOutput, 'pdf.worker.min.mjs'),
  );

  // Splash / brand assets.
  copyFileSync(resolve(root, 'assets', 'launching logo.png'), resolve(rendererOutput, 'launching-logo.png'));
  copyFileSync(resolve(root, 'assets', 'logo.png'), resolve(rendererOutput, 'logo.png'));

  // KaTeX is bundled offline: stylesheet plus its WOFF2 font set.
  const katexCss = resolve(katexDist, 'katex.min.css');
  if (!existsSync(katexCss)) {
    throw new Error('KaTeX is not installed. Run `npm install` before building.');
  }
  copyFileSync(katexCss, resolve(rendererOutput, 'katex.min.css'));
  cpSync(resolve(katexDist, 'fonts'), resolve(rendererOutput, 'fonts'), { recursive: true });
}

const entry = resolve(root, 'src', 'renderer', 'index.ts');
const output = resolve(rendererOutput, 'index.js');
const esbuildCli = resolve(root, 'node_modules', 'esbuild', 'bin', 'esbuild');

const args = [
  esbuildCli,
  entry,
  '--bundle',
  '--format=iife',
  '--platform=browser',
  '--target=es2020',
  '--sourcemap',
  `--outfile=${output}`,
];

copyRendererAssets();

if (process.argv.includes('--watch')) {
  const child = spawn(process.execPath, [...args, '--watch'], { stdio: 'inherit' });
  child.on('exit', (code) => process.exit(code ?? 0));
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => child.kill());
  }
  console.log('Watching renderer files…');
} else {
  // The esbuild CLI runs the native service with inherited stdio. This is both
  // faster and more compatible with restricted environments than spawning a
  // piped esbuild service from Node.
  execFileSync(process.execPath, args, { stdio: 'inherit' });
}
