---
title: Translation — Builder Preview — Language switcher uses per-slide translations
type: Feature
priority: H
status: done
area: builder
---

After the data model migration (task 1), update the builder preview language switcher to look up translations per-slide instead of globally.

Currently the preview switcher reads translations.json fields by key alone. After migration it must include the active slide's ID in the lookup so that, for example, switching to English on slide 6 shows "Surface Quality" (lib-surface's English headline) not "Our Company" (lib-company's English headline which happened to be stored last).

Changes needed:
- Builder preview JS: when applying a language, pass the current slide's librarySlideId to the translation lookup
- Translator panel: scope the translate/save actions to the current slide context
- Dirty-flag badge: count dirty fields per active slide, not globally

Depends on: task 1 (per-slide data model)
