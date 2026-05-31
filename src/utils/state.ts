// SPDX-License-Identifier: AGPL-3.0-only
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

export function loadState(outputDir: string): { completed: string[]; results: BranchResult[] } {
  const p = join(outputDir, "state.json");
  if (existsSync(p)) return JSON.parse(readFileSync(p, "utf-8"));
  return { completed: [], results: [] };
}

export function saveState(outputDir: string, state: any) {
  writeFileSync(join(outputDir, "state.json"), JSON.stringify(state, null, 2));
}

import type { BranchCompare, Fork, CommitInfo } from "./types.js";

interface BranchResult extends BranchCompare {}

/** Load existing forks.json — returns empty array if not found */
export function loadForks(outputDir: string): Fork[] {
  const p = join(outputDir, "forks.json");
  if (existsSync(p)) return JSON.parse(readFileSync(p, "utf-8"));
  return [];
}

/** Load compare.jsonl as array of BranchCompare — returns empty array if not found */
export function loadCompareJsonl(outputDir: string): BranchCompare[] {
  const p = join(outputDir, "compare.jsonl");
  if (!existsSync(p)) return [];
  const raw = readFileSync(p, "utf-8").trim();
  if (!raw) return [];
  return raw.split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

/** Write array of BranchCompare back to compare.jsonl */
export function saveCompareJsonl(outputDir: string, entries: BranchCompare[]) {
  const p = join(outputDir, "compare.jsonl");
  const lines = entries.map((e) => JSON.stringify(e)).join("\n");
  writeFileSync(p, lines + (lines ? "\n" : ""));
}

/** Build index: fork+branch → { tip_sha, all_shas_set(sha), commits, merge_base_sha } */
export function buildShaIndex(compare: BranchCompare[]): Map<string, {
  tip_sha: string;
  shas: Set<string>;
  merge_base_sha: string;
  commits: CommitInfo[];
}> {
  const idx = new Map<string, { tip_sha: string; shas: Set<string>; merge_base_sha: string; commits: CommitInfo[] }>();
  for (const entry of compare) {
    const key = entry.full_name + "/" + entry.branch;
    const shas = new Set(entry.commits.map((c) => c.sha));
    const tip = entry.commits.length > 0 ? entry.commits[entry.commits.length - 1].sha : "";
    idx.set(key, { tip_sha: tip, shas, merge_base_sha: entry.merge_base_sha, commits: entry.commits });
  }
  return idx;
}

/**
 * Merge old compare data with new delta data for incremental scans.
 * For each fork+branch in newData:
 *   - Look up old shas via shaIndex
 *   - Flag new commits (_is_new) that don't appear in old shas
 *   - Detect force-push if old merge_base_sha differs and old shas partially missing
 * Returns merged array and change metadata map: fork+branch → { change, new_commits, rewritten_commits }
 */
export function mergeIncrementalCompare(
  oldData: BranchCompare[],
  newData: BranchCompare[],
): { merged: BranchCompare[]; changes: Map<string, { change: "new" | "updated" | "rewritten"; new_commits: number; rewritten_commits: number }> } {
  const shaIndex = buildShaIndex(oldData);
  const changes = new Map<string, { change: "new" | "updated" | "rewritten"; new_commits: number; rewritten_commits: number }>();

  // Start with old data, but remove entries that are superseded by new data
  const superseded = new Set<string>();
  for (const entry of newData) {
    superseded.add(entry.full_name + "/" + entry.branch);
  }

  const merged = oldData.filter((e) => !superseded.has(e.full_name + "/" + e.branch));

  // Process new data
  for (const entry of newData) {
    const key = entry.full_name + "/" + entry.branch;
    const oldIdx = shaIndex.get(key);
    const newShas = entry.commits.map((c) => c.sha);

    if (!oldIdx) {
      // Completely new fork+branch
      for (const c of entry.commits) c._is_new = true;
      changes.set(key, { change: "new", new_commits: entry.total_commits, rewritten_commits: 0 });
    } else {
      const oldShaSet = oldIdx.shas;
      const oldTip = oldIdx.tip_sha;
      const oldMergeBase = oldIdx.merge_base_sha;

      // Flag new commits
      let newCount = 0;
      let rewrittenCount = 0;
      for (const c of entry.commits) {
        if (!oldShaSet.has(c.sha)) {
          c._is_new = true;
          newCount++;
        }
      }

      // Detect force-push: merge base changed AND old tip is missing from new commits
      const newTip = newShas.length > 0 ? newShas[newShas.length - 1] : "";
      const oldTipInNew = newShas.includes(oldTip);
      const mergeBaseChanged = oldMergeBase !== entry.merge_base_sha;
      const isRewrite = mergeBaseChanged && !oldTipInNew && oldShaSet.size > 0;

      if (isRewrite) {
        rewrittenCount = oldShaSet.size;
        changes.set(key, { change: "rewritten", new_commits: newCount, rewritten_commits: rewrittenCount });
      } else if (newCount > 0) {
        changes.set(key, { change: "updated", new_commits: newCount, rewritten_commits: 0 });
      } else {
        // No actual new commits despite pushed_at change — treat as unchanged
        changes.set(key, { change: "updated", new_commits: 0, rewritten_commits: 0 });
      }
    }

    merged.push(entry);
  }

  return { merged, changes };
}
