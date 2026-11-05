"""Keep the required gate connected when CI gains or loses jobs."""

import pathlib

import yaml


def test_required_ci_covers_every_ci_job():
    workflow = pathlib.Path(__file__).resolve().parents[1] / ".github/workflows/ci.yml"
    jobs = yaml.safe_load(workflow.read_text(encoding="utf-8"))["jobs"]
    gate = jobs["required-ci"]
    assert gate["name"] == "Required CI"
    assert gate["if"] == "always()"
    assert set(gate["needs"]) == set(jobs) - {"required-ci"}
