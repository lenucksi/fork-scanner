// SPDX-License-Identifier: AGPL-3.0-only

import { readFileSync, writeFileSync, existsSync, readdirSync } from "fs";
import { join, dirname } from "path";
import type { Fork, BranchCompare, ForkAnalysis, DeepAnalysis, PRInfo } from "./utils/types.js";
import { categorizePushed, PUSHED_LABELS } from "./config.js";

const __dirname = dirname(new URL(import.meta.url).pathname);
const TEMPLATE_DIR = join(__dirname, "..", "templates");

function parseTimestampFromFilename(filename: string): string {
  const m = filename.match(/-(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] + "T00:00:00.000Z" : "";
}

function loadTemplate(name: string): string {
  return readFileSync(join(TEMPLATE_DIR, name + ".html"), "utf-8");
}

function esc(s: any): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function getStats(forks: Fork[], analysis: ForkAnalysis[], allResults: BranchCompare[]) {
  let identical = 0, behind = 0, aheadBot = 0, aheadHuman = 0;
  const resultNames = new Set(allResults.map((r) => r.full_name));
  for (const f of forks) {
    if (!resultNames.has(f.full_name)) { identical++; continue; }
    const a = analysis.find((a2) => a2.full_name === f.full_name);
    if (!a) { identical++; continue; }
    if (a.is_bot_only) aheadBot++;
    else if (a.max_ahead === 0 && a.max_behind > 0) behind++;
    else if (a.max_ahead > 0) aheadHuman++;
    else identical++;
  }
  return { identical, behind, aheadBot, aheadHuman };
}

function getPushedDist(forks: Fork[]): Record<string, number> {
  const dist: Record<string, number> = { "last-30-days": 0, "last-3-months": 0, "last-6-months": 0, "last-year": 0, "older": 0, "never": 0 };
  for (const f of forks) dist[categorizePushed(f.pushed_at)]++;
  return dist;
}

function buildReportFilename(stage: number, runType: string, timestamp: string, parentFilename?: string): string {
  const datePart = timestamp.slice(0, 10);
  const base = `report-stage${stage}-${runType}-${datePart}`;
  if (parentFilename) {
    const parentMatch = parentFilename.match(/-(\d{4}-\d{2}-\d{2})/);
    const parentDate = parentMatch ? parentMatch[1] : "unknown";
    return `${base}-from-${parentDate}.html`;
  }
  return `${base}.html`;
}

function findLatestReport(outputDir: string, stage: number): { filename: string; timestamp: string } | null {
  let latest: { filename: string; timestamp: string } | null = null;
  try {
    for (const f of readdirSync(outputDir)) {
      const m = f.match(new RegExp(`^report-stage${stage}-(full|inc)-\\d{4}-\\d{2}-\\d{2}(-from-\\d{4}-\\d{2}-\\d{2})?\\.html$`));
      if (!m) continue;
      const fp = join(outputDir, f);
      const content = readFileSync(fp, "utf-8");
      const meta = content.match(/<meta name="fs:meta" content="([^"]+)">/);
      let ts = "";
      if (meta) {
        const parts = meta[1].split(",");
        ts = parts[2] || "";
      }
      if (!ts) {
        ts = parseTimestampFromFilename(f);
      }
      if (!latest || ts > latest.timestamp) {
        latest = { filename: f, timestamp: ts };
      }
    }
  } catch {}
  return latest;
}

