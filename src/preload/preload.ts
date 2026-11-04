// AKTeX — the renderer's deliberately small, typed IPC surface.
import { contextBridge, ipcRenderer } from 'electron';

export interface FileNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: FileNode[];
}

export interface ProjectPayload {
  path: string;
  files: FileNode[];
  mainFile: string | null;
}

export interface ImagePickResult {
  path: string;
  name: string;
}

export interface ImageImportResult {
  absolutePath: string;
  relativePath: string;
}

export type LogType = 'info' | 'error' | 'warning';

contextBridge.exposeInMainWorld('aktext', {
  compile: (mainFile: string): void => ipcRenderer.send('compile:start', { mainFile }),
  stopCompile: (): void => ipcRenderer.send('compile:stop'),
  onCompileLog: (callback: (line: string, type: LogType) => void): void => {
    ipcRenderer.on('compile:log', (_event, data: { line: string; type: LogType }) => callback(data.line, data.type));
  },
  onCompileDone: (callback: (pdfPath: string | null, success: boolean) => void): void => {
    ipcRenderer.on('compile:done', (_event, data: { pdfPath: string | null; success: boolean }) => callback(data.pdfPath, data.success));
  },
  onCompilerStatus: (callback: (available: boolean, label: string) => void): void => {
    ipcRenderer.on('compiler:status', (_event, data: { available: boolean; label: string }) => callback(data.available, data.label));
  },
  getCompilerStatus: (): Promise<{ available: boolean; label: string }> => ipcRenderer.invoke('compiler:status-get'),
  syncToPdf: (file: string, startLine: number, startCh: number, endLine: number, endCh: number): void =>
    ipcRenderer.send('synctex:toPdf', { file, startLine, startCh, endLine, endCh }),
  syncToEditor: (pdfPath: string, page: number, x: number, y: number): void =>
    ipcRenderer.send('synctex:toEditor', { pdfPath, page, x, y }),
  onSyncToEditor: (callback: (file: string, line: number) => void): void => {
    ipcRenderer.on('synctex:toEditor', (_event, data: { file: string; line: number }) => callback(data.file, data.line));
  },
  onSyncTexFailed: (callback: (message: string) => void): void => {
    ipcRenderer.on('synctex:failed', (_event, data: { message: string }) => callback(data.message));
  },
  onPdfPosition: (callback: (position: {
    page: number;
    x: number;
    y: number;
    width: number;
    height: number;
    boxes: Array<{ page: number; x: number; y: number; width: number; height: number }>;
  }) => void): void => {
    ipcRenderer.on('synctex:pdfPosition', (_event, data: {
      page: number;
      x: number;
      y: number;
      width: number;
      height: number;
      boxes: Array<{ page: number; x: number; y: number; width: number; height: number }>;
    }) => callback(data));
  },
  openProject: (): Promise<ProjectPayload | null> => ipcRenderer.invoke('project:open'),
  refreshProject: (): Promise<ProjectPayload | null> => ipcRenderer.invoke('project:refresh'),
  getInitialProject: (): Promise<ProjectPayload | null> => ipcRenderer.invoke('project:current'),
  openFile: (filePath: string): Promise<string> => ipcRenderer.invoke('file:open', { path: filePath }),
  readFile: (filePath: string): Promise<string> => ipcRenderer.invoke('file:read', filePath),
  readBinaryFile: (filePath: string): Promise<Uint8Array> => ipcRenderer.invoke('file:read-binary', filePath),
  saveFile: (filePath: string, content: string): Promise<void> => ipcRenderer.invoke('file:save', { path: filePath, content }),
  createFile: (directory: string): Promise<string | null> => ipcRenderer.invoke('file:create', directory),
  renameFile: (filePath: string): Promise<string | null> => ipcRenderer.invoke('file:rename', filePath),
  deleteFile: (filePath: string): Promise<boolean> => ipcRenderer.invoke('file:delete', filePath),
  pickImage: (): Promise<ImagePickResult | null> => ipcRenderer.invoke('image:pick'),
  importImage: (sourcePath: string, projectPath: string | null): Promise<ImageImportResult | null> =>
    ipcRenderer.invoke('image:import', { sourcePath, projectPath }),
  exportZip: (): Promise<boolean> => ipcRenderer.invoke('project:export-zip'),
  importZip: (): Promise<ProjectPayload | null> => ipcRenderer.invoke('project:import-zip'),
  openCompilerHelp: (): void => ipcRenderer.send('compiler:install-help'),
  closeWindow: (): void => ipcRenderer.send('window:close'),
  minimizeWindow: (): void => ipcRenderer.send('window:minimize'),
  maximizeWindow: (): void => ipcRenderer.send('window:maximize'),
});
