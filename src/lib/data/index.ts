import gameData from "@/lib/data/game-data.json";
import type { DropSource, EquipmentItem, EquipmentSlot, MonsterStats } from "@/lib/types";

export interface GameDataFile {
  version: number;
  generatedAt: string;
  /** When GE prices in this file were last refreshed. */
  pricesUpdatedAt?: string;
  items: EquipmentItem[];
  monsters: MonsterStats[];
  drops: DropSource[];
  /** Prices for recipe parts that are not wearable equipment, keyed by GE id. */
  componentPrices?: Record<string, number>;
}

const data = gameData as GameDataFile;

function monsterBaseName(monster: MonsterStats): string {
  return (
    monster.baseName ||
    monster.wikiName?.split("#")[0] ||
    monster.name
  ).trim();
}

function monsterBaseKey(monster: MonsterStats): string {
  return monsterBaseName(monster).toLowerCase();
}

function choosePrimaryMonster(variants: MonsterStats[]): MonsterStats {
  return (
    variants.find((monster) => monster.isDefaultVariant) ||
    variants.find((monster) => !monster.version) ||
    variants[0]
  );
}

/**
 * One primary entry per Wiki monster page (variant selector handles the rest).
 * Combat states/forms remain available through getMonsterVariants().
 */
const primaryMonsters: MonsterStats[] = (() => {
  const groups = new Map<string, MonsterStats[]>();
  for (const monster of data.monsters) {
    const key = monsterBaseKey(monster);
    const group = groups.get(key);
    if (group) group.push(monster);
    else groups.set(key, [monster]);
  }

  return [...groups.values()]
    .map(choosePrimaryMonster)
    .sort((a, b) => monsterBaseName(a).localeCompare(monsterBaseName(b)));
})();

export function getItems(): EquipmentItem[] {
  return data.items;
}

export function getMonsters(): MonsterStats[] {
  return primaryMonsters;
}

/** Every synced combat form/state, including non-default variants. */
export function getAllMonsterVariants(): MonsterStats[] {
  return data.monsters;
}

export function getPrimaryMonster(monsterOrId: MonsterStats | string): MonsterStats | undefined {
  const monster =
    typeof monsterOrId === "string" ? getMonsterById(monsterOrId) : monsterOrId;
  if (!monster) return undefined;
  const key = monsterBaseKey(monster);
  return primaryMonsters.find((candidate) => monsterBaseKey(candidate) === key);
}

export function getMonsterVariants(monsterOrId: MonsterStats | string): MonsterStats[] {
  const monster =
    typeof monsterOrId === "string" ? getMonsterById(monsterOrId) : monsterOrId;
  if (!monster) return [];

  const key = monsterBaseKey(monster);
  let variants = data.monsters.filter((candidate) => monsterBaseKey(candidate) === key);

  // When Wiki variants exist, omit the older curated duplicate from the variant selector.
  const wikiVariants = variants.filter((candidate) => candidate.wikiName);
  if (wikiVariants.length) variants = wikiVariants;

  return variants.sort((a, b) => {
    if (a.isDefaultVariant !== b.isDefaultVariant) return a.isDefaultVariant ? -1 : 1;
    return (a.version ?? "").localeCompare(b.version ?? "");
  });
}

export function getDrops(): DropSource[] {
  return data.drops;
}

export function getItemById(id: number | null | undefined): EquipmentItem | undefined {
  if (id == null) return undefined;
  return data.items.find((i) => i.id === id);
}

export function getItemsBySlot(slot: EquipmentSlot): EquipmentItem[] {
  return data.items.filter((i) => i.slot === slot);
}

export function getMonsterById(id: string | null | undefined): MonsterStats | undefined {
  if (!id) return undefined;
  return data.monsters.find((m) => m.id === id);
}

export function getMonsterGroups(): string[] {
  return [...new Set(primaryMonsters.map((m) => m.group).filter(Boolean) as string[])].sort();
}

export function getDropsForItem(itemId: number): DropSource[] {
  return data.drops.filter((d) => d.itemId === itemId).sort((a, b) => a.rarity - b.rarity);
}

export function searchItems(query: string): EquipmentItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return data.items;
  return data.items.filter((i) => i.name.toLowerCase().includes(q));
}

export function searchMonsters(query: string): MonsterStats[] {
  const q = query.trim().toLowerCase();
  if (!q) return primaryMonsters;
  return primaryMonsters.filter((monster) => {
    if (
      monsterBaseName(monster).toLowerCase().includes(q) ||
      monster.group?.toLowerCase().includes(q)
    ) {
      return true;
    }
    return getMonsterVariants(monster).some(
      (variant) =>
        variant.name.toLowerCase().includes(q) ||
        variant.version?.toLowerCase().includes(q),
    );
  });
}

/** Synced prices for recipe parts (hydra leather, Avernic defender hilt…). */
export function getComponentPrices(): Record<number, number> {
  const out: Record<number, number> = {};
  for (const [id, price] of Object.entries(data.componentPrices ?? {})) {
    out[Number(id)] = price;
  }
  return out;
}

export function getDataMeta() {
  return {
    version: data.version,
    generatedAt: data.generatedAt,
    pricesUpdatedAt: data.pricesUpdatedAt,
    itemCount: data.items.length,
    monsterCount: primaryMonsters.length,
    monsterVariantCount: data.monsters.length,
  };
}
