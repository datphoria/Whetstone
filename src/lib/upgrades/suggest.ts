import { calculatePlayerDps } from "@/lib/dps/calculate";
import { getComponentPrices, getDropsForItem, getItemById, getItemsBySlot } from "@/lib/data";
import {
  acquisitionFor,
  type Acquisition,
  type PriceMap,
} from "@/lib/prices/acquisition";
import type {
  DropSource,
  EquipmentItem,
  EquipmentSlot,
  Loadout,
  LoadoutEquipment,
  MonsterStats,
} from "@/lib/types";
import { EQUIPMENT_SLOTS } from "@/lib/types";

export type AccountMode = "main" | "iron";

export interface UpgradeSuggestion {
  slot: EquipmentSlot;
  currentItem: EquipmentItem | null;
  upgradeItem: EquipmentItem;
  deltaDps: number;
  newDps: number;
  currentDps: number;
  gePrice: number | null;
  dpsPerGp: number | null;
  /** How this upgrade is actually obtained (buy, buy parts, or earn). */
  acquisition: Acquisition;
  dropSources: DropSource[];
  easiestDrop: DropSource | null;
  obtainScore: number | null; // lower = easier (expected KC * log combat)
  kind: "best" | "value" | "easiest";
}

function resolve(equipment: LoadoutEquipment): (EquipmentItem | null)[] {
  return EQUIPMENT_SLOTS.map((slot) => getItemById(equipment[slot] ?? null) ?? null);
}

function withSlot(equipment: LoadoutEquipment, slot: EquipmentSlot, itemId: number | null): LoadoutEquipment {
  const next = { ...equipment, [slot]: itemId };
  const item = itemId != null ? getItemById(itemId) : null;
  if (slot === "weapon" && item?.twoHanded) next.shield = null;
  return next;
}

export function suggestUpgrades(
  loadout: Loadout,
  monster: MonsterStats,
  mode: AccountMode,
  opts?: { budget?: number; ownedItemIds?: number[]; prices?: PriceMap },
): { best: UpgradeSuggestion[]; valueOrEase: UpgradeSuggestion[] } {
  const baseItems = resolve(loadout.equipment);
  const baseDps = calculatePlayerDps(loadout, monster, baseItems).dps;
  const candidates: UpgradeSuggestion[] = [];
  const acquisitionCtx = {
    owned: new Set(opts?.ownedItemIds ?? []),
    prices: opts?.prices,
    componentPrices: getComponentPrices(),
    allowEarned: true,
  };
  const acquisitionCache = new Map<number, Acquisition>();
  const acquisitionOf = (item: EquipmentItem): Acquisition => {
    const cached = acquisitionCache.get(item.id);
    if (cached) return cached;
    const acquisition = acquisitionFor(item, acquisitionCtx);
    acquisitionCache.set(item.id, acquisition);
    return acquisition;
  };

  for (const slot of EQUIPMENT_SLOTS) {
    const currentId = loadout.equipment[slot] ?? null;
    const currentItem = getItemById(currentId) ?? null;
    let pool = getItemsBySlot(slot).filter((i) => i.id !== currentId);

    if (slot === "weapon") {
      pool = pool.filter(
        (w) => !w.attackTypes || w.attackTypes.includes(loadout.attackType),
      );
    }

    if (mode === "main") {
      // Cost by how the item is really obtained: an Avernic defender is its
      // hilt, and Ferocious gloves are a piece of hydra leather.
      pool = pool.filter((i) => {
        const cost = acquisitionOf(i).cost;
        if (!Number.isFinite(cost)) return false;
        return opts?.budget == null || cost <= opts.budget;
      });
    }

    if (mode === "iron" && opts?.ownedItemIds?.length) {
      // For irons suggesting upgrades they don't own yet — exclude owned
      const owned = new Set(opts.ownedItemIds);
      pool = pool.filter((i) => !owned.has(i.id));
    }

    for (const upgrade of pool) {
      const nextEquipment = withSlot(loadout.equipment, slot, upgrade.id);
      // Skip if two-handed weapon and we're not clearing shield properly — handled in withSlot
      const newDps = calculatePlayerDps(
        { ...loadout, equipment: nextEquipment },
        monster,
        resolve(nextEquipment),
      ).dps;
      const deltaDps = newDps - baseDps;
      if (deltaDps <= 0.001) continue;

      const drops = getDropsForItem(upgrade.id);
      const easiestDrop = drops[0] ?? null;
      const obtainScore = easiestDrop
        ? easiestDrop.rarity * Math.log10(Math.max(10, easiestDrop.combatLevel))
        : null;
      const acquisition = acquisitionOf(upgrade);
      const gePrice = Number.isFinite(acquisition.cost) ? acquisition.cost : null;
      const dpsPerGp = gePrice && gePrice > 0 ? deltaDps / gePrice : null;

      candidates.push({
        slot,
        currentItem,
        upgradeItem: upgrade,
        deltaDps,
        newDps,
        currentDps: baseDps,
        gePrice,
        dpsPerGp,
        acquisition,
        dropSources: drops,
        easiestDrop,
        obtainScore,
        kind: "best",
      });
    }
  }

  const best = [...candidates]
    .sort((a, b) => b.deltaDps - a.deltaDps)
    .slice(0, 8)
    .map((c) => ({ ...c, kind: "best" as const }));

  let valueOrEase: UpgradeSuggestion[];
  if (mode === "main") {
    valueOrEase = [...candidates]
      .filter((c) => c.dpsPerGp != null && c.dpsPerGp > 0)
      .sort((a, b) => (b.dpsPerGp ?? 0) - (a.dpsPerGp ?? 0))
      .slice(0, 8)
      .map((c) => ({ ...c, kind: "value" as const }));
  } else {
    valueOrEase = [...candidates]
      .filter((c) => c.obtainScore != null)
      .sort((a, b) => (a.obtainScore ?? Infinity) - (b.obtainScore ?? Infinity))
      .slice(0, 8)
      .map((c) => ({ ...c, kind: "easiest" as const }));
  }

  return { best, valueOrEase };
}
