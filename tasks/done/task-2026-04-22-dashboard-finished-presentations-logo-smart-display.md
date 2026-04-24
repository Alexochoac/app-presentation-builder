---
title: Dashboard — Finished Presentations — Logo — Smart display for uploaded images
priority: normal
status: done
area: dashboard-ui
---

When a logo is uploaded to a presentation card, it should always look clean and consistent regardless of image size or format. The card image area should display the logo centered, scaled proportionally to fit (object-fit: contain), and use a background color (white or black) chosen based on the logo's dominant colors — light backgrounds for dark logos, dark backgrounds for light logos. This prevents mismatched padding, stretched images, or ugly transparent/white gaps when logos of different sizes are compared side by side on the dashboard.

## Implementation Summary

**Files changed:** `builder/features/dashboard/index.html`

### What was built

Logo images in the finished presentations grid cards now display with smart background detection:

- `object-fit: contain` — logo scales proportionally inside the card area, never stretched
- **Smart background color** — on image load, the browser samples the logo's dominant pixel colors via a hidden `<canvas>` element, calculates average luminance, and sets the card background to `#fff` (light) for dark logos or `#111` (dark) for light/transparent logos
- Consistent padding and centering applied regardless of original image dimensions

### Architecture

The canvas sampling runs in an `onload` handler on each card's logo `<img>`. A small inline script draws the image to a 1×1 canvas (or small sample), reads the resulting pixel RGBA, converts to perceived luminance, and toggles the card's background class. No external libraries required.
