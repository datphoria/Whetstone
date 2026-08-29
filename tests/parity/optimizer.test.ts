import assert from "node:assert/strict";
import test from "node:test";
import { getComponentPrices, getItemById, getItems, getMonsters } from "../../src/lib/data";
import { computeUpgradePath, findBestSetup } from "../../src/lib/optimizer/bestSetup";
import { EQUIPMENT_SLOTS } from "../../src/lib/types";
import { createEmptyLoadout } from "../../src/lib/store/useAppStore";
import type { EquipmentItem } from "../../src/lib/types";

function requireItem(id: number): EquipmentItem {
  const item = getItemById(id);
  assert.ok(item, `missing item ${id}`);
  return item;
}

function abyssal() {
  const monster = getMonsters().find((m) => (m.baseName ?? m.name) === "Abyssal demon");
  assert.ok(monster);
  return monster;
}

function araxxor() {
  const monster = getMonsters().find((m) => (m.baseName ?? m.name).includes("Araxxor"));
  assert.ok(monster);
  return monster;
}

test("oracle: whip beats unarmed on abyssal demon in a tiny pool", () => {
  const pool = [requireItem(4151)]; // abyssal whip
  const base = createEmptyLoadout();
  base.prayer = "none";
  base.potions = ["none"];

  const [best] = findBestSetup(base, abyssal(), {
    budget: 1_000_000,
    accountMode: "main",
    includeUntradeables: false,
    allowedAttackTypes: ["slash"],
    allowedPrayers: ["piety"],
    potions: ["none"],
    itemPool: pool,
    exhaustive: true,
    shortlistLimit: 100,
  });

  assert.ok(best);
  assert.equal(best.loadout.equipment.weapon, 4151);
  assert.ok(best.dps > 0);
});

test("oracle: production beam matches exhaustive winner on a controlled melee pool", () => {
  const pool = [
    requireItem(4151), // whip
    requireItem(4587), // dragon scimitar
    requireItem(10828), // neitiznot
    requireItem(6570), // fire cape — may be Normal variant; resolve by search if needed
    requireItem(1725), // strength amulet
    requireItem(10551), // fighter torso
    requireItem(11840), // dragon boots
    requireItem(6737), // berserker ring
  ].filter(Boolean);

  // Prefer fire cape Normal if present in catalogue.
  const fireCape = getItems().find((i) => /^fire cape \(normal\)$/i.test(i.name));
  if (fireCape) pool.push(fireCape);
  const barrows = getItems().find((i) => /^barrows gloves$/i.test(i.name));
  if (barrows) pool.push(barrows);

  const base = createEmptyLoadout();
  const opts = {
    budget: 5_000_000,
    accountMode: "main" as const,
    includeUntradeables: true,
    allowedAttackTypes: ["slash" as const],
    allowedPrayers: ["piety" as const],
    potions: ["superCombat" as const],
    itemPool: pool,
  };

  const [beam] = findBestSetup(base, abyssal(), {
    ...opts,
    exhaustive: false,
    shortlistLimit: 20,
    beamWidth: 12,
  });
  const [exact] = findBestSetup(base, abyssal(), {
    ...opts,
    exhaustive: true,
    shortlistLimit: 100,
    beamWidth: 10_000,
  });

  assert.ok(beam && exact);
  assert.equal(beam.loadout.equipment.weapon, exact.loadout.equipment.weapon);
  assert.equal(beam.dps, exact.dps);
});

test("oracle: iron mode cannot buy items not in the bank", () => {
  const pool = [requireItem(4151), requireItem(4587)];
  const base = createEmptyLoadout();
  const [best] = findBestSetup(base, abyssal(), {
    budget: 0,
    accountMode: "iron",
    ownedItemIds: [4587],
    allowedAttackTypes: ["slash"],
    allowedPrayers: ["piety"],
    potions: ["none"],
    itemPool: pool,
    exhaustive: true,
  });
  assert.ok(best);
  assert.equal(best.loadout.equipment.weapon, 4587);
});

test("oracle: owned bank items cost zero for mains", () => {
  const whip = requireItem(4151);
  const base = createEmptyLoadout();
  const [best] = findBestSetup(base, abyssal(), {
    budget: 0,
    accountMode: "main",
    ownedItemIds: [whip.id],
    includeUntradeables: false,
    allowedAttackTypes: ["slash"],
    allowedPrayers: ["piety"],
    potions: ["none"],
    itemPool: [whip],
    exhaustive: true,
  });
  assert.ok(best);
  assert.equal(best.purchaseCost, 0);
  assert.equal(best.ownedItemsUsed, 1);
});

