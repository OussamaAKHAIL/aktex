// AKTeX — launch Electron with a clean environment.
//
// Electron respects the ELECTRON_RUN_AS_NODE environment variable. Some
// terminal/harness environments set it globally, which turns `electron .`
// into a plain Node process: the main script runs, but no window ever opens.
// This launcher always removes that variable before spawning the real GUI.
//
// Extra flags can be supplied with AKTEX_ELECTRON_FLAGS, e.g.
//   AKTEX_ELECTRON_FLAGS="--no-sandbox --disable-gpu" npm run dev

const { spawn } = require('child_process');
const path = require('path');
const electron = require('electron');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const args = ['.'];
const passedArgs = process.argv.slice(2);

// The DeepSeek Harness terminal runs commands inside a restrictive job object:
// Chromium's multi-process channel (named pipe) and the default AppData cache
// are blocked, which makes Electron exit with status 0x80000003. Add the same
// flags we use for visual checks so `npm run dev` works from that terminal too.
const isHarnessShell = env.DSH_SHELL === '1' || Boolean(env.DSH_HOME);
if (isHarnessShell) {
  if (!passedArgs.includes('--no-sandbox')) args.push('--no-sandbox');
  if (!passedArgs.includes('--disable-gpu')) args.push('--disable-gpu');
  if (!passedArgs.some((argument) => argument.startsWith('--user-data-dir'))) {
    args.push(`--user-data-dir=${path.join(process.cwd(), '.aktex-dev-data')}`);
  }
}

const extraFlags = (process.env.AKTEX_ELECTRON_FLAGS || '').trim();
if (extraFlags) {
  args.push(...extraFlags.split(/\s+/).filter(Boolean));
}
args.push(...passedArgs);

const child = spawn(electron, args, { env, stdio: 'inherit' });

child.on('error', (error) => {
  console.error('AKTeX could not start Electron:', error);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  if (signal) {
    console.error(`AKTeX Electron process stopped by ${signal}.`);
    process.exit(1);
  }
  process.exit(code ?? 0);
});
