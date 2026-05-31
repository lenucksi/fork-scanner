---
name: fork-scan
description: "Scan all forks of a GitHub repo and analyze community contributions across branches"
---

# fork-scan

Scan all forks of any GitHub repo. Two-stage analysis with sub-agent orchestration.

## Stage 1 — Deterministic Scan

Run the fork-scanner CLI for branch comparison, bot detection, and PR matching:

```
fork-scan <repo> --output ./scan-data
```

This fetches all forks, compares every branch against upstream, identifies shared vs unique branches, detects bot-only commits, and matches PRs with reactions.

**Output:** `report-stage1.html` + `forks.json`, `analysis.json`, `prs.json`, `notes.json`

### Incremental Re-scan

Re-scan only forks that changed since the last scan — detects new forks, changed pushed_at timestamps, and force-pushes:

```
fork-scan <repo> --output <existing-scan-data> --incremental
```

**What it does:**

1. Loads existing `forks.json` + `compare.jsonl` from the previous scan
2. Fetches fresh fork list, compares `pushed_at` with stored data
3. Identifies new / updated / unchanged forks
4. Re-scans only new + updated forks (full upstream compare)
5. SHA-to-SHA cross-reference to flag `_is_new` commits
6. Detects force-pushes via `merge_base_sha` change + vanished tip SHAs → `rewritten` label
7. Merges old + new compare data, preserving unchanged entries
8. Re-runs analysis with `_change`, `_new_commits`, `_rewritten_commits` on each ForkAnalysis

**Change badges in Stage 1 report:**
- 🟢 **New** (green left border) — fork never seen before
- 🟡 **Updated** (amber) — new commits since last scan
- 🔴 **Rewritten** (red) — force-push detected, history replaced

Combine with `--prepare-deep` to generate deep-input for sub-agents:

```
fork-scan <repo> --output <existing-scan-data> --incremental --prepare-deep --deep-limit 30
```

## Stage 2 — Deep Analysis (Skill Harness Mode)

### 1. Prepare Data

```
fork-scan <repo> --output ./scan-data --prepare-deep --deep-limit 30
```

Runs Stage 1 + writes `deep-input/*.json` files with commit messages + file diffs.

### 2. Launch Sub-Agents

Use `task` tool (batches of 5) to analyze each fork:

For each fork in `deep-input/`, a sub-agent should:
- Read the input JSON file (contains commits, files, metrics)
- Classify:
  - **tags** — what features/themes (e.g. "kanban", "mcp", "i18n")
  - **value** — high/medium/low (impact on upstream)
  - **upstreamability** — 1-5 (how cleanly it could be PR'd)
  - **focus** — feature/fix/docs/maintenance/config
  - **title** — one-line summary
  - **description** — 1-2 sentence description
- Write result as JSON to `deep-output/batchN.json`

**Sub-agent prompt template:**

```
Analyze this fork of Backlog.md.

Fork: {full_name}
URL: {url}
Pushed: {pushed_at}
Change status: {_change} (new/updated/rewritten)
New commits since last analysis: {_new_commits}
Branches: {branches}

For each branch, review the commits and files. If this fork has been updated (change status is "updated" or "rewritten"), focus your analysis on the new commits. Produce an incremental update paragraph describing what changed.

Output JSON:
{ "full_name": "...", "title": "...", "description": "...", "value": "high|medium|low", "upstream": 1-5, "focus": "feature|fix|docs|maintenance|config", "tags": ["tag1", "tag2"] }
```

### 3. Merge & Generate Report

```
fork-scan <repo> --output ./scan-data --merge-deep ./deep-output
```

Generates `report-stage2.html` with priority matrix, feature heatmap, and per-fork details.

### 4. Start Report Server

```
fork-scan --serve --output ./scan-data
```

No repo needed — serves existing reports. Available endpoints:

| Endpoint | Description |
|---|---|
| `/` | Landing page with report links |
| `/report-stage1.html` | Stage 1 report (auto-fallback stufe1) |
| `/report-stage2.html` | Stage 2 report (auto-fallback stufe2) |
| `/docs` | Rendered README (no CDN) |
| `/api/notes` | All user notes + checkbox states as JSON |
| `/api/notes/:fork` | Single fork's note + state |
| `/load-notes` | Alias for /api/notes |

### 5. Review Notes (via API)

Sub-agents can fetch user notes from the running server:

```
GET /api/notes
GET /api/notes/kuwork/Backlog.md
```

Notes contain `checked` (boolean) and `note` (string) per fork. Use this to:
- Prioritize forks marked as interesting (`checked: true`)
- Incorporate user's context from existing notes into deep analysis
- Skip forks explicitly marked as low priority

## Interactive Mode

```
fork-scan --interactive
```

Walks through the full pipeline: repo → output dir → deep analysis → LLM key → serve.

## Standalone LLM Mode

```
fork-scan <repo> --deep --llm-key sk-...
```

Requires `ANTHROPIC_API_KEY`. Makes direct Anthropic API calls for classification.

## GH Pages Export

```
fork-scan <repo> --gh-pages
```

Exports fully static site with vendored JS/CSS (no CDN) to `gh-pages/`:
- `index.html` — Landing page
- `report-stage1.html` — Stage 1
- `report-stage2.html` — Stage 2 (if available)

## Output Structure

```
scan-output/
├── report-stage1.html         # Stage 1: all forks, charts, tables
├── report-stage2.html         # Stage 2: deep analysis, priority matrix
├── forks.json                 # Raw fork metadata
├── compare.jsonl              # Branch comparisons (incl. _is_new commit flags)
├── analysis.json              # Filtered, clustered, bot-detected (+ _change, _new_commits, _rewritten_commits)
├── prs.json                   # PR matching + reactions
├── notes.json                 # User notes (from serve)
├── state.json                 # Resumable scan state
├── deep-input/                # Per-fork data for sub-agents (+ _change context)
├── deep-output/               # Sub-agent batch results (+ _updates timeline)
└── gh-pages/                  # Static export
```

## Installation

```bash
# Install skill
cp fork-scan-skill/SKILL.md ~/.config/opencode/skills/fork-scan/

# Run from source
bun src/index.ts MrLesk/Backlog.md --serve
```
