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
- `DEFAULT_TOPIC` (~line 25) — the topic shown on first load and on "Reset/Clear Topic". Currently `"JESUS, THE CHRIST"`.
- `FALLBACK_NAV_TOPIC` — used if `DEFAULT_TOPIC` can't be resolved.
- Topic keys are UPPERCASE strings in `data/topics-with-references.json` (e.g. `"JESUS, THE CHRIST"`, `"LOVE"`, `"FAITH"`).
- `normalizeTopicKey()` (trim + lowercase) and `resolveTopicKey()` (looks up `topicsIndex` map) handle case-insensitive matching — you can set `DEFAULT_TOPIC` in any case.
- `DATASET_CONFIG` switches between the "topics" (Nave's) and "prophecy" datasets, each backed by its own JSON file.

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
