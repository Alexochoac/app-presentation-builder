---
title: Builder — Preview — Language Switch — Tabs lose click handlers after language change
type: Issue
priority: M
status: done
area: builder-ui
---

Tabs became unclickable in the builder preview after switching to any non-English language on slides that use the `ls-tabs` component (e.g. the CulletScanner-Technology slide, slide 7 in the SoftSolution deck).

English worked fine because tabs are initialized on first load. All other languages broke.

## Root cause

`applyPreviewLang` (preview.html) replaces the `innerHTML` of every `[data-edit]` element with its translation. For slides that store the entire tab component as a single `data-edit="tabs"` translation (Spanish had one), this replaced all the tab buttons with new DOM elements. Those new buttons had no click listeners because `tabs.js` uses a `_lsTabsInit = true` guard on the outer `.ls-tabs` element — once set, `Tabs.init()` never re-runs.

German and Italian had no `tabs`-level translation, so they didn't replace the whole structure. But if the user had previously switched to Spanish (which did replace it), those languages inherited the broken Spanish HTML with no click handlers.

## Fix

**`builder/features/builder-ui/preview.html` — `applyPreviewLang`:**
After applying all translations for a slide, reset `_lsTabsInit` on every `.ls-tabs` element and clear `_lsClickWired` / `_lsRenameWired` on all tab buttons, then call `Tabs.init(slideEl)`. This re-wires click handlers every time the language changes, regardless of whether the tabs HTML was replaced or not.

**`builder/features/slides/components/tabs.js` — `initOne`:**
Before creating the `+ Tab` button, remove any existing `ls-tab-add` elements from the saved HTML. Without this, re-initializing tabs (from the fix above) would inject a second `+ Tab` button into the tab list.

## Files changed

- `builder/features/builder-ui/preview.html` — added 8 lines after the `[data-edit]` forEach to reset tab state and call `Tabs.init(slideEl)`
- `builder/features/slides/components/tabs.js` — added one line in `initOne` to remove existing `ls-tab-add` buttons before creating a new one

## Deployment

Patched as Docker image `v1.1.2`, deployed to `put-a-presentation-v1-1-0` stack via:
```
docker compose -p put-a-presentation-v1-1-0 up -d --no-deps --pull always builder
```
