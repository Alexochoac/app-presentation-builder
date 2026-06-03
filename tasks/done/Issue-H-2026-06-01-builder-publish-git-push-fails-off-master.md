---
title: Builder — Publish — Fix git push failing when not on master branch
type: Issue
priority: H
status: done
completed_at: 2026-06-02 00:00
area: build-deploy
---

`POST /api/presentations/:id/publish` returns HTTP 500 whenever the server is running on a branch other than `master`. The build and commit steps succeed, but the bare `git push` (no arguments) fails because the feature branch has no upstream tracking branch configured.

## Root cause

`builder/server.js` ~line 5911 runs:

```js
run('git', ['push'], repoRoot, function (err) {
  if (err) return res.status(500).json({ success: false, error: 'git push failed: ' + err.message });
```

A bare `git push` requires the current branch to have `[origin/...]` tracking set up. On `docs/standardization` (and any other feature branch), no upstream exists, so git refuses and the endpoint returns 500.

**Evidence the earlier steps succeed:** the last commit on `docs/standardization` is `305c1c8 publish: Rebuild — ReBuild (00000023)` — build + commit worked; only push failed.

## Why it was hidden before

On `master` (normal dev state), `master` tracks `origin/master` and bare `git push` works. Switching to a feature branch while keeping the builder server running exposes the gap.

## Fix options (ranked)

### Option A — Quick fix: push explicitly to `origin master`
```js
// before:
run('git', ['push'], repoRoot, ...)
// after:
run('git', ['push', 'origin', 'HEAD:master'], repoRoot, ...)
```
**Caveat:** fails non-fast-forward if the feature branch is behind `origin/master`.

### Option B — Correct fix: use a git worktree on master
Create/reuse a worktree checked out at `master`. Run `add / commit / push` inside that worktree so the developer's current branch is never touched and the publish always targets `master`.

```js
var publishWorktreePath = path.join(REPO_ROOT, '.publish-worktree');
run('git', ['worktree', 'add', '-f', publishWorktreePath, 'master'], REPO_ROOT, function () {
  // copy finished-presentations/<id> into worktree, then add/commit/push there
  run('git', ['push'], publishWorktreePath, function (err) { ... });
});
```

### Option C — Stop-gap: detect missing upstream early, return 400
```js
run('git', ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], repoRoot, function (err) {
  if (err) return res.status(400).json({
    success: false,
    error: 'Cannot publish: current branch has no upstream. Switch to master first.'
  });
  // ... continue with add/commit/push
});
```
Turns the cryptic 500 into a clear actionable message with no logic change.

## Recommendation
**Option B** is the correct long-term fix (publish always targets `master` regardless of dev branch). **Option C** is a one-line stop-gap that at least surfaces a readable error immediately.

## Implementation Summary

Chose a pragmatic middle path: `git push` failure no longer aborts the response with 500. Instead it is caught gracefully and surfaced as a `warning` field in an otherwise successful response, with the local frozen URL still returned.

**Problem:** `POST /api/presentations/:id/publish` returned HTTP 500 when running on any branch without an upstream (e.g. `docs/standardization`). The frozen HTML was built and committed successfully, but the bare `git push` threw, killing the entire response.

**Root cause confirmed:** `builder/server.js:5911` — bare `run('git', ['push'], ...)` with no fallback for missing upstream.

**Files changed:**

- `builder/server.js` — changed the `git push` error branch from `return res.status(500)` to setting a `pushWarning` string. The `publishedAt` timestamp is now recorded regardless of push outcome. Response is always `{ success: true, url, alreadyPublished, warning? }` — 500 is gone.

- `builder/features/builder-ui/index.html` — `fpPublish()` now checks `res.warning`. If present, the confirm dialog reads "Published locally (not on GitHub). [warning text]. [url]. Open local link?" so the user gets the local link and understands why GitHub Pages wasn't updated.

- `builder/features/dashboard/index.html` — `fpPublish()` now checks `res.warning` and shows an `alert()` with the warning text before refreshing the list.

The local URL (`http://localhost:3000/public/<id>/`) works immediately because the frozen build is written to `finished-presentations/` before any git operations run.
