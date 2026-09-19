// Pure helpers shared by verify-tier.mjs and release-check.mjs. Nothing in
// here touches the filesystem, the network, or process state, so every function
// can be unit-tested directly (see verify-lib.test.mjs).

// "v1.2.3" or "1.2.3" -> [1, 2, 3]; anything else -> null.
export function parseVersion(tag) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(tag ?? "");
  return match ? match.slice(1).map(Number) : null;
}

// True when `candidate` is a strictly higher [major, minor, patch] than `current`.
export function isNewer(candidate, current) {
  for (let i = 0; i < 3; i += 1) {
    if (candidate[i] !== current[i]) return candidate[i] > current[i];
  }
  return false;
}

// Drops YAML comments so a `uses:` written inside a comment (a usage example in
// a header, for instance) is not mistaken for a real step. A `#` only starts a
// comment at the start of a line or after whitespace, which leaves `#` inside
// a URL or a ref untouched.
export function stripYamlComments(text) {
  return text.replace(/(^|\s)#.*$/gm, "$1");
}

// Every `uses: <action>@<ref>` in workflow text whose ref is not a full
// 40-character commit SHA. Local (`./path`) and docker references carry no `@`
// and are ignored.
export function findFloatingActionRefs(workflowText) {
  const pattern = /uses:\s*([^\s@]+)@([^\s#]+)/g;
  const floating = [];
  let match;
  while ((match = pattern.exec(stripYamlComments(workflowText)))) {
    const [, action, ref] = match;
    if (!/^[0-9a-f]{40}$/.test(ref)) floating.push(`${action}@${ref}`);
  }
  return floating;
}

// Reads a declared `Tier: N` line from an AGENTS.md-style document. Fenced code
// blocks are ignored: the playbook's own docs quote the pointer block as an
// example inside a fence, and that example must not be read as the document's
// own declaration.
export function detectDeclaredTier(markdown) {
  const match = stripFencedBlocks(markdown).match(/^Tier:\s*(\d)\b/m);
  return match ? Number(match[1]) : null;
}

// Removes fenced code blocks, line by line. A block opens on a line starting
// with ``` or ~~~ and closes on the next line that starts with the same marker.
// (A single regex over the whole document backtracks super-linearly on an
// unterminated fence; a line scan does not.)
export function stripFencedBlocks(markdown) {
  const kept = [];
  let openMarker = null;
  for (const line of markdown.split("\n")) {
    const marker = /^(```|~~~)/.exec(line)?.[1] ?? null;
    if (openMarker === null) {
      if (marker === null) kept.push(line);
      else openMarker = marker;
    } else if (marker === openMarker) {
      openMarker = null;
    }
  }
  return kept.join("\n");
}

// The `PLAYBOOK_RELEASE: vX.Y.Z` value from verify-tier.yml, or null.
export function readPinnedRelease(workflowText) {
  const match = /^\s+PLAYBOOK_RELEASE:\s*(\S+)\s*$/m.exec(stripYamlComments(workflowText));
  return match ? match[1] : null;
}

// The body of the `## [<version>]` section of a Keep-a-Changelog file, trimmed,
// or an empty string when the section is missing or has no content.
export function extractChangelogSection(changelog, version) {
  const lines = changelog.split("\n");
  const heading = `## [${version}]`;
  const start = lines.findIndex((line) => line.startsWith(heading));
  if (start === -1) return "";
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (lines[i].startsWith("## [")) {
      end = i;
      break;
    }
  }
  return lines.slice(start + 1, end).join("\n").trim();
}

// True for a workflow that can only be started by another workflow
// (`on: workflow_call` with no other trigger). `concurrency:` belongs to the
// calling workflow in that case, so a checker should not expect one here.
export function isReusableOnly(workflowText) {
  const text = stripYamlComments(workflowText);
  return /^\s{2}workflow_call:/m.test(text) &&
    !/^\s{2}(push|pull_request|pull_request_target|schedule|workflow_dispatch|release|workflow_run|branch_protection_rule):/m.test(text);
}

// Static names a workflow's jobs report as check contexts, as anchored regular
// expressions. A job reports as its `name:` when it has one, otherwise its key.
// A name containing `${{ ... }}` (a matrix job, for instance) can only be
// matched loosely, so its expression becomes a wildcard. A job that calls a
// reusable workflow reports as "<its name> / <called job>". Line-based, like the
// other helpers here: it reads the two-space job keys and four-space `name:`.
export function reportedCheckPatterns(workflowText) {
  const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const lines = stripYamlComments(workflowText).split("\n");
  const jobs = [];
  let inJobs = false;
  for (const line of lines) {
    if (/^jobs:\s*$/.test(line)) {
      inJobs = true;
    } else if (inJobs && /^\S/.test(line)) {
      inJobs = false;
    } else if (inJobs) {
      const key = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line);
      if (key) jobs.push({ key: key[1], name: null, reusable: false });
      const current = jobs[jobs.length - 1];
      const name = /^ {4}name:\s*(.+?)\s*$/.exec(line);
      if (current && name) current.name = name[1].replace(/^(["'])(.*)\1$/, "$2");
      if (current && /^ {4}uses:/.test(line)) current.reusable = true;
    }
  }
  return jobs.map(({ key, name, reusable }) => {
    const display = name ?? key;
    const source = display.split(/\$\{\{[^}]*\}\}/).map(escape).join(".+");
    return new RegExp(reusable ? `^${source}( / .+)?$` : `^${source}$`);
  });
}

// The required contexts that no job in the given workflow files would report.
export function unmatchedRequiredContexts(contexts, workflowTexts) {
  const patterns = workflowTexts.flatMap(reportedCheckPatterns);
  return contexts.filter((context) => !patterns.some((pattern) => pattern.test(context)));
}
