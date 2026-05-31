// SPDX-License-Identifier: AGPL-3.0-only
const BOT_PATTERNS = [
  /\[bot\]$/i,
  /^dependabot/i, /^renovate/i, /^snyk/i, /^github-actions/i,
  /^github-classroom/i, /^imgbot/i, /^codecov/i, /^codacy-bot/i,
  /^deepsource/i, /^lgtm/i, /^scalingo/i, /^sonarcloud/i,
  /^sourcery/i, /^stackery/i, /^goreleaser/i, /^semantic-release/i,
  /^changeset-bot/i, /^allcontributors/i, /^stale/i, /^netlify/i,
  /^crowdin/i, /^transifex/i, /^lokalise/i, /^pre-commit-hook/i,
  /^pyup/i, /^greenkeeper/i, /^sibbell/i, /^gitlocalize/i,
  /^mend/i, /^whitesource/i, /^fork-contributor/i,
  /^google-labs-jules/i, /^atlassian-compass/i,
];

export function isBotCommit(commit: any): boolean {
  const login = commit.author?.login || commit.author_login || "";
  const name = commit.commit?.author?.name || commit.author_name || "";
  return BOT_PATTERNS.some((p) => p.test(login) || p.test(name));
}

export { BOT_PATTERNS };
