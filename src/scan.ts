import { writeFileSync, appendFileSync, readFileSync } from "fs";
import { join } from "path";
import { apiFetch, apiFetchPaginated } from "./utils/api.js";
import type { Fork, BranchCompare, CommitInfo } from "./utils/types.js";
import { UPSTREAM_BRANCH } from "./config.js";

export async function fetchForks(repo: string, outputDir: string): Promise<Fork[]> {
  console.log("Fetching forks for " + repo + "...");
  const data = await apiFetchPaginated("/repos/" + repo + "/forks");
  const forks = data.map((f: any) => ({
    full_name: f.full_name,
    owner: f.owner.login,
    default_branch: f.default_branch,
    pushed_at: f.pushed_at,
    created_at: f.created_at,
    size: f.size,
  }));
  writeFileSync(join(outputDir, "forks.json"), JSON.stringify(forks, null, 2));
  console.log("  " + forks.length + " forks found");
  return forks;
}

/** Per-branch full upstream compare with optional incremental SHA cross-ref for _is_new flagging */
async function scanForkBranches(
  repo: string,
  fork: Fork,
  oldShaMap?: Map<string, Set<string>>,
): Promise<BranchCompare[]> {
  const branches = await apiFetch("/repos/" + fork.full_name + "/branches");
  if (!branches || !Array.isArray(branches)) return [];

  const results: BranchCompare[] = [];
  for (const branch of branches) {
    const branchName = branch.name;
    const encoded = encodeURIComponent(branchName);
    const comparePath = "/repos/" + repo + "/compare/" + UPSTREAM_BRANCH + "..." + fork.owner + ":" + encoded;
    const data = await apiFetch(comparePath);
    if (!data) continue;

    const aheadBy = data.ahead_by ?? 0;
    const behindBy = data.behind_by ?? 0;
    if (aheadBy === 0 && behindBy === 0) continue;

    const files = data.files ?? [];
    const oldShas = oldShaMap?.get(fork.full_name + "/" + branchName);

    const commits = (data.commits ?? []).map((c: any) => {
      const ci: CommitInfo = {
        sha: c.sha,
        short_sha: c.sha?.slice(0, 7),
        author_login: c.author?.login ?? null,
        author_name: c.commit?.author?.name ?? null,
        author_email: c.commit?.author?.email ?? null,
        message: c.commit?.message ?? "",
        date: c.commit?.author?.date ?? null,
      };
      // Flag new commits for incremental scans
      if (oldShas && !oldShas.has(c.sha)) {
        ci._is_new = true;
      }
      return ci;
    });

    results.push({
      full_name: fork.full_name,
      branch: branchName,
      status: data.status,
      ahead_by: aheadBy,
      behind_by: behindBy,
      merge_base_sha: data.merge_base_commit?.sha ?? "",
      total_commits: commits.length,
      commits,
      total_files: files.length,
      total_additions: files.reduce((s: number, f2: any) => s + (f2.additions ?? 0), 0),
      total_deletions: files.reduce((s: number, f2: any) => s + (f2.deletions ?? 0), 0),
      files: files.map((f2: any) => ({
        filename: f2.filename,
        status: f2.status,
        additions: f2.additions,
        deletions: f2.deletions,
      })),
    });
  }
  return results;
}

export async function scanBranches(
  repo: string,
  forks: Fork[],
  outputDir: string,
  oldShaMap?: Map<string, Set<string>>,
): Promise<BranchCompare[]> {
  const mod = await import("./utils/state.js");
  const state = mod.loadState(outputDir);
  const completedSet = new Set(state.completed);
  const pending = forks.filter((f) => !completedSet.has(f.full_name));
  const BATCH = 10;

  if (pending.length > 0) {
    console.log("Scanning branches: " + state.completed.length + " done, " + pending.length + " pending");
  }

  for (let i = 0; i < pending.length; i += BATCH) {
    const batch = pending.slice(i, i + BATCH);
    const batchResults = await Promise.all(batch.map(async (fork) => {
      const results = await scanForkBranches(repo, fork, oldShaMap);
      const interesting = results.filter((r) => r.ahead_by > 0 || r.behind_by > 0);
      const status = interesting.length > 0
        ? interesting.map((r) => r.branch + "(" + r.ahead_by + "a/" + r.behind_by + "b)").join(", ")
        : "= identical";
      console.log("  [" + (state.completed.length + batch.indexOf(fork) + 1) + "/" + forks.length + "] " + fork.full_name + " " + status);
      return { fork: fork.full_name, results };
    }));

    for (const { fork, results } of batchResults) {
      for (const r of results) {
        appendFileSync(join(outputDir, "compare.jsonl"), JSON.stringify(r) + "\n");
      }
      state.completed.push(fork);
    }
    mod.saveState(outputDir, state);
  }

  const p = join(outputDir, "compare.jsonl");
  const content = readFileSync(p, "utf-8").trim();
  if (!content) return [];
  return content.split("\n").filter(Boolean).map((l: string) => JSON.parse(l));
}

/**
 * Detect which forks have changed since the last scan.
 * Returns categorized fork lists and a SHA index from old compare data.
 */
export function detectChanges(
  freshForks: Fork[],
  oldForks: Fork[],
  oldShaIndex: Map<string, Set<string>>,
): {
  newForks: Fork[];
  updatedForks: Fork[];
  unchangedForks: Fork[];
} {
  const oldLookup = new Map(oldForks.map((f) => [f.full_name, f]));
  const newForks: Fork[] = [];
  const updatedForks: Fork[] = [];
  const unchangedForks: Fork[] = [];

  for (const fork of freshForks) {
    const old = oldLookup.get(fork.full_name);
    if (!old) {
      newForks.push(fork);
    } else if (old.pushed_at !== fork.pushed_at) {
      updatedForks.push(fork);
    } else {
      unchangedForks.push(fork);
    }
  }

  return { newForks, updatedForks, unchangedForks };
}

/**
 * Build a per-fork+branch SHA set from an array of BranchCompare.
 * Key format: "full_name/branch_name"
 */
export function buildOldShaMap(compare: BranchCompare[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const entry of compare) {
    const key = entry.full_name + "/" + entry.branch;
    const shas = new Set(entry.commits.map((c) => c.sha));
    map.set(key, shas);
  }
  return map;
}
