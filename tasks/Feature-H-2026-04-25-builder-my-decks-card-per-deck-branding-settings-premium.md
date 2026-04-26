---
title: Builder — My Decks — Card & Per-Deck Branding Settings (Premium Feature)
type: Feature
priority: H
status: pending
area: builder
---

## Summary

Add a "My Decks" card to the Builder section that allows users to create and manage multiple decks. A deck is a named collection of slides that share the same branding settings. This is a premium feature — free users have one default deck; premium users can create unlimited named decks.

## The Full Content Hierarchy

```
Template
  └── Slide (template + own content + own name)
        └── Deck (collection of slides + branding settings)
              └── Presentation (finished output built from a deck)
```

- **Template** — the structural blueprint (slide library). Defines layout, zones, placeholders.
- **Slide** — an instance of a template with its own content (text, images) and its own name. A slide belongs to a deck; two decks can use the "Company" template but each has its own Company slide with different content and styling.
- **Deck** — a named collection of slides plus shared branding settings (logo, hero background, theme, colors). The deck is the unit you open in the builder.
- **Presentation** — a finished, published output assembled from a deck. Visible in the "Your Presentations" section; opened via the "Open Builder" button.

## What Is a Deck?

A deck owns:
- A set of slide instances (each with their own content and name, derived from templates)
- Its own branding settings (logo, hero background image)
- Its own theme (dark or light default)
- Its own color palette / style

Slides are **not shared** between decks — each deck has its own instances. Two decks can be built from the same templates but their slides will have independent content, names, and styling.

## Builder Section — How the Cards Connect

The Builder section has two key cards that work together:

**My Decks card**
- Lists all the user's decks as cards/rows
- Each deck entry shows: name, theme badge (dark/light), logo thumbnail, last edited date
- Has a "Create new deck" button (premium gated)
- Selecting a deck makes it the **active deck** for the builder

**Your Presentations card**
- Shows a preview of the currently active deck (hero slide + slide strip)
- Displays which deck is selected — the deck name/identity is clearly visible
- The "Open Builder" button opens that deck in the slide editor
- Publishing a presentation always uses the deck that is active here — no deck picker at publish time, you select the deck first then build/publish from it

## Feature Scope

### My Decks Card (Builder UI)
- New card on the Builder section
- Shows a list of the user's decks as cards or rows
- Each deck card shows: name, theme badge (dark/light), logo thumbnail, last edited date
- Actions: Create new deck, Open deck (sets as active), Rename, Duplicate, Delete
- Selecting a deck updates the Your Presentations card preview immediately

### New Deck Defaults
Every newly created deck starts with two required slides already in it:
- **Hero slide** — the opening/title slide (required, cannot be removed)
- **Last slide** — the closing slide (required, cannot be removed)

These default slides are blank instances from the corresponding templates, ready to be customized with the deck's branding and content.

### Deck Settings (per-deck)
The following settings move from global → per-deck scope:
- **Logo** — the company/brand logo shown in the presentation
- **Hero background** — the background image used on hero/title slides
- **Theme** — dark or light default
- **Color palette / style** — primary brand colors tied to that deck's identity

Global settings that remain global (not per-deck):
- User account info
- Default slide library
- App language / locale preferences

### Data Model (file-based, Phase 1)
Each deck is stored as a folder under a new `decks/` directory. Slides are stored inside the deck — they are not shared across decks.

```
decks/
└── [deck-id]/
    ├── config.json         ← deck name, theme, createdAt, updatedAt
    ├── branding.json       ← logo path, hero background path, colors
    ├── assets/             ← deck-specific logo and hero images
    └── slides/
        └── [slide-id]/
            ├── slide.html  ← slide content (instance, not shared)
            └── meta.json   ← slide name, source template id, order
```

The builder always operates in the context of the active deck. Opening the builder = opening a deck.

### Premium Gate
- Free tier: 1 deck (the default deck, equivalent to today's global settings)
- Premium tier: unlimited named decks
- UI shows a "Premium" badge on the "Create new deck" button when the user is on the free tier
- Clicking it shows an upgrade prompt (Phase 1: just a placeholder modal)

## Open Questions
- Should deck switching in the builder trigger a save prompt if there are unsaved changes?
- When duplicating a deck, should all slide content be deep-copied into the new deck?

## Acceptance Criteria
- [ ] "My Decks" card appears on the Builder section
- [ ] User can create a new named deck (premium gate enforced)
- [ ] New deck is created with a hero slide and a last slide by default
- [ ] Each deck stores its own logo, hero background, theme, and color settings
- [ ] Selecting a deck sets it as active and updates the Your Presentations card preview
- [ ] Your Presentations card shows the active deck name and its slide preview
- [ ] "Open Builder" opens the active deck in the slide editor
- [ ] Publishing always uses the active deck — no deck picker at publish time
- [ ] Default deck exists for all users (maps to current global settings behavior)
- [ ] Deck list shows name, theme, logo thumbnail, last edited date
- [ ] Deck can be renamed, duplicated, and deleted
