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
│   │   ├── index.ts    # App entry, window creation
│   │   ├── compiler.ts # Spawn pdflatex / xelatex / biber, detect MiKTeX/TeX Live
│   │   └── synctex.ts  # Parse SyncTeX output for bidirectional sync
│   ├── renderer/       # Electron renderer process (browser context)
│   │   ├── index.html  # Shell HTML
│   │   ├── index.ts    # Renderer entry
│   │   ├── editor/
│   │   │   ├── editor.ts       # CodeMirror 6 setup + LaTeX autocomplete
│   │   │   └── latex-lang.ts   # LaTeX language support / completions
│   │   ├── pdf/
│   │   │   └── viewer.ts       # pdf.js integration + SyncTeX click handler
│   │   └── ui/
│   │       ├── toolbar.ts      # Top toolbar (compile button, settings…)
│   │       ├── filetree.ts     # Left sidebar: project file tree
│   │       └── theme.ts        # Claude-inspired dark theme tokens
│   └── preload/
│       └── preload.ts  # contextBridge: exposes IPC to renderer safely
├── assets/
│   └── icon.png        # App icon (512x512)
├── AGENTS.md           # ← you are here
├── CLAUDE.md           # Claude Code instructions (same content)
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
6. **Errors must surface to the user** — compiler errors go to a dedicated error panel in the UI, never silently swallowed.

## Key Behaviours to Implement

### Compiler Detection (compiler.ts)
On startup, search for `pdflatex` in these locations in order:
1. `PATH` environment variable
2. `C:\Program Files\MiKTeX\miktex\bin\x64\`
3. `C:\Program Files\MiKTeX 2.9\miktex\bin\x64\`
4. `C:\texlive\<year>\bin\win32\`
Show a friendly dialog if none found, with a link to https://miktex.org.

### Compile Flow
1. User clicks **Compile** (or presses `Ctrl+Enter`).
2. Main process saves the active file, then runs:
   ```
   pdflatex -synctex=1 -interaction=nonstopmode -output-directory=<project_dir> <main_tex_file>
   ```
3. If `.bib` files exist in the project, also run `biber` or `bibtex` then rerun `pdflatex` twice.
4. Stream stdout/stderr to the **Log panel** at the bottom.
5. On success, reload the PDF viewer.

### SyncTeX
- Editor → PDF: on cursor move, call `synctex view` and scroll PDF to that page/position.
- PDF → Editor: on click in PDF, call `synctex edit` and move editor cursor to that line.

### File Tree
- Shows all files in the currently open project folder.
- Right-click menu: New File, Rename, Delete.
- Clicking a `.tex` file opens it in the editor.

### ZIP Export / Import
- **Export:** zip the entire project folder → save as `<project-name>.zip`.
- **Import:** unzip to a chosen directory and open as a project.
  The zip structure must be compatible with Overleaf (flat or nested, main file named `main.tex`).

### Theme (Claude-inspired dark)
CSS custom properties to define in `theme.ts` / global CSS:
```
--bg-primary:    #1a1a2e   (deep navy, like Claude sidebar)
--bg-secondary:  #16213e
--bg-surface:    #0f3460
--accent:        #e94560   (Claude orange-red accent)
--text-primary:  #eaeaea
--text-muted:    #8892a4
--border:        #2a2a4a
--font-mono:     'JetBrains Mono', 'Fira Code', monospace
--font-ui:       'Inter', system-ui, sans-serif
```

## IPC Channels (preload bridge)
| Channel | Direction | Payload |
|---|---|---|
| `compile:start` | renderer → main | `{ mainFile: string }` |
| `compile:log` | main → renderer | `{ line: string, type: 'info'\|'error'\|'warning' }` |
| `compile:done` | main → renderer | `{ pdfPath: string \| null, success: boolean }` |
| `synctex:toEditor` | main → renderer | `{ file: string, line: number }` |
| `synctex:toPdf` | renderer → main | `{ file: string, line: number }` |
| `file:open` | renderer → main | `{ path: string }` |
| `file:save` | renderer → main | `{ path: string, content: string }` |
| `project:open` | renderer → main | — (opens dialog) |
| `project:export-zip` | renderer → main | — |
| `project:import-zip` | renderer → main | — |

## Build & Run
```bash
npm install
npm run dev        # start Electron in dev mode with hot reload
npm run build      # compile TypeScript
npm run dist       # package as .exe with electron-builder
```

## Open Source Notes
- License: MIT
- The repo should include a `CHANGELOG.md` and GitHub Actions workflow at
  `.github/workflows/build.yml` that builds the `.exe` on every push to `main`
  and attaches it to the GitHub Release.

## Progress

### Completed
- Implemented the Electron window, secure preload bridge, compiler discovery,
  asynchronous compile flow, compiler logs, and compiler-not-found guidance.
- Built the mockup-matched dark application shell: title bar, toolbar, project
  tree, CodeMirror editor, PDF pane, and Output/Problems panel.
- Added local project open/refresh, file read/save/create/rename/delete,
  project ZIP import/export, editor autosave, compile/stop controls, and the
  first pass of SyncTeX and PDF navigation wiring.
- Validated complete renderer-to-main IPC flow in the running Electron app
  and connected title bar controls (close, minimize, maximize).
- Completed runtime validation for local compiler discovery (TeX Live / MiKTeX),
  pdflatex, BibTeX, Biber, and multi-file projects.
- Upgraded PDF.js rendering to load directly via binary IPC buffers, resolving
  file URL and caching restrictions.
- Implemented accurate bidirectional SyncTeX: forward sync scrolls PDF to the
  exact vertical coordinate; reverse sync handles SyncTeX 1.5 path syntax and
  scrolls the editor to the matching file and line.
- Integrated CodeMirror 6 search panel (`Ctrl+F` and toolbar Find button).
- Added comprehensive end-to-end smoke test suite (`npm test`) validating compiler,
  PDF viewer, SyncTeX, and ZIP import/export in a single pass.

### Remaining
- Optional packaging and code signing verification for distribution.
