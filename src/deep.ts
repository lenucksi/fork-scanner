import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import type { ForkAnalysis, DeepAnalysis, DeepInput } from "./utils/types.js";

const SHARED_BRANCH_THRESHOLD = 5;

export function computeBranchFreq(analysis: ForkAnalysis[]): Record<string, number> {
  const freq: Record<string, number> = {};
  for (const f of analysis) {
    for (const b of f.branches) {
      freq[b.branch] = (freq[b.branch] || 0) + 1;
    }
  }
  return freq;
}

export function prepareDeepInputs(
  analysis: ForkAnalysis[],
  exclude: string[],
  limit: number,
  outputDir: string,
): DeepInput[] {
  const branchFreq = computeBranchFreq(analysis);

  let candidates = analysis.filter((f) => {
    if (exclude.includes(f.full_name)) return false;
    if (f.is_bot_only) return false;
    if (f.max_ahead === 0) return false;
    return true;
  });

  candidates.sort((a: any, b: any) => b.max_ahead - a.max_ahead);
  const top = candidates.slice(0, limit);

  const inputDir = join(outputDir, "deep-input");
  if (!existsSync(inputDir)) mkdirSync(inputDir, { recursive: true });

  const inputs: DeepInput[] = [];

  for (const fork of top) {
    const interestingBranches = fork.branches.filter((b: any) => {
      if (b.branch === "main") return b.ahead_by > 0;
      return (branchFreq[b.branch] || 0) < SHARED_BRANCH_THRESHOLD;
    });

    if (interestingBranches.length === 0) continue;

    const input: DeepInput = {
      full_name: fork.full_name,
      url: "https://github.com/" + fork.full_name,
      pushed_at: fork.pushed_at,
      max_ahead: fork.max_ahead,
      max_behind: fork.max_behind,
      pushed_category: fork.pushed_category,
      branches: interestingBranches.map((b: any) => ({
        name: b.branch,
        ahead_by: b.ahead_by,
        behind_by: b.behind_by,
        total_commits: b.total_commits,
        commits: (b.commits || []).slice(0, 10).map((c: any) => ({
          sha: c.short_sha,
          author: c.author_login || c.author_name,
          message: c.message,
          date: c.date,
        })),
        total_files: b.total_files,
        total_additions: b.total_additions,
        total_deletions: b.total_deletions,
        files: (b.files || []).slice(0, 30).map((f2: any) => ({
          filename: f2.filename,
          status: f2.status,
          additions: f2.additions,
          deletions: f2.deletions,
        })),
      })),
    };

    inputs.push(input);
    const forkName = fork.full_name.replace("/", "__");
    writeFileSync(join(inputDir, forkName + ".json"), JSON.stringify(input, null, 2));
  }

  // Write manifest
  const manifest = inputs.map((i) => ({
    full_name: i.full_name,
    input_file: i.full_name.replace("/", "__") + ".json",
  }));
  writeFileSync(join(outputDir, "deep-manifest.json"), JSON.stringify(manifest, null, 2));

  return inputs;
}

export function mergeDeepResults(
  analysis: ForkAnalysis[],
  deepOutputDir: string,
): Map<string, DeepAnalysis> {
  const result = new Map<string, DeepAnalysis>();
  const dir = deepOutputDir || join(deepOutputDir, "..", "deep-output");

  if (existsSync(dir)) {
    for (let i = 1; i <= 20; i++) {
      const fp = join(dir, "batch" + i + ".json");
      if (existsSync(fp)) {
        const batch: DeepAnalysis[] = JSON.parse(readFileSync(fp, "utf-8"));
        for (const r of batch) result.set(r.full_name, r);
      }
    }
  }

  return result;
}