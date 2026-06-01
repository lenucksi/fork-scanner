import { describe, it, expect } from "bun:test";
import { buildShaIndex, mergeIncrementalCompare } from "../utils/state.js";
import type { BranchCompare, CommitInfo } from "../utils/types.js";

const TS = "2026-05-01T12:00:00Z";

function makeCompare(
  full_name: string,
  branch: string,
  mergeBase: string,
  shas: string[],
): BranchCompare {
  return {
    full_name,
    branch,
    status: "ahead",
    ahead_by: shas.length,
    behind_by: 0,
    merge_base_sha: mergeBase,
    total_commits: shas.length,
    commits: shas.map((sha) => ({
      sha,
      short_sha: sha.slice(0, 7),
      author_login: "testuser",
      author_name: "Test User",
      author_email: "test@x.com",
      message: `commit ${sha}`,
      date: TS,
    })),
    total_files: 0,
    total_additions: 0,
    total_deletions: 0,
    files: [],
  };
}

describe("buildShaIndex", () => {
  it("builds index from compare entries", () => {
    const compare = [
      makeCompare("lenucksi/Backlog.md", "feature/a", "abc", ["sha1", "sha2"]),
      makeCompare("lenucksi/Backlog.md", "feature/b", "def", ["sha3"]),
    ];
    const idx = buildShaIndex(compare);
    expect(idx.size).toBe(2);

    const keyA = "lenucksi/Backlog.md/feature/a";
    expect(idx.get(keyA)?.tip_sha).toBe("sha2");
    expect(idx.get(keyA)?.shas.has("sha1")).toBe(true);
    expect(idx.get(keyA)?.shas.has("sha2")).toBe(true);
    expect(idx.get(keyA)?.merge_base_sha).toBe("abc");

    const keyB = "lenucksi/Backlog.md/feature/b";
    expect(idx.get(keyB)?.tip_sha).toBe("sha3");
    expect(idx.get(keyB)?.merge_base_sha).toBe("def");
  });

  it("returns empty map for empty input", () => {
    const idx = buildShaIndex([]);
    expect(idx.size).toBe(0);
  });

  it("handles commits without SHAs gracefully", () => {
    const compare = [makeCompare("x/y", "main", "base", [])];
    const idx = buildShaIndex(compare);
    const key = "x/y/main";
    expect(idx.get(key)?.tip_sha).toBe("");
    expect(idx.get(key)?.shas.size).toBe(0);
  });
});

describe("mergeIncrementalCompare", () => {
  it("flags new fork+branch as 'new' with all commits _is_new", () => {
    const oldData: BranchCompare[] = [];
    const newData = [makeCompare("new/Backlog.md", "main", "abc", ["s1", "s2"])];

    const { merged, changes } = mergeIncrementalCompare(oldData, newData);
    expect(merged.length).toBe(1);
    expect(merged[0].commits.every((c) => c._is_new)).toBe(true);

    const key = "new/Backlog.md/main";
    expect(changes.get(key)?.change).toBe("new");
    expect(changes.get(key)?.new_commits).toBe(2);
  });

  it("detects updated fork (same merge_base, new SHAs)", () => {
    const oldData = [makeCompare("lenucksi/Backlog.md", "feature/x", "abc", ["s1", "s2"])];
    const newData = [makeCompare("lenucksi/Backlog.md", "feature/x", "abc", ["s1", "s2", "s3"])];

    const { merged, changes } = mergeIncrementalCompare(oldData, newData);
    const key = "lenucksi/Backlog.md/feature/x";
    expect(changes.get(key)?.change).toBe("updated");
    expect(changes.get(key)?.new_commits).toBe(1);

    // Old SHAs not flagged, new one is
    const commitS1 = merged.find((e) => e.branch === "feature/x")!.commits.find((c) => c.sha === "s1")!;
    const commitS3 = merged.find((e) => e.branch === "feature/x")!.commits.find((c) => c.sha === "s3")!;
    expect(commitS1._is_new).toBeUndefined();
    expect(commitS3._is_new).toBe(true);
  });

  it("marks unchanged when no new SHAs despite same key", () => {
    const oldData = [makeCompare("u/Backlog.md", "main", "abc", ["s1"])];
    const newData = [makeCompare("u/Backlog.md", "main", "abc", ["s1"])];

    const { merged, changes } = mergeIncrementalCompare(oldData, newData);
    const key = "u/Backlog.md/main";
    expect(changes.get(key)?.change).toBe("updated");
    expect(changes.get(key)?.new_commits).toBe(0);
    expect(merged.length).toBe(1);
  });

  it("detects rewritten (force-push: different merge_base, old tip missing)", () => {
    const oldData = [makeCompare("lenucksi/Backlog.md", "feature/r", "oldbase", ["o1", "o2", "o3"])];
    const newData = [makeCompare("lenucksi/Backlog.md", "feature/r", "newbase", ["n1", "n2"])];

    const { merged, changes } = mergeIncrementalCompare(oldData, newData);
    const key = "lenucksi/Backlog.md/feature/r";
    expect(changes.get(key)?.change).toBe("rewritten");
    expect(changes.get(key)?.new_commits).toBe(2);
    expect(changes.get(key)?.rewritten_commits).toBe(3);
    // All new commits flagged _is_new
    expect(merged.find((e) => e.branch === "feature/r")!.commits.every((c) => c._is_new)).toBe(true);
  });

  it("preserves old entries that are not superseded by new data", () => {
    const oldData = [
      makeCompare("keep/Backlog.md", "stable", "abc", ["s1"]),
      makeCompare("replace/Backlog.md", "wip", "def", ["s2"]),
    ];
    const newData = [makeCompare("replace/Backlog.md", "wip", "def", ["s2", "s3"])];

    const { merged } = mergeIncrementalCompare(oldData, newData);
    expect(merged.length).toBe(2);
    expect(merged.some((e) => e.full_name === "keep/Backlog.md" && e.branch === "stable")).toBe(true);
    expect(merged.some((e) => e.full_name === "replace/Backlog.md" && e.branch === "wip")).toBe(true);
  });

  it("produces empty merged for empty old and new", () => {
    const { merged, changes } = mergeIncrementalCompare([], []);
    expect(merged.length).toBe(0);
    expect(changes.size).toBe(0);
  });
});
