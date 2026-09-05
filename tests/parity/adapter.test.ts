import assert from "node:assert/strict";
import test from "node:test";
import fixtures from "./fixtures/upstream.json";
import { getAllMonsterVariants, getMonsters } from "../../src/lib/data";
import { calculatePlayerDps } from "../../src/lib/dps/calculate";
import { createEmptyLoadout } from "../../src/lib/store/useAppStore";
import {
  ACCURACY_PRECISION,
  DPS_PRECISION,
  assertClose,
  runMonsterFixture,
  runPlayerFixture,
  type ParityFixture,
} from "./helpers";

const playerFixtures = (fixtures.fixtures as ParityFixture[]).filter(
  (fixture) => fixture.expected.maxHit != null || fixture.expected.dps != null,
);
const npcFixtures = (fixtures.fixtures as ParityFixture[]).filter(
  (fixture) => fixture.expected.npcMaxHit != null,
);

for (const fixture of playerFixtures) {
  test(`engine+adapter player: ${fixture.id} (${fixture.source})`, () => {
    const { adapter, native, player, wikiMonster } = runPlayerFixture(fixture, true);

    assert.ok(wikiMonster.id > 0, "monster resolved to engine id");
    for (const [slot, id] of Object.entries(fixture.equipment ?? {})) {
      if (id == null) continue;
      const equipped = player.equipment[slot as keyof typeof player.equipment];
      assert.ok(equipped, `missing ${slot}`);
      assert.equal(equipped.id, id, `${slot} id`);
    }
    assert.equal(player.style.type, fixture.attackType);

    if (fixture.expected.maxHit != null) {
      assert.equal(adapter.maxHit, fixture.expected.maxHit);
      assert.equal(native.maxHit, fixture.expected.maxHit);
    }
    if (fixture.expected.dps != null) {
      assertClose(adapter.dps, fixture.expected.dps, DPS_PRECISION, "adapter dps");
      assertClose(native.dps, fixture.expected.dps, DPS_PRECISION, "native dps");
    }
    if (fixture.expected.accuracy != null) {
      assertClose(adapter.accuracy, fixture.expected.accuracy, ACCURACY_PRECISION, "adapter accuracy");
      assertClose(native.accuracy, fixture.expected.accuracy, ACCURACY_PRECISION, "native accuracy");
    }

    // Adapter rounding of the same engine call must match native within tolerances.
    assert.equal(adapter.maxHit, native.maxHit);
    assertClose(adapter.dps, native.dps, DPS_PRECISION, "adapter vs native dps");
    assertClose(adapter.accuracy, native.accuracy, ACCURACY_PRECISION, "adapter vs native accuracy");
  });
}

for (const fixture of npcFixtures) {
  test(`engine+adapter monster DPS: ${fixture.id}`, () => {
    const defence = fixture.skills?.defence ?? 99;
    const result = runMonsterFixture(fixture, defence);
    assert.equal(result.maxHit, fixture.expected.npcMaxHit);
    if (fixture.expected.npcDps != null) {
      assertClose(result.dps, fixture.expected.npcDps, DPS_PRECISION, "npc dps");
    }
    if (fixture.expected.npcAccuracy != null) {
      assertClose(result.accuracy, fixture.expected.npcAccuracy, ACCURACY_PRECISION, "npc accuracy");
    }
  });
}

test("strict mode rejects unsupported equipment ids", () => {
  assert.throws(
    () =>
      runPlayerFixture(
        {
          id: "bad-item",
          source: "local",
          monsterNpcId: 415,
          monsterVersion: "Standard",
          equipment: { weapon: 99999901 },
          attackType: "slash",
          combatStyle: "accurate",
          prayer: "none",
          potions: ["none"],
          expected: {},
        },
        true,
      ),
    /Strict DPS calc/,
  );
});

test("live Wiki cross-check: baseline Araxxor weapon results", () => {
  const monster = getMonsters().find((candidate) =>
    (candidate.baseName ?? candidate.name).includes("Araxxor"),
  );
  assert.ok(monster);
  const base = {
    ...createEmptyLoadout(),
    prayer: "none" as const,
    prayers: [],
    potions: [],
  };

  // Verified against https://tools.runescape.wiki/osrs-dps at revision 91218d6:
  // 99 stats, no armour/prayer/potion, Araxxor, Pound (accurate).
  const dual = calculatePlayerDps(
    {
      ...base,
      equipment: { weapon: 28997 },
      attackType: "crush",
      combatStyle: "accurate",
    },
    monster,
    [],
  );
  assert.equal(dual.maxHit, 24);
  assert.equal(dual.dps, 3.139);
  assert.equal(dual.accuracy, 72.05);

  // Same live calculator state with an abyssal whip + Avernic defender.
  const whip = calculatePlayerDps(
    {
      ...base,
      equipment: { weapon: 4151, shield: 22322 },
      attackType: "slash",
      combatStyle: "accurate",
    },
    monster,
    [],
  );
  assert.equal(whip.maxHit, 26);
  assert.equal(whip.dps, 2.612);
  assert.equal(whip.accuracy, 48.08);
});

test("Araxxor Enraged variant reaches the upstream phase input", () => {
  const variants = getAllMonsterVariants().filter((candidate) =>
    (candidate.baseName ?? candidate.name).includes("Araxxor"),
  );
  const standard = variants.find((candidate) => candidate.version === "In combat");
  const enraged = variants.find((candidate) => candidate.version === "Enraged");
  assert.ok(standard && enraged);
  const loadout = {
    ...createEmptyLoadout(),
    equipment: { weapon: 28997 },
    attackType: "crush" as const,
    combatStyle: "accurate" as const,
    prayer: "none" as const,
    prayers: [],
    potions: [],
  };

  const standardResult = calculatePlayerDps(loadout, standard, []);
  const enragedResult = calculatePlayerDps(loadout, enraged, []);
  assert.equal(standardResult.dps, 3.139);
  assert.equal(enragedResult.dps, 2.73);
  assert.ok(enragedResult.accuracy < standardResult.accuracy);
});

test("Wiki engine cross-check: Ursine beats zombie axe with melee gear on Araxxor", () => {
  const monster = getMonsters().find((candidate) =>
    (candidate.baseName ?? candidate.name).includes("Araxxor"),
  );
  assert.ok(monster);
  const equipment = {
    head: 11865,
    cape: 21295,
    neck: 19553,
    body: 11832,
    legs: 11834,
    hands: 7462,
    feet: 13239,
    ring: 28307,
    shield: 22322,
  };
  const base = {
    ...createEmptyLoadout(),
    attackType: "crush" as const,
    combatStyle: "aggressive" as const,
    onTask: true,
  };
  const ursine = calculatePlayerDps(
    { ...base, equipment: { ...equipment, weapon: 27657 } },
    monster,
    [],
  );
  const zombieAxe = calculatePlayerDps(
    { ...base, equipment: { ...equipment, weapon: 28810 } },
    monster,
    [],
  );

  assert.equal(ursine.dps, 9.898);
  assert.equal(zombieAxe.dps, 9.33);
  assert.ok(ursine.dps > zombieAxe.dps);
});
