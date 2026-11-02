# AKTeX — Agent Instructions

## Project Overview
AKTeX is a desktop LaTeX editor for Windows built with Electron + TypeScript.
It works fully offline, detects a local LaTeX compiler (MiKTeX or TeX Live),
and provides a split-pane UI (code editor left, PDF preview right) inspired by
Claude's dark aesthetic.

## Tech Stack
- **Runtime:** Electron (latest stable)
- **Language:** TypeScript (strict mode)
- **Editor:** CodeMirror 6 with a LaTeX language extension
- **PDF viewer:** pdf.js (pdfjs-dist)
- **Build/bundle:** electron-builder (outputs `.exe` installer for Windows)
- **Package manager:** npm

## Repository Layout
```
aktext/
├── src/
│   ├── main/           # Electron main process (Node.js)
│   │   ├── index.ts    # App entry, window creation, IPC handlers
│   │   ├── compiler.ts # Spawn pdflatex / biber / bibtex, detect MiKTeX/TeX Live
│   │   └── synctex.ts  # Parse SyncTeX output for bidirectional sync
│   ├── renderer/       # Electron renderer process (browser context)
│   │   ├── index.html  # Shell HTML (single canvas-free PDF pane)
│   │   ├── index.ts    # Renderer orchestration entry point
│   │   ├── editor/
│   │   │   ├── editor.ts       # CodeMirror 6 setup + LaTeX autocomplete
│   │   │   └── latex-lang.ts   # LaTeX language support / completions
│   │   ├── pdf/
│   │   │   └── viewer.ts       # pdf.js continuous-scroll viewer
│   │   └── ui/
│   │       ├── toolbar.ts      # Top toolbar (compile button, settings…)
│   │       ├── filetree.ts     # Left sidebar: project file tree
│   │       └── theme.ts        # Claude-inspired dark theme tokens
│   └── preload/
│       └── preload.ts  # contextBridge: exposes IPC to renderer safely
├── assets/
│   └── icon.png        # App icon (512x512)
├── AGENTS.md           # ← you are here (also copied as CLAUDE.md)
├── CLAUDE.md           # Claude Code instructions (same content as AGENTS.md)
├── package.json
├── tsconfig.json
├── electron-builder.yml
└── .gitignore
```

## Coding Rules (follow strictly)
1. **TypeScript strict mode** — no `any`, no `@ts-ignore`.
2. **IPC only through preload** — renderer never uses `require('electron')` directly.
3. **Never block the main process** — all compiler invocations use `child_process.spawn` (not `execSync`).
4. **One file, one concern** — keep compiler logic in `compiler.ts`, synctex in `synctex.ts`, etc.
5. **No internet calls at runtime** — everything runs locally.
6. **Errors must surface to the user** — compiler errors go to the Output/Problems panel, never silently swallowed.

## Key Behaviours

