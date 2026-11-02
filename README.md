<p align="center">
  <img src="assets/logo.png" alt="AKTeX Logo" width="340"/>
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

- **Split-pane UI** — CodeMirror 6 editor alongside a pdf.js PDF viewer, side by side
- **Automatic compiler detection** — finds MiKTeX or TeX Live on startup; guides you to install one if none is found
- **One-click compile** — press `Ctrl+Enter` or click Compile; streams stdout/stderr to a live Log panel
- **Bibliography support** — auto-detects `.bib` files and runs BibTeX / Biber as needed
- **Bidirectional SyncTeX** — click in the editor to jump to the PDF; click in the PDF to jump back to the source line
- **LaTeX autocomplete** — powered by a custom CodeMirror 6 language extension
- **Project file tree** — browse, create, rename, and delete files from the sidebar
- **ZIP import / export** — export your project as an Overleaf-compatible `.zip`, or import one directly
- **Autosave** — never lose a line of work
- **Dark theme** — a carefully tuned dark palette easy on the eyes during long writing sessions

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
```

### Build

```bash
# Compile TypeScript
npm run build

# Package as a Windows .exe installer
npm run dist
```

The packaged installer will be output to the `dist/` folder.

---

## Keyboard Shortcuts

| Action | Shortcut |
|---|---|
| Compile | `Ctrl + Enter` |
| Save | `Ctrl + S` |
| Find | `Ctrl + F` |
| Open Project | `Ctrl + O` |

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
│   │   ├── index.html
│   │   ├── editor/         # CodeMirror 6 setup & LaTeX language support
│   │   ├── pdf/            # pdf.js integration
│   │   └── ui/             # Toolbar, file tree, theme tokens
│   └── preload/
│       └── preload.ts      # Secure contextBridge IPC layer
├── assets/                 # App icons & logo
├── scripts/
├── electron-builder.yml
├── package.json
└── tsconfig.json
```

---

## CI / CD

Every push to `main` triggers a GitHub Actions workflow that compiles the project and attaches a Windows `.exe` installer to the corresponding GitHub Release.

---

## Roadmap

- [x] Electron shell + secure IPC preload bridge
- [x] CodeMirror 6 editor with LaTeX autocomplete
- [x] Compiler detection (MiKTeX / TeX Live)
- [x] Async compile flow with live log streaming
- [x] pdf.js PDF viewer (binary IPC buffer loading)
- [x] Bidirectional SyncTeX
- [x] Project file tree (create / rename / delete)
- [x] ZIP import / export (Overleaf-compatible)
- [x] End-to-end smoke test suite
- [ ] Code signing for Windows distribution

---

## License

MIT © [Oussama AKHAIL](https://github.com/OussamaAKHAIL)