test("oracle: two-handed weapon never pairs with a shield", () => {
  const tbow = getItems().find((i) => i.id === 20997) ?? requireItem(20997);
  const buckler = getItems().find((i) => i.id === 21000) ?? requireItem(21000);
  const base = createEmptyLoadout();
  const [best] = findBestSetup(base, abyssal(), {
    budget: 2_000_000_000,
    accountMode: "main",
    includeUntradeables: true,
    allowedAttackTypes: ["ranged"],
    allowedPrayers: ["rigour"],
    potions: ["ranging"],
    itemPool: [tbow, buckler],
    exhaustive: true,
  });
  assert.ok(best);
  assert.equal(best.loadout.equipment.weapon, tbow.id);
  assert.equal(best.loadout.equipment.shield, undefined);
});

test("regression: weapon and shield are paired before beam pruning", () => {
  const greyGolem = getMonsters().find((m) => m.name === "Grey golem");
  assert.ok(greyGolem);
  const whip = requireItem(4151);
  const dualMacuahuitl = requireItem(28997);
  const dragonScimitar = requireItem(4587);
  const avernic = getItems().find((i) => i.id === 22322);
  assert.ok(avernic);

  // With no shield the dual macuahuitl ranks above the whip and a width-1 beam
  // used to discard the whip before the shield slot was reached.
  const [best] = findBestSetup(createEmptyLoadout(), greyGolem, {
    budget: 2_000_000_000,
    accountMode: "main",
    includeUntradeables: true,
    allowedAttackTypes: ["slash", "crush"],
    allowedPrayers: ["piety"],
    potions: ["superCombat"],
    // The cheap scimitar occupies the beam's low-cost branch. Before core
    // pairing, that left no branch for whip + defender.
    itemPool: [whip, dualMacuahuitl, dragonScimitar, avernic],
    shortlistLimit: 10,
    beamWidth: 2,
  });

  assert.ok(best);
  assert.equal(best.loadout.equipment.weapon, whip.id);
  assert.equal(best.loadout.equipment.shield, avernic.id);
});

test("regression: late strength gear keeps Ursine ahead of zombie axe", () => {
  const monster = araxxor();
  const itemIds = [
    27660, // Ursine chainmace (charged)
    28810, // Zombie axe
    11865, // Slayer helmet (i)
    21295, // Infernal cape
    19553, // Amulet of torture
    11832, // Bandos chestplate
    11834, // Bandos tassets
    7462,  // Barrows gloves
    13239, // Primordial boots
    28307, // Ultor ring
    22322, // Avernic defender
  ];
  const itemPool = itemIds.map(requireItem);
  const [best] = findBestSetup(createEmptyLoadout(), monster, {
    budget: 0,
    accountMode: "main",
    includeUntradeables: true,
    restrictToOwned: true,
    ownedItemIds: itemIds,
    allowedAttackTypes: ["crush"],
    allowedPrayers: ["piety"],
    potions: ["superCombat"],
    itemPool,
    shortlistLimit: itemPool.length,
    // A tiny beam proves weapon branches are deliberately retained rather than
    // surviving only because the production beam happens to be wide enough.
    beamWidth: 1,
  });

  assert.ok(best);
  assert.equal(best.loadout.equipment.weapon, 27660);
  assert.ok(best.dps > 9.8, `expected Ursine setup above 9.8 DPS, got ${best.dps}`);
});

test("regression: optimizer checks every upstream weapon stance", () => {
  const artio = getMonsters().find((m) => m.name === "Artio");
  assert.ok(artio);
  const dualMacuahuitl = requireItem(28997);
  const [best] = findBestSetup(createEmptyLoadout(), artio, {
    budget: 100_000_000,
    accountMode: "main",
    includeUntradeables: false,
    allowedAttackTypes: ["crush"],
    allowedPrayers: ["piety"],
    potions: ["superCombat"],
    itemPool: [dualMacuahuitl],
    exhaustive: true,
  });

  assert.ok(best);
  assert.equal(best.loadout.combatStyle, "accurate");
});

