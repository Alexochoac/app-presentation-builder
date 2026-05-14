---
title: Slides — Template Creator — 2 — Wizard UI
type: Feature
priority: H
status: done
area: slides
order: 2
---

Second task in the Template Creator series. Build the step-by-step wizard inside the Slide Builder tab.

**Depends on:** Task 1 (data model & API)

## Goal
Replace the current free-form canvas builder in the Slide Builder tab with a guided wizard that produces anatomy-compliant templates. The wizard collects everything needed to generate the HTML.

## Wizard steps

### Step 1 — Basic info
- Slide name (text input)
- Category picker: Cover · Content · Stats · Visual · CTA · Data (pill buttons)
- Slide mode toggle: Sequence (default) · Embedded
- Auto-suggests the next slide number (reads highest existing ls[NN] from templates.json and increments)

### Step 2 — Layout picker
Show a grid of pre-defined layout thumbnails (drawn in CSS, no images needed):
- Single column (header + body)
- Two column (left content + right image)
- Stats grid (header + 2–4 stat blocks)
- Hero (full-bleed background + overlay text)
- List (header + two-column bullet list)
- CTA (header + steps + contact block)

User clicks one to select it. Show a simple wireframe preview of the selected layout.

### Step 3 — Content blocks
Based on the chosen layout, show a list of pre-configured content blocks. Each block can be toggled on/off or reordered:
- Headline (always on)
- Section label (always on)
- Subtitle / intro paragraph
- Image slot (with data-feed option for webhook)
- Stat number (with data-feed option)
- Body text / paragraph
- Bullet list
- CTA buttons (WhatsApp, Email)
- Custom button (triggers embedded slide)

For each block marked as "live data" — show a field for the `data-feed` key name.

### Step 4 — Review & generate
- Show the anatomy checklist (all 5 layers) with green checkmarks auto-filled based on wizard answers
- Show a "Generate Template" button
- On click: POST to `/api/templates` with the wizard data → server generates the HTML (Task 3)
- On success: show the file path + a "Go to Templates" button

## UI notes
- Wizard lives inside `#panel-builder` in `builder/features/slides/index.html`
- Step indicator at the top (1 → 2 → 3 → 4), Back/Next buttons
- Keep the existing "Save as Template" and "Save to Library" buttons for when users arrive via the old flow
- Mobile-friendly — each step should work on a single screen without horizontal scroll

## Reference
- `architecture/template-anatomy.md` — the 5-layer anatomy and naming conventions
- `architecture/claude-skill-template-creator.md` — the Q&A flow mirrors the wizard steps

## Implementation Summary

**Files modified:**
- `builder/features/slides/index.html` — three insertion points:

**CSS added** (~280 lines): `.builder-mode-toggle`, `.wizard-pane`, `.wz-stepper` with step dots/lines/labels, `.wz-step-content`, `.wz-field-group`, `.wz-pill` (category/mode selectors), `.wz-layout-grid` + `.wz-layout-card` + CSS wireframe blocks (`.wf-header`, `.wf-body`, `.wf-cols`, `.wf-stats`, `.wf-hero`, `.wf-bullets`, `.wf-cta-steps`), `.wz-blocks-list` + `.wz-block-row` + `.wz-block-toggle`, `.wz-anatomy-list`, `.wz-footer`, and preview thumbnail + popup styles.

**HTML added** inside `#panel-builder`: Wizard/Canvas mode toggle in the topbar; `id="builderBody"` on the existing canvas div; full `#wizardPane` with 4 step sections and a fixed footer with Back/Next/Generate buttons. Step 4 includes a clickable preview thumbnail that shows the generated HTML skeleton rendered in an iframe.

**JS added** (~330 lines): `wzData` state, `WZ_LAYOUT_BLOCKS` and `WZ_BLOCK_META` maps, `setBuilderMode()`, `wzPickCategory/Mode/Layout()`, `wzComputeId()` (fetches `/api/templates` to find next ls[NN]), `wzBuildBlocksList()`, `wzBuildReview()`, `wzBuildHtml()` (generates anatomy-compliant skeleton), `wzValidateStep()`, `wzShowStep()`, `wzNext/Back/Reset()`, `wzGenerate()` (POSTs to `/api/templates`). Also `wzBuildPreviewPage()`, `wzRenderPreview()` (blob URL iframe), `wzOpenPreviewPopup()`, `wzClosePreviewPopup()`.

**Extra feature added during session:** Live preview on Step 4 — a 200px thumbnail iframe renders the skeleton HTML as a blob URL before generation. Clicking it opens a near-fullscreen popup overlay. After "Generate Template" succeeds, the preview switches to the real `/slides/preview/{id}` server URL. Tested and confirmed working end-to-end (ls16-test-wizard-template successfully created).
