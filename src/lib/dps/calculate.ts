import type {
  AggregatedBonuses,
  DpsResult,
  EquipmentItem,
  Loadout,
  MonsterDpsResult,
  MonsterStats,
} from "@/lib/types";
import { EMPTY_BONUSES } from "@/lib/types";
import {
  calculateWikiMonsterDps,
  calculateWikiPlayerDps,
} from "@/lib/dps/wikiAdapter";

/**
 * Used only for displaying aggregate equipment bonuses in the editor.
 * Combat results come exclusively from the pinned OSRS Wiki engine.
 */
export function sumBonuses(
  items: (EquipmentItem | null | undefined)[],
): AggregatedBonuses {
  const bonuses: AggregatedBonuses = {
    ...EMPTY_BONUSES,
    totalGePrice: 0,
    attackSpeed: 4,
  };
  let weaponSpeed: number | null = null;

  for (const item of items) {
    if (!item) continue;
    const stats = item.bonuses;
    bonuses.stabAttack += stats.stabAttack;
    bonuses.slashAttack += stats.slashAttack;
    bonuses.crushAttack += stats.crushAttack;
    bonuses.magicAttack += stats.magicAttack;
    bonuses.rangedAttack += stats.rangedAttack;
    bonuses.stabDefence += stats.stabDefence;
    bonuses.slashDefence += stats.slashDefence;
    bonuses.crushDefence += stats.crushDefence;
    bonuses.magicDefence += stats.magicDefence;
    bonuses.rangedDefence += stats.rangedDefence;
    bonuses.strength += stats.strength;
    bonuses.rangedStrength += stats.rangedStrength;
    bonuses.magicDamage += stats.magicDamage;
    bonuses.prayer += stats.prayer;
    bonuses.totalGePrice += item.gePrice ?? 0;
    if (item.slot === "weapon") weaponSpeed = stats.attackSpeed;
  }

  bonuses.attackSpeed = weaponSpeed ?? 4;
  return bonuses;
}

export function calculatePlayerDps(
  loadout: Loadout,
  monster: MonsterStats,
  _equippedItems: (EquipmentItem | null | undefined)[],
  options?: { strict?: boolean },
): DpsResult {
  return calculateWikiPlayerDps(loadout, monster, options);
}

export function calculateMonsterDps(
  loadout: Loadout,
  monster: MonsterStats,
  _equippedItems: (EquipmentItem | null | undefined)[],
  protecting = false,
  options?: { strict?: boolean },
): MonsterDpsResult {
  return calculateWikiMonsterDps(loadout, monster, protecting, options);
}

export function dpsAtHp(
  loadout: Loadout,
  monster: MonsterStats,
  _equippedItems: (EquipmentItem | null | undefined)[],
  hp: number,
): number {
  return calculateWikiPlayerDps(
    { ...loadout, monsterHpOverride: hp },
    monster,
  ).dps;
}
