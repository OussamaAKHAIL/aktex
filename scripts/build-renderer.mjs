import { build, context } from 'esbuild';
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rendererOutput = resolve(root, 'dist', 'renderer');

function copyRendererAssets() {
  mkdirSync(rendererOutput, { recursive: true });
  copyFileSync(resolve(root, 'src', 'renderer', 'index.html'), resolve(rendererOutput, 'index.html'));
  copyFileSync(
    resolve(root, 'node_modules', 'pdfjs-dist', 'build', 'pdf.worker.min.mjs'),
    resolve(rendererOutput, 'pdf.worker.min.mjs'),
  );
}

const options = {
  entryPoints: [resolve(root, 'src', 'renderer', 'index.ts')],
  outfile: resolve(rendererOutput, 'index.js'),
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['es2020'],
  sourcemap: true,
  logLevel: 'info',
};

copyRendererAssets();
if (process.argv.includes('--watch')) {
  const rendererContext = await context(options);
  await rendererContext.watch();
  console.log('Watching renderer files…');
} else {
  await build(options);
}
