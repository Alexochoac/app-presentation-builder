---
title: Parity verification tool (scripts/parity.js)
type: Feature
priority: M
status: done
area: scripts
commit: b23466e
---

Script that renders every slide builder-vs-published through the same `renderCartridge` and diffs them. PASS = published == builder minus editing chrome. Loads server render functions offline via a source-slice + new Function loader. Standard post-rebuild check.

## What was built

- `scripts/parity.js` — offline render + diff tool
- Loads `renderCartridge` from server source without running the full Express app
- Renders each slide in builder mode and published mode
- Diffs them: strips editing chrome (`data-builder-only` elements) from builder output before comparing
- Reports PASS / FAIL per slide

## Side effects discovered

- Also surfaced that `scripts/build.js` is broken (stale line numbers) — tracked separately
