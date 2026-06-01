---
id: TASK-1
title: Fix repo name in report headers
status: Archived
assignee: []
created_date: 2026-05-31 22:10
labels:
  - bug
  - reporting
dependencies: []
modified_files:
  - src/report.ts
  - src/index.ts
priority: high
ordinal: 1000
---
## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Stage 1 shows 'alessandro-rizzo/...' and Stage 2 shows '?' instead of the actual upstream repo (e.g. 'MrLesk/Backlog.md'). The bug is in report.ts where both generateStage1Report and generateStage2Report derive the repo from allResults[0].full_name (a fork's name) instead of accepting the actual CLI repo argument. Fix: add a repo parameter to both functions and pass argv.repo from all 5 call sites in index.ts.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Stage 1 header shows upstream repo name instead of first fork's owner
- [ ] #2 Stage 2 header shows upstream repo name instead of '?'
<!-- AC:END -->