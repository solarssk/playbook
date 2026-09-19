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
  const match = /^Tier:\s*(\d)\b/m.exec(stripFencedBlocks(markdown));
  return match ? Number(match[1]) : null;
}

// The fence run (three or more backticks or tildes) if `line` is a fence line, else
// null. CommonMark allows at most three spaces of indentation: four spaces or a tab
// makes the line indented code, not a fence. And the info string of a backtick
// fence may not itself contain a backtick.
function fenceRun(line) {
  let start = 0;
  while (line[start] === " ") start += 1;
  const char = line[start];
  if (start > 3 || (char !== "`" && char !== "~")) return null;
  let end = start;
  while (line[end] === char) end += 1;
  if (end - start < 3) return null;
  return char === "`" && line.slice(end).includes("`") ? null : line.slice(start, end);
}

// Removes fenced code blocks, line by line, following CommonMark: a block opens on
// a run of three or more backticks or tildes and closes only on a line holding
// nothing but a run of the same character at least as long. So a four-backtick
// fence can display a three-backtick example without the inner line closing it.
// Only fences at column 0 to 3 count. A fence nested deeper (under a list item)
// holds lines that are themselves indented, and this is used to find a
// column-0 `Tier:` line, so nothing inside one could match anyway. (A single
// regex over the whole document backtracks super-linearly on an unterminated
// fence; a line scan does not.)
export function stripFencedBlocks(markdown) {
  const kept = [];
  let open = null;
  for (const line of markdown.split("\n")) {
    const run = fenceRun(line);
    if (open === null) {
      if (run === null) kept.push(line);
      else open = { char: run[0], length: run.length };
    } else if (run !== null && run.startsWith(open.char) && run.length >= open.length && line.trim() === run) {
      open = null;
    }
  }
  return kept.join("\n");
}

// The `PLAYBOOK_RELEASE: vX.Y.Z` value from verify-tier.yml, or null.
export function readPinnedRelease(workflowText) {
  const key = "PLAYBOOK_RELEASE:";
  for (const line of stripYamlComments(workflowText).split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith(key)) continue;
    const value = unquote(trimmed.slice(key.length).trim());
    return value === "" || /\s/.test(value) ? null : value;
  }
  return null;
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

// The trigger names a workflow declares under its top-level `on:` key: a block
// (`on:` then two-space keys), an inline list (`on: [push, pull_request]`), or a
// single name (`on: push`). Line-based, like the other helpers here.
export function workflowTriggers(workflowText) {
  const lines = stripYamlComments(workflowText).split("\n");
  const start = lines.findIndex((line) => /^["']?on["']?:/.test(line));
  if (start === -1) return [];
  const inline = lines[start].slice(lines[start].indexOf(":") + 1).trim();
  if (inline !== "") {
    return inline.replaceAll(/[[\]{}]/g, " ").split(",").map((part) => part.split(":")[0].trim()).filter(Boolean);
  }
  const triggers = [];
  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line)) break;
    const key = /^ {2}([A-Za-z_]+):/.exec(line);
    if (key) triggers.push(key[1]);
  }
  return triggers;
}

// True for a workflow that can only be started by another workflow
// (`workflow_call` is its sole trigger). `concurrency:` belongs to the calling
// workflow in that case, so a checker should not expect one here. Any other
// trigger, listed or not, makes the workflow triggerable on its own.
export function isReusableOnly(workflowText) {
  const triggers = workflowTriggers(workflowText);
  return triggers.length === 1 && triggers[0] === "workflow_call";
}

// Strips one pair of matching quotes from a YAML scalar.
function unquote(text) {
  const first = text[0];
  return text.length >= 2 && (first === '"' || first === "'") && text.at(-1) === first ? text.slice(1, -1) : text;
}

// The jobs in a workflow's `jobs:` block: each job's key, its `name:` when it
// has one, and whether it calls a reusable workflow. Line-based, like the other
// helpers here: it reads the two-space job keys and the four-space `name:` and
// `uses:` beneath them.
function parseJobs(workflowText) {
  const jobs = [];
  let inJobs = false;
  for (const line of stripYamlComments(workflowText).split("\n")) {
    if (/^jobs:\s*$/.test(line)) {
      inJobs = true;
      continue;
    }
    if (!inJobs) continue;
    if (/^\S/.test(line)) {
      inJobs = false;
      continue;
    }
    const key = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line);
    if (key) {
      jobs.push({ key: key[1], name: null, reusable: false });
      continue;
    }
    const current = jobs.at(-1);
    if (!current) continue;
    if (line.startsWith("    name:")) current.name = unquote(line.slice("    name:".length).trim());
    else if (line.startsWith("    uses:")) current.reusable = true;
  }
  return jobs;
}

// An anchored pattern for the check name a job reports. A name containing
// `${{ ... }}` (a matrix job, for instance) can only be matched loosely, so its
// expression becomes a wildcard. A job that calls a reusable workflow reports as
// "<its name> / <called job>", and the suffix is required: the bare caller name
// is never the name of a check that runs (a skipped job is the one exception,
// and requiring a skipped check is not something to encourage).
function patternFor({ key, name, reusable }) {
  const escape = (text) => text.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
  const source = (name ?? key).split(/\$\{\{[^}]*\}\}/).map(escape).join(".+");
  return new RegExp(reusable ? `^${source} / .+$` : `^${source}$`);
}

// Static names a workflow's jobs report as check contexts, as anchored regular
// expressions. A job reports as its `name:` when it has one, otherwise its key.
export function reportedCheckPatterns(workflowText) {
  return parseJobs(workflowText).map(patternFor);
}

// The required contexts that no job in the given workflow files would report.
export function unmatchedRequiredContexts(contexts, workflowTexts) {
  const patterns = workflowTexts.flatMap(reportedCheckPatterns);
  return contexts.filter((context) => !patterns.some((pattern) => pattern.test(context)));
}

// Reads the "Documentation impact" checkboxes from a pull request body.
// "No doc update needed" only counts with a real reason: the template's own
// placeholder text does not.
export function readDocsImpactDeclaration(body) {
  return {
    docsUpdated: /^- \[[xX]\] Docs updated\s*$/m.test(body),
    noDocsUpdate: /^- \[[xX]\] No doc update needed: (?!<state the reason>\s*$)\S.+$/m.test(body),
  };
}
