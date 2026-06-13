# Bible Explorer

Static site (vanilla HTML/CSS/JS, no build step) — interactive treemap-style explorer of the Bible by topic/prophecy. Live at https://bible-explorer.gospelgo.org.

## Stack & entry points
- `index.html` — single page, all views (Bible/Book/Verse "states") live in here.
- `js/app.js` — all application logic (~3000 lines). `js/book-metadata.js` is static per-book metadata (genre, author, etc.).
- `css/style.css` — the **only** active stylesheet (loaded with `css/normalize.css`). It's plain CSS with custom properties (`--text-1`, `--accent-1`, etc. in `:root`).
- `data/` — large JSON datasets: `bible.json`, `data/books/`, `data/chapters/` (full text), `topics-with-references.json` (~19MB, Nave's Topics), `prophecy-topics-with-references.json`.
- `scripts/` — one-off Node scripts used to generate/parse the data files (USFM, Nave's topics, prophecy docx, etc.). Not part of the runtime app.

## Stale files — ignore
`css/base.css`, `components.css`, `layout.css`, `responsive.css`, `states.css`, and `_refactor_matches.txt` are all **empty (0 bytes)** — leftovers from an abandoned modular CSS refactor (Mar 2026). `_style_pre_modular.css` and `style.css.bak` are old backups. Don't edit any of these — everything active is in `css/style.css`.

## Local dev server gotcha
`server.js` (`node server.js`, port 8000) is a tiny static file server that does **not** strip query strings — `index.html` references `js/app.js?v=NN` (cache-busting), which 404s under `server.js`. For testing/screenshots, use something that handles query strings, e.g. `npx http-server -p 8001 -s`.

## Topic system (js/app.js)
- `DEFAULT_TOPIC` (~line 25) — Nave's Topics' default, `"JESUS, THE CHRIST"`. Each `DATASET_CONFIG` entry also has its own `defaultTopic` (BSB Topics: `"Blood of Jesus"`, Concordance: `"Eternal"`, Prophecy: `""` = blank). `getDatasetDefaultTopic(mode)` resolves the right one (Prophecy returns `null`, leaving the search field empty with its `<datalist>` still populated for the dropdown).
- `FALLBACK_NAV_TOPIC` — used if `DEFAULT_TOPIC` can't be resolved.
- Topic keys are UPPERCASE strings in `data/topics-with-references.json` (e.g. `"JESUS, THE CHRIST"`, `"LOVE"`, `"FAITH"`).
- `normalizeTopicKey()` (trim + lowercase) and `resolveTopicKey()` (looks up `topicsIndex` map) handle case-insensitive matching — you can set `DEFAULT_TOPIC` in any case.
- `DATASET_CONFIG` (~line 34) switches between four datasets, all sharing one `{name, references: {BOOKID: [{verse, subtopics, refs}]}, books}` schema: **Nave's Topics** (`topics`), **BSB Topics** (`bsb-topics`), **Prophecy** (`prophecy`, has its own aggregate-topic logic via `PROPHECY_AGGREGATE_TOPICS`), and **BSB Concordance** (`concordance`, word-level references with a stopword filter). Switching dataset when the current topic doesn't exist in the new one falls back to that dataset's `defaultTopic` via `getDatasetDefaultTopic()`. See `docs/treemap-and-datasets.md` for dataset schemas, source files, and parser scripts.
- The search field (`#topic-input`) has a circular `&times;` clear button (`#topic-clear-btn`, inside `.topic-input-wrap`) instead of a separate "Reset Topic" button. Clicking it always clears the field to no topic (`applyTopicSelection(null, { commit: true })`), in every state. `updateTopicActionState()` hides it whenever `selectedTopic` is null (nothing to clear).

## Overview treemap sizing (js/app.js)
- Each book card's height is proportional to its character count (`data/book-character-counts.json`), via `enforceAspectRatios()` (~line 1209): a `value^0.3` weight compresses the ~138x size range to ~4.4x, then items are greedily packed into 14 columns (canonical Genesis→Revelation order) with a binary-searched unit scale so columns absorb however many books fit, with each column's fill stretch capped at `MAX_COLUMN_FILL_FACTOR = 1.3` (keeps Revelation from being stretched larger than Matthew in the sparse last column). `scripts/verify-treemap-packing.js` re-runs this against real data outside the browser. Full algorithm and rationale in `docs/treemap-and-datasets.md`.

## Pin-line bands (js/app.js)
- Topic/word references inside each book/chapter card render as `.pin-line` elements grouped into `PIN_LINE_BANDS = 8` vertical `.pin-line-band` rows (`getPinLineBandIndex()`, ~line 290), based on each reference's position (0-100%) within the book/chapter. A reference near the end of a book renders near the bottom of the card; empty bands render as blank space. Used in both the Bible state (`renderTreemap`, book cards) and Book state (`renderBookView`, chapter cards) — same recipe, mirrored. The Verse state doesn't use pin-lines (text reading view). Full details in `docs/treemap-and-datasets.md`.

## Header layout (index.html ~line 44-115)
- `.header` is a flex row, `justify-content: space-between`, with exactly two top-level children: `.title-block` (left: title, "by gospelgo" link, state indicator, Berean source link) and `.header-right` (right: `.controls` block + any standalone header links like `.peruser-link`).
- To add a new top-right header link/badge, append it as a sibling **after** `.controls` inside `.header-right` — that's what places it in the far top-right corner.

## Responsive breakpoints (css/style.css)
- `< 900px`: entire `#app` is hidden behind a full-screen "width too small" overlay (`#width-warning`, logic in `index.html` inline script) with share/copy-link buttons. Anything inside `#app` doesn't need mobile styling.
- `max-width: 780px`: tablet tweaks (mostly moot since covered by the 900px overlay).
- `min-width: 1101px and max-width: 1920px`: HD — tighter spacing/sizes for header controls.
- `min-width: 2560px`: 4K — larger fonts/padding throughout (lots of breathing room).

## CI
`.github/workflows/discord-notify.yml` posts a Discord embed on every push to `main` with the commit message and a link to the live site.
