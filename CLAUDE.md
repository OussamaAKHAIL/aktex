# AKTeX — Agent Instructions

## Project Overview

AKTeX is a desktop LaTeX editor for Windows built with Electron + TypeScript.
It works fully offline, detects a local LaTeX compiler (MiKTeX or TeX Live),
and provides a resizable split-pane UI (project tree + outline on the left,
code editor with a LaTeX tool strip in the middle, PDF preview on the right,
collapsible output terminal at the bottom) inspired by Claude's dark aesthetic.

## Tech Stack

- **Runtime:** Electron 30
- **Language:** TypeScript (strict mode)
- **Editor:** CodeMirror 6 with a LaTeX language extension and visual line wrapping
- **PDF viewer:** pdf.js (`pdfjs-dist`), lazy-rendered, DPR-aware canvases
- **Math preview:** KaTeX (bundled offline with its fonts)
- **Build/bundle:** native esbuild CLI, electron-builder (NSIS `.exe`)
- **Package manager:** npm

## Repository Layout

```
aktex/
├── src/
│   ├── main/                  # Electron main process (Node.js)
│   │   ├── index.ts           # Window creation, IPC, project/file/zip/image APIs
│   │   ├── compiler.ts        # Spawn pdflatex / biber / bibtex; detect MiKTeX/TeX Live
│   │   └── synctex.ts         # Forward/reverse SyncTeX, range boxes for highlights
│   ├── preload/
│   │   └── preload.ts         # contextBridge: exposes typed IPC to renderer
│   ├── renderer/
│   │   ├── index.html         # App shell, theme, dialogs, splash markup
│   │   ├── index.ts           # Renderer orchestration
│   │   ├── editor/
│   │   │   ├── editor.ts      # CodeMirror setup, wrapping, selection/insert helpers
│   │   │   └── latex-lang.ts  # LaTeX language support / completions
│   │   ├── pdf/
│   │   │   └── viewer.ts      # Continuous, lazy, zoomable, DPR-aware PDF viewer
│   │   └── ui/
│   │       ├── icons.ts       # Inline SVG sprite (supplied icon set + tool glyphs)
│   │       ├── layout.ts      # Resizable splitters, persisted pane sizes
│   │       ├── logpanel.ts    # Collapsible Output/Problems terminal
│   │       ├── outline.ts     # LaTeX section parser + outline widget
│   │       ├── formula.ts     # Formula editor + formula viewer (KaTeX)
│   │       ├── image-insert.ts# Image picker / figure builder
│   │       ├── splash.ts      # Launch fade-in
│   │       ├── toast.ts       # Transient notifications
│   │       └── theme.ts       # Theme tokens (legacy helper)
├── assets/
│   ├── icon.png               # Original app icon
│   ├── icon-512.png           # Square 512×512 app icon
│   ├── icon.ico               # Windows installer/exe icon
│   ├── launching logo.png     # Splash logo (transparent PNG)
│   ├── logo.png               # Transparent wordmark
│   ├── interface icons/       # Supplied SVG icon sprite
│   └── functionalities design/# Feature reference screenshots + spec
├── scripts/
│   ├── build-renderer.mjs     # Copies assets, bundles renderer with esbuild
│   └── smoke-test.cjs         # Launches Electron in --smoke-test mode
├── AGENTS.md                  # ← you are here
├── CLAUDE.md                  # Same instructions (kept in sync)
├── package.json
├── tsconfig.json
├── electron-builder.yml
└── .github/workflows/build.yml
```

## Coding Rules (follow strictly)

1. **TypeScript strict mode** — no `any`, no `@ts-ignore`.
2. **IPC only through preload** — the renderer never uses `require('electron')`.
3. **Never block the main process** — compiler/SyncTeX invocations use
   `child_process.spawn` (never `execSync`).
4. **One file, one concern** — compiler in `compiler.ts`, SyncTeX in
   `synctex.ts`, PDF rendering in `viewer.ts`, tools in their own `ui/` files.
5. **No internet calls at runtime** — everything runs locally. KaTeX and all
   fonts are bundled; the worker is copied into `dist/renderer`.
6. **Errors must surface to the user** — compiler/SyncTeX/tool errors go to the
   log panel or a toast, never silently swallowed.
7. **Do not mutate documents for visual formatting** — long code lines wrap
   visually through CodeMirror's `EditorView.lineWrapping`; never insert hard
   newlines into the source.

## Key Behaviours

### Compiler Detection (`src/main/compiler.ts`)

