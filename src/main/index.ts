// AKTeX — Electron main process and local project IPC.
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import archiver = require('archiver');
import unzipper from 'unzipper';
import { compile, detectCompiler, LogType, stopCompilation } from './compiler';
import { editFromPdf, viewInPdf, viewRangeInPdf } from './synctex';

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

function argumentValue(prefix: string): string | null {
  const entry = process.argv.find((argument) => argument.startsWith(`${prefix}=`));
  if (!entry) return null;
  const value = entry.slice(prefix.length + 1).trim();
  return value.length > 0 ? value : null;
}

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
    show: false,
    backgroundColor: '#141414',
    titleBarStyle: 'hidden',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: iconPath,
    title: 'AKTeX',
  });
  const showWindow = (): void => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) mainWindow.show();
  };

  // `ready-to-show` is the normal path, but a renderer/preload failure should
  // never leave the user with an invisible application. These fallbacks make
  // startup problems visible instead of looking like "npm run dev did nothing".
  mainWindow.once('ready-to-show', showWindow);
  mainWindow.webContents.once('did-finish-load', () => setTimeout(showWindow, 150));
  setTimeout(showWindow, 2500);

  mainWindow.webContents.on('did-fail-load', (_event, code, description, url) => {
    console.error(`[AKTeX] Renderer failed to load (${code}): ${description} — ${url}`);
    showWindow();
  });
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error(`[AKTeX] Renderer process exited: ${details.reason} (${details.exitCode})`);
  });
  mainWindow.webContents.on('preload-error', (_event, preloadPath, error) => {
    console.error(`[AKTeX] Preload failed (${preloadPath}):`, error);
  });

  void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  const screenshotPath = argumentValue('--screenshot');
  if (screenshotPath) {
    mainWindow.webContents.on('console-message', (_event, level, message) => {
      if (level >= 2) console.log(`[renderer:${level}] ${message}`);
    });
    mainWindow.webContents.once('did-finish-load', () => {
      const openTool = argumentValue('--open-tool');
      const shouldCompile = process.argv.includes('--compile');
      const shouldSync = process.argv.includes('--sync');
      const shouldZoom = process.argv.includes('--zoom');
      const requestedDelay = Number(argumentValue('--shot-delay') ?? '3600');
      const shotDelay = Number.isFinite(requestedDelay) ? Math.max(250, requestedDelay) : 3600;
      setTimeout(async () => {
        try {
          if (shouldCompile) {
            await mainWindow?.webContents.executeJavaScript(
              "document.getElementById('btn-compile')?.click()",
            );
            await new Promise((resolve) => setTimeout(resolve, 5500));
          }
          if (shouldZoom) {
            await mainWindow?.webContents.executeJavaScript(
              "document.getElementById('btn-zoom-in')?.click(); document.getElementById('btn-zoom-in')?.click();",
            );
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
          if (shouldSync) {
            await mainWindow?.webContents.executeJavaScript(`
              (() => {
                const view = window.__aktexEditorView;
                if (view) {
                  const line = view.state.doc.line(5);
                  view.dispatch({
                    selection: {
                      anchor: line.from + Math.min(20, line.length),
                      head: line.from + Math.min(23, line.length),
                    },
                    scrollIntoView: true,
                  });
                }
                document.getElementById('btn-code-to-pdf')?.click();
              })()
            `);
            await new Promise((resolve) => setTimeout(resolve, 1800));
          }
          if (openTool === 'formula') {
            await mainWindow?.webContents.executeJavaScript(
              "document.getElementById('btn-formula-editor')?.click()",
            );
            await new Promise((resolve) => setTimeout(resolve, 500));
            if (process.argv.includes('--formula-demo')) {
              await mainWindow?.webContents.executeJavaScript(`
                (() => {
                  const input = document.querySelector('.formula-input');
                  if (input) {
                    input.value = '\\\\frac{a}{b} = \\\\sqrt{x^2 + 1}';
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                  }
                })()
              `);
              await new Promise((resolve) => setTimeout(resolve, 800));
            }
            await new Promise((resolve) => setTimeout(resolve, 400));
          }
          const image = await mainWindow?.webContents.capturePage();
          if (image) await fs.promises.writeFile(path.resolve(screenshotPath), image.toPNG());
          console.log(`[AKTeX] Screenshot written to ${screenshotPath}`);
        } catch (error) {
          console.error('[AKTeX] Screenshot failed:', error);
        } finally {
          app.exit(0);
        }
      }, shotDelay);
    });
  }
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
  ipcMain.handle('project:current', async (): Promise<ProjectPayload | null> => currentProject ? projectPayload(currentProject) : null);

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

  ipcMain.handle('image:pick', async (): Promise<{ path: string; name: string } | null> => {
    const result = await dialog.showOpenDialog({
      title: 'Insert image',
      properties: ['openFile'],
      filters: [
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg'] },
        { name: 'All files', extensions: ['*'] },
      ],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    return { path: result.filePaths[0], name: path.basename(result.filePaths[0]) };
  });

  ipcMain.handle('image:import', async (
    _event,
    data: { sourcePath: string; projectPath: string | null },
  ): Promise<{ absolutePath: string; relativePath: string } | null> => {
    if (!data.projectPath) return null;
    const source = path.resolve(data.sourcePath);
    if (!fs.existsSync(source)) throw new Error('The selected image no longer exists.');

    const relativeToProject = path.relative(data.projectPath, source);
    if (relativeToProject && !relativeToProject.startsWith('..') && !path.isAbsolute(relativeToProject)) {
      return {
        absolutePath: source,
        relativePath: relativeToProject.replace(/\\/g, '/'),
      };
    }

    const figures = path.join(data.projectPath, 'figures');
    await fs.promises.mkdir(figures, { recursive: true });
    const base = path.basename(source).replace(/[^a-zA-Z0-9._-]+/g, '-');
    const extension = path.extname(base);
    const stem = path.basename(base, extension) || 'image';
    let target = path.join(figures, `${stem}${extension}`);
    let counter = 2;
    while (fs.existsSync(target)) {
      target = path.join(figures, `${stem}-${counter}${extension}`);
      counter += 1;
    }
    await fs.promises.copyFile(source, target);
    return {
      absolutePath: target,
      relativePath: path.relative(data.projectPath, target).replace(/\\/g, '/'),
    };
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

  ipcMain.on('synctex:toPdf', (_event, data: {
    file: string;
    startLine: number;
    startCh: number;
    endLine: number;
    endCh: number;
  }) => {
    if (!compilerDirectory) return;
    const sibling = data.file.replace(/\.tex$/i, '.pdf');
    const projectPdf = currentProject ? path.join(currentProject, 'main.pdf') : null;
    const pdfFile = projectPdf && fs.existsSync(projectPdf)
      ? projectPdf
      : (fs.existsSync(sibling) ? sibling : projectPdf ?? sibling);
    void viewRangeInPdf(
      compilerDirectory,
      data.file,
      data.startLine,
      data.startCh,
      data.endLine,
      data.endCh,
      pdfFile,
    ).then((result) => {
      if (result) {
        getWindow()?.webContents.send('synctex:pdfPosition', result);
      } else {
        getWindow()?.webContents.send('synctex:failed', {
          message: 'SyncTeX could not find that source position. Compile with SyncTeX enabled and try again.',
        });
      }
    });
  });
  ipcMain.on('synctex:toEditor', (_event, data: { pdfPath: string; page: number; x: number; y: number }) => {
    if (!compilerDirectory) return;
    void editFromPdf(compilerDirectory, data.pdfPath, data.page, data.x, data.y).then((result) => {
      if (result) getWindow()?.webContents.send('synctex:toEditor', result);
      else getWindow()?.webContents.send('synctex:failed', {
        message: 'SyncTeX could not resolve that PDF position. Compile with SyncTeX enabled and try again.',
      });
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
      hasPdfPane: Boolean(document.getElementById('pdf-scroll')),
      hasCodeToolbar: Boolean(document.getElementById('code-toolbar')),
      hasOutline: Boolean(document.getElementById('outline-content')),
      hasSplash: Boolean(document.getElementById('splash')),
      hasToolbar: Boolean(document.getElementById('toolbar')),
      title: document.title,
    })
  `);
  testWin.destroy();

  if (!windowState.hasAktext || !windowState.hasEditor || !windowState.hasPdfPane
    || !windowState.hasCodeToolbar || !windowState.hasOutline || !windowState.hasToolbar) {
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

  const initialProject = argumentValue('--project');
  if (initialProject) currentProject = path.resolve(initialProject);

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
  if (!compilerDirectory && !argumentValue('--screenshot')) {
    const response = await dialog.showMessageBox({ type: 'info', title: 'LaTeX compiler not found', message: 'AKTeX could not find pdflatex.', detail: 'Install MiKTeX or TeX Live, then restart AKTeX. You can still edit projects offline.', buttons: ['Get MiKTeX', 'Continue'], defaultId: 1, cancelId: 1 });
    if (response.response === 0) void shell.openExternal('https://miktex.org');
  }
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
