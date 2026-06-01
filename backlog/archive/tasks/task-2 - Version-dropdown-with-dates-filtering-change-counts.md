---
id: TASK-2
title: Version dropdown with dates, filtering, change counts
status: Archived
assignee: []
created_date: 2026-05-31 22:10
labels:
  - enhancement
  - ux
  - reporting
dependencies: []
modified_files:
  - src/report.ts
  - src/serve.ts
priority: high
ordinal: 2000
---
## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The nav bar version dropdown currently shows bare filenames (e.g. 'stage1', 'stage1-v1') for all report types regardless of context. Needs: (1) show date+time from mtime, (2) filter to current report type only (stage1 dropdown only shows stage1 versions), (3) show [Inc] vs [Full] label, (4) show change count for incremental runs. Approach: embed <meta name='fs:meta'> tag in report HTML at generation time, then parse it in generateNavBar().
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Dropdown shows per-option date and time formatted as 'May 31 21:25'
- [ ] #2 Current page's report type filters the dropdown (stage1 page only shows stage1 options)
- [ ] #3 Entries show [Inc] or [Full] label based on whether changes were detected
- [ ] #4 Incremental entries show change count (e.g. '· 5 changes')
<!-- AC:END -->