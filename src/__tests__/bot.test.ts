// SPDX-License-Identifier: AGPL-3.0-only
import { describe, it, expect } from "bun:test";
import { isBotCommit, BOT_PATTERNS } from "../utils/bot.js";

function makeCommit(login: string, name: string) {
  return {
    author: { login },
    commit: { author: { name } },
  };
}

describe("isBotCommit", () => {
  it("detects dependabot by login", () => {
    expect(isBotCommit(makeCommit("dependabot[bot]", "dependabot"))).toBe(true);
  });

  it("detects renovate by login", () => {
    expect(isBotCommit(makeCommit("renovate[bot]", "Renovate"))).toBe(true);
  });

  it("detects github-actions by login", () => {
    expect(isBotCommit(makeCommit("github-actions[bot]", "GitHub Actions"))).toBe(true);
  });

  it("detects snyk by login", () => {
    expect(isBotCommit(makeCommit("snyk-bot", "Snyk"))).toBe(true);
  });

  it("returns false for a real human", () => {
    expect(isBotCommit(makeCommit("lenucksi", "Lenucksi"))).toBe(false);
  });

  it("returns false for empty commit", () => {
    expect(isBotCommit({ author: { login: "" }, commit: { author: { name: "" } } })).toBe(false);
  });

  it("returns false for null fields", () => {
    expect(isBotCommit({ author: { login: null }, commit: { author: { name: null } } })).toBe(false);
  });

  it("handles missing author gracefully", () => {
    expect(isBotCommit({})).toBe(false);
  });

  it("has at least 30 bot patterns", () => {
    expect(BOT_PATTERNS.length).toBeGreaterThanOrEqual(30);
  });

  it("matches [bot] suffix convention", () => {
    expect(isBotCommit(makeCommit("some-random-bot[bot]", "Some Bot"))).toBe(true);
  });
});
