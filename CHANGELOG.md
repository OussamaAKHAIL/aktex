# Changelog

## [Unreleased]

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
