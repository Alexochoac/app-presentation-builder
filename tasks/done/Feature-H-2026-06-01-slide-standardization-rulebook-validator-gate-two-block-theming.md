---
id: Feature-H-2026-06-01-slide-standardization-rulebook-validator-gate-two-block-theming
title: "Slide standardization — single rulebook, validator + pre-commit gate, two-block theming, first slide rebuilt (CTA)"
status: done
priority: high
area: slides-standardization
created_at: 2026-05-30
completed_at: 2026-06-01
---

## What Was Done

Started a standardization initiative to fix slide-to-slide variance across the pipeline
(template → library slide → deck → published). Built the foundation, proved every piece end-to-end, and
took the first slide all the way through. **Ongoing initiative** — the living plan and remaining work are
in [`architecture/standardization-plan.md`](../../architecture/standardization-plan.md) (has a
`▶ RESUME HERE` marker). All work is on branch **`docs/standardization`** (NOT merged to master).

---

## Deliverables (this milestone)

### 1. One rulebook (was five contradicting docs)
Consolidated `template-anatomy.md`, `template-lifecycle.md`, the skill duplicate, and scattered CLAUDE.md
rules into a single authoritative **[`architecture/slide-system-rulebook.md`](../../architecture/slide-system-rulebook.md)**.
Deleted the redundant docs; updated `CLAUDE.md` + the skill bundle (`architecture/skill-package/`) to comply.
Resolved 6 contradictions + template guardrails (see plan for the decisions).

### 2. Validator + pre-commit gate
- **`scripts/validate.js`** — checks the 16 registered templates (by template ID, like the app) against
  the rulebook; lists orphans/shared-file/tests separately. Derives its CSS-var allowlist from
  `builder/features/slides/style.css` `:root` (so it can't drift). `node scripts/validate.js [--summary] [file]`.
- **`scripts/hooks/pre-commit`** (enabled via `git config core.hooksPath scripts/hooks`) — validates only
  the *staged* slide cartridges, so the legacy backlog never blocks unrelated work. Bypass: `--no-verify`.
- **`scripts/preview-slide.js`** — wraps any cartridge into a standalone browser-openable preview
  (palette + finish), no server/login needed.

### 3. Two-block theming proven & wired live
A theme = **Palette block** (CSS vars, already worked) + **Finish block** (signature effects — blur, glow,
the vivid background — that palette extraction drops). Built the first Finish block
**`builder/themes/finish/glassmorphism.css`** and wired `finishStyleTag(ref)` into all 4 render paths in
`server.js` (keyed by active styleRef/theme; template-preview reads `?theme=`). Verified live: selecting
glassmorphism on a card slide renders palette + frosted glass.

### 4. First slide rebuilt end-to-end (CTA) — the proven recipe
`ls14-cta` → clean cartridge **`template14-cta`** (`builder/features/slides/slide-14-cta.html`): added
`data-slide`/`data-slide-mode`, standard scope class, real CSS vars, fixed broken `Track.click`, all 11
`data-edit` slots preserved. Re-pointed `lib-cta` + `CTA-Validated` to it; removed the JS twin
`renderCtaLayout()` + its dispatch + the dead `tpl-new-cta`/`tpl-cta` registry entries. Verified live.
**Recipe for remaining slides:** build cartridge → `validate.js <file>` → verify render → re-point library
slide(s) → delete its JS twin in `server.js`.

---

## Key Discoveries (the validator self-corrected reality 3×)

1. **`data-lang-key` is dead markup** — translation keys off `data-edit` (`bakeLanguageSpans`). Removed the
   fictional rule.
2. **`ghost-css-var` was a false positive** — `--bg-card`/`--border`/`--nav-bg` etc. ARE defined and bridged
   to the `--card-*` theme names in `style.css` `:root` (the real contract). The palette already switches.
3. **Comment false-positive** — `umami.track()` mentioned in a code comment isn't a call; validator now
   strips comments first.
4. **A theme's signature BACKGROUND lives in the Finish block** — palette extraction flattens the vivid
   gradient to a solid color; `.slide.content{background:var(--bg)}` needs `!important` to override.

---

## State / Notes

- **16 templates** (templates.json; `ls06-surface` + `ls06-surface-copy` share one .html). **20 library
  slides.** **1 real deck (`default`)** — many `deckEdits` are ORPHANS from deleted decks (Model-A cleanup).
- Removed 15 orphan/test `.html` files from `builder/features/slides/`.
- Several files had accidental **CRLF** flips pre-session (no real changes) — normalized to LF on touch.
- Publishing from the app while on a feature branch commits `finished-presentations/` onto that branch.
- **Remaining work** (tracked in the plan, not here): rebuild the other ~14 legacy slides; extract Finish
  blocks for the other ~34 styles; Model-A copy-on-add + template-guardrail enforcement; merge to master.
