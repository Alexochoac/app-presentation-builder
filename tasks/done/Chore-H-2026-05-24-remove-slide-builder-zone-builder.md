# Remove Slide Builder / Zone Builder

**Type:** Chore  
**Priority:** High  
**Status:** Done  
**Date:** 2026-05-24

## What was done

Removed the entire zone-based slide builder from the codebase. The feature was built but the concept is being rethought from scratch.

### Files removed
- `builder/features/zone-builder/` — entire folder deleted (1,878-line builder UI)
- 3 pending task files for zone-builder features 6, 8, and resize control

### Code cleaned from `builder/features/slides/index.html`
- `#panel-builder` tab content replaced with a "Coming Soon" placeholder
- ~1,400 lines of Slide Builder JS removed (canvas, rows, components, save logic)
- ~420 lines of Template Creator Wizard JS removed
- Removed `openZoneBuilder()` function and the two "+ New Template" buttons that called it
- Fixed `switchTab` and `openSlideBuilder` to not call removed functions
- Updated empty states and page hints to remove builder references

### Code cleaned from `builder/server.js`
- Removed `GET /zone-builder` route
- Removed `GET /api/layout-skeletons` route
- Removed `POST /api/slide-builder/save` route
- Removed `LAYOUT_SKELETONS_PATH` constant

### Tasks cleaned
- Deleted all 6 zone-builder done tasks from `tasks/done/`
- Deleted 3 pending zone-builder tasks from `tasks/`

## Notes

Slides that were previously created with the builder (`builtWith: 'zone-builder'`) are still readable by the server — those data guards were kept intentionally to avoid errors on existing data.

When the slide builder is revived, it will be designed from scratch.
