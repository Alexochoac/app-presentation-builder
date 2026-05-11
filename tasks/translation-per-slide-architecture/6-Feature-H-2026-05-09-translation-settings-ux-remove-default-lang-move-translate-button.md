---
title: Translation — Settings UX — Remove default language picker and move Translate button inside Translation Settings
type: Feature
priority: H
status: done
area: builder
---

The Translation Settings modal has two UX problems that need fixing:

1. **Remove "Default Language" dropdown.** English is always the builder's base language — the user should never change this. The dropdown is confusing and misleading. Remove it from the modal entirely. The defaultLanguage value in translations.json can stay as "en" permanently.

2. **Move the Translate button into Translation Settings.** Currently the "Translate" button lives in the burger/actions dropdown menu. It should live inside the Translation Settings panel instead, making Translation Settings the single entry point for all translation actions: choosing active languages AND triggering the translation run.

Changes needed:
- Remove the Default Language `<select>` and its label from `#translationSettingsModal` in preview.html
- Remove `#btnTranslate` from the header actions dropdown menu
- Add a "Translate" button (with badge) at the bottom of the Translation Settings modal, above Save/Cancel
- The button triggers the same `handleTranslateClick()` logic as before
- Update `openTranslationSettings()` to wire up the new button
- Remove any dead code that referenced the old burger-menu translate button

Depends on: tasks 1, 2, 3