test("regression: Araxxor heuristic search never recommends greegree/minigame junk", () => {
  const base = createEmptyLoadout();
  const results = findBestSetup(base, araxxor(), {
    budget: 500_000_000,
    accountMode: "main",
    includeUntradeables: true,
    allowedAttackTypes: ["slash", "crush", "stab"],
    ownedItemIds: [],
  });
  assert.ok(results.length > 0);
  for (const result of results) {
    assert.ok(result.dps > 1, `${result.attackType} dps too low: ${result.dps}`);
    assert.ok(result.purchaseCost <= 500_000_000);
    for (const id of Object.values(result.loadout.equipment)) {
      if (id == null) continue;
      const item = getItemById(id)!;
      const name = item.name.toLowerCase();
      assert.doesNotMatch(name, /greegree|gorilla/);
      assert.doesNotMatch(name, /\((broken|locked|minigame|tutorial)\)/);
      assert.doesNotMatch(name, /crate of /);
    }
    const weapon = getItemById(result.loadout.equipment.weapon ?? null);
    assert.ok(weapon);
    assert.ok((weapon.attackTypes?.length ?? 0) > 0);
  }
});

test("restrictToOwned keeps mains inside their bank and at zero cost", () => {
  const whip = requireItem(4151);
  const scimitar = requireItem(4587);
  const base = createEmptyLoadout();
  const [best] = findBestSetup(base, abyssal(), {
    budget: 1_000_000_000,
    accountMode: "main",
    restrictToOwned: true,
    includeUntradeables: true,
    ownedItemIds: [scimitar.id],
    allowedAttackTypes: ["slash"],
    allowedPrayers: ["piety"],
    potions: ["none"],
    itemPool: [whip, scimitar],
    exhaustive: true,
  });
  assert.ok(best);
  assert.equal(best.loadout.equipment.weapon, scimitar.id);
  assert.equal(best.purchaseCost, 0);
  assert.ok(best.plan.every((entry) => entry.acquisition.kind === "owned"));
});

test("restrictToOwned never returns an item outside the bank in a full search", () => {
  const owned = [
    4151, // abyssal whip
    11865, // slayer helmet (i)
    19553, // amulet of torture
    11832, // bandos chestplate
    11834, // bandos tassets
    7462, // barrows gloves
  ].filter((id) => getItemById(id) != null);
  const base = createEmptyLoadout();
  const results = findBestSetup(base, araxxor(), {
    budget: 2_000_000_000,
    accountMode: "main",
    restrictToOwned: true,
    includeUntradeables: true,
    ownedItemIds: owned,
    allowedAttackTypes: ["slash"],
    onTask: true,
  });
  assert.ok(results.length > 0);
  for (const result of results) {
    for (const id of Object.values(result.loadout.equipment)) {
      if (id == null) continue;
      assert.ok(owned.includes(id), `${getItemById(id)?.name} is not in the bank`);
    }
    assert.equal(result.purchaseCost, 0);
  }
});

test("Araxxor forces the only possible on-task state and picks a slayer helmet", () => {
  const base = createEmptyLoadout();
  const opts = {
    budget: 2_000_000_000,
    accountMode: "main" as const,
    includeUntradeables: true,
    allowedAttackTypes: ["slash" as const],
    ownedItemIds: [],
  };
  const [offTask] = findBestSetup(base, araxxor(), { ...opts, onTask: false });
  const [onTask] = findBestSetup(base, araxxor(), { ...opts, onTask: true });
  assert.ok(offTask && onTask);
  assert.equal(offTask.dps, onTask.dps);
  assert.equal(offTask.loadout.onTask, true);
  const helm = getItemById(onTask.loadout.equipment.head ?? null);
  assert.ok(helm);
  assert.match(helm.name.toLowerCase(), /slayer helmet|black mask/);
});

