import assert from "node:assert/strict";
import test from "node:test";
import { getItemById, getMonsters } from "../../src/lib/data";
import { defaultStretchBudget, shortfall } from "../../src/lib/prices/stretchBudget";
import { createEmptyLoadout } from "../../src/lib/store/useAppStore";
import { suggestUpgrades } from "../../src/lib/upgrades/suggest";

test("stretch ceiling covers mid-tier buys like Bludgeon from a short bank", () => {
  assert.equal(defaultStretchBudget(5_000_000), 30_000_000);
  assert.equal(defaultStretchBudget(20_000_000), 60_000_000);
  assert.equal(shortfall(19_000_000, 10_000_000), 9_000_000);
});

test("Upgrade Advisor surfaces Bludgeon as a stretch goal for Araxxor", () => {
  const monster = getMonsters().find((candidate) =>
    (candidate.baseName ?? candidate.name).includes("Araxxor"),
  );
  assert.ok(monster);
  const bludgeon = getItemById(13263);
  assert.ok(bludgeon);

  const loadout = {
    ...createEmptyLoadout(),
    attackType: "crush" as const,
    combatStyle: "aggressive" as const,
    onTask: true,
    equipment: {
      // Weak crush starter so Bludgeon is a clear upgrade.
      weapon: 1333, // Rune scimitar won't match crush styles well; use granite maul-ish
      // Use a cheap crush weapon if present; otherwise leave empty unarmed.
    },
  };
  // Prefer a real cheap crush weapon from the catalogue.
  const cheapCrush = getItemById(4153) ?? getItemById(13576) ?? getItemById(1333);
  if (cheapCrush) loadout.equipment.weapon = cheapCrush.id;

  const budget = 10_000_000;
  const { best, stretch } = suggestUpgrades(loadout, monster, "main", {
    budget,
    stretchBudget: defaultStretchBudget(budget),
  });

  assert.ok(
    !best.some((entry) => entry.upgradeItem.id === bludgeon.id),
    "Bludgeon must not appear in the affordable list on a 10M budget",
  );
  const stretchHit = stretch.find((entry) => entry.upgradeItem.id === bludgeon.id);
  assert.ok(stretchHit, "Bludgeon should appear in stretch upgrades");
  assert.ok((stretchHit.shortfall ?? 0) > 0);
  assert.ok(stretchHit.deltaDps > 0);
});
