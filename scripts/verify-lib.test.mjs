import assert from "node:assert/strict";
import { test } from "node:test";

import {
  detectDeclaredTier,
  extractChangelogSection,
  findFloatingActionRefs,
  isNewer,
  isReusableOnly,
  parseVersion,
  readPinnedRelease,
  stripFencedBlocks,
  stripYamlComments,
} from "./verify-lib.mjs";

const SHA = "3d3c42e5aac5ba805825da76410c181273ba90b1";

test("parseVersion accepts vX.Y.Z and X.Y.Z, rejects everything else", () => {
  assert.deepEqual(parseVersion("v0.1.1"), [0, 1, 1]);
  assert.deepEqual(parseVersion("12.0.30"), [12, 0, 30]);
  for (const bad of ["v1.2", "v1.2.3-rc1", "latest", "", null, undefined, "v1.2.3\n::error::x"]) {
    assert.equal(parseVersion(bad), null, `should reject ${JSON.stringify(bad)}`);
  }
});

test("isNewer compares major, then minor, then patch, and is strict", () => {
  assert.equal(isNewer([0, 2, 0], [0, 1, 9]), true);
  assert.equal(isNewer([1, 0, 0], [0, 99, 99]), true);
  assert.equal(isNewer([0, 1, 2], [0, 1, 1]), true);
  assert.equal(isNewer([0, 1, 1], [0, 1, 1]), false);
  assert.equal(isNewer([0, 1, 0], [0, 1, 1]), false);
});

test("stripYamlComments removes comments but keeps a # that is part of a value", () => {
  assert.equal(stripYamlComments("# whole line").trim(), "");
  assert.equal(stripYamlComments("uses: a/b@sha  # v1").trim(), "uses: a/b@sha");
  assert.equal(stripYamlComments("url: https://x.test/a#frag").trim(), "url: https://x.test/a#frag");
});

test("findFloatingActionRefs flags tags and branches, accepts full SHAs", () => {
  const workflow = [
    `      - uses: actions/checkout@${SHA}  # v7.0.1`,
    "      - uses: actions/setup-node@v4",
    "      - uses: some/action@main",
    "      - uses: ./.github/actions/local",
  ].join("\n");
  assert.deepEqual(findFloatingActionRefs(workflow), ["actions/setup-node@v4", "some/action@main"]);
});

test("findFloatingActionRefs ignores a `uses:` that only appears in a comment", () => {
  const workflow = [
    "# Usage:",
    "#   uses: solarssk/playbook/.github/workflows/verify-tier.yml@<commit-sha>  # v0.1.1",
    `      - uses: actions/checkout@${SHA}`,
  ].join("\n");
  assert.deepEqual(findFloatingActionRefs(workflow), []);
});

test("findFloatingActionRefs rejects a short SHA", () => {
  assert.deepEqual(findFloatingActionRefs("      - uses: a/b@3d3c42e"), ["a/b@3d3c42e"]);
});

test("detectDeclaredTier reads a real declaration", () => {
  assert.equal(detectDeclaredTier("# Agents\n\nTier: 2 (see docs)\n"), 2);
  assert.equal(detectDeclaredTier("nothing here"), null);
});

test("detectDeclaredTier ignores a Tier line quoted inside a fenced block", () => {
  const doc = ["## Example", "", "```markdown", "Tier: 3", "```", ""].join("\n");
  assert.equal(detectDeclaredTier(doc), null);
  assert.equal(detectDeclaredTier(`${doc}\nTier: 1\n`), 1);
});

test("readPinnedRelease reads the env value and ignores a commented-out one", () => {
  const workflow = ["env:", "  # PLAYBOOK_RELEASE: v9.9.9", "  PLAYBOOK_RELEASE: v0.2.0  # bumped by the release commit"].join("\n");
  assert.equal(readPinnedRelease(workflow), "v0.2.0");
  assert.equal(readPinnedRelease("env: {}"), null);
});

test("extractChangelogSection returns only the requested version's body", () => {
  const changelog = [
    "# Changelog",
    "",
    "## [Unreleased]",
    "",
    "### Added",
    "- not released yet",
    "",
    "## [0.2.0] - 2026-09-20",
    "",
    "### Added",
    "- the new thing",
    "",
    "## [0.1.2] - 2026-09-08",
    "",
    "- older",
  ].join("\n");
  assert.equal(extractChangelogSection(changelog, "0.2.0"), "### Added\n- the new thing");
  assert.equal(extractChangelogSection(changelog, "0.1.2"), "- older");
  assert.equal(extractChangelogSection(changelog, "0.3.0"), "");
  assert.equal(extractChangelogSection(changelog, "Unreleased"), "### Added\n- not released yet");
});

test("extractChangelogSection treats a heading with no body as empty", () => {
  assert.equal(extractChangelogSection("## [1.0.0]\n\n## [0.9.0]\n- x", "1.0.0"), "");
});

test("isReusableOnly is true only for a workflow_call-only trigger set", () => {
  assert.equal(isReusableOnly("on:\n  workflow_call:\n    inputs: {}\n"), true);
  assert.equal(isReusableOnly("on:\n  push:\n    branches: [main]\n"), false);
  assert.equal(isReusableOnly("on:\n  workflow_call:\n  schedule:\n    - cron: '0 0 * * 0'\n"), false);
  assert.equal(isReusableOnly("on:\n  # workflow_call:\n  push:\n"), false);
});

test("stripFencedBlocks drops fenced content, keeps the rest, and tolerates an unterminated fence", () => {
  assert.equal(stripFencedBlocks("a\n```md\nTier: 3\n```\nb"), "a\nb");
  assert.equal(stripFencedBlocks("a\n~~~\nx\n~~~\nb"), "a\nb");
  assert.equal(stripFencedBlocks("a\n```\nnever closed"), "a");
  assert.equal(stripFencedBlocks("a\n```\nx\n~~~\ny\n```\nb"), "a\nb");
});
