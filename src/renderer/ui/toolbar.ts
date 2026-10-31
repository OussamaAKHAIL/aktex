// AKTeX — Toolbar
// Codex: add more toolbar buttons and keyboard shortcuts here.

export function initToolbar(opts: {
  onCompile: () => void;
  onOpenProject: () => void;
  onExportZip: () => void;
  onImportZip: () => void;
  onSettings: () => void;
}): void {
  document.getElementById('btn-compile')
    ?.addEventListener('click', opts.onCompile);
  document.getElementById('btn-open-project')
    ?.addEventListener('click', opts.onOpenProject);
  document.getElementById('btn-export-zip')
    ?.addEventListener('click', opts.onExportZip);
  document.getElementById('btn-import-zip')
    ?.addEventListener('click', opts.onImportZip);

  // Keyboard shortcut: Ctrl+Enter = Compile
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'Enter') {
      e.preventDefault();
      opts.onCompile();
    }
    // Ctrl+S = Save
    if (e.ctrlKey && e.key === 's') {
      e.preventDefault();
      // TODO: trigger save of current file
    }
  });
}

export function setCompilerStatus(text: string, ok = true): void {
  const el = document.getElementById('compiler-status');
  if (!el) return;
  el.textContent = text;
  el.style.color = ok ? '#6bcb77' : '#e94560';
}