test("craftable gear is costed by its parts and respects the budget", () => {
  const whip = requireItem(4151);
  const gloves = getItems().find((i) => /^ferocious gloves$/i.test(i.name));
  assert.ok(gloves);
  const leather = getComponentPrices()[22983];
  assert.ok(leather > 1_000_000);

  const base = createEmptyLoadout();
  const opts = {
    accountMode: "main" as const,
    includeUntradeables: true,
    allowedAttackTypes: ["slash" as const],
    allowedPrayers: ["piety" as const],
    potions: ["none" as const],
    itemPool: [whip, gloves],
    exhaustive: true,
    shortlistLimit: 100,
  };

  const [poor] = findBestSetup(base, abyssal(), { ...opts, budget: leather - 1 });
  assert.ok(poor);
  assert.equal(poor.loadout.equipment.hands, undefined, "gloves cost more than the budget");

  const [rich] = findBestSetup(base, abyssal(), { ...opts, budget: leather + 1_000_000 });
  assert.ok(rich);
  assert.equal(rich.loadout.equipment.hands, gloves.id);
  const entry = rich.plan.find((p) => p.slot === "hands");
  assert.ok(entry);
  assert.equal(entry.acquisition.kind, "craft");
  assert.equal(entry.acquisition.cost, leather);
  assert.equal(
    rich.purchaseCost,
    rich.plan.reduce((sum, p) => sum + p.acquisition.cost, 0),
    "reported spend is the sum of the plan",
  );
});

test("upgrade path covers every difference, cheapest DPS first", () => {
  const base = createEmptyLoadout();
  const bankIds = [
    4151, // abyssal whip
    10828, // helm of neitiznot
    19553, // amulet of torture
    11832, // bandos chestplate
    11834, // bandos tassets
    7462, // barrows gloves
  ].filter((id) => getItemById(id) != null);
  const opts = {
    budget: 300_000_000,
    accountMode: "main" as const,
    includeUntradeables: true,
    ownedItemIds: bankIds,
    allowedAttackTypes: ["slash" as const, "crush" as const],
    onTask: false,
  };

  const [bank] = findBestSetup(base, araxxor(), {
    ...opts,
    budget: 0,
    restrictToOwned: true,
    includeUntradeables: false,
  });
  const [target] = findBestSetup(base, araxxor(), opts);
  assert.ok(bank && target);
  assert.ok(target.dps > bank.dps, "buying gear should beat the bank-only setup");

  const path = computeUpgradePath(base, araxxor(), opts, {
    from: bank.loadout.equipment,
    to: target.loadout.equipment,
    attackTypes: opts.allowedAttackTypes,
  });

  const changedSlots = EQUIPMENT_SLOTS.filter(
    (slot) =>
      target.loadout.equipment[slot] != null &&
      target.loadout.equipment[slot] !== bank.loadout.equipment[slot],
  );
  assert.deepEqual(
    [...path.steps.map((s) => s.slot)].sort(),
    [...changedSlots].sort(),
    "every changed slot appears exactly once",
  );
  assert.ok(Math.abs(path.endDps - target.dps) < 0.05, `${path.endDps} vs ${target.dps}`);
  assert.ok(Math.abs(path.startDps - bank.dps) < 0.05, `${path.startDps} vs ${bank.dps}`);
  assert.equal(
    path.totalCost,
    path.steps.reduce((sum, step) => sum + step.cost, 0),
  );

  // Each step is scored after the previous ones, so DPS only goes up.
  let previous = path.startDps;
  for (const step of path.steps) {
    assert.ok(
      step.cumulativeDps >= previous - 0.001,
      `${step.toItemName} lowered DPS: ${previous} -> ${step.cumulativeDps}`,
    );
    previous = step.cumulativeDps;
  }
  // The first paid step is the best DPS per GP available at that point.
  const paid = path.steps.filter((step) => step.cost > 0 && step.dpsGain > 0);
  if (paid.length > 1) {
    const firstValue = paid[0].dpsGain / paid[0].cost;
    const lastValue = paid[paid.length - 1].dpsGain / paid[paid.length - 1].cost;
    assert.ok(
      firstValue >= lastValue,
      `first paid upgrade should be better value: ${firstValue} vs ${lastValue}`,
    );
  }
});

test("progress callback fires during search", () => {
  const messages: string[] = [];
  const base = createEmptyLoadout();
  findBestSetup(base, abyssal(), {
    budget: 1_000_000,
    accountMode: "main",
    includeUntradeables: true,
    allowedAttackTypes: ["slash"],
    itemPool: [requireItem(4151), requireItem(10828)],
    exhaustive: true,
    onProgress: (p) => messages.push(p.phase),
  });
  assert.ok(messages.includes("starting"));
  assert.ok(messages.includes("done"));
});
