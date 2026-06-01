---
id: TASK-3
title: Fix kuwork update timeline dates
status: Archived
assignee: []
created_date: 2026-05-31 22:10
labels:
  - bug
  - reporting
dependencies: []
modified_files:
  - src/deep.ts
priority: medium
ordinal: 3000
---
## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In the Stage 2 report, kuwork's _updates timeline entry shows the same date as the current analysis body because mergeDeepResults sets update.date = new Date().toISOString() (the merge time). Fix: track per-entry batch-file mtime in mergeDeepResults so the update entry gets the original batch creation date rather than the current merge timestamp.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Update entries in _updates timeline show the original analysis date, not the merge time
- [ ] #2 Current analysis body still shows the fork's pushed_at date
<!-- AC:END -->