export function generateStage1Report(
  forks: Fork[], allResults: BranchCompare[], analysis: ForkAnalysis[],
  outputDir: string, repo: string,
) {
  const stats = getStats(forks, analysis, allResults);
  const pushedDist = getPushedDist(forks);
  const interesting = analysis.filter((s) => !s.is_bot_only && s.max_ahead > 0);
  const pushedLabels = Object.keys(PUSHED_LABELS).map((k) => PUSHED_LABELS[k]);
  const pushedValues = Object.keys(PUSHED_LABELS).map((k) => pushedDist[k] || 0);
  const data = {
    stats: { total: forks.length, identical: stats.identical, behind: stats.behind, aheadBot: stats.aheadBot, aheadHuman: stats.aheadHuman },
    pushedLabels, pushedValues,
    interesting: interesting.map((s) => ({
      full_name: s.full_name, pushed_at: s.pushed_at, max_ahead: s.max_ahead, max_behind: s.max_behind,
      _change: s._change, _new_commits: s._new_commits, _rewritten_commits: s._rewritten_commits,
      branches: s.branches.map((b) => ({ branch: b.branch, ahead_by: b.ahead_by, behind_by: b.behind_by, files: b.files })),
    })),
  };

  let html = loadTemplate("stage1");
  html = html.replace("{{TOTAL_FORKS}}", String(forks.length));
  html = html.replace("{{REPO}}", esc(repo));
  const runType1 = interesting.some((f: ForkAnalysis) => f._change !== undefined) ? "inc" : "full";
  html = html.replace("{{DATE}}", new Date().toISOString().slice(0, 10));
  html = html.replace("{{RUN_TYPE}}", runType1 === "inc" ? "Incremental scan" : "Full scan");
  html = html.replace("{{DATA_JSON}}", JSON.stringify(data));

  const runType = runType1;
  const changeCount = interesting.filter((f: ForkAnalysis) => f._change !== undefined && f._change !== "unchanged").length;
  const nowISO = new Date().toISOString();
  const parent = runType === "inc" ? findLatestReport(outputDir, 1) : null;
  const parentRef = parent ? `,based-on:${parent.filename}` : "";
  html = html.replace("</head>", '<meta name="fs:meta" content="' + runType + ',' + changeCount + ',' + nowISO + parentRef + '">\n</head>');

  const fn = buildReportFilename(1, runType, nowISO, parent?.filename);
  writeFileSync(join(outputDir, fn), html);
  console.log("Stage 1 report: " + join(outputDir, fn));
}

export function generateStage2Report(
  forks: Fork[], allResults: BranchCompare[], analysis: ForkAnalysis[],
  outputDir: string, deepMap: Map<string, DeepAnalysis>, prMap: Map<string, PRInfo[]>,
  userNotes: any = {}, repo: string = "?",
) {
  const stats = getStats(forks, analysis, allResults);

  const deepEntries = [...deepMap.entries()];
  const valueOrder: Record<string, number> = { high: 3, medium: 2, low: 1 };
  const ordered = deepEntries
    .map(([name, r]) => {
      const f = analysis.find((a) => a.full_name === name);
      const prs = prMap.get(name) || [];
      const allFiles = f?.branches?.flatMap((b) => b.files) || [];
      return {
        full_name: name, title: r.title, description: r.description,
        tags: r.tags, value: r.value_assessment, upstream: r.upstreamability,
        focus: r.main_focus, has_code: r.has_code_changes,
        _updates: r._updates,
        _change: f?._change || "unchanged",
        max_ahead: f?.max_ahead ?? 0, max_behind: f?.max_behind ?? 0, pushed_at: f?.pushed_at ?? "",
        files: allFiles.length,
        adds: allFiles.reduce((s, f2) => s + (f2.additions || 0), 0),
        dels: allFiles.reduce((s, f2) => s + (f2.deletions || 0), 0),
        prs: prs.map((p) => ({
          number: p.number, title: p.title, state: p.state,
          created_at: p.created_at, merged_at: p.merged_at,
          reaction_count: p.reaction_count,
        })),
        _merged_upstream: prs.length > 0 && prs.every(p => p.merged_at),
        branches: f?.branches?.filter((b) => b.ahead_by > 0).map((b) => ({
          name: b.branch, ahead: b.ahead_by, behind: b.behind_by, files: b.total_files,
        })) || [],
      };
    })
    .sort((a, b) => {
      const va = valueOrder[a.value] || 0;
      const vb = valueOrder[b.value] || 0;
      return (vb * 10 + (b.upstream || 0)) - (va * 10 + (a.upstream || 0));
    });

  // Feature heatmap
  const heatmap: Record<string, number> = {};
  for (const [, r] of deepEntries) {
    for (const tag of r.tags || []) heatmap[tag] = (heatmap[tag] || 0) + 1;
  }
  const sortedFeatures = Object.entries(heatmap).sort((a, b) => b[1] - a[1]);

  const interestingCount = analysis.filter((s: ForkAnalysis) => !s.is_bot_only && s.max_ahead > 0).length;
  const data = {
    stats: {
      total: forks.length, identical: stats.identical, behind: stats.behind,
      aheadBot: stats.aheadBot, aheadHuman: stats.aheadHuman,
      deepAnalyzed: deepEntries.length,
      interestingForks: interestingCount,
      highValue: deepEntries.filter(([, r]) => r.value_assessment === "high").length,
    },
    ordered, heatmap: sortedFeatures, forkCount: deepEntries.length,
    details: ordered, notes: userNotes,
  };

  let html = loadTemplate("stage2");
  html = html.replace("{{TOTAL_FORKS}}", String(forks.length));
  html = html.replace("{{REPO}}", esc(repo));
  const runType2 = ordered.some((f: any) => f._change && f._change !== "unchanged") ? "inc" : "full";
  html = html.replace("{{DATE}}", new Date().toISOString().slice(0, 10));
  html = html.replace("{{RUN_TYPE}}", runType2 === "inc" ? "Incremental scan" : "Full scan");
  html = html.replace("{{DATA_JSON}}", JSON.stringify(data));

  const runType = runType2;
  const changeCount = ordered.filter((f: any) => f._change && f._change !== "unchanged").length;
  const nowISO = new Date().toISOString();
  const parent = runType === "inc" ? findLatestReport(outputDir, 2) : null;
  const parentRef = parent ? `,based-on:${parent.filename}` : "";
  html = html.replace("</head>", '<meta name="fs:meta" content="' + runType + ',' + changeCount + ',' + nowISO + parentRef + '">\n</head>');

  const fn = buildReportFilename(2, runType, nowISO, parent?.filename);
  writeFileSync(join(outputDir, fn), html);
  console.log("Stage 2 report: " + join(outputDir, fn));
}

