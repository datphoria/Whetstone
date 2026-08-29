/**
 * Rewrites item metadata from the pinned OSRS Wiki calculator dataset so the
 * names, slots and bonuses shown in the app are the ones the engine actually
 * uses for its maths. Wiki Bucket rows disagree with the calculator often
 * enough (renamed variants, ornament kits, hand-authored seed rows pointing at
 * the wrong item id) that anything derived from them - display names, optimizer
 * shortlists - drifts away from the DPS results.
 */
import {
  availableEquipment,
  getCanonicalItemId,
  getCombatStylesForCategory,
} from "../../src/vendor/osrs-wiki/engine.generated.js";
import type { AttackType, EquipmentItem, EquipmentSlot } from "../../src/lib/types";

type EngineEquipment = (typeof availableEquipment)[number];

const SLOTS: EquipmentSlot[] = [
  "head", "cape", "neck", "ammo", "weapon", "body",
  "shield", "legs", "hands", "feet", "ring",
];

const engineById = new Map<number, EngineEquipment>(
  availableEquipment.map((item) => [item.id, item]),
);

function engineEntry(id: number): { entry: EngineEquipment; exact: boolean } | null {
  const exact = engineById.get(id);
  if (exact) return { entry: exact, exact: true };
  const canonical = engineById.get(getCanonicalItemId(id));
  return canonical ? { entry: canonical, exact: false } : null;
}

/** Attack types a weapon can actually use, ignoring the universal manual cast. */
export function engineAttackTypes(entry: EngineEquipment): AttackType[] {
  if (entry.slot !== "weapon") return [];
  if (!entry.category || entry.category.toLowerCase() === "unarmed") return [];
  const types = getCombatStylesForCategory(entry.category)
    .filter((style) => style.stance !== "Manual Cast")
    .map((style) => style.type)
    .filter((type): type is AttackType => type != null);
  return [...new Set(types)];
}

function engineName(entry: EngineEquipment): string {
  return entry.version ? `${entry.name} (${entry.version})` : entry.name;
}

export interface ReconcileStats {
  total: number;
  matched: number;
  renamed: number;
  viaCanonicalId: number;
  unsupported: number;
}

export function reconcileItems(items: EquipmentItem[]): {
  items: EquipmentItem[];
  stats: ReconcileStats;
} {
  const stats: ReconcileStats = {
    total: items.length,
    matched: 0,
    renamed: 0,
    viaCanonicalId: 0,
    unsupported: 0,
  };

  const reconciled = items.map((item) => {
    const match = engineEntry(item.id);
    if (!match) {
      stats.unsupported++;
      return { ...item, optimizerEligible: false };
    }
    stats.matched++;
    if (!match.exact) stats.viaCanonicalId++;

    const { entry } = match;
    const slot = SLOTS.includes(entry.slot as EquipmentSlot)
      ? (entry.slot as EquipmentSlot)
      : item.slot;
    // Ornament-kit ids resolve to their canonical stats but keep their own name.
    const name = match.exact ? engineName(entry) : item.name;
    if (name !== item.name) stats.renamed++;
    const attackTypes = engineAttackTypes(entry);
    const nameMatchesSource = name.toLowerCase() === item.name.toLowerCase();

    return {
      ...item,
      name,
      slot,
      twoHanded: entry.isTwoHanded || undefined,
      combatStyle: entry.category || undefined,
      attackTypes: attackTypes.length ? attackTypes : undefined,
      bonuses: {
        stabAttack: entry.offensive.stab,
        slashAttack: entry.offensive.slash,
        crushAttack: entry.offensive.crush,
        magicAttack: entry.offensive.magic,
        rangedAttack: entry.offensive.ranged,
        stabDefence: entry.defensive.stab,
        slashDefence: entry.defensive.slash,
        crushDefence: entry.defensive.crush,
        magicDefence: entry.defensive.magic,
        rangedDefence: entry.defensive.ranged,
        strength: entry.bonuses.str,
        rangedStrength: entry.bonuses.ranged_str,
        magicDamage: entry.bonuses.magic_str,
        prayer: entry.bonuses.prayer,
        attackSpeed: entry.speed > 0 ? entry.speed : 4,
      },
      // Hand-authored requirements are keyed by name, so drop them when the
      // seed row turned out to describe a different item.
      requirements: nameMatchesSource ? item.requirements : undefined,
      optimizerEligible: true,
    } satisfies EquipmentItem;
  });

  const byId = new Map<number, EquipmentItem>();
  for (const item of reconciled) byId.set(item.id, item);
  return {
    items: [...byId.values()].sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id),
    stats,
  };
}
