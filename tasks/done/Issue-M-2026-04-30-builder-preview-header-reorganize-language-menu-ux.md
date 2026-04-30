---
title: Builder — Preview Header — Reorganize Language Dropdown and Menu for UX
type: Issue
priority: M
status: done
area: builder
---

The builder preview header feels disorganized and hard to use. Rearrange controls for clarity:

- Move the **language dropdown** next to the "Builder Preview" heading in the header, with a flag icon for each language option.
- Move the **Translate button** into the menu (hamburger/actions menu), not the header.
- Place the **menu button** immediately next to the "Builder Preview" text in the header.
- Goal: header stays clean (title + language), actions live in the menu — clear separation between navigation context and actions.

## Implementation Summary

**Problem:** The builder preview header was cluttered — language dropdown, Translate button, Create Presentation button, and actions menu (⋯) were all piled into `header-right` with no clear hierarchy. Nothing was grouped by purpose, making it hard to scan.

**Files changed:** `builder/features/builder-ui/preview.html`

**Fixes made:**

- **Moved `presActionsWrap` (menu button + dropdown) to `header-left`**, right after the "Builder Preview" title. Changed the icon from ⋯ to ☰ (hamburger) to better signal "menu". Changed `presActionsMenu` to open left-aligned (`left: 0`) instead of right-aligned so it doesn't clip off-screen.
- **Moved `previewLangWrap` (language button + dropdown) to `header-left`**, after the menu button. Changed `previewLangMenu` to also open left-aligned.
- **Moved "Create Presentation" button into the menu** as a `footer-menu-item` at the top, since it's an action not a persistent UI element.
- **Moved "Translate" button into the menu** as a `footer-menu-item` (with a divider separating it from navigation actions). Clicking it closes the menu then triggers `handleTranslateClick()`. Removed standalone `#btnTranslate` CSS styles.
- **Added `LANG_FLAGS` map** — emoji flags for ~25 language codes (en 🇬🇧, es 🇪🇸, fr 🇫🇷, etc.), with `langFlag(code)` helper that falls back to 🌐.
- **Updated `buildLangMenu()`** to render flag + code in each language option.
- **Added `#previewLangFlag` span** to the language button and wired `setPreviewLang()` to update it on language switch.
- **Updated click-outside handler** to also close `previewLangMenu` on outside clicks (previously only `presActionsMenu` was handled). Removed the stale `e.target.id !== 'btnTranslate'` guard from the translation panel close logic.
- **`header-right` is now minimal**: only the Preview badge and slide counter remain — clean context info only.
