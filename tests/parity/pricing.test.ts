import assert from "node:assert/strict";
import test from "node:test";
import { getComponentPrices, getItems } from "../../src/lib/data";
import { acquisitionFor, priceOf } from "../../src/lib/prices/acquisition";
import { geNameCandidates } from "../../src/lib/prices/geResolve";
import { RECIPES } from "../../src/lib/prices/recipes";
import type { EquipmentItem } from "../../src/lib/types";

function itemNamed(name: string): EquipmentItem {
  const item = getItems().find((i) => i.name.toLowerCase() === name.toLowerCase());
  assert.ok(item, `missing item ${name}`);
  return item;
}

const ctx = { componentPrices: getComponentPrices(), allowEarned: true };

test("every priced item resolves to a real GE item id", () => {
  const offenders = getItems().filter((item) => item.gePrice != null && item.geItemId == null);
  assert.deepEqual(
    offenders.map((i) => `${i.id} ${i.name}`),
    [],
    "items may only carry a price that came from a mapped GE id",
  );
});

test("charged gear is priced from its tradeable form, not left to a stale guess", () => {
  const scythe = itemNamed("Scythe of vitur (Charged)");
  const uncharged = itemNamed("Scythe of vitur (Uncharged)");
  assert.equal(scythe.geItemId, uncharged.geItemId ?? uncharged.id);
  const price = priceOf(scythe, ctx);
  assert.ok(price != null && price > 500_000_000, `scythe priced at ${price}`);

  const sang = itemNamed("Sanguinesti staff (Charged)");
  const sangPrice = priceOf(sang, ctx);
  assert.ok(sangPrice != null && sangPrice > 1_000_000, `sang priced at ${sangPrice}`);
});

test("uncharged name candidates are tried for charged variants", () => {
  const candidates = geNameCandidates("Scythe of vitur (Charged)");
  assert.ok(candidates.includes("Scythe of vitur (uncharged)"));
  assert.ok(candidates.includes("Scythe of vitur"));
});

test("Ferocious gloves cost their hydra leather, not a hand-written number", () => {
  const gloves = itemNamed("Ferocious gloves");
  const acquisition = acquisitionFor(gloves, ctx);
  assert.equal(acquisition.kind, "craft");
  assert.equal(acquisition.steps.length, 1);
  assert.equal(acquisition.steps[0].name, "Hydra leather");
  const leather = getComponentPrices()[22983];
  assert.ok(leather > 1_000_000, `hydra leather price missing: ${leather}`);
  assert.equal(acquisition.cost, leather);
});

test("Avernic defender is buyable as a hilt plus an earned dragon defender", () => {
  const avernic = itemNamed("Avernic defender (Normal)");
  const acquisition = acquisitionFor(avernic, ctx);
  assert.equal(acquisition.kind, "craft");
  assert.equal(acquisition.cost, getComponentPrices()[22477]);
  assert.ok(acquisition.cost > 1_000_000);
  assert.deepEqual(acquisition.earnSteps, ["Dragon defender (Warriors' Guild)"]);

  // Without in-game steps allowed it must not appear as free gear.
  const strict = acquisitionFor(avernic, { ...ctx, allowEarned: false });
  assert.equal(strict.kind, "unobtainable");
  assert.equal(strict.cost, Infinity);
});

test("owned items always cost nothing", () => {
  const scythe = itemNamed("Scythe of vitur (Charged)");
  const acquisition = acquisitionFor(scythe, { ...ctx, owned: new Set([scythe.id]) });
  assert.equal(acquisition.kind, "owned");
  assert.equal(acquisition.cost, 0);
});

test("gear with no GE route is reported as earned, never bought", () => {
  const infernal = getItems().find((i) => /^infernal cape/i.test(i.name));
  assert.ok(infernal);
  const acquisition = acquisitionFor(infernal, ctx);
  assert.equal(acquisition.kind, "earn");
  assert.equal(acquisition.cost, 0);
  assert.equal(acquisitionFor(infernal, { ...ctx, allowEarned: false }).kind, "unobtainable");
});

test("live prices override synced prices", () => {
  const fang = itemNamed("Osmumten's fang");
  const geId = fang.geItemId ?? fang.id;
  assert.equal(priceOf(fang, { ...ctx, prices: { [geId]: 123_456 } }), 123_456);
});

test("every recipe part is priced or explicitly earned", () => {
  const componentPrices = getComponentPrices();
  for (const recipe of RECIPES) {
    for (const part of recipe.parts) {
      if (part.kind !== "ge") continue;
      assert.ok(part.geItemId, `${recipe.match} part ${part.name} has no GE id`);
      const priced =
        componentPrices[part.geItemId!] != null ||
        getItems().some((i) => i.geItemId === part.geItemId && i.gePrice != null);
      assert.ok(priced, `${part.name} (${part.geItemId}) has no price — check the GE id`);
    }
  }
});
