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
# Stage 1 — fork discovery, branch compare, PR matching (no LLM needed)
npx fork-scan MrLesk/Backlog.md --serve

# Opens at http://localhost:4099
```

## Table of Contents

- [Installation](#installation)
- [Usage](#usage)
- [Modes](#modes)
  - [Stage 1 — Deterministic Scan](#stage-1--deterministic-scan)
  - [Stage 2 — Deep Analysis](#stage-2--deep-analysis)
  - [Interactive Mode](#interactive-mode)
  - [GitHub Pages Export](#github-pages-export)
- [OpenCode Skill](#opencode-skill)
  - [Skill Mode (Harness)](#skill-mode-harness)
  - [Standalone Mode](#standalone-mode)
- [Output Structure](#output-structure)
- [Architecture](#architecture)
- [Templates](#templates)
- [Permissions](#required-permissions)

## Installation

```bash
# Global install
npm install -g @backlog/fork-scanner

# Or run directly
npx @backlog/fork-scanner MrLesk/Backlog.md

# From source
git clone https://github.com/your-org/fork-scanner.git
cd fork-scanner
bun install
bun src/index.ts MrLesk/Backlog.md
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
fork-scan MrLesk/Backlog.md --gh-pages

# Custom output directory
fork-scan MrLesk/Backlog.md -o ./reports/my-scan

# Versioned output (keeps previous runs)
fork-scan MrLesk/Backlog.md --version
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
├── report-stage1.html       ← Open this
├── forks.json               # All 338 forks
├── compare.jsonl            # Branch comparisons
├── analysis.json            # Filtered + clustered
├── prs.json                 # PR matching + reactions
└── state.json               # Resumable scan state
```

### Stage 2 — Deep Analysis

Adds AI-powered classification on top of Stage 1.

**Two flavours:** | Mode | LLM Source | Setup | --- | --- | --- | **OpenCode Skill** | Coding harness (Task tool sub-agents) | No key needed | **Standalone CLI** | Anthropic API direct | `ANTHROPIC_API_KEY` or `--llm-key` | **What it adds:**

- Feature classification per fork (tags, value assessment, upstreamability score)
- Priority matrix sorted by impact × upstreamability
- Feature heatmap (what's built most often in the community)
- PR status per fork (merged / open / closed + reaction timeline)
- Interactive checkboxes + notes per fork (persisted to `notes.json`)

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
fork-scan MrLesk/Backlog.md --gh-pages
```

Exports to `<output>/gh-pages/`:

```
gh-pages/
├── index.html                 ← Landing page
├── report-stage1.html         ← Stage 1 report
├── report-stage2.html         ← Stage 2 (if available)
├── analysis.json              ← Machine-readable data
├── forks.json
├── prs.json
└── .nojekyll                  ← For GH Pages compatibility
```

The export is fully static — no save-note endpoints, no server needed.

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

4. Optionally: `fork-scan MrLesk/Backlog.md --serve`
   → Start the local report server

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
├── report-stage1.html           # Stage 1: all forks, charts, tables
├── report-stage2.html           # Stage 2: deep analysis, priority matrix
├── report-stage1-v1.html        # Versioned (with --version flag)
├── report-stage2-v1.html
├── forks.json                   # Raw fork metadata
├── compare.jsonl                # Branch-by-branch comparison results
├── analysis.json                # Filtered, clustered, bot-detected
├── prs.json                     # PR matching + reactions
├── state.json                   # Resumable scan state
├── notes.json                   # User notes (from serve.ts save-note)
├── deep-manifest.json           # Manifest of prepared deep-input files
├── deep-input/                  # Per-fork input files for sub-agents
│   ├── kuwork__Backlog.md.json
│   └── ...
├── deep-output/                 # Sub-agent batch results
│   ├── batch1.json
│   └── ...
└── gh-pages/                    # Static export (--gh-pages)
    ├── index.html
    ├── report-stage1.html
    ├── .nojekyll
    └── ...
```

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
  │   └── templates/      HTML templates with {{PLACEHOLDER}} substitution
  │       ├── stage1.html
  │       ├── stage2.html
  │       └── landing.html
  │
  ├── src/serve.ts        Local dev server (notes persistence)
  │
  └── src/gh-pages.ts     Static GH Pages export

opencode/                 OpenCode integration
├── fork-scan-skill/
│   └── SKILL.md
└── scan.yaml
```

### Template System

HTML templates live in `templates/` and use `{{PLACEHOLDER}}` substitution. Complex data is embedded as JSON in a `<script>window.__DATA__</script>` block. Charts and tables are rendered client-side by Chart.js and vanilla JS.

This means:
- Same template works for `--serve` and `--gh-pages`
- No server-side rendering needed
- Templates can be edited independently of source code
- Data is machine-readable in the page source

## Required Permissions

The scanner needs **no special GitHub permissions**. It uses:

- Public API: `GET /repos/{repo}/forks`, `GET /repos/{repo}/compare/...`, `GET /repos/{repo}/pulls`
- Authenticated API: for higher rate limits (5000 req/hr vs 60 for unauthenticated)
- The token from `gh auth status` or `GH_TOKEN` env var

A fine-grained personal access token with **no scopes** works — the API is all public data.

## License

MIT
