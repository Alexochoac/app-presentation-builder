---
title: Presentation lifecycle — archive/delete flow + ID fix
priority: high
status: done
area: dashboard-ui
completed: 2026-05-14
---

Fixed makePresId() to use max(existing IDs)+1 so IDs never repeat after deletions or duplicates. Established two-step destruction: Archive (soft, reversible, no typing required; live disclaimer shown) → Permanent Delete (hard, requires typing DELETE; live presentations warn link will break permanently). Public GitHub Pages URL used in #ID link for published presentations. Status filter (Active/Archived/All) shows archived presentations with Restore + Permanently Delete actions. builder-ui Finished Presentations: gear dropdown, filtered by active deck, deckId persisted on save/duplicate.
