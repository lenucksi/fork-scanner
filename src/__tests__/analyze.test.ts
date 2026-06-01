import { describe, it, expect, beforeAll } from "bun:test";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { analyze } from "../analyze.js";
import type { Fork, BranchCompare, ForkAnalysis } from "../utils/types.js";

const TS = "2026-01-01T00:00:00Z";

let tmpDir: string;

function makeFork(fn: string, owner: string, pushed: string): Fork {
  return {
    full_name: fn,
    owner,
    default_branch: "main",
    pushed_at: pushed,
    created_at: "2025-01-01T00:00:00Z",
    size: 100,
  };
}

function makeCompare(fn: string, branch: string, ahead: number, shas: string[]): BranchCompare {
  return {
    full_name: fn,
    branch,
    status: "ahead",
    ahead_by: ahead,
    behind_by: 0,
    merge_base_sha: "base",
    total_commits: shas.length,
    commits: shas.map((sha) => ({
      sha,
      short_sha: sha.slice(0, 7),
      author_login: fn.split("/")[0],
      author_name: "User",
      author_email: "u@x.com",
      message: `commit ${sha}`,
      date: TS,
    })),
    total_files: 0,
    total_additions: 0,
    total_deletions: 0,
    files: [],
  };
}

beforeAll(() => {
  tmpDir = join(tmpdir(), "fork-scan-test-" + Date.now());
  if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });
});

describe("analyze", () => {
  it("produces analysis from forks and compare data", () => {
    const forks = [makeFork("lenucksi/Backlog.md", "lenucksi", TS)];
    const results = [makeCompare("lenucksi/Backlog.md", "feature/a", 3, ["s1", "s2", "s3"])];

    const out = analyze(forks, results, tmpDir);
    expect(out.length).toBe(1);
    expect(out[0].full_name).toBe("lenucksi/Backlog.md");
    expect(out[0].total_branches_with_changes).toBe(1);
    expect(out[0].max_ahead).toBe(3);
    expect(out[0].is_bot_only).toBe(false);
  });

  it("detects bot-only forks", () => {
    const forks = [makeFork("bot-user/Backlog.md", "bot-user", TS)];
    const results = [makeCompare("bot-user/Backlog.md", "main", 2, ["s1", "s2"])];
    // Override commit author to be a bot
    results[0].commits.forEach((c) => {
      c.author_login = "dependabot[bot]";
      c.author_name = "dependabot";
    });

    const out = analyze(forks, results, tmpDir);
    expect(out[0].is_bot_only).toBe(true);
  });

  it("injects _change and _new_commits from forkChanges map", () => {
    const forks = [makeFork("lenucksi/Backlog.md", "lenucksi", TS)];
    const results = [makeCompare("lenucksi/Backlog.md", "feature/a", 4, ["s1", "s2", "s3", "s4"])];

    const changes = new Map<string, { change: "new" | "updated" | "rewritten" | "unchanged"; new_commits: number; rewritten_commits: number }>();
    changes.set("lenucksi/Backlog.md/feature/a", { change: "updated", new_commits: 1, rewritten_commits: 0 });

    const out = analyze(forks, results, tmpDir, changes);
    expect(out[0]._change).toBe("updated");
    expect(out[0]._new_commits).toBe(1);
    expect(out[0]._rewritten_commits).toBeUndefined();
  });

  it("injects _change=rewritten when branch is force-pushed", () => {
    const forks = [makeFork("r/Backlog.md", "r", TS)];
    const results = [makeCompare("r/Backlog.md", "main", 2, ["n1", "n2"])];

    const changes = new Map<string, { change: "new" | "updated" | "rewritten" | "unchanged"; new_commits: number; rewritten_commits: number }>();
    changes.set("r/Backlog.md/main", { change: "rewritten", new_commits: 2, rewritten_commits: 3 });

    const out = analyze(forks, results, tmpDir, changes);
    expect(out[0]._change).toBe("rewritten");
    expect(out[0]._new_commits).toBe(2);
    expect(out[0]._rewritten_commits).toBe(3);
  });

  it("sorts by max_ahead descending", () => {
    const forks = [
      makeFork("b/Backlog.md", "b", TS),
      makeFork("a/Backlog.md", "a", TS),
    ];
    const results = [
      makeCompare("b/Backlog.md", "main", 1, ["s1"]),
      makeCompare("a/Backlog.md", "main", 5, ["s1", "s2"]),
    ];
    // Fix ahead_by to match
    results[0].ahead_by = 1;
    results[1].ahead_by = 5;

    const out = analyze(forks, results, tmpDir);
    expect(out[0].full_name).toBe("a/Backlog.md");
    expect(out[1].full_name).toBe("b/Backlog.md");
  });

  it("writes analysis.json to output dir", () => {
    const forks = [makeFork("w/Backlog.md", "w", TS)];
    const results = [makeCompare("w/Backlog.md", "main", 1, ["s1"])];

    analyze(forks, results, tmpDir);
    const written = JSON.parse(readFileSync(join(tmpDir, "analysis.json"), "utf-8"));
    expect(written.length).toBe(1);
    expect(written[0].full_name).toBe("w/Backlog.md");
  });

  it("handles empty forks and results", () => {
    const out = analyze([], [], tmpDir);
    expect(out.length).toBe(0);
  });
});