### Compiler Detection (`compiler.ts`)
Search order (async, non-blocking):
1. TeX Live at `C:\texlive\<year>\bin\windows` (newest year first, then `win64`, `win32`)
2. `PATH` environment variable
3. `C:\Users\<user>\AppData\Local\Programs\MiKTeX\miktex\bin\x64\`
4. `C:\Program Files\MiKTeX\miktex\bin\x64\`
5. `C:\Program Files\MiKTeX 2.9\miktex\bin\x64\`

Each candidate is validated by running `pdflatex --version` (2-second timeout).
Show a friendly dialog if none found, with a link to https://miktex.org.

### Compile Flow
1. User clicks **Compile** or presses `Ctrl+Enter`.
2. Main process saves the active file, then runs:
   ```
   pdflatex -synctex=1 -interaction=nonstopmode -output-directory=<project_dir> <main_tex_file>
   ```
   For MiKTeX, also adds `--miktex-disable-installer --c-style-errors`.
3. **Success is determined by whether the PDF file exists on disk**, NOT by exit code alone.
   LaTeX often returns non-zero exit codes for warnings (missing images, etc.) while still
   producing a valid PDF. Always check `fs.existsSync(pdfPath)` as the true success criterion.
4. If `.bib` files exist, also run `biber` (preferred) or `bibtex`, then rerun `pdflatex` twice.
   Biber is chosen when a `.bcf` file exists; fall back to `bibtex` if `biber.exe` is absent.
5. Stream stdout/stderr to the **Output** panel at the bottom.
6. On success, reload the continuous-scroll PDF viewer.
7. `stopCompilation()` kills the active child process immediately.

### PDF Viewer (`src/renderer/pdf/viewer.ts`)
Continuous-scroll Overleaf-style viewer — **no next/previous page buttons**.

Key design decisions:
- All pages are rendered into individual `<canvas data-page="N">` elements inside `.pdf-page-wrapper` divs appended to `#pdf-scroll`.
- `renderVersion` counter cancels stale renders when the user recompiles mid-render.
- **Scroll-based page tracking**: a `scroll` event listener on `#pdf-scroll` finds the canvas whose wrapper midpoint is closest to the container's vertical midpoint and fires `_onPageChange(page, total)`.
- **Pinch-to-zoom**: `touchstart`/`touchmove` listeners on `#pdf-scroll` detect two-finger distance changes, update `currentScale`, and re-render all pages. Re-renders are throttled (only when scale delta > 0.04). Works on touch-enabled Windows laptops and tablets.
- Listeners (`scroll` tracker + pinch zoom) are attached once via `container.dataset.listenersAttached` guard.

Public API:
```typescript
loadPdf(pdfPath: string): Promise<PdfViewState>
getPdfState(): PdfViewState
changeScale(delta: number): Promise<PdfViewState>   // used by + / − buttons
scrollToPage(pageNumber: number): Promise<void>
scrollToPosition(page: number, x: number, y: number): Promise<void>  // SyncTeX
setSyncTexClickHandler(handler): void   // PDF click → editor
setPageChangeHandler(handler): void     // fires on scroll with current page
```

`PdfViewState = { page: number; pages: number; scale: number }`

### PDF Toolbar (`index.html` `#pdf-pane`)
Only zoom controls + page counter. **No prev/next page buttons.**
```html
<button id="btn-zoom-out">−</button>
<span id="zoom-level">100%</span>
<button id="btn-zoom-in">＋</button>
<span id="pdf-page-info"></span>   <!-- updated by setPageChangeHandler -->
```

### SyncTeX
- **Editor → PDF**: on cursor move (debounced 350ms), call `synctex view -i <line>:<col>:<texfile> -o <pdffile>`, then `scrollToPosition(page, x, y)`.
- **PDF → Editor**: on canvas click, call `synctex edit -o <page>:<x>:<y>:<pdffile>`, then scroll editor to matching line.

### File Tree
- Shows all files in the currently open project folder (excludes `node_modules`, `.git`, `dist`, `release`).
- Right-click context menu: New File, Rename, Delete.
- Clicking a `.tex` / `.bib` / `.sty` / `.cls` / `.txt` file opens it in the editor.
- Auto-selects `main.tex` as the main file when opening a project.

### ZIP Export / Import
- **Export:** zip the entire project folder → save as `<project-name>.zip` (Overleaf-compatible).
- **Import:** unzip to a chosen directory, then open as a project.

