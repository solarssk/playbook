import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// docs/tiers.md carries an "At a glance" table naming, for every requirement, the
// verify-tier check that covers it. This keeps that table and the script in
// agreement, so neither can gain, lose, or move a check without the other.

const tiersDoc = readFileSync(new URL("../docs/tiers.md", import.meta.url), "utf8");
const script = readFileSync(new URL("./verify-tier.mjs", import.meta.url), "utf8");

// `settings` is a placeholder recorded when the admin-token checks cannot run at
// all; the checks it stands in for are listed individually.
const NOT_IN_TABLE = new Set(["settings"]);

function checksInTable() {
  const start = tiersDoc.indexOf("## At a glance");
  const end = tiersDoc.indexOf("\n## ", start + 1);
  const rows = tiersDoc.slice(start, end).split("\n").filter((line) => line.startsWith("| ") && !line.startsWith("| Requirement") && !line.startsWith("|---"));
  const checks = new Map();
  for (const row of rows) {
    const cells = row.split("|").slice(1, -1).map((cell) => cell.trim());
    assert.equal(cells.length, 6, `table row should have 6 cells: ${row.slice(0, 60)}`);
    const id = /^`([a-z][a-z0-9-]*)`/.exec(cells[5])?.[1];
    if (!id) continue;
    const firstColumn = cells.slice(1, 5).findIndex((cell) => cell !== "" && cell !== "opt");
    assert.notEqual(firstColumn, -1, `row for ${id} has no tier`);
    checks.set(id, firstColumn);
  }
  return checks;
}

function checksInScript() {
  const checks = new Map();
  for (const [, tier, id] of script.matchAll(/record\((\d), "([a-z0-9-]+)"/g)) {
    if (!NOT_IN_TABLE.has(id)) checks.set(id, Number(tier));
  }
  return checks;
}

test("every verify-tier check appears in the tiers.md table, and every named check exists", () => {
  const inTable = checksInTable();
  const inScript = checksInScript();
  assert.deepEqual([...inTable.keys()].sort(), [...inScript.keys()].sort());
});

test("each check starts at the same tier in the table and in the script", () => {
  const inTable = checksInTable();
  for (const [id, tier] of checksInScript()) {
    assert.equal(inTable.get(id), tier, `${id}: table says tier ${inTable.get(id)}, script says tier ${tier}`);
  }
});
