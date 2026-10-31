// AKTeX — Electron main process and local project IPC.
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import archiver = require('archiver');
import unzipper from 'unzipper';
import { compile, detectCompiler, LogType, stopCompilation } from './compiler';
import { editFromPdf, viewInPdf } from './synctex';

interface FileNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: FileNode[];
}

interface ProjectPayload {
  path: string;
  files: FileNode[];
  mainFile: string | null;
}

let mainWindow: BrowserWindow | null = null;
let currentProject: string | null = null;
let compilerDirectory: string | null = null;

function getWindow(): BrowserWindow | null {
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
}

async function readTree(directory: string): Promise<FileNode[]> {
  const entries = await fs.promises.readdir(directory, { withFileTypes: true });
  const visible = entries
    .filter((entry) => !['node_modules', '.git', 'dist', 'release'].includes(entry.name))
    .sort((left, right) => Number(right.isDirectory()) - Number(left.isDirectory()) || left.name.localeCompare(right.name));
  return Promise.all(visible.map(async (entry): Promise<FileNode> => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory()
      ? { name: entry.name, path: entryPath, isDirectory: true, children: await readTree(entryPath) }
      : { name: entry.name, path: entryPath, isDirectory: false };
  }));
}

async function projectPayload(projectPath: string): Promise<ProjectPayload> {
  const files = await readTree(projectPath);
  const preferred = path.join(projectPath, 'main.tex');
  const firstTex = await findFirstTex(files);
  return { path: projectPath, files, mainFile: fs.existsSync(preferred) ? preferred : firstTex };
}

async function findFirstTex(nodes: FileNode[]): Promise<string | null> {
  for (const node of nodes) {
    if (node.isDirectory && node.children) {
      const nested = await findFirstTex(node.children);
      if (nested) return nested;
    }
    if (!node.isDirectory && node.name.toLowerCase().endsWith('.tex')) return node.path;
  }
  return null;
}

function createWindow(): void {
  const iconPath = fs.existsSync(path.join(app.getAppPath(), 'assets/icon.png'))
    ? path.join(app.getAppPath(), 'assets/icon.png')
    : path.join(__dirname, '../../assets/icon.png');
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 960,
    minHeight: 650,
    backgroundColor: '#141414',
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: iconPath,
    title: 'AKTeX',
  });
  void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
}

function reportCompilerStatus(directory: string | null): void {
  getWindow()?.webContents.send('compiler:status', {
    available: Boolean(directory),
    label: directory ? `Ready · ${path.basename(directory)} · pdflatex` : 'LaTeX compiler not found',
  });
}

function sendCompileLog(line: string, type: LogType): void {
  getWindow()?.webContents.send('compile:log', { line, type });
}

