<p align="center">
  <img src="assets/launching logo.png" alt="AKTeX Logo" width="340"/>
</p>

<h1 align="center">AKTeX</h1>

<p align="center">
  A modern, offline LaTeX editor for Windows — built with Electron & TypeScript.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/platform-Windows-blue?style=flat-square&logo=windows" alt="Platform"/>
  <img src="https://img.shields.io/badge/built%20with-Electron-47848f?style=flat-square&logo=electron" alt="Electron"/>
  <img src="https://img.shields.io/badge/language-TypeScript-3178c6?style=flat-square&logo=typescript" alt="TypeScript"/>
  <img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="License"/>
</p>

---

## Overview

**AKTeX** is a fully offline desktop LaTeX editor for Windows that detects your local LaTeX installation (MiKTeX or TeX Live) and gives you a clean, distraction-free writing environment. It features a split-pane interface — code editor on the left, live PDF preview on the right — inspired by a dark, minimal aesthetic.

No internet required. No subscription. Just write and compile.

---

## Features

- **Resizable split-pane UI** — project tree + outline, CodeMirror 6 editor, and a pdf.js PDF viewer with draggable splitters
- **Automatic compiler detection** — finds MiKTeX or TeX Live on startup; guides you to install one if none is found
- **One-click compile** — press `Ctrl+Enter` or click Compile; streams stdout/stderr to a collapsible live Log panel
- **Bibliography support** — auto-detects `.bib` files and runs BibTeX / Biber as needed
- **High-resolution PDF viewer** — crisp DPR-aware rendering, lazy page loading, smooth fit-width / fit-page, and zoom by buttons, `Ctrl + wheel`, pinch, or keyboard
- **Two-click SyncTeX** — select code and press **To PDF** to jump and highlight the selection; click the PDF once and press **To code** (or double-click) to jump back
- **Visual line wrapping** — long code lines wrap to the widget width without inserting hard newlines
- **Outline widget** — live section navigation under the project tree
- **LaTeX tools** — offline KaTeX formula editor and viewer, plus an image inserter that copies files into `figures/` and builds `figure` environments
- **LaTeX autocomplete** — powered by a custom CodeMirror 6 language extension
- **Project file tree** — browse, create, rename, and delete files from the sidebar
- **ZIP import / export** — export your project as an Overleaf-compatible `.zip`, or import one directly
- **Autosave** — never lose a line of work
- **Dark theme** — a carefully tuned dark palette, supplied icon set, and a fading launch splash

---

## Getting Started

### Prerequisites

- **Node.js** v18 or later
- **npm** v9 or later
- A local LaTeX distribution: [MiKTeX](https://miktex.org) or [TeX Live](https://tug.org/texlive/)

### Install & Run

```bash
# Clone the repository
git clone https://github.com/OussamaAKHAIL/aktex.git
cd aktex

# Install dependencies
npm install

# Start in development mode
npm run dev

# Or launch the built app without watchers
npm start
```

`npm run dev` uses `scripts/start-electron.cjs`, which clears the
`ELECTRON_RUN_AS_NODE` environment variable before launching Electron. Some
terminals set that variable globally, which otherwise makes `electron .` run as
a Node script and no window appears. `npm run dev` also stops the watchers when
the app window closes.

### Build

```bash
# Compile TypeScript
npm run build

# Package as a Windows .exe installer
npm run dist
```

The packaged installer is written to `release/AKTeX-<version>-x64.exe`.

### Installer troubleshooting

The NSIS installer force-closes a running AKTeX copy before upgrading and clears
read-only attributes on the previous uninstaller files. This prevents the
typical “Error opening file for writing … uninstallerIcon.ico” and “AKTeX
cannot be closed” failures. If Windows still reports a locked file:

1. Close AKTeX from Task Manager (`AKTeX.exe`).
2. Re-run the installer.
3. The installer now runs per-machine (UAC prompt) and installs to
   `Program Files\AKTeX`, avoiding per-user AppData ACL/lock problems. If you
   still see a locked-file error, choose another directory on the installer's
   directory page.

---

## Keyboard Shortcuts

| Action | Shortcut |
|---|---|
| Compile | `Ctrl + Enter` |
| Save | `Ctrl + S` |
| Find | `Ctrl + F` |
| PDF zoom in / out / reset | `Ctrl + +` / `Ctrl + -` / `Ctrl + 0` |
| Code → PDF sync | `Ctrl + Alt + J` |
| PDF → code sync | `Ctrl + Alt + K` |

---

## Project Structure

```
aktex/
├── src/
│   ├── main/               # Electron main process (Node.js)
│   │   ├── index.ts        # App entry & window creation
│   │   ├── compiler.ts     # Compiler detection & pdflatex / biber runner
│   │   └── synctex.ts      # SyncTeX bidirectional sync
│   ├── renderer/           # Renderer process (browser context)
│   │   ├── index.html      # Shell, theme, splash and dialogs
│   │   ├── editor/         # CodeMirror 6 setup, wrapping, LaTeX support
│   │   ├── pdf/            # pdf.js viewer (zoom, lazy render, highlights)
│   │   └── ui/             # Icons, layout splitters, outline, tools, log panel
│   └── preload/
│       └── preload.ts      # Secure contextBridge IPC layer
├── assets/                 # App icons, logos, supplied icon sprite
├── scripts/                # Renderer build + Electron smoke test
├── electron-builder.yml
├── package.json
└── tsconfig.json
```

---

## CI / CD

Every push to `main` and every `v*` tag triggers a GitHub Actions workflow that builds and packages the Windows `.exe` installer. Pushes upload the installer as a workflow artifact; tag builds also attach it to the GitHub Release. The workflow runs `npm ci`, `npm run build`, `npm run package:win`, verifies the installer exists, and publishes with `contents: write` permission.

---

## Roadmap

- [x] Electron shell + secure IPC preload bridge
- [x] CodeMirror 6 editor with LaTeX autocomplete
- [x] Compiler detection (MiKTeX / TeX Live)
- [x] Async compile flow with live log streaming
- [x] pdf.js PDF viewer (binary IPC buffer loading)
- [x] Crisp, zoomable PDF viewer (buttons, Ctrl+wheel, pinch, fit width/page)
- [x] Two-click SyncTeX with PDF selection highlighting
- [x] Resizable panes, visual code wrapping, outline widget
- [x] Formula editor/viewer (KaTeX) and image inserter
- [x] Collapsible log terminal and supplied icon set
- [x] Launch splash with fade-in
- [x] Project file tree (create / rename / delete)
- [x] ZIP import / export (Overleaf-compatible)
- [x] End-to-end smoke test suite
- [x] Reliable `npm run dev` launch (clears `ELECTRON_RUN_AS_NODE`)
- [x] Installer force-closes running copies and recovers locked uninstaller files
- [ ] Code signing for Windows distribution

---

## Contributors

| | Name | Role |
|---|---|---|
| <img src="https://github.com/OussamaAKHAIL.png" width="60"/> | [Oussama AKHAIL](https://github.com/OussamaAKHAIL) | Creator & Lead Developer |

---

## License

MIT © [Oussama AKHAIL](https://github.com/OussamaAKHAIL)
