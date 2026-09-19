// Checks that the release bookkeeping agrees with itself, and optionally writes
// the GitHub Release notes. Two callers:
//
//   - CI, on every pull request and push: no RELEASE_TAG set. Verifies that the
//     version PLAYBOOK_RELEASE names in verify-tier.yml has a non-empty section
//     in CHANGELOG.md, so a release commit that forgets one of the two fails at
//     review time instead of at tag time.
//   - release.yml, on a version tag: RELEASE_TAG is the pushed tag. Additionally
//     verifies that PLAYBOOK_RELEASE equals it, and writes the CHANGELOG section
//     to NOTES_OUT for `gh release create --notes-file`.
//
// Messages are built from constants only. The tag arrives from the environment
// and is never echoed, so nothing here can be turned into a workflow command.

import { readFileSync, writeFileSync } from "node:fs";

import { extractChangelogSection, parseVersion, readPinnedRelease, readPlaybookCheckoutRef } from "./verify-lib.mjs";

function fail(message) {
  console.error(`release-check: ${message}`);
  process.exit(1);
}

const workflow = readFileSync(".github/workflows/verify-tier.yml", "utf8");
const pinned = readPinnedRelease(workflow);
const pinnedParts = parseVersion(pinned);
if (!pinnedParts) {
  fail("PLAYBOOK_RELEASE in .github/workflows/verify-tier.yml is missing or not a vX.Y.Z tag.");
}
const pinnedTag = `v${pinnedParts.join(".")}`;
if (readPlaybookCheckoutRef(workflow) !== pinnedTag) {
  fail("The playbook checkout's ref in .github/workflows/verify-tier.yml differs from PLAYBOOK_RELEASE. Set both to the release.");
}

const tagInput = process.env.RELEASE_TAG;
if (tagInput !== undefined && tagInput !== "") {
  const tagParts = parseVersion(tagInput);
  if (!tagParts) fail("RELEASE_TAG is not a vX.Y.Z tag.");
  if (`v${tagParts.join(".")}` !== pinnedTag) {
    fail("The pushed tag does not match PLAYBOOK_RELEASE in .github/workflows/verify-tier.yml. Bump it in the release commit and re-tag.");
  }
}

const notes = extractChangelogSection(readFileSync("CHANGELOG.md", "utf8"), pinnedParts.join("."));
if (notes === "") {
  fail("CHANGELOG.md has no non-empty section for the version PLAYBOOK_RELEASE names. Move the Unreleased notes under that version heading.");
}

if (process.env.NOTES_OUT) writeFileSync(process.env.NOTES_OUT, `${notes}\n`);
console.log(`release-check: ${pinnedTag} is consistent (workflow pin and CHANGELOG section agree).`);
