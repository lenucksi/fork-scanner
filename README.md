# fork-scanner

Scan all forks of any GitHub repo. Analyse community contributions, find features worth upstreaming, detect bot-only clutter.

```
       __                __
  ____/ /___  __  ______/ /__  _____
 / __  / __ \/ / / / __  / _ \/ ___/
/ /_/ / /_/ / /_/ / /_/ /  __/ /
\__,_/\___/\__,_/\__,_/\___/_/
```

## Quick Start

```bash
# Install
bun install

# Stage 1 — fork discovery, branch compare, PR matching (no LLM needed)
bun run src/index.ts MrLesk/Backlog.md

# Start the report server
bun run serve

# Dev mode (auto-restart on source changes)
bun run dev

# Regenerate reports from existing scan data and start server
./tools/start-analysis-backlog-data.sh
```

## Table of Contents

- [Installation](#installation)
- [Usage](#usage)
- [Modes](#modes)
  - [Stage 1 — Deterministic Scan](#stage-1--deterministic-scan)
  - [Incremental Scan](#incremental-scan-stage-1-re-scan)
  - [Stage 2 — Deep Analysis](#stage-2--deep-analysis)
  - [Interactive Mode](#interactive-mode)
  - [GitHub Pages Export](#github-pages-export)
- [Scripts](#scripts)
- [OpenCode Skill](#opencode-skill)
  - [Skill Mode (Harness)](#skill-mode-harness)
  - [Standalone Mode](#standalone-mode)
- [Output Structure](#output-structure)
- [Architecture](#architecture)
- [Templates](#templates)
- [Testing](#testing)
- [Required Permissions](#required-permissions)

## Installation

```bash
# Global install
npm install -g @lenucksi/fork-scanner

# Or run directly
npx @lenucksi/fork-scanner MrLesk/Backlog.md

# From source
git clone https://github.com/lenucksi/fork-scanner.git
cd fork-scanner
bun install
bun run src/index.ts MrLesk/Backlog.md
```

**Prerequisites:**

- [Bun](https://bun.sh) 1.3+ runtime
- GitHub token (auto-detected via `gh auth token`, `GH_TOKEN`, or `GITHUB_TOKEN`)
- For Stage 2 (standalone): `ANTHROPIC_API_KEY` or `--llm-key`

## Usage

```bash
# Minimal — Stage 1 only
fork-scan MrLesk/Backlog.md

# Stage 1 + serve report
fork-scan MrLesk/Backlog.md --serve

# Stage 1 + prepare for deep analysis (for OpenCode skill)
fork-scan MrLesk/Backlog.md --prepare-deep --deep-limit 30

# Merge sub-agent results into Stage 2 report
fork-scan MrLesk/Backlog.md --merge-deep ./deep-output

# Interactive wizard
fork-scan --interactive

# Export static site for GitHub Pages
fork-scan MrLesk/Backlog.md --gh-pages \
  --gh-pages-subpath my-analysis

# Custom output directory
fork-scan MrLesk/Backlog.md -o ./reports/my-scan

# Incremental re-scan (only changed forks)
fork-scan MrLesk/Backlog.md -o ./scan-data --incremental --serve

# Serve existing scan data
bun run src/index.ts --output /path/to/scan-data --serve
```

## Modes

### Stage 1 — Deterministic Scan

Runs entirely on GitHub REST API. No LLM needed. Always produces identical results for the same repo snapshot.

**What it does:**

1. **Fork discovery** — fetches all forks (paginated, handles 338+ forks)
2. **Branch comparison** — for each fork, lists ALL branches and compares each against upstream via `GET /repos/{upstream}/compare/{base}...{fork_owner}:{branch}`
3. **Bot detection** — checks every ahead-commit author against known bot patterns (`dependabot`, `renovate`, `github-actions`, etc.)
4. **Cluster analysis** — groups forks by their merge base commit (same upstream baseline)
5. **PR matching** — queries upstream PRs, matches them to fork owners by author login, fetches emoji reactions with timestamps
6. **HTML report** — generates interactive Chart.js report with fork status donut, push activity bar chart, interesting forks table

**Output:**
```
scan-output/
├── report-stage1-full-2026-06-01.html   ← Versioned report
├── forks.json
├── compare.jsonl
├── analysis.json
├── prs.json
└── state.json
```

### Incremental Scan (Stage 1 re-scan)

Re-scan only forks that changed since the last scan. Faster and produces change-annotated reports.

```
fork-scan MrLesk/Backlog.md -o ./my-scan --incremental
```

**What it does:**

1. Loads existing `forks.json` + `compare.jsonl` from the output directory
2. Fetches fresh fork list, compares `pushed_at` timestamps
3. Identifies **new** (never before seen), **updated** (pushed_at changed), and **unchanged** forks
4. Re-scans only new + updated forks with full upstream branch compare
5. SHA-to-SHA cross-reference flags `_is_new` on individual commits
6. Detects force-pushes via changes to `merge_base_sha` + vanished tip SHAs → `rewritten` label
7. Merges old + new compare data in memory, preserving unchanged entries
8. Runs analysis with change context: `_change`, `_new_commits`, `_rewritten_commits`

**Change badges in report:**
- 🟢 **New** row (green left border) — fork appeared since last scan
- 🟡 **Updated** row (amber) — new commits detected on existing fork
- 🔴 **Rewritten** row (red, striped) — force-push replaced the branch history

Incremental reports use the `-inc-{date}-from-{parent-date}` filename convention, referencing the prior report they're based on. The parent reference is also stored in the HTML `<meta name="fs:meta">` tag.

Combine with `--prepare-deep` and `--serve`:

```bash
fork-scan MrLesk/Backlog.md -o ./scan-data --incremental --prepare-deep --deep-limit 30 --serve
```

### Stage 2 — Deep Analysis

Adds AI-powered classification on top of Stage 1.

**Two flavours:**

| Mode | LLM Source | Setup |
|------|-----------|-------|
| **OpenCode Skill** | Coding harness (Task tool sub-agents) | No key needed |
| **Standalone CLI** | Anthropic API direct | `ANTHROPIC_API_KEY` or `--llm-key` |

**What it adds:**

- Feature classification per fork (tags, value assessment, upstreamability score)
- Priority matrix sorted by impact × upstreamability
- Feature heatmap (what's built most often in the community)
- PR status per fork (merged / open / closed + reaction timeline)
- Interactive checkboxes + notes per fork (persisted to `notes.json`)
- Incremental update timeline per fork (when re-analyzed via `--incremental`):
  `_updates[]` entries show timestamped paragraphs for each analysis round

### Interactive Mode

```bash
fork-scan --interactive
```

Walks through the full pipeline step-by-step:

1. Enter repo name
2. Fetch forks + show summary
3. Choose: deep analysis? how many?
4. LLM key or harness mode?
5. Start server?

### GitHub Pages Export

```bash
fork-scan MrLesk/Backlog.md --gh-pages \
  --gh-pages-subpath my-analysis
```

Exports to `<output>/gh-pages/<subpath>/`:

```
gh-pages/my-analysis/
├── index.html                          ← Landing page (auto-generated)
├── report-stage1-full-2026-06-01.html  ← All versioned reports
├── report-stage2-full-2026-06-01.html
├── chart.umd.min.js                    ← Vendored JS/CSS
├── marked.min.js
├── highlight.min.js
├── github-dark.min.css
├── analysis.json                       ← Machine-readable data
├── forks.json
├── prs.json
└── .nojekyll                           ← For GH Pages compatibility
```

The export is fully static — all report files are versioned with date-based filenames. The nav bar links point to the latest version per stage. The version dropdown lists every report with its run type, date, and change count (parsed from `<meta name="fs:meta">` tags). No server needed.

See the [reports repo](https://github.com/lenucksi/fork-scanner-reports) for a live example.

## Scripts

| Command | Description |
|---------|-------------|
| `bun run build` | Build CLI bundle to `dist/` |
| `bun run serve` | Start report server on `./scan-output` |
| `bun run dev` | Start server with `bun --watch` (auto-restart on source changes) |
| `bun run typecheck` | Run TypeScript type check |
| `bun test` | Run unit tests |
| `bun run test:e2e` | Run Playwright end-to-end tests |
| `bun run update-vendors` | Update vendored JS/CSS from CDN |
| `./tools/start-analysis-backlog-data.sh` | Regenerate reports from existing scan data + start server |

The report server reads files fresh on every request — HTML report changes in the output directory are reflected immediately without restarting.

## OpenCode Skill

The skill integrates fork-scanner with OpenCode's agent infrastructure. Invoke it via the TUI:

```
/fork-scan MrLesk/Backlog.md
```

### Skill Mode (Harness)

When run through the OpenCode skill, deep analysis uses **sub-agents** via the Task tool. No external API key needed — the harness provides the LLM context.

**Flow:**

1. `fork-scan MrLesk/Backlog.md --prepare-deep --deep-limit 30`
   → Stage 1 + writes `deep-input/` files with commit messages + file diffs

2. **Skill launches sub-agents** (batches of 5, using Task tool):
   - Each sub-agent reads input files, analyzes commit messages + file changes
   - Classifies: tags, value assessment, upstreamability, main focus
   - Writes results to `deep-output/batchN.json`

3. `fork-scan MrLesk/Backlog.md --merge-deep ./deep-output`
   → Generates Stage 2 HTML report with all data merged

4. Optionally: `bun run serve` → Start the local report server

### Standalone Mode

```bash
# With API key
ANTHROPIC_API_KEY=sk-... fork-scan MrLesk/Backlog.md --deep

# Or via flag
fork-scan MrLesk/Backlog.md --deep --llm-key sk-...
```

The CLI makes direct Anthropic API calls (parallel, rate-limited) for the same classification the sub-agents would do.

## Output Structure

```
<output-dir>/
├── report-stage1-full-2026-06-01.html    # Versioned report (stage, run-type, date)
├── report-stage2-full-2026-06-01.html
├── report-stage2-inc-2026-06-07-from-2026-06-01.html  # Incremental: references parent
├── forks.json                            # Raw fork metadata
├── compare.jsonl                         # Branch-by-branch comparison results
├── analysis.json                         # Filtered, clustered, bot-detected
├── prs.json                              # PR matching + reactions
├── state.json                            # Resumable scan state
├── notes.json                            # User notes (from save-note endpoints)
├── deep-manifest.json                    # Manifest of prepared deep-input files
├── deep-input/                           # Per-fork input files for sub-agents
│   ├── kuwork__Backlog.md.json
│   └── ...
├── deep-output/                          # Sub-agent batch results
│   ├── batch1.json
│   └── ...
└── gh-pages/                             # Static export (--gh-pages)
    └── my-analysis/
        ├── index.html
        ├── report-stage1-full-2026-06-01.html
        └── ...
```

**Filename convention:**
```
report-stage{1|2}-{full|inc}-{YYYY-MM-DD}(-from-{parent-YYYY-MM-DD})?.html
```

Every report is a versioned file. The `-from-` suffix appears only for incremental scans and links to the parent report. The same information is stored in the HTML `<meta name="fs:meta">` tag.

**Meta tag format:**
```html
<!-- full baseline -->
<meta name="fs:meta" content="full,0,2026-06-01T02:30:00.000Z">

<!-- incremental with parent reference -->
<meta name="fs:meta" content="inc,3,2026-06-07T02:30:00.000Z,based-on:report-stage2-full-2026-06-01.html">
```

Fields: `runType,changeCount,ISOTimestamp[,based-on:parentFilename]`

## Architecture

```
CLI entry (src/index.ts)
  │
  ├── src/scan.ts         Fork discovery + branch compare
  │   └── utils/api.ts    GitHub REST client (rate-limit, retry, pagination)
  │
  ├── src/analyze.ts      Filter, cluster, bot detection
  │   └── utils/bot.ts    Bot author pattern matching
  │
  ├── src/pr-check.ts     PR lookup + emoji reactions
  │
  ├── src/deep.ts         Deep input prep + merge
  │
  ├── src/report.ts       HTML report generator
  │   └── buildReportFilename()  — date-based versioned filenames
  │   └── findLatestReport()     — parent detection from meta tags
  │
  ├── src/utils/state.ts  Incremental merge, SHA index, load/save helpers
  │   └── utils/bot.ts    Bot author pattern matching
  │
  │   └── templates/      HTML templates with {{PLACEHOLDER}} substitution
  │       ├── stage1.html
  │       ├── stage2.html
  │       └── landing.html
  │
  ├── src/serve.ts        Local dev server
  │   └── generateNavBar()  — reads meta tags, injects nav links
  │
  └── src/gh-pages.ts     Static GH Pages export
      └── dynamic file scan — copies all versioned files

tools/
└── start-analysis-backlog-data.sh  — Reproduce reports from existing data
```

### Template System

HTML templates live in `templates/` and use `{{PLACEHOLDER}}` substitution. Complex data is embedded as JSON in a `<script>window.__DATA__</script>` block. Charts and tables are rendered client-side by Chart.js and vanilla JS.

This means:
- Same template works for `--serve` and `--gh-pages`
- No server-side rendering needed
- Templates can be edited independently of source code
- Data is machine-readable in the page source

The nav bar (`nav.html`) uses `{{STAGE1_LINK}}` / `{{STAGE2_LINK}}` placeholders that are dynamically injected by `serve.ts` and `gh-pages.ts` — pointing to the latest versioned report per stage.

## Testing

Deterministic functions (change detection, merge logic, analysis, bot filtering) are tested with synthetic fixtures derived from real Shortwave data.

```bash
# Run all tests
bun test

# Run with coverage
bun test --coverage
```

Test files live in `src/__tests__/`:

| File | Tests |
|------|-------|
| `state.test.ts` | `mergeIncrementalCompare`, `buildShaIndex` |
| `scan.test.ts` | `detectChanges`, `buildOldShaMap` |
| `analyze.test.ts` | `analyze` with change injection |
| `bot.test.ts` | `isBotCommit` pattern matching |

Fixtures in `src/__tests__/fixtures/` contain synthetic fork sets, compare entries, and analysis data based on real Shortwave scan outputs.

## Required Permissions

The scanner needs **no special GitHub permissions**. It uses:

- Public API: `GET /repos/{repo}/forks`, `GET /repos/{repo}/compare/...`, `GET /repos/{repo}/pulls`
- Authenticated API: for higher rate limits (5000 req/hr vs 60 for unauthenticated)
- The token from `gh auth status` or `GH_TOKEN` env var

A fine-grained personal access token with **no scopes** works — the API is all public data.

## License

AGPL-3.0-only