Search order (async, non-blocking):
1. TeX Live at `C:\texlive\<year>\bin\windows` (newest year first, then
   `win64`, `win32`)
2. `PATH` environment variable
3. `C:\Users\<user>\AppData\Local\Programs\MiKTeX\miktex\bin\x64\`
4. `C:\Program Files\MiKTeX\miktex\bin\x64\`
5. `C:\Program Files\MiKTeX 2.9\miktex\bin\x64\`

Each candidate is validated by running `pdflatex --version` (2-second timeout).
A friendly dialog points to https://miktex.org when none is found.

### Compile Flow

1. User clicks **Compile** or presses `Ctrl+Enter`.
2. The active file is saved, then:
   ```
   pdflatex -synctex=1 -interaction=nonstopmode -output-directory=<project_dir> <main_tex_file>
   ```
   For MiKTeX, `--miktex-disable-installer --c-style-errors` are added.
3. **Success is determined by `fs.existsSync(pdfPath)`**, not the exit code.
   LaTeX returns non-zero for warnings while still producing a valid PDF.
4. If `.bib` files exist: run `biber` (preferred when a `.bcf` exists) or
   `bibtex`, then run `pdflatex` twice more.
5. Logs stream to the **Output** panel; compile start automatically expands a
   collapsed log panel.
6. On success the PDF viewer reloads while preserving the current zoom level.
7. `stopCompilation()` kills the active child process.

### Editor and Layout

- CodeMirror 6 with LaTeX syntax, autocomplete, history, search and
  `EditorView.lineWrapping`. Wrapping is visual only.
- Draggable splitters resize:
  - sidebar ↔ editor,
  - code editor ↔ PDF pane,
  - project tree ↔ outline,
  - log panel ↔ workspace.
- Pane sizes and collapsed states persist in `localStorage`.
- Double-click a splitter resets it; arrow keys resize when focused.
- The outline updates on a 420 ms debounce while typing and immediately when a
  file is opened.

### PDF Viewer (`src/renderer/pdf/viewer.ts`)

- Continuous vertical scroll; no previous/next page buttons.
- Page placeholders are created for the whole document, but only pages near the
  viewport are rendered (`IntersectionObserver`). Distant canvases are released
  to keep memory bounded.
- **High-resolution rendering:** each canvas is rendered at
  `max(devicePixelRatio, 1.5)` (capped at 2.5) and displayed at CSS size, which
  fixes blurry text on high-DPI and standard displays.
- **Zoom inputs:**
  - `+` / `−` toolbar buttons,
  - `Ctrl` + mouse wheel / trackpad pinch,
  - two-finger touch pinch,
  - `Ctrl` + `+`, `Ctrl` + `-`, `Ctrl` + `0`,
  - **Fit width** / **Fit page** buttons,
  - click the zoom percentage to reset to 100%.
- Zoom is anchored at the pointer (wheel/pinch) or viewport centre (buttons),
  and page bitmaps are re-rendered crisp after the gesture settles.
- Text layer enables native PDF text selection and copy.
- Scroll position is tracked to update `N / Total` in the toolbar.

Public API:
```typescript
loadPdf(pdfPath: string): Promise<PdfViewState>
getPdfState(): PdfViewState
zoomIn(): PdfViewState
zoomOut(): PdfViewState
setZoom(scale: number): PdfViewState
fitWidth(): PdfViewState
fitPage(): PdfViewState
resetZoom(): PdfViewState
scrollToPage(page: number): Promise<void>
scrollToPosition(page, x, y, boxes?, sourceText?): Promise<void>
showSyncHighlights(boxes: PdfSyncBox[]): void
showSyncMarker(page, x, y, timeout?): void
setPageChangeHandler(handler): void
setZoomChangeHandler(handler): void
setSyncTexHandlers({ onClick, onDoubleClick }): void
```
`PdfViewState = { page; pages; scale }`

### SyncTeX (two-click workflow)

Automatic cursor-to-PDF syncing is intentionally removed. Sync is deliberate:

- **Code → PDF:** select text (or place the cursor), then click **To PDF** in
  the code tool strip. The editor selection is sent as
  `{ file, startLine, startCh, endLine, endCh }`; the PDF scrolls to the target
  and highlights the selected source range (a cursor highlights its line).
- **PDF → code:** click once in the PDF to place a sync marker, then click
  **To code** (or double-click the PDF for a two-click jump). The editor opens
  the matching file, scrolls to the line and selects it.
- Keyboard shortcuts: `Ctrl+Alt+J` (code → PDF) and `Ctrl+Alt+K` (PDF → code).
- `src/main/synctex.ts` normalises Windows paths to forward slashes because
  SyncTeX's colon-separated arguments mis-handle `C:\…`. It reads the source
  file to proportionally clip the line box to the selected code-point range.
- For a tighter highlight, the viewer also searches the PDF.js text layer for
  the selected (plain-text) source and draws a DOM Range rectangle over the
  exact characters. The SyncTeX box is used as a fallback when the text cannot
  be matched (math-heavy or multi-line selections).

### Code Tool Strip

A toolbar above the editor mirrors the supplied design. Implemented tools:

1. **Formula Editor** (`#btn-formula-editor`) — modal with category palettes,
   selection-aware snippet insertion, KaTeX live preview, block/inline style,
   environment wrapper, “Add to My Formula” (localStorage), Copy, Insert, and a
   “Recognize from Image” placeholder tab. Escape closes; `Ctrl+Enter` inserts.
