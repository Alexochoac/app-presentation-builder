---
title: Builder — Slide Editor — Save — Audit and fix inconsistent save reliability
type: Issue
priority: H
status: pending
area: builder
---

Edits made in the slide editor do not save consistently. Affected operations include: editing text, adding tabs, editing labels, adding/reordering/deleting list items, and adding/deleting images. Some edits persist, others are silently lost. The save trigger is also unclear to the user — it is not obvious whether save happens immediately on each change, on navigating away, or only on an explicit action.

The back-navigation "save changes?" modal adds to the confusion (see related idea `Idea-L-2026-04-24-builder-navigation-back-force-save-no-modal.md`), but the core issue is deeper: certain edit types may not be wiring into the save pipeline at all, or the pipeline is firing before the DOM change is committed.

**Investigate:**
- Which edit types are auto-saved immediately vs. deferred vs. not wired at all
- Whether the dirty-flag is set correctly for every edit type
- Whether the save call reads stale state in any path (e.g. image upload callback, list reorder)
- Reconcile the two save paths (immediate auto-save vs. navigate-away modal) into one clear model

---

## Findings (2026-06-12) — partial root cause + one instance fixed

**Core mechanism.** The Builder Preview (`preview.html`) — the source-of-truth editing surface — only triggers a save on a **narrow set of events**:
- `input` (typing in a contenteditable) → `scheduleSave` (`preview.html:848`)
- `slide-carousel-save` (component blob changed) → immediate save (`preview.html:700`)
- `slide-image-change` (image set) → immediate save
- `beforeunload` flush

Any edit that mutates the DOM **without emitting one of those** is silently lost. Notably, the Builder Preview does **NOT** listen for `focusout` — whereas the deck/publish render save script (`server.js:200`) **does**. Classic per-render-path drift.

**Confirmed instance — FIXED.** `template06-surface` (`slide-06-surface-v2.html`) persisted its defect-button config blob by dispatching a synthetic `focusout`. That saved in deck-preview but **not** in the builder → **deleting a button / changing an icon was silently lost** (add/rename only worked incidentally because typing fires `input`). Fixed: `persistConfig()` now dispatches `slide-carousel-save` (the cross-surface channel), same stored content. Audit found **no other live `dispatchEvent(new FocusEvent('focusout'))` savers** in `deck-rebuild` cartridges.

**Components that are actually fine.** `list.js` (add/reorder/hide/delete, line 70), `tabs.js` (line 108), `carousel.js`, `gallery.js` all dispatch `slide-carousel-save` → they DO persist in the builder. So Issue-H reports of list/tab loss likely stem from the other causes below, not these components.

**Remaining suspected causes (still to fix):**
1. **Language guard** — `preview.html:701` & `:1191` `if (previewLang !== 'en') return;` blocks blob/text saves while previewing a **non-English** language. Editing in a non-English preview silently drops changes. High-suspicion for "inconsistent depending on what I did."
2. **Legacy `focusout` slides** — `slide-06-surface.html`, `slide-23-ls20-multi-buttons.html` carry `focusout` usage; verify whether any are still reachable.
3. **Merge-only `/edits` endpoint** — `server.js:4390` `Object.assign({}, existing, edits)` can **never remove a key**. Deletions that rely on key-removal won't persist (components dodge this by replacing whole blobs).
4. **Stale state in async callbacks** — image-upload / reorder callbacks may read pre-mutation state (per original report).

**Recommended structural fix ("one clear model").** Add a safety net in `preview.html`: a `MutationObserver` on the slides container that marks any changed `[data-edit]` container dirty + schedules a save on **any** subtree mutation, plus a `focusout` fallback. Then no edit type can slip through regardless of how it mutates the DOM — independent of whether each component remembered to dispatch an event.

**Rulebook-level convention to add.** Component blobs must persist via `slide-carousel-save` (honored on every render surface), **never** a synthetic `focusout`.