export function generateLanding(reports: any[], outputDir: string) {
  // Sort by timestamp descending, group by stage, number sequentially
  const grouped = new Map<string, { name: string; file: string; timestamp: string; stage: string; }[]>();
  for (const r of reports) {
    const stage = r.stage || ((r.file || "").includes("stage2") ? "Stage 2" : "Stage 1");
    if (!grouped.has(stage)) grouped.set(stage, []);
    grouped.get(stage)!.push(r);
  }
  for (const [, group] of grouped) {
    group.sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""));
  }

  // Flatten: all stages interleaved, newest first
  const flat = [...grouped.entries()]
    .sort((a, b) => {
      const aMax = a[1][0]?.timestamp || "";
      const bMax = b[1][0]?.timestamp || "";
      return bMax.localeCompare(aMax);
    })
    .flatMap(([stage, items]) =>
      items.map((r, i) => ({
        ...r,
        stage,
        seq: items.length > 1 ? i + 1 : undefined,
      }))
    );

  let html = loadTemplate("landing");
  // Inject nav bar for static export (gh-pages) - resolve latest per stage
  const navTmpl = readFileSync(join(TEMPLATE_DIR, "nav.html"), "utf-8");
  let navHtml = navTmpl.replace("{{VERSION_OPTIONS}}", "");
  const stage1Latest = flat.find((r: any) => r.stage === "Stage 1")?.file || "report-stage1.html";
  const stage2Latest = flat.find((r: any) => r.stage === "Stage 2")?.file || "report-stage2.html";
  navHtml = navHtml.replace("{{STAGE1_LINK}}", stage1Latest);
  navHtml = navHtml.replace("{{STAGE2_LINK}}", stage2Latest);
  html = html.replace("{{NAV_BAR}}", navHtml);
  html = html.replace("{{REPOS_JSON}}", JSON.stringify(flat));
  html = html.replace("{{DATE}}", new Date().toISOString().slice(0, 10));
  writeFileSync(join(outputDir, "index.html"), html);
  console.log("Landing page: " + join(outputDir, "index.html"));
}
