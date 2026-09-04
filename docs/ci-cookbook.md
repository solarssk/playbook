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
version a pin corresponds to.

**Finding and updating pins:**

- **Preferred, ongoing:** Dependabot's `github-actions` ecosystem. Add it once and Dependabot opens
  a PR every time a pinned action's tag moves forward, bumping both the SHA and the version comment
  together.

  ```yaml
  # .github/dependabot.yml
  version: 2
  updates:
    - package-ecosystem: "github-actions"
      directory: "/"
      schedule:
        interval: "weekly"
      groups:
        codeql-action:
          patterns:
            - "github/codeql-action/*"
  ```

  The `groups:` block is optional. It's worth adding for any action family whose sub-actions are
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

**Pattern (language-agnostic, OSV database):**

```yaml
      - uses: google/osv-scanner-action/osv-scanner-action@0745d5ee13f9dfa06f2af1b41d5c7b6c1a4c6fd0  # v2.2.2
        with:
          scan-args: |-
            --lockfile=./package-lock.json
```

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
    groups:
      python-dependencies:
        patterns:
          - "*"

  - package-ecosystem: "github-actions"  # see §1
    directory: "/"
    schedule:
      interval: "weekly"
    groups:
      codeql-action:
        patterns:
          - "github/codeql-action/*"

  - package-ecosystem: "docker"  # the app's own Dockerfile
    directory: "/"
    schedule:
      interval: "weekly"

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
```

Only include the ecosystem blocks a repo actually uses. A Tier 1 CLI with no Docker image and no
npm dependencies needs `github-actions` and `pip` and nothing else.

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
pass `--config` more than once for a polyglot repo. Tier 3: compile a hash-locked
`requirements.txt` (`pip-compile --generate-hashes`) and install with `--require-hashes` instead of
a bare version pin.

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

      - name: Install gitleaks
        run: |
          curl -sSL -o gitleaks.tar.gz \
            https://github.com/gitleaks/gitleaks/releases/download/v8.30.0/gitleaks_8.30.0_linux_x64.tar.gz
          tar -xzf gitleaks.tar.gz gitleaks
          echo "$PWD" >> "$GITHUB_PATH"

      - name: Compute scan range
        id: range
        run: |
          if [ "${{ github.event_name }}" = "pull_request" ]; then
            echo "range=origin/${{ github.base_ref }}..HEAD" >> "$GITHUB_OUTPUT"
          elif [ -n "${{ github.event.before }}" ] && [ "${{ github.event.before }}" != "0000000000000000000000000000000000000000" ]; then
            echo "range=${{ github.event.before }}..${{ github.sha }}" >> "$GITHUB_OUTPUT"
          else
            echo "range=-1" >> "$GITHUB_OUTPUT"
          fi

      - name: gitleaks (scoped to this run's commits)
        run: gitleaks detect --source . --log-opts="${{ steps.range.outputs.range }}" --exit-code 1
```

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
        uses: codecov/codecov-action@fb8b3582c8e4def4969c97caa2f19720cb33a72f  # v7.0.0
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
        uses: SonarSource/sonarqube-scan-action@22918119ff8e1ca75a623e15c8296b6ea4fbe28f  # v8.2.1
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