### Theme (Claude-inspired dark)
```
--bg-base:       #141414
--bg-panel:      #1c1c1c
--bg-surface:    #242424
--bg-active:     #2e2e2e
--border:        #2f2f2f
--text-primary:  #ede8dc
--text-muted:    #7a7a7a
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
| `compile:log` | main → renderer | `{ line: string, type: 'info'\|'error'\|'warning' }` |
| `compile:done` | main → renderer | `{ pdfPath: string \| null, success: boolean }` |
| `compiler:status` | main → renderer | `{ available: boolean, label: string }` |
| `compiler:status-get` | renderer → main (handle) | — → `{ available, label }` |
| `compile:stop` | renderer → main | — |
| `synctex:toPdf` | renderer → main | `{ file: string, line: number }` |
| `synctex:toEditor` | main → renderer | `{ file: string, line: number }` |
| `synctex:pdfPosition` | main → renderer | `{ page, x, y }` |
| `file:read` | renderer → main (handle) | `filePath: string` |
| `file:read-binary` | renderer → main (handle) | `filePath: string` → `Uint8Array` |
| `file:open` | renderer → main (handle) | `{ path: string }` |
| `file:save` | renderer → main (handle) | `{ path: string, content: string }` |
| `file:create` | renderer → main (handle) | `directory: string` → `string \| null` |
| `file:rename` | renderer → main (handle) | `filePath: string` → `string \| null` |
| `file:delete` | renderer → main (handle) | `filePath: string` → `boolean` |
| `project:open` | renderer → main (handle) | — → `ProjectPayload \| null` |
| `project:refresh` | renderer → main (handle) | — → `ProjectPayload \| null` |
| `project:export-zip` | renderer → main (handle) | — → `boolean` |
| `project:import-zip` | renderer → main (handle) | — → `ProjectPayload \| null` |
| `compiler:install-help` | renderer → main | — (opens miktex.org) |
| `window:close` | renderer → main | — |
| `window:minimize` | renderer → main | — |
| `window:maximize` | renderer → main | — |

## Build & Run
```bash
npm install
npm run build      # compile TypeScript (tsc)
npm run dev        # start Electron in dev mode
npm run dist       # package as .exe with electron-builder
npm test           # run end-to-end smoke test (--smoke-test flag)
```

After `npm run build`, manually copy the HTML shell:
```
mkdir dist\renderer
copy src\renderer\index.html dist\renderer\index.html
```
(tsc does not copy `.html` files — this step is required before `npm run dev`)

## Open Source Notes
- License: MIT
- GitHub Actions workflow at `.github/workflows/build.yml` builds the `.exe` on every push to `main` and on tags, and attaches it to the GitHub Release.

## Progress

### Completed
- Electron window, secure preload bridge (contextBridge), IPC handlers for all channels.
- Split-pane dark UI: title bar, toolbar, project file tree, CodeMirror 6 editor, PDF pane, Output/Problems log panel.
- Compiler detection: async scan of TeX Live (newest year first) then PATH then MiKTeX paths; validated with `pdflatex --version`.
- Full compile flow: pdflatex → biber/bibtex → pdflatex ×2 (when .bib present); streams logs live.
- **Compilation success fix**: checks `fs.existsSync(pdfPath)` instead of exit code — LaTeX returns non-zero on warnings but still produces a valid PDF.
- Local project open/refresh, file CRUD (create/rename/delete), autosave on edit (550ms debounce).
- ZIP export (archiver) and import (unzipper), Overleaf-compatible structure.
- **Continuous-scroll PDF viewer**: all pages rendered as stacked canvases in a scrollable container (Overleaf-style, no next/prev buttons).
- **Scroll-based page counter**: fires on scroll, shows `N / Total` in toolbar.
- **Pinch-to-zoom**: two-finger touch gesture rescales all pages; throttled to avoid excessive re-renders.
- Zoom in/out buttons (± 10% per click).
- Bidirectional SyncTeX: forward (editor → PDF, scrolls to exact position) and reverse (PDF click → editor line).
- CodeMirror 6 search panel (Ctrl+F and toolbar Find button).
- End-to-end smoke test suite (`npm test`) covering compiler, PDF, SyncTeX, ZIP.
- GitHub Actions CI workflow producing `.exe` artifact on push to main.

### Remaining
- Optional: code-signing for Windows distribution (requires a certificate).
- Optional: settings panel (font size, theme toggle, default compiler selection).