# GmKing

Draw electronic circuits with connected wires, editable symbols, labels, notes, Undo/Redo, and SVG/PNG clipboard export.

- **Web editor:** `apps/web`; browser-local storage and JSON import/export.
- **Embeddable library:** `packages/schematic`; [API and embedding](packages/schematic/README.md).
- **Obsidian plugin:** `apps/obsidian`; desktop only, Obsidian 1.13.4+.

## Run

Node.js 22.13+ and npm 10+:

```sh
npm ci
npm run dev
```

Open `http://127.0.0.1:8001`. After library changes, run `npm run build:lib` and reload. `npm run build` builds all three packages; `npm run typecheck`, `npm test`, and `npm run test:browser` verify them. The browser check needs Chrome/Chromium or Edge.

`npm run lint` runs the official Obsidian ESLint rules across the workspace. Outstanding findings are reported; lint currently runs as an advisory CI step.

## Obsidian

Build with `npm run build`. Copy `main.js`, `styles.css`, and `manifest.json` from `apps/obsidian/dist` into `<vault>/.obsidian/plugins/schematic-editor/`, then enable **GmKing** in Community plugins. Run **GmKing: Insert schematic** in the command palette; edit the inserted block in Live Preview. Circuit data stays in the note's JSON code block.

## Hosting and data

Host `apps/web/dist` on a static server. Web documents stay in that browser; export JSON for backups or transfer. Web formula rendering loads MathJax from jsDelivr and needs a network connection. The Obsidian plugin uses Obsidian's rendering APIs. Clipboard features depend on host permissions; Web clipboard access generally needs HTTPS or localhost.

The Web editor uses English and Light mode for this release. **Options** contains the symbol template setting, and **Help** opens the bundled manual in a new tab.

MIT © 2026 RarityBrown. Dependencies retain their own licenses; see [third-party notices](THIRD_PARTY_NOTICES.md).
