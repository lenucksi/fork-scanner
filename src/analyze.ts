import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import type { Fork, BranchCompare, ForkAnalysis } from "./utils/types.js";
import { isBotCommit } from "./utils/bot.js";
import { categorizePushed } from "./config.js";

export function analyze(
  forks: Fork[],
  results: BranchCompare[],
  outputDir: string,
): ForkAnalysis[] {
  const branchFreq: Record<string, number> = {};
  for (const r of results) {
    branchFreq[r.branch] = (branchFreq[r.branch] || 0) + 1;
  }

  const forkMap = new Map<string, BranchCompare[]>();
  for (const r of results) {
    if (!forkMap.has(r.full_name)) forkMap.set(r.full_name, []);
    forkMap.get(r.full_name)!.push(r);
  }

  const forkMeta = new Map(forks.map((f) => [f.full_name, f]));
  const summaries: ForkAnalysis[] = [];

  for (const [full_name, branches] of forkMap) {
    const meta = forkMeta.get(full_name);
    const allCommits = branches.flatMap((b) => b.commits);
    const botOnly = allCommits.length > 0 && allCommits.every(isBotCommit);
    const maxAhead = Math.max(...branches.map((b) => b.ahead_by), 0);
    const mergeBases = branches.filter((b) => b.merge_base_sha);
    const clusterSha = mergeBases.length > 0
      ? mergeBases.sort((a, b) => b.ahead_by - a.ahead_by)[0].merge_base_sha.slice(0, 7)
      : "unknown";

    summaries.push({
      full_name,
      owner: meta?.owner ?? full_name.split("/")[0],
      pushed_at: meta?.pushed_at ?? "",
      total_branches_with_changes: branches.length,
      max_ahead: maxAhead,
      max_behind: Math.max(...branches.map((b) => b.behind_by), 0),
      is_bot_only: botOnly,
      branches,
      cluster_group: clusterSha,
      pushed_category: categorizePushed(meta?.pushed_at ?? ""),
    });
  }

  summaries.sort((a, b) => b.max_ahead - a.max_ahead);
  writeFileSync(join(outputDir, "analysis.json"), JSON.stringify(summaries, null, 2));
  return summaries;
}

export function getSharedBranchThreshold(results: BranchCompare[]): number {
  const freq: Record<string, number> = {};
  for (const r of results) freq[r.branch] = (freq[r.branch] || 0) + 1;
  return 5; // appears in 5+ forks = shared
}

export function branchFreq(results: BranchCompare[]): Record<string, number> {
  const freq: Record<string, number> = {};
  for (const r of results) freq[r.branch] = (freq[r.branch] || 0) + 1;
  return freq;
}
