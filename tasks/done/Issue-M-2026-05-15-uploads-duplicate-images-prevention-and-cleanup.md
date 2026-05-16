---
title: Uploads — Prevent duplicate images on re-upload and clean up existing duplicates
type: Issue
priority: M
status: done
area: builder
---

Two-part fix for duplicate images accumulating in the uploads folder.

## Root cause

The `/api/upload-image` endpoint sanitized the incoming filename (spaces → dashes) and always wrote the file, with no check for whether it already existed. This caused duplicates in two ways:

1. **Re-upload from uploads folder** — user picks a file that already exists in uploads via the OS file picker. The server receives the original filename (e.g. `My Image.jpg`), sanitizes it to `My-Image.jpg`, and writes a new file — even though `My Image.jpg` was already there.
2. **Historical inconsistency** — some files were placed in uploads manually or via older code that didn't sanitize, leaving files with spaces. Later re-uploads of the same images created dashed-name versions alongside the originals.

---

## Fix 1 — Server: check exact filename before sanitizing

**File:** `builder/server.js` — `POST /api/upload-image`

New logic (in order):
1. Check if the **original filename** (unsanitized) already exists in uploads → if yes, return its path immediately, no write
2. Sanitize the filename (spaces/special chars → dashes)
3. Check if the **sanitized filename** already exists → if yes, return that path, no write
4. Otherwise write the new file

This means re-uploading a file from the uploads folder always reuses the existing file, regardless of whether its name has spaces or dashes.

---

## Fix 2 — Cleanup: 53 duplicate files deleted

Ran a full content-hash audit of the uploads folder (~337 files). For each group of files with identical content:
- Kept the version that is referenced in `server.js`, `deck.json`, `slide-library.json`, `presentations.json`, or slide HTML
- Deleted unreferenced copies

Result: **53 files deleted**, folder reduced to ~284 files.

### Groups kept intact (both names referenced in different places)
- `World Map of locations .jpeg` + `World-Map-of-locations-.jpeg`
- `Defect of a Coating image LineScanner Raw Image.png` + `Defect-of-a-Coating-image-LineScanner-Raw-Image.png`
- `LOGO-Softsolution-Black.jpg` + `LOGO_Softsolution_Black.jpg`
