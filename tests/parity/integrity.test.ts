import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { availableEquipment } from "../../src/vendor/osrs-wiki/engine.generated.js";
import version from "../../src/vendor/osrs-wiki/version.json";
import { getItems } from "../../src/lib/data";
import { PINNED_REVISION } from "./helpers";
import fixtures from "./fixtures/upstream.json";

test("pinned revision metadata is present and matches fixture pack", () => {
  assert.equal(version.repository, "https://github.com/weirdgloop/osrs-dps-calc");
  assert.equal(version.revision, PINNED_REVISION);
  assert.equal(fixtures.revision, PINNED_REVISION);
  assert.match(version.revision, /^[0-9a-f]{40}$/);
});

test("vendored engine exports a non-empty equipment table", () => {
  assert.ok(availableEquipment.length > 1000);
  const ids = new Set(availableEquipment.map((item) => item.id));
  assert.equal(ids.size, availableEquipment.length);
});

test("reconciled game-data bonuses match the pinned engine for supported items", () => {
  const engine = new Map(availableEquipment.map((item) => [item.id, item]));
  const items = getItems().filter((item) => item.optimizerEligible !== false);
  let compared = 0;
  for (const item of items) {
    const entry = engine.get(item.id);
    if (!entry) continue;
    compared++;
    assert.equal(item.bonuses.stabAttack, entry.offensive.stab, `${item.id} stab`);
    assert.equal(item.bonuses.slashAttack, entry.offensive.slash, `${item.id} slash`);
    assert.equal(item.bonuses.crushAttack, entry.offensive.crush, `${item.id} crush`);
    assert.equal(item.bonuses.magicAttack, entry.offensive.magic, `${item.id} magic`);
    assert.equal(item.bonuses.rangedAttack, entry.offensive.ranged, `${item.id} ranged`);
    assert.equal(item.bonuses.strength, entry.bonuses.str, `${item.id} str`);
    assert.equal(item.bonuses.rangedStrength, entry.bonuses.ranged_str, `${item.id} rstr`);
    assert.equal(item.bonuses.magicDamage, entry.bonuses.magic_str, `${item.id} mdmg`);
  }
  assert.ok(compared > 1000, `expected many matched items, got ${compared}`);
});

test("sync script pins equipment.json to the same revision", () => {
  const source = readFileSync(join(process.cwd(), "scripts/sync-wiki-data.ts"), "utf8");
  assert.match(source, /pinnedCalculatorEquipmentUrl/);
  assert.doesNotMatch(source, /osrs-dps-calc\/main\/cdn\/json\/equipment\.json/);
});
