---
title: Slides — Template update notifications — diff, badge, accept/ignore flow
type: Feature
priority: L
status: pending
area: slides
order: 6
---

## Goal

When a template's structure changes (new row, added component, removed component), all library slides based on that template should be notified. The user can review what changed, then accept the update (merge new structure, keep their content) or ignore it.

## The Problem

Today there is no link tracked between a template version and the library slides built from it. If the "Company Intro" template gets a new section added, every library slide using it has no way of knowing.

## Data Model Changes

### Templates — add version tracking
```json
{
  "id": "tpl-new-company",
  "version": 3,
  "updatedAt": "2026-05-15T10:00:00Z",
  "rows": [...]
}
```

### Library Slides — add templateVersion snapshot
```json
{
  "id": "lib-company",
  "templateId": "tpl-new-company",
  "templateVersion": 2,
  "deckEdits": { "default": {...} }
}
```

When `libSlide.templateVersion < template.version`, the slide has an update available.

## The Update Review Flow

### Where it surfaces
1. **Slides → My Library tab** — badge "⬆ Update available" on the slide card
2. **Builder → Slide panel** — same badge on the slide thumbnail in the strip
3. **Slides → Templates tab** — "3 slides need updating" count on the template card

### The review UI
Clicking the badge opens a side-by-side modal:
- **Left** — current slide (the user's content, current structure)
- **Right** — slide with new template structure applied (user content merged in where possible)
- Highlighted diff: new components shown in green, removed in red, unchanged in white
- Two actions: **Accept update** | **Ignore for now**

### Accept update
- Server merges the new template structure onto the library slide
- Content in matching `data-edit` keys is preserved
- New components added by the template get empty/placeholder content
- Removed components lose their content (with a warning)
- `libSlide.templateVersion` updated to match `template.version`

### Ignore
- A `templateUpdateIgnoredAt` timestamp is set on the library slide
- Badge downgraded to a subtle indicator (not a bold warning)
- User can re-review later from My Library

## Server Changes

- `GET /api/slide-library` — include `hasTemplateUpdate: true` flag if versions mismatch
- `POST /api/slide-library/:id/accept-update` — runs the merge, updates templateVersion
- `POST /api/slide-library/:id/ignore-update` — sets `templateUpdateIgnoredAt`
- `PUT /api/layouts/:id` (or `/api/slide-templates/:id`) — increments `version` on save

## Acceptance Criteria
- [ ] Templates have a `version` field, incremented on every save
- [ ] Library slides track `templateVersion` snapshot
- [ ] `GET /api/slide-library` returns `hasTemplateUpdate: true` when versions mismatch
- [ ] Badge appears on slide cards in My Library and Builder slide panel
- [ ] Review modal shows side-by-side comparison
- [ ] "Accept update" merges structure, preserves content, updates version
- [ ] "Ignore" suppresses badge and sets ignored timestamp
