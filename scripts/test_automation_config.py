"""Keep Node.js and Dependabot configuration aligned with the repository's CI."""

import json
from pathlib import Path

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[1]


def test_workflow_node_versions_match_the_node_types_major():
    package = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
    types_version = package["devDependencies"]["@types/node"]
    major = types_version.split(".", 1)[0]
    assert major.isdecimal()

    setups = {}
    workflows = ROOT / ".github/workflows"
    for path in list(workflows.glob("*.yml")) + list(workflows.glob("*.yaml")):
        workflow = yaml.safe_load(path.read_text(encoding="utf-8"))
        for job_name, job in workflow.get("jobs", {}).items():
            for step in job.get("steps", []):
                if step.get("uses", "").startswith("actions/setup-node@"):
                    setups[(path.name, job_name)] = str(step.get("with", {}).get("node-version", ""))

    assert setups.keys() >= {
        ("ci.yml", "test"),
        ("ci.yml", "self-verify"),
        ("ci.yml", "required-ci"),
        ("docs-impact.yml", "docs-impact"),
        ("release.yml", "release"),
        ("verify-tier.yml", "verify"),
    }
    assert {version for version in setups.values()} == {major}


@pytest.fixture
def dependabot_updates():
    path = ROOT / ".github/dependabot.yml"
    config = yaml.safe_load(path.read_text(encoding="utf-8"))
    return {entry["package-ecosystem"]: entry for entry in config["updates"]}


@pytest.mark.parametrize(
    ("ecosystem", "directory", "language_label"),
    [
        ("github-actions", "/", "github_actions"),
        ("npm", "/", "javascript"),
        ("pip", "/scripts", "python"),
    ],
)
def test_version_updates_are_limited_and_labeled(
    dependabot_updates, ecosystem, directory, language_label
):
    entry = dependabot_updates[ecosystem]
    assert entry["directory"] == directory
    assert entry["schedule"]["interval"] == "weekly"
    assert entry["open-pull-requests-limit"] == 1
    assert set(entry["labels"]) >= {"dependencies", language_label, "type: chore"}
    assert entry["cooldown"]["default-days"] == 7


@pytest.mark.parametrize("ecosystem", ["github-actions", "npm", "pip"])
def test_all_version_updates_have_a_group(dependabot_updates, ecosystem):
    groups = list(dependabot_updates[ecosystem]["groups"].values())
    assert all(group.get("applies-to", "version-updates") == "version-updates" for group in groups)
    catch_all = groups[-1]
    assert catch_all["patterns"] == ["*"]
    assert "update-types" not in catch_all
    assert "exclude-patterns" not in catch_all
    if ecosystem == "github-actions":
        assert groups[0]["patterns"] == ["github/codeql-action/*"]
        assert "update-types" not in groups[0]
        assert "exclude-patterns" not in groups[0]


def test_node_types_major_ignore_applies_only_to_version_updates(dependabot_updates):
    assert dependabot_updates["npm"]["ignore"] == [
        {
            "dependency-name": "@types/node",
            "update-types": ["version-update:semver-major"],
        }
    ]


def test_dependency_review_covers_all_dependency_scopes():
    path = ROOT / ".github/workflows/dependency-review.yml"
    workflow = yaml.safe_load(path.read_text(encoding="utf-8"))
    steps = workflow["jobs"]["review"]["steps"]
    reviews = [
        step for step in steps if step.get("uses", "").startswith("actions/dependency-review-action@")
    ]
    assert len(reviews) == 1
    settings = reviews[0]["with"]
    assert settings["fail-on-severity"] == "high"
    assert {scope.strip() for scope in settings.get("fail-on-scopes", "").split(",")} == {
        "runtime",
        "development",
        "unknown",
    }