2. **Formula Viewer** (`#btn-formula-viewer`) — previews the selected LaTeX (or
   the current line) in a floating KaTeX panel with a copy action.
3. **Insert Image** (`#btn-image`) — picks an image, copies it into
   `<project>/figures/`, previews it from a blob URL, and inserts
   `\includegraphics` or a full `figure` environment with width/placement,
   caption and label. Warns when `graphicx` is not detected.

Undo/redo and **To PDF** are also active. AI, magic, reference, table, inline
edit, symbols and settings are visible but disabled with “coming in a future
update” tooltips.

### Outline Widget

`src/renderer/ui/outline.ts` parses `\part`, `\chapter`, `\section`,
`\subsection`, `\subsubsection`, `\paragraph` and `\subparagraph` (including
starred forms and optional short titles), ignores comments, and renders an
indented clickable list under the project tree. Clicking a heading selects and
scrolls to that line. The panel can be collapsed and resized.

### Log Terminal

- Output and Problems tabs.
- Collapsible from the title bar, the log header, or by compiling.
- Draggable height; collapsed state persists.
- Problems filters info lines; error count appears in the tab.

### File Tree / ZIP

- Shows all project files (excludes `node_modules`, `.git`, `dist`, `release`).
- Right-click: New File, Rename, Delete.
- Opens `.tex`, `.bib`, `.sty`, `.cls`, `.txt`.
- Auto-selects `main.tex` when opening a project.
- ZIP export/import is Overleaf-compatible.

### Icons and Splash

- `src/renderer/ui/icons.ts` embeds the supplied icon sprite inline (so it works
  from `file://` without CORS issues) and exposes `icon(name)`.
- The launch splash uses `assets/launching logo.png`, copied to
  `dist/renderer/launching-logo.png`; it fades in and out over the dark shell.

### Theme (Claude-inspired dark)

```
--bg-base:       #141414
--bg-panel:      #1c1c1c
--bg-surface:    #242424
--bg-active:     #2e2e2e
--border:        #2f2f2f
--text-primary:  #ede8dc
--text-muted:    #8d8a83
--accent:        #c8742a
--accent-bright: #e08535
--log-error:     #e05555
--log-warn:      #d4a017
--log-ok:        #5cad6e
--font-display:  Georgia, serif
--font-ui:       Inter, system-ui, sans-serif
--font-mono:     'JetBrains Mono', Consolas, monospace
```

## IPC Channels (preload bridge)

| Channel | Direction | Payload |
|---|---|---|
| `compile:start` | renderer → main | `{ mainFile: string }` |
| `compile:log` | main → renderer | `{ line, type }` |
| `compile:done` | main → renderer | `{ pdfPath, success }` |
| `compiler:status` | main → renderer | `{ available, label }` |
| `compiler:status-get` | renderer → main (handle) | — → `{ available, label }` |
| `compile:stop` | renderer → main | — |
| `synctex:toPdf` | renderer → main | `{ file, startLine, startCh, endLine, endCh }` |
| `synctex:pdfPosition` | main → renderer | `{ page, x, y, width, height, boxes[] }` |
| `synctex:toEditor` | renderer → main | `{ pdfPath, page, x, y }` |
| `synctex:toEditor` | main → renderer | `{ file, line, column }` |
| `synctex:failed` | main → renderer | `{ message }` |
| `file:read` | renderer → main (handle) | `filePath` → `string` |
| `file:read-binary` | renderer → main (handle) | `filePath` → `Uint8Array` |
| `file:open` | renderer → main (handle) | `{ path }` → `string` |
| `file:save` | renderer → main (handle) | `{ path, content }` |
| `file:create` | renderer → main (handle) | `directory` → `string \| null` |
| `file:rename` | renderer → main (handle) | `filePath` → `string \| null` |
| `file:delete` | renderer → main (handle) | `filePath` → `boolean` |
| `project:open` | renderer → main (handle) | — → `ProjectPayload \| null` |
| `project:refresh` | renderer → main (handle) | — → `ProjectPayload \| null` |
| `project:current` | renderer → main (handle) | — → `ProjectPayload \| null` |
| `project:export-zip` | renderer → main (handle) | — → `boolean` |
| `project:import-zip` | renderer → main (handle) | — → `ProjectPayload \| null` |
| `image:pick` | renderer → main (handle) | — → `{ path, name } \| null` |
| `image:import` | renderer → main (handle) | `{ sourcePath, projectPath }` → `{ absolutePath, relativePath } \| null` |
| `compiler:install-help` | renderer → main | — |
| `window:close` | renderer → main | — |
| `window:minimize` | renderer → main | — |
| `window:maximize` | renderer → main | — |

