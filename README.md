# Du Kích Studio (`dukich-studio`)

**Local-first editorial slide presenter, document viewer (PDF / Word / PowerPoint), interactive quiz engine, and infinite whiteboard built for teachers, trainers, and presenters.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Built with Vite](https://img.shields.io/badge/Vite-6.x-646CFF.svg)](https://vite.dev/)
[![Local First](https://img.shields.io/badge/Storage-Local%20First-2E7D32.svg)](#project-structure)

No cloud lock-in, no subscriptions, no database setup. Your decks, documents, and whiteboards live as plain files inside your local folder and run directly in the browser on `http://localhost:5288/`.

![Du Kích Studio Launcher](docs/screenshots/launcher.png)

---

## Key Features

- **Editorial 16:9 Slide Deck & Slide Studio (`E`)**: 7 structured layouts on a toggleable graph-paper canvas (`G`), animated highlighter sweeps, docked live editor with Undo/Redo, drag-and-drop image upload, and drag-to-reorder slide bar.
- **Interactive Question Engine**: 4 question groups (True/False & inline fill-in, two-column matching, tables/summaries/flow-charts/diagrams, and single/multi-choice) with independent step-by-step Evidence and Answer reveals.
- **Documents Presenter (`Docs`)**: Fullscreen read-only presenter for **PDF**, **PowerPoint (`.pptx`, `.ppt`)**, and **Word (`.docx`, `.doc`)** with `1P/2P` spread view, `60%-300%` zoom, 6-column thumbnail grid, and persistent per-page annotations.
- **Infinite Canvas Whiteboard (`Board`)**: White-labeled Excalidraw canvas with local save (`Ctrl+S` + auto-save), PNG export, custom grouped Shape & Laser tools (`Default Laser` + `Particle Laser`), smart text-matched Highlighter (`H`), and an instant overlay launcher right from the Slide/Document footer.
- **Live Teacher Tools**: Techno Particle Laser (`L`), Pen (`P`), Rectangle Box (`R`), Text Note (`T`), Highlighter (`H`), Spotlight (`S`), multi-tab Floating Note Boxes (`N`), and Mini Timer (`M`) with gentle chime.
- **4 Curated Color Palettes (Light & Dark)**: Summer Vibe, Deep Lake, Starry Night, and Neon Tokyo - all synced across Launcher, Slides, Documents, Whiteboard, and `brandsheet.html`.

<p>
  <img src="docs/screenshots/slide-deck.png" alt="Editorial 16:9 Slide Deck" width="49%" />
  <img src="docs/screenshots/whiteboard.png" alt="Whiteboard Infinite Canvas" width="49%" />
</p>

---

## Quick Start

### Option A: Guided Setup with an AI Agent (Recommended for Teachers & Creators)

If you prefer not to edit config files manually, open this repository in **Antigravity, Claude Code, Cursor, Codex, or Windsurf** and send this single prompt:

> *"Tải repo https://github.com/trungo0512/dukich-studio về máy (hoặc mở thư mục hiện tại), đọc `SETUP_AGENT.md` và tiến hành setup cho tôi."*

Your AI Agent will automatically check Node.js, ask whether you want optional LibreOffice support for Word files, personalize your brand name, logo, and color palette, install packages, and start `http://localhost:5288/`.

### Option B: Developer Setup

Requires **Node.js >= 18**.

```bash
git clone https://github.com/trungo0512/dukich-studio.git
cd dukich-studio
npm install
npm run dev
```

Open:
- App Launcher: `http://localhost:5288/`
- Design System & Palette Brandsheet: `http://localhost:5288/brandsheet.html`

> **Optional Word (`.docx`/`.doc`) conversion:** PDF and PowerPoint (`.pptx` via Microsoft PowerPoint on Windows or built-in JS fallback) work out of the box. For pixel-accurate Word rendering inside Documents, install [LibreOffice](https://www.libreoffice.org/download/download-libreoffice/) (free).

---

## Keyboard Shortcuts

| Context | Key | Action |
|---|---|---|
| **Slides / Docs** | `←` / `→` | Previous / Next slide or page |
| **Slides / Docs** | `G` / `F` | Toggle Graph Grid / Fullscreen |
| **Slides** | `E` | Open / Close Slide Studio Editor |
| **Teacher Tools** | `V` / `L` / `P` / `R` / `T` / `H` / `S` | Hand / Laser / Pen / Box / Text / Highlighter / Spotlight |
| **Classroom Widgets** | `N` / `M` | Spawn Floating Note Box / Toggle Mini Timer |
| **Whiteboard** | `V` / `Q` / `R` / `D` / `O` / `P` / `T` / `H` / `L` | Hand / Select / Rect / Diamond / Ellipse / Pen / Text / Smart Highlighter / Laser |
| **Editing** | `Ctrl+Z` / `Ctrl+S` | Undo / Save immediately |

---

## Project Structure

```text
dukich-studio/
├── assets/images/        # Light & Dark brand logos (SVG or PNG)
├── decks/
│   ├── my-folder-1/      # Starter walkthrough & interactive quiz decks
│   ├── ebooks/           # Stored PDF / Word / PPTX documents
│   ├── whiteboards/      # Saved infinite whiteboards (meta.json + board.json)
│   └── _template/        # Hidden starter deck schema template
├── src/
│   ├── components/       # Launcher, Presenters, Slide Studio, Whiteboard, Teacher Tools
│   ├── lib/              # Brand config, theme switcher, deck/book/board loaders
│   └── styles/           # Design tokens (themes.css) & UI styles (engine.css)
├── brandsheet.html       # Interactive design system & color palette preview
├── DECK_GUIDE.md         # Slide & interactive question JSON schema reference
├── SETUP_AGENT.md        # Step-by-step Vietnamese onboarding script for AI Agents
└── vite.config.js        # Local file APIs & hybrid document conversion middleware
```

---

## Open Source Credits

Du Kích Studio stands on the shoulders of great open-source projects:

- [Excalidraw](https://github.com/excalidraw/excalidraw) (MIT License) - Infinite whiteboard canvas engine
- [PDF.js](https://github.com/mozilla/pdf.js) (Apache-2.0 License) - High-DPI PDF rendering
- [docx-preview](https://github.com/VolodymyrBaydalka/docxjs) (Apache-2.0 License) & [pptx-preview](https://github.com/pipipi-pikachu/pptx-preview) (MIT License) - Client-side Office fallback viewers
- [Vite](https://github.com/vitejs/vite) (MIT License) & [React](https://github.com/facebook/react) (MIT License)

---

## License

Released under the [MIT License](LICENSE) by **IELTS Du Kich** ([@trungo0512](https://github.com/trungo0512)).
