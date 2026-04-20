---
title: Delete presentation
priority: normal
status: pending
area: dashboard-ui
---

Add a delete action to the Dashboard presentation list. Clicking delete should prompt for confirmation, then call `DELETE /api/presentations/:id` which removes the entry from `presentations.json` and deletes the associated deck config file.