## Build & Run

```bash
npm install
npm run build       # tsc --noEmit + main/preload tsc + esbuild renderer
npm run dev         # watch main/renderer + start Electron
npm test            # build then run the Electron smoke test (needs a local TeX)
npm run dist        # build + electron-builder installer
npm run package:win # electron-builder only (CI uses build + this)
```

`scripts/build-renderer.mjs` copies `index.html`, the PDF worker, KaTeX CSS and
fonts, and the splash logo, then invokes the **native esbuild CLI through Node
with inherited stdio**. This avoids the piped esbuild service (which fails in
restricted environments) and keeps the GitHub build deterministic.

Installer output: `release/AKTeX-<version>-x64.exe`.

### Debug / visual-check flags

These are development-only and do not affect normal launches:

```bash
electron . --project=<dir> --screenshot=<file> [--compile] [--zoom] [--sync]
           [--open-tool=formula] [--formula-demo] [--shot-delay=900]
           --no-sandbox --disable-gpu
```

`--sync` selects a test range on line 5 before invoking the two-click sync;
`--open-tool=formula` opens the formula editor and `--formula-demo` fills it
with a sample formula for screenshot checks.

## GitHub Actions

`.github/workflows/build.yml` runs on pushes/PRs to `main` and on `v*` tags:

1. `npm ci`
2. `npm run build`
3. `npm run package:win` with `CSC_IDENTITY_AUTO_DISCOVERY=false` and
   `TMP`/`TEMP` pointed at `runner.temp`
4. verify `release/*.exe`
5. upload the installer
6. on tags, create a GitHub Release (workflow has `contents: write` permission)

`electron-builder.yml` sets `signAndEditExecutable: false` because the project is
unsigned and the `winCodeSign` archive contains macOS symlinks that cannot be
extracted on Windows without symlink privileges. This keeps CI packaging
reproducible. The installer still uses `assets/icon.ico` for the NSIS UI.

## Progress

### Completed

- Electron window, secure preload bridge, all IPC handlers.
- Compiler discovery (TeX Live → PATH → MiKTeX), async compile flow with
  biber/bibtex, streamed logs, PDF-existence success criterion.
- Project open/refresh, file CRUD, autosave, ZIP import/export.
- **PDF viewer rework:** lazy page rendering, DPR-aware crisp canvases,
  robust zoom (buttons, Ctrl+wheel, pinch, keyboard, fit width/page), anchored
  zoom, page tracking, text layer.
- **Two-click SyncTeX** with forward selection highlighting and reverse
  line selection; Windows path normalisation.
- Resizable sidebar/editor/PDF/outline/log panes with persisted sizes.
- Visual code wrapping (no document mutation).
- Outline widget with parser and live updates.
- Code tool strip: formula editor (KaTeX, categories, environment/style, saved
  formulas), formula viewer, image inserter; remaining tools visibly disabled.
- Collapsible Output/Problems terminal.
- Supplied icon set integrated as an inline sprite.
- Launch fade-in with the supplied launching logo.
- Smoke test updated for the new UI (compiler, SyncTeX, ZIP, bridge).
- GitHub Actions packaging fixed and verified locally (NSIS installer builds).

### Remaining

- Optional code signing certificate for public distribution.
- Optional settings panel (font size, theme, default compiler).
- Future tools: AI assistant, magic tools, reference insertion, table generator,
  inline edit, symbol picker, settings.
- Optional OCR/image recognition tab in the formula editor.
