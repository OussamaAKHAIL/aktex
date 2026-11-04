# Changelog

## [0.1.2] - 2026-11-04

### Added
- **Multi-file tabs** — open `main.tex`, `chap1.tex`, etc. at the same time and
  switch between them with close buttons, Chrome/Windows style. Each tab keeps
  its own in-memory buffer and autosaves on switch.
- **Include-aware outline** — the outline now follows `\input`, `\include` and
  `\subfile` recursively, so the full document structure shows even when
  chapters live in separate `.tex` files. Clicking an entry opens the right
  file and jumps to the heading.
- **Hover-to-preview math** — hovering over an inline/display equation in the
  editor shows a KaTeX preview near the cursor.

### Fixed
- **PDF text selection** — selecting text in the PDF no longer drops a SyncTeX
  anchor or starts waiting for the PDF→code second click. Only a clean click
  (no drag, no selection) arms the sync target.
- **Multi-line SyncTeX highlight** — a code→PDF selection spanning two or more
  lines now highlights every selected line (previously it could fail because
  the single-text search could not map across line breaks).
- **Formula preview errors** — the formula editor no longer renders a broken red
  KaTeX error inside the preview; it shows a friendly “preview unavailable”
  placeholder plus the error message below.
- **App icon** — `AKTeX.exe` now embeds the AKTeX icon via an `afterPack`
  rcedit hook instead of showing Electron's default icon (taskbar/explorer).
- **Title bar logo** — the title bar now shows the actual `logo.png` asset
  instead of the text wordmark.

## [0.1.1] - 2026-11-04

### Added
- Initial project scaffold with Electron + TypeScript
- Split-pane UI: CodeMirror 6 editor (left) + pdf.js viewer (right)
- LaTeX compiler detection (MiKTeX / TeX Live)
- Two-click SyncTeX (selection → PDF highlight, PDF click → source line)
- LaTeX autocomplete (CodeMirror 6)
- Bibliography support (BibTeX / Biber)
- Project file tree sidebar
- Live outline widget with section navigation
- Resizable project / editor / PDF / outline / log panes
- Visual code line wrapping (no source mutation)
- Crisp, zoomable PDF viewer (buttons, `Ctrl`+wheel, pinch, fit width/page)
- Offline KaTeX formula editor and formula viewer
- Image inserter with automatic `figures/` copy and `figure` environment
- Collapsible Output/Problems terminal
- Supplied icon set as an inline SVG sprite
- Launch splash with the supplied logo and fade-in
- ZIP export/import (Overleaf-compatible)
- Claude-inspired dark theme
- GitHub Actions CI: builds `.exe` on every push and release tag

### Fixed
- GitHub Actions packaging: pinned `@types/archiver`, removed the CI-only
  install step, added release permissions, and disabled unsigned executable
  editing so `winCodeSign` symlink extraction cannot break the build.
- `npm run dev` / `npm start` now clear `ELECTRON_RUN_AS_NODE` before launching
  Electron, so a window always opens; `concurrently -k` stops watchers when the
  app closes, and startup failures reveal the window instead of staying hidden.
- NSIS upgrades over a running AKTeX: custom installer hooks force-close the
  app and stale uninstaller and clear read-only uninstaller files, fixing
  “Error opening file for writing” and “AKTeX cannot be closed” failures.
- PDF viewer blurriness and image scaling (device-pixel-ratio rendering).
- SyncTeX on Windows: forward slashes in argument paths and correct selection
  box parsing.