function registerIpc(): void {
  ipcMain.handle('compiler:status-get', (): { available: boolean; label: string } => ({
    available: Boolean(compilerDirectory),
    label: compilerDirectory ? `Ready · ${path.basename(compilerDirectory)} · pdflatex` : 'LaTeX compiler not found',
  }));
  ipcMain.on('compile:start', (_event, data: { mainFile: string }) => {
    if (!compilerDirectory) {
      sendCompileLog('No LaTeX compiler was found. Install MiKTeX or TeX Live to compile this project.', 'error');
      getWindow()?.webContents.send('compile:done', { pdfPath: null, success: false });
      return;
    }
    void compile({
      mainFile: data.mainFile,
      compilerBinDir: compilerDirectory,
      onLog: sendCompileLog,
      onCompilerSwitched: (newDir) => {
        compilerDirectory = newDir;
        reportCompilerStatus(newDir);
      },
      onDone: (pdfPath, success) => getWindow()?.webContents.send('compile:done', { pdfPath, success }),
    });
  });
  ipcMain.on('compile:stop', () => {
    stopCompilation();
    sendCompileLog('Compilation stopped.', 'warning');
  });

  ipcMain.handle('project:open', async (): Promise<ProjectPayload | null> => {
    const result = await dialog.showOpenDialog({ title: 'Open LaTeX project', properties: ['openDirectory'] });
    if (result.canceled || !result.filePaths[0]) return null;
    currentProject = result.filePaths[0];
    return projectPayload(currentProject);
  });
  ipcMain.handle('project:refresh', async (): Promise<ProjectPayload | null> => currentProject ? projectPayload(currentProject) : null);

  ipcMain.handle('file:read', async (_event, filePath: string): Promise<string> => fs.promises.readFile(filePath, 'utf8'));
  ipcMain.handle('file:open', async (_event, data: { path: string } | string): Promise<string> => {
    const target = typeof data === 'string' ? data : data.path;
    return fs.promises.readFile(target, 'utf8');
  });
  ipcMain.handle('file:read-binary', async (_event, filePath: string): Promise<Uint8Array> => {
    const buffer = await fs.promises.readFile(filePath);
    return new Uint8Array(buffer);
  });
  ipcMain.handle('file:save', async (_event, data: { path: string; content: string }): Promise<void> => {
    await fs.promises.writeFile(data.path, data.content, 'utf8');
  });
  ipcMain.handle('file:create', async (_event, directory: string): Promise<string | null> => {
    const result = await dialog.showSaveDialog({ title: 'New file', defaultPath: path.join(directory, 'untitled.tex'), filters: [{ name: 'LaTeX', extensions: ['tex'] }, { name: 'All files', extensions: ['*'] }] });
    if (result.canceled || !result.filePath) return null;
    await fs.promises.writeFile(result.filePath, '', { flag: 'wx' });
    return result.filePath;
  });
  ipcMain.handle('file:rename', async (_event, filePath: string): Promise<string | null> => {
    const result = await dialog.showSaveDialog({ title: 'Rename file', defaultPath: filePath });
    if (result.canceled || !result.filePath || result.filePath === filePath) return null;
    await fs.promises.rename(filePath, result.filePath);
    return result.filePath;
  });
  ipcMain.handle('file:delete', async (_event, filePath: string): Promise<boolean> => {
    const result = await dialog.showMessageBox({ type: 'warning', buttons: ['Delete', 'Cancel'], defaultId: 1, cancelId: 1, title: 'Delete file', message: `Delete ${path.basename(filePath)}?`, detail: 'This cannot be undone.' });
    if (result.response !== 0) return false;
    await fs.promises.rm(filePath, { recursive: true, force: true });
    return true;
  });

  ipcMain.handle('project:export-zip', async (): Promise<boolean> => {
    const projectDirectory = currentProject;
    if (!projectDirectory) return false;
    const save = await dialog.showSaveDialog({ title: 'Export project', defaultPath: `${path.basename(projectDirectory)}.zip`, filters: [{ name: 'ZIP archive', extensions: ['zip'] }] });
    if (save.canceled || !save.filePath) return false;
    await new Promise<void>((resolve, reject) => {
      const output = fs.createWriteStream(save.filePath);
      const archive = archiver('zip', { zlib: { level: 9 } });
      output.on('close', resolve);
      output.on('error', reject);
      archive.on('error', reject);
      archive.pipe(output);
      archive.directory(projectDirectory, false);
      void archive.finalize();
    });
    return true;
  });
  ipcMain.handle('project:import-zip', async (): Promise<ProjectPayload | null> => {
    const zip = await dialog.showOpenDialog({ title: 'Import LaTeX project', filters: [{ name: 'ZIP archive', extensions: ['zip'] }], properties: ['openFile'] });
    if (zip.canceled || !zip.filePaths[0]) return null;
    const destination = await dialog.showOpenDialog({ title: 'Choose a destination folder', properties: ['openDirectory', 'createDirectory'] });
    if (destination.canceled || !destination.filePaths[0]) return null;
    const target = path.join(destination.filePaths[0], path.basename(zip.filePaths[0], '.zip'));
    await fs.promises.mkdir(target, { recursive: true });
    await fs.createReadStream(zip.filePaths[0]).pipe(unzipper.Extract({ path: target })).promise();
    currentProject = target;
    return projectPayload(target);
  });

  ipcMain.on('synctex:toPdf', (_event, data: { file: string; line: number }) => {
    if (!compilerDirectory) return;
    let pdfFile = data.file.replace(/\.tex$/i, '.pdf');
    if (!fs.existsSync(pdfFile) && currentProject) {
      const preferred = path.join(currentProject, 'main.pdf');
      if (fs.existsSync(preferred)) {
        pdfFile = preferred;
      }
    }
    void viewInPdf(compilerDirectory, data.file, data.line, 1, pdfFile).then((result) => {
      if (result) getWindow()?.webContents.send('synctex:pdfPosition', result);
    });
  });
  ipcMain.on('synctex:toEditor', (_event, data: { pdfPath: string; page: number; x: number; y: number }) => {
    if (!compilerDirectory) return;
    void editFromPdf(compilerDirectory, data.pdfPath, data.page, data.x, data.y).then((result) => {
      if (result) getWindow()?.webContents.send('synctex:toEditor', result);
    });
  });
  ipcMain.on('compiler:install-help', () => { void shell.openExternal('https://miktex.org'); });
  ipcMain.on('window:close', () => mainWindow?.close());
  ipcMain.on('window:minimize', () => mainWindow?.minimize());
  ipcMain.on('window:maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });
}

async function runSmokeTest(): Promise<void> {
  const testDir = path.join(app.getPath('temp'), `aktex-smoke-${Date.now()}`);
  await fs.promises.mkdir(testDir, { recursive: true });
  const texFile = path.join(testDir, 'main.tex');
  const bibFile = path.join(testDir, 'references.bib');

  await fs.promises.writeFile(texFile, [
    '\\documentclass{article}',
    '\\begin{document}',
    '\\title{AKTeX Verification}',
    '\\author{AKTeX Test Suite}',
    '\\maketitle',
    '\\section{Introduction}',
    'Testing AKTeX compilation and SyncTeX integration.',
    'See citation \\cite{lamport94}.',
    '\\bibliographystyle{plain}',
    '\\bibliography{references}',
    '\\end{document}',
  ].join('\n'), 'utf8');

  await fs.promises.writeFile(bibFile, [
    '@book{lamport94,',
    '  author = {Leslie Lamport},',
    '  title = {LaTeX: A Document Preparation System},',
    '  year = {1994},',
    '  publisher = {Addison-Wesley}',
    '}',
  ].join('\n'), 'utf8');

  console.log('[SMOKE TEST] Test project created at:', testDir);

  const compiler = await detectCompiler();
  if (!compiler) {
    throw new Error('LaTeX compiler was not detected.');
  }
  console.log('[SMOKE TEST] Compiler detected:', compiler);

  const logs: string[] = [];
  let compileResult: { pdfPath: string | null; success: boolean } = { pdfPath: null, success: false };
  await new Promise<void>((resolve) => {
    void compile({
      mainFile: texFile,
      compilerBinDir: compiler,
      onLog: (line, type) => {
        logs.push(`[${type}] ${line}`);
      },
      onDone: (pdfPath, success) => {
        compileResult = { pdfPath, success };
        resolve();
      },
    });
  });

  if (!compileResult.success || !compileResult.pdfPath || !fs.existsSync(compileResult.pdfPath)) {
    console.error('[SMOKE TEST] Compilation failed. Logs:\n' + logs.slice(-20).join('\n'));
    throw new Error('Compilation did not produce a PDF.');
  }
  console.log('[SMOKE TEST] Compilation successful. PDF generated at:', compileResult.pdfPath);

  const viewResult = await viewInPdf(compiler, texFile, 7, 1, compileResult.pdfPath);
  if (!viewResult || viewResult.page < 1) {
    throw new Error('SyncTeX viewInPdf failed.');
  }
  console.log('[SMOKE TEST] SyncTeX viewInPdf succeeded:', JSON.stringify(viewResult));

  const editResult = await editFromPdf(compiler, compileResult.pdfPath, viewResult.page, viewResult.x, viewResult.y);
  if (!editResult || !editResult.file || editResult.line < 1) {
    throw new Error('SyncTeX editFromPdf failed.');
  }
  console.log('[SMOKE TEST] SyncTeX editFromPdf succeeded:', JSON.stringify(editResult));

  const zipPath = path.join(app.getPath('temp'), `aktex-smoke-export-${Date.now()}.zip`);
  await new Promise<void>((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    output.on('close', resolve);
    output.on('error', reject);
    archive.on('error', reject);
    archive.pipe(output);
    archive.directory(testDir, false);
    void archive.finalize();
  });
  if (!fs.existsSync(zipPath) || fs.statSync(zipPath).size === 0) {
    throw new Error('ZIP export failed.');
  }
  console.log('[SMOKE TEST] ZIP export succeeded. Size:', fs.statSync(zipPath).size);

  const extractDir = path.join(testDir, 'extracted');
  await fs.promises.mkdir(extractDir, { recursive: true });
  await fs.createReadStream(zipPath).pipe(unzipper.Extract({ path: extractDir })).promise();
  if (!fs.existsSync(path.join(extractDir, 'main.tex'))) {
    throw new Error('ZIP import/extract failed.');
  }
  console.log('[SMOKE TEST] ZIP import/extract verified.');

  const testWin = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const rendererErrors: string[] = [];
  testWin.webContents.on('console-message', (_e, level, message) => {
    if (level >= 3) {
      rendererErrors.push(message);
    }
  });

  await testWin.loadFile(path.join(__dirname, '../renderer/index.html'));
  const windowState = await testWin.webContents.executeJavaScript(`
    ({
      hasAktext: Boolean(window.aktext),
      hasEditor: Boolean(document.querySelector('.cm-editor')),
      hasCanvas: Boolean(document.getElementById('pdf-canvas')),
      hasToolbar: Boolean(document.getElementById('toolbar')),
      title: document.title,
    })
  `);
  testWin.destroy();

  if (!windowState.hasAktext || !windowState.hasEditor || !windowState.hasCanvas) {
    throw new Error('Renderer UI failed to mount properly: ' + JSON.stringify(windowState));
  }
  if (rendererErrors.length > 0) {
    throw new Error('Renderer logged console errors: ' + rendererErrors.join('; '));
  }
  console.log('[SMOKE TEST] Renderer UI and IPC bridge verified successfully:', JSON.stringify(windowState));

  try {
    await fs.promises.rm(testDir, { recursive: true, force: true });
    if (fs.existsSync(zipPath)) await fs.promises.unlink(zipPath);
  } catch {
    // Ignore temp cleanup errors
  }
  console.log('[SMOKE TEST] ALL TESTS PASSED SUCCESSFULLY!');
}

app.whenReady().then(async () => {
  registerIpc();

  if (process.argv.includes('--smoke-test')) {
    try {
      await runSmokeTest();
      app.exit(0);
    } catch (err) {
      console.error('[SMOKE TEST FAILED]', err);
      app.exit(1);
    }
    return;
  }

  createWindow();
  compilerDirectory = await detectCompiler();
  reportCompilerStatus(compilerDirectory);
  if (!compilerDirectory) {
    const response = await dialog.showMessageBox({ type: 'info', title: 'LaTeX compiler not found', message: 'AKTeX could not find pdflatex.', detail: 'Install MiKTeX or TeX Live, then restart AKTeX. You can still edit projects offline.', buttons: ['Get MiKTeX', 'Continue'], defaultId: 1, cancelId: 1 });
    if (response.response === 0) void shell.openExternal('https://miktex.org');
  }
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
