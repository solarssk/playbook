# CI Cookbook

A practical, copy-paste reference for wiring up CI/CD security and quality tooling on a repository.
This is not a "turn everything on" checklist: a small single-purpose tool and a flagship product
with real users carry different risk, different maintenance budgets, and shouldn't carry the same
CI weight. Every recipe below states which tier(s) it applies to; skipping a tool for a Tier 1 repo
is a legitimate decision, not a shortcut someone forgot to take.

Every snippet here is a working pattern verified against real CI configuration, not invented from
documentation memory. Action names and commit SHAs should be treated as verified starting points,
current as of the time this doc was written; keep them fresh with Dependabot (§1) rather than
hand-copying them indefinitely. Placeholders like `<owner>/<repo>` or `<org>` stand in for values
specific to the repo you're configuring.

## Tiers

| Tier | What it is | Shape of the repo |
|---|---|---|
| **Tier 1** | Small, single-purpose tool. Solo-maintained, no external users depending on its output; may not ship a container image at all. | An internal CLI, a personal automation script, a small library consumed by one other project. |
| **Tier 2** | Public tool with real users or dependents. Ships an artifact (package, container image, plugin) that strangers install and rely on; has an issue tracker other people actually file into. | A published container image on a registry, a public npm/pip package, a plugin distributed to other projects. |
| **Tier 3** | Flagship / keystone project. Self-hosted product handling sensitive data (auth, personal data, anything payments-adjacent), multi-service architecture: the repo that would cause the most damage if it shipped a vulnerability. | The primary product whose failure would do the most damage. |

Treat this as a spectrum, not a rigid checklist. A mostly-dormant Tier 2 repo doesn't need every
Tier 3 recipe; a Tier 1 repo that suddenly gets real users should move up.

## Contents

