# Project notes for Claude

## Converting uploaded attachments (token saving)

When the user uploads or references a **non-plain-text document** —
PDF, Word (`.docx`), PowerPoint (`.pptx`), Excel (`.xlsx`), HTML, EPUB,
images (`.png/.jpg`), or similar — **always convert it to Markdown first**
using Microsoft [markitdown](https://github.com/microsoft/markitdown),
then read the resulting `.md` instead of the raw file. This keeps token
usage low while preserving structure (headings, lists, tables, links).

Run:

```bash
.claude/hooks/to-markdown.sh <uploaded-file> /tmp/<name>.md
```

Then `Read` the generated `.md`. The helper auto-installs markitdown if
it isn't present yet.

**Skip conversion** for files that are already plain text and cheap to
read directly: `.csv`, `.json`, `.xml`, `.md`, `.txt`, `.kml`, source code.

markitdown is auto-installed each web session by
`.claude/hooks/session-start.sh` (registered in `.claude/settings.json`).

## About this repo

Italy family-trip planning dashboard. `build_dashboard.py` generates
`index.html` from the CSV data files (`attractions.csv`, `lodging.csv`,
`transport.csv`) and `trip-map.kml`. Deployed via Netlify (`netlify.toml`).
