import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import type { Fork, BranchCompare, ForkAnalysis } from "./utils/types.js";
import { isBotCommit } from "./utils/bot.js";
import { categorizePushed } from "./config.js";

export function analyze(
  forks: Fork[],
  results: BranchCompare[],
  outputDir: string,
  forkChanges?: Map<string, { change: "new" | "updated" | "rewritten" | "unchanged"; new_commits: number; rewritten_commits: number }>,
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

    // Aggregate change info from the changes map (per-branch) up to fork level
    let change: "new" | "updated" | "rewritten" | "unchanged" | undefined;
    let newCommits = 0;
    let rewrittenCommits = 0;
    if (forkChanges) {
      // Collect per-branch changes for this fork
      let hasRewrite = false;
      let hasUpdate = false;
      for (const [key, val] of forkChanges) {
        if (key.startsWith(full_name + "/")) {
          newCommits += val.new_commits;
          rewrittenCommits += val.rewritten_commits;
          if (val.change === "rewritten") hasRewrite = true;
          else if (val.change === "updated" && val.new_commits > 0) hasUpdate = true;
        }
      }
      // Also check direct fork entry (for new forks)
      const direct = forkChanges.get(full_name);
      if (direct) {
        newCommits += direct.new_commits;
        if (direct.change === "rewritten") hasRewrite = true;
        if (direct.change === "updated") hasUpdate = true;
      }
      if (hasRewrite) change = "rewritten";
      else if (newCommits > 0) change = "updated";
      else change = "unchanged";
    }

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
      _change: change,
      _new_commits: newCommits > 0 ? newCommits : undefined,
      _rewritten_commits: rewrittenCommits > 0 ? rewrittenCommits : undefined,
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
