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

import { extractChangelogSection, readPinnedRelease, readPlaybookCheckoutRef } from "./verify-lib.mjs";

/** @returns {never} */
function fail(message) {
  console.error(`release-check: ${message}`);
  process.exit(1);
}

/** @param {string} value */
function isStableTag(value) {
  const match = /^v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/.exec(value);
  return match !== null && match[0] === value;
}

const workflow = readFileSync(".github/workflows/verify-tier.yml", "utf8");
const pinned = readPinnedRelease(workflow);
if (!pinned || !isStableTag(pinned)) {
  fail("PLAYBOOK_RELEASE in .github/workflows/verify-tier.yml is missing or not a vX.Y.Z tag.");
}
if (readPlaybookCheckoutRef(workflow) !== "${{ job.workflow_sha }}") {
  fail("The playbook checkout's ref must be job.workflow_sha so the script matches the called workflow's exact commit.");
}

const tagInput = process.env.RELEASE_TAG;
if (tagInput !== undefined && tagInput !== "") {
  if (!isStableTag(tagInput)) fail("RELEASE_TAG is not a vX.Y.Z tag.");
  if (tagInput !== pinned) {
    fail("The pushed tag does not match PLAYBOOK_RELEASE in .github/workflows/verify-tier.yml. Bump it in the release commit and re-tag.");
  }
}

const notes = extractChangelogSection(readFileSync("CHANGELOG.md", "utf8"), pinned.slice(1));
if (notes === "") {
  fail("CHANGELOG.md has no non-empty section for the version PLAYBOOK_RELEASE names. Move the Unreleased notes under that version heading.");
}

if (process.env.NOTES_OUT) writeFileSync(process.env.NOTES_OUT, `${notes}\n`);
console.log(`release-check: ${pinned} is consistent (release metadata, source ref and CHANGELOG agree).`);