1. [Pin GitHub Actions to a commit SHA](#1-pin-github-actions-to-a-commit-sha)
2. [Concurrency groups (cancel on supersede vs never cancel a release)](#2-concurrency-groups-cancel-on-supersede-vs-never-cancel-a-release)
3. [Dependency vulnerability audit (pip-audit, npm audit, osv-scanner)](#3-dependency-vulnerability-audit-pip-audit-npm-audit-osv-scanner)
4. [Dependabot (one file, every ecosystem)](#4-dependabot-one-file-every-ecosystem)
5. [CodeQL (minimal, correct, least privilege)](#5-codeql-minimal-correct-least-privilege)
6. [Semgrep (SAST for what CodeQL does not cover)](#6-semgrep-sast-for-what-codeql-does-not-cover)
7. [gitleaks (CI secret scanning, not a replacement for platform scanning)](#7-gitleaks-ci-secret-scanning-not-a-replacement-for-platform-scanning)
8. [Trivy (scan the artifact that actually ships)](#8-trivy-scan-the-artifact-that-actually-ships)
9. [Codecov (a real signal, not yet a gate)](#9-codecov-a-real-signal-not-yet-a-gate)
10. [SonarCloud (Automatic Analysis vs CI-based analysis)](#10-sonarcloud-automatic-analysis-vs-ci-based-analysis)
11. [SBOM generation on release (CycloneDX)](#11-sbom-generation-on-release-cyclonedx)
12. [Docs as source of truth, and catching stale docs at PR time](#12-docs-as-source-of-truth-and-catching-stale-docs-at-pr-time)
13. [Verifying a repo against this standard automatically](#13-verifying-a-repo-against-this-standard-automatically)
14. [Hash-pinned dependency lockfile (Python: pip-compile)](#14-hash-pinned-dependency-lockfile-python-pip-compile)
15. [Linting workflows (actionlint and zizmor)](#15-linting-workflows-actionlint-and-zizmor)

---

## 1. Pin GitHub Actions to a commit SHA

**Why:** `uses: owner/action@v4` is a mutable pointer, not a version. The action's maintainer, or
anyone who compromises their account or the marketplace listing, can repoint that tag at different
code at any time, and every workflow using it starts running the new code on its next trigger, with
no diff and no review in your repo. A commit SHA is immutable: `uses: owner/action@<40-char-sha>`
guarantees the exact code that ran in your last CI run is the code that runs again tomorrow, until
you deliberately bump it.

**When to use it:** All tiers, no exceptions. This is the cheapest, highest-leverage supply-chain
control available, and Dependabot removes essentially all of its maintenance cost.

**Pattern:**

```yaml
steps:
  - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1  # v7.0.1
    with:
      persist-credentials: false
```

The trailing `# vX.Y.Z` comment is for humans only (GitHub Actions ignores it), but keep it,
because Dependabot writes and maintains it automatically and it's the only way to eyeball what
version a pin corresponds to. This depends on the comment already being an exact version: a bare
major alias like `# v6` is not something Dependabot rewrites in place. A real Dependabot commit
bumping a pin from v6.2.0 to v7.0.0 has been observed leaving a pre-existing `# v6` comment
untouched, which now names the wrong major version rather than merely a stale one. Always write
the exact pinned version in the comment, never a bare major, so Dependabot's own bump PRs keep it
accurate.

**Finding and updating pins:**

- **Preferred, ongoing:** Dependabot's `github-actions` ecosystem. Add it once and Dependabot opens
  a PR every time a pinned action's tag moves forward, bumping both the SHA and an already-exact
  version comment together. It does not retroactively fix a comment that was never an exact
  version to begin with.

  ```yaml
  # .github/dependabot.yml
  version: 2
  updates:
    - package-ecosystem: "github-actions"
      directory: "/"
      schedule:
        interval: "weekly"
      cooldown:
        default-days: 7
      groups:
        codeql-action:
          patterns:
            - "github/codeql-action/*"
  ```

  The `cooldown:` block waits a week before proposing a freshly published version (see §4). The `groups:` block is optional. It's worth adding for any action family whose sub-actions are
  always bumped together (`github/codeql-action/init`, `/autobuild`, `/analyze`,
  `/upload-sarif`), so a version bump lands as one PR instead of four.

- **One-off / manual:** resolve a tag to its commit yourself and copy the SHA:

  ```bash
  git ls-remote --tags https://github.com/<owner>/<repo> <tag>
  ```

---

## 2. Concurrency groups (cancel on supersede vs never cancel a release)

**Why:** without a `concurrency:` block, every push or retriggered event starts a fully independent
workflow run; runs pile up, finish out of order, and burn minutes. `concurrency:` tells GitHub "at
most one run in this group may be active: queue or cancel the rest." There are two shapes, and
they are **not interchangeable**.

### a) CI / PR pattern: cancel superseded runs

**When to use it:** every workflow triggered by `push`/`pull_request` (CI, CodeQL, Semgrep), all
tiers. A new push to a PR makes the previous run's result irrelevant, so there's no reason to let it
keep burning minutes. `cancel-in-progress` is gated on not being the trunk branch, so a push to
`main` is never raced against a redundant duplicate run of the same commit.

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: ${{ github.ref != 'refs/heads/main' }}
```

(The identical pattern applies to every non-release workflow: `ci.yml`, `codeql.yml`,
`semgrep.yml`.)

### b) Release / publish pattern: never cancel mid-flight

**When to use it:** any workflow that publishes something with irreversible side effects: a
container image push, an SBOM upload, a GitHub Release creation. Tier 2+ (Tier 1 tools that publish
nothing usually have nothing to gate here). Cancelling a release workflow partway through does not
roll any of that back. It leaves a half-published state (an image tag that exists but was never
scanned, a release with no assets) with no automatic recovery. The only safe default is
`cancel-in-progress: false`, always.

```yaml
concurrency:
  group: release-${{ github.repository }}
  cancel-in-progress: false
```

If a workflow can target different refs (e.g. `workflow_dispatch` with a `ref` input alongside a
normal tag push), group by the *resolved, canonicalized* target instead of the workflow name alone.
A concurrency group holds at most one *running* **and** one *pending* run, not a FIFO queue, so
grouping too broadly means an unrelated third run (a different tag, a scheduled re-scan with no tag
at all) can silently replace the pending run and drop a real release with no error anywhere:

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ contains(inputs.ref || github.ref, 'refs/tags/') && (inputs.ref || github.ref) || format('refs/tags/{0}', inputs.ref || github.ref) }}
  cancel-in-progress: false
```

**This bug class is common enough to name explicitly, and it shows up in two distinct ways.** The
first: the (a) pattern gets copy-pasted into a release/publish workflow, keeping
`cancel-in-progress: ${{ github.ref != 'refs/heads/main' }}`. A tag push's `github.ref` is
`refs/tags/vX.Y.Z`, never `refs/heads/main`, so that expression evaluates to `true` on *every* tag
push. A second matching run (a retry, a follow-up tag) can then cancel a publish that already had a
container pushed, an SBOM uploaded, or a GitHub Release half-created, with no rollback. The second:
a publish workflow with a side-effecting multi-arch build-and-release step ships with **no**
concurrency group at all, copied from a template that assumed CI's own protections already applied.
Treat "does this workflow publish anything" as the fork in the road for which pattern to use. Never
assume the CI pattern is safe by default.

---

## 3. Dependency vulnerability audit (pip-audit, npm audit, osv-scanner)

**Why:** Dependabot's security-updates alert (Tier 0) is passive: it opens a PR against a known
vulnerability that's already in the dependency graph, on its own schedule, and does nothing to
stop a PR from *introducing* a fresh vulnerable pin in the first place. A CI audit step closes
that gap: it runs against the exact manifest a PR proposes, before merge, and fails the build the
moment a known-CVE dependency is added or reintroduced. It's also the single cheapest, most
legible control in this cookbook: no external account, no token, seconds of runtime against an
already-pinned dependency set (Tier 1 already requires pinned dependencies, so there's no
floating-version noise to fight), and it's the one check here a stranger can reproduce
unassisted against bare source with one command.

**When to use it:** Tier 1 and up, no exceptions. This is cheap enough, and closes a common
enough gap, that "the repo is small" isn't a reason to skip it.

**Pattern (Python, pip-audit):**

```yaml
      - name: Audit dependencies for known vulnerabilities
        run: |
          python -m pip install --break-system-packages pip-audit==2.9.0
          pip-audit -r requirements.txt
```

**Pattern (Node, npm audit):**

```yaml
      - name: Audit dependencies for known vulnerabilities
        run: npm audit --omit=dev --audit-level=high
```

`--omit=dev` scopes the audit to what actually ships; a dev-only tool's transitive CVE isn't
runtime exposure, and including it is the most common source of noise that gets this check
disabled six months in. `--audit-level=high` (or pip-audit's own severity filtering, where
available) keeps LOW/MEDIUM findings visible without blocking on them.

**Pattern (language-agnostic, OSV database, for a stack pip-audit/npm audit don't cover):**
call the reusable workflows this project publishes for exactly this purpose, not its underlying
action directly. The action's own `action.yml` says plainly it isn't meant for direct use, since
its behavior can change between minor versions; the reusable workflow is the supported interface.

```yaml
# .github/workflows/osv-scanner.yml
name: OSV-Scanner

on:
  pull_request:
  schedule:
    - cron: "0 7 * * 1"

permissions:
  contents: read

jobs:
  scan-pr:
    if: github.event_name == 'pull_request'
    permissions:
      actions: read # the called workflow declares it; a caller cannot grant less than that
      contents: read
      security-events: write # upload SARIF; granted to this job only
    uses: google/osv-scanner-action/.github/workflows/osv-scanner-reusable-pr.yml@6e4298ebc4db23e847df9b2e2de2939d6f066c67  # v2.5.1

  scan-scheduled:
    if: github.event_name == 'schedule'
    permissions:
      actions: read # the called workflow declares it; a caller cannot grant less than that
      contents: read
      security-events: write # upload SARIF; granted to this job only
    uses: google/osv-scanner-action/.github/workflows/osv-scanner-reusable.yml@6e4298ebc4db23e847df9b2e2de2939d6f066c67  # v2.5.1
```

Pinned to a commit SHA like every other `uses:` (§1), including a reusable workflow: a tag can be
moved, a SHA cannot. Use the SHA of whatever the project's current release is when you adopt this
(check its own releases page), and keep it fresh via Dependabot's `github-actions` ecosystem
(§4). `security-events: write` sits on the two jobs that upload SARIF, not at the top of the file,
so nothing else in the workflow inherits it. A reusable workflow can only be granted what the
caller allows, and this one declares `actions: read` as well, so a caller that grants less fails
at startup with no log (`startup_failure`), not with a permissions error.

**Avoiding the "permanently red" failure mode:** a real known-unfixable transitive CVE (no patched
version published yet) will otherwise block every unrelated PR indefinitely, which is exactly how
a check like this gets ignored or disabled. Start report-only (`continue-on-error: true`, or
`npm audit` without `--audit-level` gating the job's exit code) for the first few weeks on an
existing repo with an unaudited dependency tree, resolve or explicitly accept whatever the first
run finds, then flip to blocking. On a brand-new repo with a clean tree, blocking from day one is
fine, there's nothing yet to triage.

---

## 4. Dependabot (one file, every ecosystem)

**Why:** dependency and Action-pin freshness across every ecosystem a repo touches, without a human
babysitting each one individually.

**When to use it:** every tier needs at least the `github-actions` entry (see §1) plus whatever
language ecosystem the repo uses. The `docker` ecosystem applies once the repo ships a container
image (Tier 2+ typically). The *second* `docker` entry below (for a deploy/compose directory) is
specifically for Tier 2+ projects that ship more than their own Dockerfile.

```yaml
# .github/dependabot.yml
version: 2
updates:
  # JS/TS app code. If it lives in a subdirectory (e.g. "service/" next to
  # root-level Docker/deploy config), point `directory` there instead of "/".
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
    cooldown:
      default-days: 7
    open-pull-requests-limit: 5
    groups:
      minor-and-patch:
        update-types:
          - "minor"
          - "patch"

  - package-ecosystem: "pip"
    directory: "/"
    schedule:
      interval: "weekly"
    cooldown:
      default-days: 7
    groups:
      python-dependencies:
        patterns:
          - "*"

  - package-ecosystem: "github-actions"  # see §1
    directory: "/"
    schedule:
      interval: "weekly"
    cooldown:
      default-days: 7
    groups:
      codeql-action:
        patterns:
          - "github/codeql-action/*"

  - package-ecosystem: "docker"  # the app's own Dockerfile
    directory: "/"
    schedule:
      interval: "weekly"
    cooldown:
      default-days: 7

  # Easy to miss, and the single most common gap a compose-stack audit
  # finds: a SECOND docker entry for anything shipped that isn't the app's
  # own Dockerfile, e.g. a docker-compose.yml / deploy/ directory pinning
  # third-party images (postgres, redis, nginx) that self-hosters actually
  # run. Without this, Dependabot faithfully watches the app's own image
  # and silently never watches the database/cache/proxy images beside it.
  - package-ecosystem: "docker"
    directory: "/deploy"
    schedule:
      interval: "weekly"
    cooldown:
      default-days: 7
```

Only include the ecosystem blocks a repo actually uses. A Tier 1 CLI with no Docker image and no
npm dependencies needs `github-actions` and `pip` and nothing else.

**Every entry carries a `cooldown`.** A version published minutes ago is the version most likely
to be a compromised release that gets pulled within days. `cooldown` makes Dependabot wait before
proposing it, and security updates ignore it, so a real fix is not delayed. `zizmor` reports an
entry without one (`dependabot-cooldown`), which is why it is in every block above.

---

## 5. CodeQL (minimal, correct, least privilege)

**Why:** semantic static analysis that finds real vulnerability patterns (not just style issues),
with native integration into the GitHub Security tab (SARIF) and no separate account or dashboard
to manage. Free for public repos.

**When to use it:** Tier 2+ as a default; worth enabling on Tier 1 too for any language CodeQL
supports, since it's essentially maintenance-free once wired up. Skip it only if the repo's whole
surface is a language CodeQL doesn't support (PHP, for one; see §6 instead).

```yaml
# .github/workflows/codeql.yml
name: CodeQL

on:
  push:
    branches: [main]
  # No `branches:` filter here on purpose: a `branches: [main]` filter on
  # `pull_request` silently skips this (often required) `analyze` check for
  # any PR stacked on top of another open PR, once the bottom PR merges and
  # the top PR's base branch stops resolving to `main`.
  pull_request: {}
  schedule:
    - cron: "0 3 * * 1"

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: ${{ github.ref != 'refs/heads/main' }}

permissions:
  contents: read
  security-events: write

jobs:
  analyze:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1  # v7.0.1
        with:
          persist-credentials: false
      - uses: github/codeql-action/init@cdf488f595d80d6e07e03d4674febd5ab45fa938  # v4.37.9
        with:
          languages: javascript-typescript
          queries: security-extended
      - uses: github/codeql-action/autobuild@cdf488f595d80d6e07e03d4674febd5ab45fa938  # v4.37.9
      - uses: github/codeql-action/analyze@cdf488f595d80d6e07e03d4674febd5ab45fa938  # v4.37.9
```

For more than one language, use `strategy: matrix: language: [...]` instead of duplicating the job.
Add `actions` to the list: CodeQL can analyze the workflow files themselves for injection and unsafe
triggers, and it needs no build step (`build-mode: none`).
Stagger the weekly `schedule` cron a few hours from Semgrep's and Trivy's own schedules (§6, §8) so
scans don't all queue at once.

---

## 6. Semgrep (SAST for what CodeQL does not cover)

**Why:** CodeQL doesn't support every language you might ship (PHP has no CodeQL support at all),
and even where both tools apply to the same code, Semgrep's community rule registry (`p/javascript`,
`p/php`, `p/typescript`, …) is an independently maintained, differently-tuned rule set. Running both
is not redundant; it's a second reviewer looking for different things.

**When to use it:** Tier 2+ generally, as a complement to CodeQL. Essential (not optional) for any
Tier 1+ repo whose primary language CodeQL doesn't cover. In that case Semgrep is the *only* SAST
option, not a nice-to-have.

```yaml
# .github/workflows/semgrep.yml
name: Semgrep

on:
  pull_request:
  push:
    branches: [main]
  schedule:
    - cron: "0 5 * * 1"

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: ${{ github.ref != 'refs/heads/main' }}

permissions:
  contents: read
  security-events: write
  actions: read

jobs:
  semgrep:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1  # v7.0.1
        with:
          persist-credentials: false

      - uses: actions/setup-python@5fda3b95a4ea91299a34e894583c3862153e4b97  # v7.0.0
        with:
          python-version: "3.11"

      - name: Install Semgrep
        run: python -m pip install --break-system-packages semgrep==1.136.0

      - name: Run Semgrep
        run: |
          semgrep scan \
            --config=p/javascript \
            --config=p/typescript \
            --error \
            --sarif \
            --output=semgrep.sarif \
            . \
            --exclude node_modules \
            --exclude dist

          test -f semgrep.sarif || echo '{"version":"2.1.0","runs":[]}' > semgrep.sarif

      - uses: github/codeql-action/upload-sarif@cdf488f595d80d6e07e03d4674febd5ab45fa938  # v4
        if: always()
        with:
          sarif_file: semgrep.sarif
```

`--error` fails the scan step on any finding: that's the gate. `upload-sarif` runs on
`if: always()` so results still reach the Security tab if the scan step failed; `test -f ... ||
echo ...` guarantees a valid (empty) SARIF file exists even if Semgrep crashed before writing one.
Swap `p/javascript`/`p/typescript` for the packs matching your stack. Registry configs stack, so
pass `--config` more than once for a polyglot repo. For a Python project, [section 14](#14-hash-pinned-dependency-lockfile-python-pip-compile)
covers a stronger alternative to a bare version pin.

---

## 7. gitleaks (CI secret scanning, not a replacement for platform scanning)

**Why:** catches secrets already committed to the working tree or history (API keys, private keys,
database URLs with embedded credentials) that a human skimming a diff can miss, especially in
generated files or a large diff.

**When to use it:** all tiers, including Tier 1. This costs seconds of CI time and catches an
entire class of "we shipped a live credential" incident; even a Tier 1 tool with zero external
users has API keys in its own local environment that a contributor could accidentally commit.

**Pattern (range-scoped, the actual default to use, all tiers):** gitleaks' own default
`--log-opts` is `git log --all --full-history`, which, combined with a full-history checkout,
scans *every branch's entire history* on every run. Left at that default, a PR can fail
`secret-scan` because some unrelated branch has an old flagged commit, regardless of what the PR
itself changed, which is exactly the kind of false positive that trains people to ignore or
disable the check. Scope the scan to the commits a run actually introduces from the start, don't
defer this:

```yaml
# .github/workflows/ci.yml (excerpt)
jobs:
  secret-scan:
    name: Secret scan (gitleaks)
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1  # v7.0.1
        with:
          fetch-depth: 0
          persist-credentials: false

      - name: Install gitleaks (checksum-verified)
        env:
          GITLEAKS_VERSION: "8.30.0"
          # From the release's own gitleaks_<version>_checksums.txt. Update it with the version.
          GITLEAKS_SHA256: 79a3ab579b53f71efd634f3aaf7e04a0fa0cf206b7ed434638d1547a2470a66e
        run: |
          set -euo pipefail
          archive="gitleaks_${GITLEAKS_VERSION}_linux_x64.tar.gz"
          curl --proto '=https' --tlsv1.2 -sSfL -o "$archive" "https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/${archive}"
          echo "${GITLEAKS_SHA256}  ${archive}" | sha256sum --check --strict
          tar -xzf "$archive" gitleaks
          echo "$PWD" >> "$GITHUB_PATH"

      - name: Compute scan range
        id: range
        env:
          EVENT_NAME: ${{ github.event_name }}
          BASE_REF: ${{ github.base_ref }}
          BEFORE_SHA: ${{ github.event.before }}
          HEAD_SHA: ${{ github.sha }}
        run: |
          set -euo pipefail
          if [ "$EVENT_NAME" = "pull_request" ]; then
            echo "range=origin/${BASE_REF}..HEAD" >> "$GITHUB_OUTPUT"
          elif [ -n "$BEFORE_SHA" ] && [ "$BEFORE_SHA" != "0000000000000000000000000000000000000000" ]; then
            echo "range=${BEFORE_SHA}..${HEAD_SHA}" >> "$GITHUB_OUTPUT"
          else
            echo "range=-1" >> "$GITHUB_OUTPUT"
          fi

      - name: gitleaks (scoped to this run's commits)
        env:
          SCAN_RANGE: ${{ steps.range.outputs.range }}
        run: gitleaks detect --source . --log-opts="$SCAN_RANGE" --exit-code 1
```

Two details in this recipe are deliberate, and both were wrong in earlier versions of it:

- **Context values reach the shell through `env:`, never through `${{ }}` inside `run:`.** An
  expression inside a `run:` block is substituted into the script text before the shell parses it,
  so a value an outsider can influence (a branch name, a PR title) becomes code. Passed as an
  environment variable, it is only ever data. `zizmor` flags the old form as high severity
  (`template-injection`), and §15 wires it into CI.
- **The download is HTTPS-only** (`--proto '=https' --tlsv1.2`), so a redirect cannot downgrade it.
- **The downloaded binary is verified against a checksum before it runs.** An unverified `curl`
  of an executable into a CI job is the kind of unpinned dependency OpenSSF Scorecard's
  Pinned-Dependencies check reports. Take the hash from the release's own checksums file.

**Faster to wire up, but carries a known false-positive mode: the action-based minimal
pattern.** If the range-scoped version above is more setup than a given moment allows, this
one-step version is a legitimate starting point, but treat the upgrade above as immediate
follow-up work, not a someday-Tier-2 nice-to-have:

```yaml
      - uses: gitleaks/gitleaks-action@e0c47f4f8be36e29cdc102c57e68cb5cbf0e8d1e  # v3.0.0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          GITLEAKS_ENABLE_COMMENTS: false
```

(`GITLEAKS_ENABLE_COMMENTS: false` skips posting PR comments so the job doesn't need
`pull-requests: write` on top of `contents: read`. A `GITLEAKS_LICENSE` secret is only required for
GitHub *organization*-owned repos, not personal-account repos.)

**Complement, not replacement:** also turn on GitHub's own **Settings → Code security → Secret
scanning** and **Push protection**, on every repo, public or private (both free for public repos;
private repos need GitHub Advanced Security on non-Enterprise plans). They catch different things
for different reasons:

- **Secret scanning + push protection** runs server-side, at push time, against provider-partnered
  token formats (AWS, Stripe, GitHub tokens, etc.). Push protection actually *blocks* the push
  before the secret lands in the repo. No CI step running after the push can do that.
- **gitleaks** runs in CI, after the push, against a configurable regex/entropy ruleset. It catches
  bespoke or internal secret formats outside GitHub's partner list, and it backstops a contributor
  working from a fork or a machine where push protection was bypassed some other way.

Run both. Neither is a superset of the other.

---

## 8. Trivy (scan the artifact that actually ships)

**Why:** "scan what you ship" is the entire point. Scanning a throwaway image built with different
base-layer digests, different build args, or a different Dockerfile than what actually gets pushed
to the registry tells you nothing about what your users will pull.

**When to use it:** Tier 2+: any project that publishes a container image other people or systems
pull. Skip it for a Tier 1 tool that never publishes an image, or publishes one nobody else uses;
add it the moment that stops being true.

**Pattern:** build the image once with `push: false, load: true`, tag it something like `:ci-scan`,
scan that exact image, gate on CRITICAL, and only if the gate passes, push.

```yaml
      - name: Build image for scanning
        uses: docker/build-push-action@53b7df96c91f9c12dcc8a07bcb9ccacbed38856a  # v7.3.0
        with:
          context: .
          file: ./Dockerfile
          push: false
          load: true
          tags: ghcr.io/${{ github.repository }}:ci-scan
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Trivy scan (SARIF, always uploaded)
        uses: aquasecurity/trivy-action@ed142fd0673e97e23eac54620cfb913e5ce36c25  # v0.36.0
        with:
          image-ref: ghcr.io/${{ github.repository }}:ci-scan
          format: sarif
          output: trivy-results.sarif
          severity: CRITICAL,HIGH,MEDIUM
          ignore-unfixed: true

      - uses: github/codeql-action/upload-sarif@cdf488f595d80d6e07e03d4674febd5ab45fa938  # v4
        if: always()
        with:
          sarif_file: trivy-results.sarif

      # Hard gate: fails the job, before any push, on fixable CRITICAL
      # findings. ignore-unfixed avoids a permanently red build over an
      # unpatched base-image CVE with no fix available yet.
      - name: Trivy gate (fixable CRITICAL only)
        uses: aquasecurity/trivy-action@ed142fd0673e97e23eac54620cfb913e5ce36c25  # v0.36.0
        with:
          image-ref: ghcr.io/${{ github.repository }}:ci-scan
          format: table
          severity: CRITICAL
          ignore-unfixed: true
          exit-code: "1"

      - name: Push image
        if: steps.resolve.outputs.publish == 'true'  # only on a real release, not every branch build
        uses: docker/build-push-action@53b7df96c91f9c12dcc8a07bcb9ccacbed38856a  # v7.3.0
        with:
          context: .
          file: ./Dockerfile
          push: true
          tags: ghcr.io/${{ github.repository }}:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

The "Push image" step rebuilds rather than re-tagging the already-scanned local image. That's safe
*only* because `cache-from`/`cache-to` (BuildKit's GitHub Actions cache) makes the second build
content-identical and near-instant, not a fresh build from a possibly-different upstream state. If
the Dockerfile does anything non-deterministic at build time (e.g. `apt-get upgrade` with no pin),
don't rely on this: build once per platform, push by digest, and compose the final manifest with
`docker buildx imagetools create` from those digests instead of ever rebuilding (the Tier 3
multi-arch pattern).

**Also worth adding (Tier 2+):** a weekly scheduled re-scan of the actual *published* `:latest`
image: `docker pull` and re-tag it to `:ci-scan` on a `schedule` trigger rather than rebuilding, so
the same "Trivy scan" step above runs against it. Rebuilding on a schedule would silently re-apply
today's patched OS packages via the Dockerfile's own install step, defeating the point of checking
what's actually deployed. This is the only way to learn about a CVE disclosed in a base image
weeks after the last release, without a human remembering to re-trigger anything.

---

## 9. Codecov (a real signal, not yet a gate)

**Why:** coverage alone doesn't prove correctness, but a coverage regression on a PR's diff ("patch
coverage") is a fast, near-zero-effort signal that new code shipped with no test around it. Worth
surfacing on every PR even before anyone decides to enforce it.

**When to use it:** Tier 2+, or any repo whose test suite already emits a coverage report. Wire it
up at the same time as the test job, not as a separate later initiative. The cost is a few extra
lines once `pytest --cov`/`vitest --coverage`/equivalent is already producing a report.

**Wiring:**

1. Add the repo on codecov.io and copy its upload token.
2. Add it as a GitHub Actions secret named `CODECOV_TOKEN`.
3. Upload after tests run:

```yaml
      - name: Test
        run: pytest --cov --cov-report=xml --junitxml=junit.xml

      - name: Upload coverage to Codecov
        # Fork and Dependabot PRs can't read repo secrets; tests still run either way.
        if: ${{ env.CODECOV_TOKEN != '' }}
        uses: codecov/codecov-action@303a32d7a59b442fa8d48b6a1cc6825c09c847a5  # v7.1.1
        env:
          CODECOV_TOKEN: ${{ secrets.CODECOV_TOKEN }}
        with:
          token: ${{ env.CODECOV_TOKEN }}
          files: coverage.xml
          fail_ci_if_error: true

      - name: Upload test results to Codecov
        if: ${{ !cancelled() && env.CODECOV_TOKEN != '' }}
        uses: codecov/test-results-action@0fa95f0e1eeaafde2c782583b36b28ad0d8c77d3  # v1.2.1
        env:
          CODECOV_TOKEN: ${{ secrets.CODECOV_TOKEN }}
        with:
          token: ${{ env.CODECOV_TOKEN }}
          files: junit.xml
```

A step's own `env:` block is evaluated before that same step's `if:` condition, so checking
`env.CODECOV_TOKEN` inside the same step's `if:` is a valid, working way to skip cleanly on fork PRs
without a separate job-level `env:` block (the same pattern is used for `SONAR_TOKEN` in §10).

4. Add a `codecov.yml` at the repo root to make thresholds explicit instead of relying on Codecov's
   undocumented defaults:

```yaml
# codecov.yml
coverage:
  status:
    project:
      default:
        target: auto
        threshold: 1%
    patch:
      default:
        target: auto
        threshold: 1%

comment:
  layout: "reach, diff, flags, files"
  behavior: default
  require_changes: false
```

**Not a merge gate by default.** As soon as this is wired up, `codecov/project` and `codecov/patch`
appear as commit statuses on every PR (genuinely useful), but nothing about adding this file makes
a red status block a merge. That's a separate, deliberate decision: **Settings → Branches → Branch
protection rule → Require status checks to pass → add `codecov/project` and/or `codecov/patch`.** Do
this only after seeing real numbers for a while and confirming the threshold isn't a surprise wall
on the next ordinary PR.

---

## 10. SonarCloud (Automatic Analysis vs CI-based analysis)

This is the most nuanced tool in this cookbook: SonarCloud ships two mutually exclusive analysis
modes, and the default one silently cannot do the thing most people set it up for.

**The sourced finding (from SonarSource's own documentation, not inferred):** Automatic Analysis
has coverage support removed at the product level. SonarSource's own docs state it plainly:
*"Currently, automatic analysis has the following limitations: … Code coverage information is not
supported"*. That holds under any configuration, for any language. Coverage only works under
**CI-based analysis**: a `sonar-scanner`/`sonarqube-scan-action` step running in your own CI,
authenticated with `SONAR_TOKEN`, reading `sonar-project.properties`. The two modes also actively
conflict if both are left on: SonarSource's docs state that enabling Automatic Analysis while a
CI-based analysis is configured makes the CI-based analysis fail. Migrating is not "add a CI step."
It's "turn Automatic Analysis off, *then* add a CI step." A repo that ran Automatic Analysis since
import (the default on first add) and only later wired up real coverage-generating tests can have a
fully green dashboard with a coverage-based quality-gate condition (e.g. "new code coverage < 80%
fails the gate") that has silently never fired even once, not because coverage is good, but because
there's no coverage number to evaluate it against.

**When to use it:** Tier 2+, and specifically only once the repo already has a coverage-generating
test suite wired to something (even just Codecov, §9). SonarCloud's main incremental value over
Codecov alone is combining coverage with code-smell/duplication/maintainability analysis under one
quality gate. For Tier 1, Codecov alone is the faster, lower-setup-cost path to "coverage is visibly
checked somewhere"; SonarCloud is worth adding for its own sake later, not a starting requirement.

**Exact human steps** (cannot be done by an agent: needs SonarCloud org-admin *and* GitHub
repo-admin access):

1. In SonarCloud, open the project's **Administration → Analysis Method** page and pick the
   **GitHub Actions** tutorial. The in-product tutorial generates the token for you (a scoped
   organization token on a Team plan, a personal access token on Free); use the value it shows
   rather than guessing which token type the plan expects.
2. In GitHub: **Settings → Secrets and variables → Actions → New repository secret**, named
   `SONAR_TOKEN`, value from step 1.
3. On the same SonarCloud **Analysis Method** page, switch **Automatic Analysis** to **off**. Not
   optional: leaving it on makes the new CI-based analysis step fail on every run.

**`sonar-project.properties`** (repo root):

```properties
# SonarCloud CI-based analysis (see .github/workflows/ci.yml).
# Requires SonarCloud's "Automatic Analysis" to be turned off for this
# project (Administration -> Analysis Method); the two modes are mutually
# exclusive and Automatic Analysis otherwise silently overrides this scan.

sonar.projectKey=<org>_<repo>
sonar.organization=<sonarcloud-org>

sonar.sources=app
sonar.tests=tests
sonar.python.version=3.14

sonar.python.coverage.reportPaths=coverage.xml
sonar.python.xunit.reportPath=junit.xml
```

For a JS/TS project, replace the two `sonar.python.*` lines with
`sonar.javascript.lcov.reportPaths=path/to/lcov.info` (accepts a comma-separated list for a
monorepo with several workspaces). `sonar.sources` and `sonar.tests` never accept wildcards, under
either analysis mode. List real paths, not a glob.

**CI step**, added after the job step(s) that produce the coverage/JUnit reports it reads:

```yaml
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1  # v7.0.1
        with:
          persist-credentials: false
          # SonarCloud's scan below needs full history (not the default
          # shallow clone) to attribute new-vs-existing code by git blame.
          fetch-depth: 0

      # ... test step producing coverage.xml / junit.xml (or lcov.info) here ...

      # CI-based analysis (sonar-project.properties), not SonarCloud's
      # Automatic Analysis; the two are mutually exclusive. Automatic
      # Analysis must stay off in the SonarCloud project settings or it
      # silently overrides this scan. Skipped on fork PRs, which can't
      # read SONAR_TOKEN.
      - name: SonarCloud scan
        if: ${{ env.SONAR_TOKEN != '' }}
        uses: SonarSource/sonarqube-scan-action@ba9859eae8dd6bd29e412f25ddbbef3d032000f4  # v8.2.2
        env:
          SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}
          SONAR_HOST_URL: https://sonarcloud.io
```

**Why the guard has to be `if: env.SONAR_TOKEN != ''`, not `if: success()` or nothing at all:**
fork-originated `pull_request` runs never receive repository secrets: `secrets.SONAR_TOKEN`
resolves to an empty string, not an error. Unlike Codecov's upload action, `sonarqube-scan-action`
has no soft-fail option. An empty `SONAR_TOKEN` makes the step error for real, turning every
external contributor's PR red through no fault of their own. As in §9, the step's own `env:` block
is evaluated before its `if:`, so this works without a separate job-level `env:` block. The
trade-off to make deliberately, not by accident: this means fork PRs get *no* SonarCloud analysis.
Covering them too needs SonarSource's documented three-workflow split (build the fork's code with
no secrets → hand off via `workflow_run` → analyze with secrets, never executing fork-provided
code): real added complexity, worth it only if fork contributions are actually common.

**A later, deliberate decision, not a default:** add `sonar.qualitygate.wait=true` to
`sonar-project.properties` once real coverage numbers have been observed and the quality gate's
coverage condition is confirmed achievable. That flag fails the scan step itself when the quality
gate fails. That's what makes it safe to add the scan job to `main`'s required status checks
(**Settings → Branches**). Don't add it on the same PR that turns CI-based analysis on; you don't
yet know what the gate will say.

**Verify it actually worked, don't assume:**

```bash
curl -s "https://sonarcloud.io/api/measures/component?component=<org>_<repo>&metricKeys=coverage,new_coverage"
```

`coverage`/`new_coverage` should be present and non-empty in the response. Under Automatic
Analysis they're absent from this endpoint's response entirely, not just zero.

---

## 11. SBOM generation on release (CycloneDX)

**Why:** a CycloneDX SBOM is a machine-readable manifest of every package inside the artifact you
shipped. It's the only way anyone downstream (including your own team, months later) can answer
"are we affected by CVE-2026-XXXXX" without re-scanning the exact historical image. Increasingly
also a procurement/compliance ask from security-conscious customers.

**When to use it:** Tier 2+ that ships a container image. Generating it is a marginal addition once
Trivy is already scanning the published artifact (§8); the same tool produces both. Skip it for
Tier 1: it's added workflow surface (another artifact to store, another format to keep matching the
real image) for a document nobody downstream is asking for yet; add it the moment either stops
being true.

**Pattern:** reuse the exact image already scanned and gated in §8, never a separately built one:

```yaml
      - name: Generate CycloneDX SBOM
        if: steps.resolve.outputs.publish == 'true'
        uses: aquasecurity/trivy-action@ed142fd0673e97e23eac54620cfb913e5ce36c25  # v0.36.0
        with:
          image-ref: ghcr.io/${{ github.repository }}:ci-scan
          format: cyclonedx
          output: sbom.cdx.json

      - uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a  # v7.0.1
        if: steps.resolve.outputs.publish == 'true'
        with:
          name: sbom
          path: sbom.cdx.json
          retention-days: 90

      # Attach it to the GitHub Release so it's discoverable without
      # digging through workflow-run artifacts, which expire on their
      # retention schedule; the release asset doesn't.
      - name: Attach SBOM to the GitHub Release
        if: steps.resolve.outputs.publish == 'true'
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          set -euo pipefail
          TAG="${{ steps.resolve.outputs.tag }}"
          gh release upload "$TAG" sbom.cdx.json --clobber
```

For a Tier 3 project already doing a multi-arch, push-by-digest publish, generate one SBOM per
platform (suffix the artifact/file name accordingly) and attach both to the same release, alongside
a build provenance attestation (`actions/attest-build-provenance`). Genuinely worth the extra step
once the publish pipeline is already this sophisticated, not a starting requirement.

---

## 12. Docs as source of truth, and catching stale docs at PR time

**The problem this solves:** a wiki, a security policy, or a controls table drifts from reality
the moment the thing it describes changes and nobody remembers to update the doc in the same PR.
This is not a hypothetical: a real audit of a Tier 3 repo following this exact pattern found its
own `SECURITY.md` undercounting its required CI checks by two, an architecture doc contradicting
itself about whether a feature had shipped, and a worked example describing a bug that had
already been fixed, days to weeks earlier in each case. None of that was caught automatically,
because nothing was checking.

**When to use it:** the wiki-sync half (below) applies once a repo has a GitHub Wiki (Tier 3, see
[tiers.md](tiers.md#tier-3-flagship)). The PR-time declaration check (further below) is worth
adopting from Tier 2 up, even for a repo with no Wiki at all, since it works for any doc a PR
might need to touch.

### a) If the repo has a Wiki: the Wiki is a build output, not a source

Never edit a GitHub Wiki page directly in its own web UI once this pattern is in place. A direct
edit is invisible to the repo's history, isn't reviewed, and gets silently overwritten by the
next sync from the real source.

Keep the actual content in the repository, for example `docs/wiki/`, and sync it to the GitHub
Wiki with a workflow that runs on every push to the default branch that touches that directory:

```yaml
# .github/workflows/publish-wiki.yml
name: Publish Wiki

on:
  push:
    branches: [main]
    paths:
      - "docs/wiki/**"
      - ".github/workflows/publish-wiki.yml"
  workflow_dispatch:

permissions:
  contents: write

concurrency:
  group: publish-wiki
  cancel-in-progress: false

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1  # v7.0.1
        with:
          persist-credentials: false

      - name: Validate Wiki source
        run: node scripts/check-wiki-docs.mjs

      - name: Synchronize GitHub Wiki
        env:
          WIKI_REMOTE: https://x-access-token:${{ github.token }}@github.com/${{ github.repository }}.wiki.git
        run: |
          wiki_publish_dir=$(mktemp -d)
          trap 'rm -rf "$wiki_publish_dir"' EXIT
          git clone "$WIKI_REMOTE" "$wiki_publish_dir"
          rsync -a --delete --exclude=.git docs/wiki/ "$wiki_publish_dir/"
          if git -C "$wiki_publish_dir" diff --quiet; then
            echo "Wiki is already current."
            exit 0
          fi
          git -C "$wiki_publish_dir" config user.name "github-actions[bot]"
          git -C "$wiki_publish_dir" config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git -C "$wiki_publish_dir" add --all
          git -C "$wiki_publish_dir" commit -m "docs(wiki): publish ${GITHUB_SHA}"
          git -C "$wiki_publish_dir" push origin HEAD:master
```

`github.token` (the default `GITHUB_TOKEN`) is enough here: pushing to a repo's own Wiki only
needs `contents: write` on the parent repo, the same permission this job already declares. No
extra secret to create or rotate.

**"Validate Wiki source" is a script you write for your own repo, not something to copy
verbatim.** The point is structural checks that catch drift automatically, not any particular
rule set. A reasonable starting menu, all cheap to implement in a few dozen lines of plain
Node/Python with no dependencies:

- Every page your docs are supposed to have actually exists (a fixed list of expected filenames,
  or every page linked from an index/sidebar page actually resolves).
- Every internal link (`[text](Some-Page)`, an image reference) resolves to a real file inside
  the docs directory; nothing links outside it or to a page that no longer exists.
- A required metadata line is present and well-formed if your docs use one, for example a byline
  stating who a page is for and when it was last verified against the product.
- No real email address or other non-synthetic personal data leaked into example content (a
  cheap, high-value anonymization check that pays for itself the first time it fires).

Run this same script both in `publish-wiki.yml` (so a broken sync never reaches the live Wiki)
and as a required PR check whenever `docs/wiki/**` changes, so the structural problems above are
caught before merge, not after publish.

### b) Any tier with real docs: declare and verify documentation impact per PR

This doesn't need a Wiki. It needs a PR template section and one script, and it catches the more
common failure: a PR changes something that should update a doc, and nobody remembers.

Add a required section to `pull_request_template.md`:

```markdown
## Documentation impact

<!-- Select exactly one. -->
- [ ] Docs updated
- [ ] No doc update needed: <state the reason>
```

Then verify, in CI, that the declaration is actually consistent with the diff instead of trusting
it on its word:

```yaml
# .github/workflows/docs-impact.yml
name: Documentation impact

on:
  pull_request:
    types: [opened, synchronize, reopened, edited]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read

jobs:
  docs-impact:
    name: Documentation impact declaration
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1  # v7.0.1
        with:
          fetch-depth: 0
          persist-credentials: false
      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020  # v7.0.0
        with:
          node-version: "22"
      - name: Check documentation-impact declaration
        run: node scripts/check-pr-docs-impact.mjs
```

The `edited` trigger is the point of running this as its own workflow. The declaration lives in the
pull request description, and a plain `pull_request` trigger only runs on opened, synchronize, and
reopened, so a contributor who corrects the checkbox would still see a failing check until they
push another commit. `fetch-depth: 0` is needed because the script diffs the pull request's base
and head commits.

```javascript
// scripts/check-pr-docs-impact.mjs
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const eventPath = process.env.GITHUB_EVENT_PATH;
const event = JSON.parse(readFileSync(eventPath, "utf8"));
const pullRequest = event.pull_request;
if (!pullRequest) process.exit(0);

// Automated dependency PRs can't fill in a hand-written template body. Match the author, never
// the branch name: anyone can open a PR from a branch called dependabot/....
if ((pullRequest.user?.login ?? "") === "dependabot[bot]") process.exit(0);

const body = pullRequest.body ?? "";
const docsUpdated = /^- \[[xX]\] Docs updated\s*$/m.test(body);
// A real reason is required: the template's own placeholder text does not count.
const noDocsUpdate = /^- \[[xX]\] No doc update needed: (?!<state the reason>\s*$)\S.+$/m.test(body);

if (docsUpdated === noDocsUpdate) {
  console.error(
    "Select exactly one Documentation impact declaration, with a real reason if none is needed.",
  );
  process.exit(1);
}

// DOCS_PATHS: the paths this repo considers "docs" for this check's purposes.
// Adjust to match your own layout (docs/wiki/, SECURITY.md, README.md, ...).
const DOCS_PATHS = ["docs/wiki/", "SECURITY.md"];
const changedFiles = execFileSync(
  "/usr/bin/git",
  ["diff", "--name-only", `${pullRequest.base.sha}...${pullRequest.head.sha}`],
  { encoding: "utf8" },
).split("\n").filter(Boolean);
const docsChanged = changedFiles.some((file) => DOCS_PATHS.some((prefix) => file.startsWith(prefix)));

if (docsUpdated && !docsChanged) {
  console.error("'Docs updated' is selected but none of the declared doc paths actually changed.");
  process.exit(1);
}
if (noDocsUpdate && docsChanged) {
  console.error("A declared doc path changed; select 'Docs updated' instead.");
  process.exit(1);
}

console.log("Documentation impact declaration is consistent with the diff.");
```

This needs no extra token or secret: `pull_request.base.sha`/`head.sha` come from the event
payload GitHub already provides, and diffing the two only needs the checkout already present in
the job. Widen `DOCS_PATHS` to whatever this repo actually treats as documentation. A `SECURITY.md`
that lists specific job names as required checks is exactly the kind of file worth including: a
PR that renames or removes one of those jobs should be forced to say, in its own words, whether
`SECURITY.md` needs a matching update.

**What this pattern cannot do, and why:** it cannot verify that `SECURITY.md`'s claimed required
status checks still match what branch protection actually enforces in repo settings. Reading
branch protection (`GET /repos/{owner}/{repo}/branches/{branch}/protection`) needs a token with
administrative access to the repository, and `administration` is not one of the scopes a
workflow's `permissions:` block can grant to the default `GITHUB_TOKEN` (verified against
GitHub's own documented list of workflow permission scopes: it is not in it). The check above
verifies internal consistency (does the PR's own claim match its own diff); it cannot verify
external consistency (does the doc match a live setting that lives outside any file in the repo).

Closing that second gap for real needs a personal access token with repository administration
access, stored as a secret, and deliberately kept out of the pull-request-triggered path (a
privileged token has no business being reachable from a workflow anyone can trigger by opening a
PR). The proportionate way to use one: a separate, scheduled workflow, `workflow_dispatch` plus a
weekly `schedule`, that fetches the live required-checks list with that token and fails loudly
(or opens/updates a tracking issue) if it no longer matches what `SECURITY.md` claims. That is a
drift detector, not a merge gate, and Tier 3 is the tier where the added setup and the ongoing
custody of an admin-scoped secret are worth it.

---

## 13. Verifying a repo against this standard automatically

Everything above is a recipe you copy into your own repo. This playbook also publishes a reusable
workflow that runs the file- and pattern-based half of [docs/tiers.md](tiers.md)'s checklist for
you, from one place, so a change to what the standard requires doesn't mean re-copying anything.

**When to use it:** any tier, once a repo has adopted the standard (carries the pointer block from
[AGENTS.md](../AGENTS.md), "If you were sent here from another repository"). Add it as a required
status check once you trust its output; report-only first if you're not sure yet what it will say
about a repo that's never been checked before.

```yaml
# .github/workflows/verify-standard.yml
name: Verify standard

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

jobs:
  verify:
    uses: solarssk/playbook/.github/workflows/verify-tier.yml@<commit-sha>  # v0.1.1
    secrets:
      admin_token: ${{ secrets.PLAYBOOK_ADMIN_TOKEN }}  # optional, see below
```

Pin the reusable workflow call to a commit SHA, not a tag, the same rule as every other `uses:`
reference in this document (§1): a floating tag or `@main` here means playbook can silently change
what "passing" means in every repo that calls it, with no diff for any of them to review. A SHA
means you see and choose the bump, and Dependabot's `github-actions` ecosystem (§4) proposes it the
same way it proposes any other Action version bump, comment included, so the tag stays visible next
to the SHA. Find the SHA for a given release with `git ls-remote --tags
https://github.com/solarssk/playbook`.

The `permissions:` block on the calling workflow is not optional either. Without it, this workflow
runs with the repository's default `GITHUB_TOKEN` permissions, which on most repositories is
broader read/write access than a job that only checks out code and runs a script needs. Set it
explicitly even though the called workflow also declares its own `permissions: contents: read`;
each workflow file needs its own block; a caller does not inherit or narrow the callee's.

**What it checks without any extra setup:** LICENSE, CODEOWNERS, SECURITY.md, CONTRIBUTING.md,
issue and PR templates, SHA-pinning, `permissions:` and `concurrency:` blocks, and a handful of
keyword-based heuristics (a secret-scan step, a dependency-audit step, SAST, an OpenSSF Scorecard
workflow, a badge row). It also reports whether a newer playbook release exists than the one the
call is pinned to (see below). Tier is auto-detected from the calling repo's own `AGENTS.md`.

**What needs `admin_token`, an optional PAT with repository administration access:**
delete-branch-on-merge, Dependabot security-updates status, whether branch protection exists
at all, and whether every required status check matches the name a workflow job actually reports. Skipped and reported as skipped, not silently omitted, if the secret isn't provided. This
is the same limitation described in §12: `administration` isn't a scope a workflow's own
`permissions:` block can grant, so there is no way to read these without a token that already has
that access.

**How a repo finds out the playbook changed.** Pinning to a SHA means nothing updates silently, so
the notification has to be deliberate. Two mechanisms carry it, and both depend on the playbook
publishing a real GitHub Release for every version, not just a tag:

1. **A warning in the check itself.** On every run, `verify-tier` compares the release it is pinned
   to against the playbook's latest Release. If a newer one exists, the run reports a
   `playbook-version` warning and a workflow annotation with a link to the release notes. It
   never fails the build: a new release must not turn every adopter's CI red at once. It is a
   prompt to read the notes and bump the pin.
2. **A Dependabot pull request.** If the adopting repo has the `github-actions` ecosystem in its
   `dependabot.yml` (§4), Dependabot proposes the SHA bump on its own. It normally includes the
   Release notes in the PR description, but confirm that on the first real bump rather than
   relying on it; the warning in mechanism 1 does not depend on Dependabot.

Either way, the thing to read is the release's **Adopter action** list: what a repository at each
tier must change to stay in line. A release with no such list changes nothing an adopter has to do.

Keep the `github-actions` Dependabot entry in any repo that calls this workflow. Without it, the
warning in the workflow run is the only signal, and a warning nobody is looking at gets missed.

A result of "pass" here means the mechanical checks for the declared tier are satisfied. It does
not mean the repo is actually well-maintained: a keyword match for "gitleaks" doesn't confirm the
step still runs correctly, and nothing here can judge whether the declared tier itself is still
the right one. Treat it as a fast, cheap first pass, not a replacement for actually reading the
repo the way [AGENTS.md](../AGENTS.md)'s own adoption workflow describes.

---

## 14. Hash-pinned dependency lockfile (Python: pip-compile)

**Why:** Tier 1 requires dependencies to be "version-pinned in the manifest, not left to float on
every install." A bare `>=` specifier in `pyproject.toml` satisfies nothing: two builds of the
same commit, weeks apart, can resolve different exact versions of every dependency and every
transitive dependency. `pip` has no first-class lockfile the way `npm` or `cargo` does, so the
manifest itself has to stay loose (an application generally should not upper-bound its own direct
dependencies) while a separate, generated file pins the exact resolved set, including hashes.

**When to use it:** optional at Tier 1, worth adopting once a repo actually publishes an artifact
(a container image, a package) where "which exact dependency versions shipped" matters, which
usually means Tier 2. Not required by any tier's checklist; a plain pinned or upper-bounded
manifest is still a legitimate way to satisfy Tier 1's own item.

**Generate the lockfile:**

```bash
pip install "pip-tools==7.6.1"
pip-compile --generate-hashes --allow-unsafe -o requirements.txt pyproject.toml
```

Pin `pip-tools` itself to an exact version rather than a floating one for local use, even though
the manifest's own dev-dependency entry can stay loose: pip-tools has had header-rendering
differences between versions (for example, whether an unset `--no-index` flag gets echoed into the
generated file's comment header) that can shift the output in a way unrelated to any real
dependency change, which breaks the drift check below for the wrong reason. `--generate-hashes`
records a SHA-256 for every distribution `pip` is allowed to install, so a compromised or
substituted package on the index fails the install rather than silently landing. `--allow-unsafe`
includes packages pip-tools otherwise excludes by default (`pip`, `setuptools`, and similar); skip
it only if none of those appear in the resolved set.

**Install from it, and drop `pip` afterward:**

```dockerfile
COPY pyproject.toml requirements.txt ./
COPY app ./app

RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir --require-hashes -r requirements.txt \
    && pip install --no-cache-dir --no-deps . \
    && pip uninstall -y pip
```

`--require-hashes` refuses to install anything that isn't hash-pinned in `requirements.txt`,
turning a missing or stale hash into a build failure instead of a silent gap. The application
itself installs with `--no-deps`, since its dependencies are already locked; it isn't
re-resolving anything. Removing `pip` from the final image after install is a small, real
hardening step for a service that only ever runs via its own entrypoint and never invokes `pip` at
runtime: `pip` vendors its own copies of packages like `setuptools`, which periodically pick up
CVEs of their own, unrelated to anything the application actually uses, that a scanner will flag
in an image that has no way to reach them.

**Catch drift in CI, don't just trust the committed file:**

```yaml
# .github/workflows/ci.yml (excerpt)
jobs:
  dependency-lock:
    name: Verify requirements.txt matches pyproject.toml
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1  # v7.0.1
        with:
          persist-credentials: false
      - uses: actions/setup-python@5fda3b95a4ea91299a34e894583c3862153e4b97  # v7.0.0
        with:
          python-version: "3.12"
      - run: pip install "pip-tools==7.6.1"
      - name: Verify requirements.txt matches pyproject.toml
        run: |
          pip-compile --generate-hashes --allow-unsafe -o requirements.txt pyproject.toml
          git diff --exit-code requirements.txt
```

This regenerates the lockfile in CI and fails the job if the result differs from what's committed,
the same shape as the SBOM and Wiki-sync drift checks elsewhere in this document: don't trust that
a generated file was regenerated, verify it. Set `python-version` here to whatever version the
image that actually ships is built on, not whatever a repo's other CI jobs happen to use for
linting or type-checking: `pip-compile` resolves environment-marker-conditional transitive
dependencies (an `if python_version < "3.13"` clause in some package's own metadata, for example)
using the interpreter it runs under, so compiling under a different Python version than the
Dockerfile's base image can reproduce a lockfile that differs from the committed one for a reason
that has nothing to do with an actual `pyproject.toml` change.

---

## 15. Linting workflows (actionlint and zizmor)

**Why:** workflow files are code that runs with a token and, often, secrets, and almost nothing
reads them the way a reviewer reads application code. Two linters cover different halves:

- **actionlint** checks that a workflow is *correct*: valid expressions, real input names, and
  ShellCheck on every `run:` block.
- **zizmor** checks that it is *safe*: template injection, unpinned actions, excessive
  permissions, cache poisoning in release jobs, credential persistence, and Dependabot config
  without a cooldown.

Neither replaces the other. Both are fast, free, and run without secrets. A template injection is
easy to write and hard to see in review, because the expression looks like ordinary templating,
while `zizmor` finds it mechanically in seconds.

**When to use it:** Tier 2 and above, and worth it earlier on any repo whose workflows have grown
past a single lint job. Start report-only if the first run finds a backlog, then make it blocking.

```yaml
# .github/workflows/ci.yml (excerpt)
jobs:
  lint-workflows:
    name: Lint workflows (actionlint, zizmor)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1  # v7.0.1
        with:
          persist-credentials: false

      - name: Install actionlint (checksum-verified)
        env:
          ACTIONLINT_VERSION: "1.7.12"
          # From the release's own actionlint_<version>_checksums.txt. Update it with the version.
          ACTIONLINT_SHA256: 8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8
        run: |
          set -euo pipefail
          archive="actionlint_${ACTIONLINT_VERSION}_linux_amd64.tar.gz"
          curl --proto '=https' --tlsv1.2 -sSfL -o "$archive" "https://github.com/rhysd/actionlint/releases/download/v${ACTIONLINT_VERSION}/${archive}"
          echo "${ACTIONLINT_SHA256}  ${archive}" | sha256sum --check --strict
          tar -xzf "$archive" actionlint
          echo "$PWD" >> "$GITHUB_PATH"

      - name: actionlint
        run: actionlint .github/workflows/*.yml

      - uses: zizmorcore/zizmor-action@cc914d7f3750a2d13d75c7f184a1060aa0e9d482  # v0.6.4
        with:
          version: v1.30.0
          advanced-security: false
          annotations: true
```

Notes:

- **Pin zizmor's version** with the `version:` input. The default is `latest`, which is a floating
  reference inside an otherwise pinned step. `advanced-security: false` keeps the job at
  `contents: read` (no SARIF upload, so no `security-events: write`); findings appear as
  annotations instead.
- **Run it locally first.** `zizmor .` and `actionlint` both run offline against a checkout. Add
  `GH_TOKEN=$(gh auth token)` to `zizmor` for its online audits.
- **The docs' own snippets are workflows too.** This repository extracts every complete workflow
  quoted in its Markdown and runs `actionlint` on it (`scripts/check_doc_snippets.py --extract`), because a
  snippet that does not parse gets pasted into real repositories anyway.
- **A finding is a fix, not a suppression.** If a `zizmor: ignore` comment is genuinely needed,
  put the reason in the same comment.

---
