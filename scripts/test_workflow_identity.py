"""Verify the fail-closed source guard and its checkout wiring."""

import os
import pathlib
import subprocess

import pytest
import yaml


WORKFLOW = pathlib.Path(__file__).resolve().parents[1] / ".github/workflows/verify-tier.yml"


def test_workflow_uses_its_own_validated_source():
    steps = yaml.safe_load(WORKFLOW.read_text(encoding="utf-8"))["jobs"]["verify"]["steps"]
    guard = steps[0]
    assert guard["env"] == {
        "WORKFLOW_SHA": "${{ job.workflow_sha }}",
        "WORKFLOW_REPOSITORY": "${{ job.workflow_repository }}",
    }
    checkout = next(step for step in steps if step.get("with", {}).get("repository") == "solarssk/playbook")
    assert checkout["with"]["ref"] == "${{ job.workflow_sha }}"
    result = subprocess.run(
        ["/bin/bash", "-c", guard["run"]],
        env={**os.environ, "WORKFLOW_SHA": "a" * 40, "WORKFLOW_REPOSITORY": "solarssk/playbook"},
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0


@pytest.mark.parametrize("sha,repo", [
    ("", "solarssk/playbook"),
    ("main", "solarssk/playbook"),
    ("a" * 39, "solarssk/playbook"),
    ("a" * 40 + "\n", "solarssk/playbook"),
    ("a" * 40, "<owner>/<repo>"),
])
def test_workflow_rejects_missing_or_incorrect_identity(sha, repo):
    guard = yaml.safe_load(WORKFLOW.read_text(encoding="utf-8"))["jobs"]["verify"]["steps"][0]
    result = subprocess.run(
        ["/bin/bash", "-c", guard["run"]],
        env={**os.environ, "WORKFLOW_SHA": sha, "WORKFLOW_REPOSITORY": repo},
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode != 0
    assert "requires its own source identity" in result.stdout
