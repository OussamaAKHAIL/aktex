const cp = require('child_process');
const electronBin = require('electron');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = cp.spawn(electronBin, ['.', '--smoke-test', '--no-sandbox', '--disable-gpu'], {
  env,
  stdio: 'inherit',
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});

