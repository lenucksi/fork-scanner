import { describe, it, expect } from "bun:test";
import { detectChanges, buildOldShaMap } from "../scan.js";
import type { Fork, BranchCompare } from "../utils/types.js";

const TS = "2026-01-01T00:00:00Z";

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

function makeCompare(fn: string, branch: string, shas: string[]): BranchCompare {
  return {
    full_name: fn,
    branch,
    status: "ahead",
    ahead_by: shas.length,
    behind_by: 0,
    merge_base_sha: "base",
    total_commits: shas.length,
    commits: shas.map((sha) => ({
      sha,
      short_sha: sha.slice(0, 7),
      author_login: "user",
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

describe("buildOldShaMap", () => {
  it("builds SHA set per fork+branch key", () => {
    const compare = [
      makeCompare("a/Backlog.md", "main", ["s1", "s2"]),
      makeCompare("b/Backlog.md", "dev", ["s3"]),
    ];
    const map = buildOldShaMap(compare);
    expect(map.size).toBe(2);
    expect(map.get("a/Backlog.md/main")?.has("s1")).toBe(true);
    expect(map.get("a/Backlog.md/main")?.has("s2")).toBe(true);
    expect(map.get("b/Backlog.md/dev")?.has("s3")).toBe(true);
  });

  it("returns empty map for empty input", () => {
    expect(buildOldShaMap([]).size).toBe(0);
  });
});

describe("detectChanges", () => {
  const oldForks: Fork[] = [
    makeFork("a/Backlog.md", "a", "2026-05-01T00:00:00Z"),
    makeFork("b/Backlog.md", "b", "2026-05-15T00:00:00Z"),
  ];

  const oldShaIndex = new Map<string, Set<string>>();
  oldShaIndex.set("a/Backlog.md/main", new Set(["s1"]));

  it("detects new fork not in old data", () => {
    const freshForks: Fork[] = [
      ...oldForks,
      makeFork("c/Backlog.md", "c", "2026-06-01T00:00:00Z"),
    ];
    const { newForks, updatedForks, unchangedForks } = detectChanges(freshForks, oldForks, oldShaIndex);
    expect(newForks.length).toBe(1);
    expect(newForks[0].full_name).toBe("c/Backlog.md");
  });

  it("detects updated fork (pushed_at changed)", () => {
    const freshForks: Fork[] = [
      makeFork("a/Backlog.md", "a", "2026-06-01T00:00:00Z"), // pushed_at changed
      makeFork("b/Backlog.md", "b", "2026-05-15T00:00:00Z"), // same
    ];
    const { newForks, updatedForks, unchangedForks } = detectChanges(freshForks, oldForks, oldShaIndex);
    expect(newForks.length).toBe(0);
    expect(updatedForks.length).toBe(1);
    expect(updatedForks[0].full_name).toBe("a/Backlog.md");
    expect(unchangedForks.length).toBe(1);
  });

  it("returns empty change sets when nothing changed", () => {
    const freshForks = [...oldForks];
    const { newForks, updatedForks, unchangedForks } = detectChanges(freshForks, oldForks, oldShaIndex);
    expect(newForks.length).toBe(0);
    expect(updatedForks.length).toBe(0);
    expect(unchangedForks.length).toBe(2);
  });

  it("handles empty old forks (first scan)", () => {
    const freshForks = [makeFork("a/Backlog.md", "a", "2026-06-01T00:00:00Z")];
    const { newForks, updatedForks } = detectChanges(freshForks, [], oldShaIndex);
    expect(newForks.length).toBe(1);
    expect(updatedForks.length).toBe(0);
  });

  it("handles both empty", () => {
    const { newForks, updatedForks, unchangedForks } = detectChanges([], [], new Map());
    expect(newForks.length).toBe(0);
    expect(updatedForks.length).toBe(0);
    expect(unchangedForks.length).toBe(0);
  });
});
