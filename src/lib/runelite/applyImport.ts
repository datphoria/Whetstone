import type { Loadout, LoadoutEquipment, PlayerSkills } from "@/lib/types";
import type { WikiSyncLoadout } from "@/lib/runelite/wikisync";

const SLOT_MAP: Record<string, keyof LoadoutEquipment> = {
  head: "head",
  cape: "cape",
  neck: "neck",
  ammo: "ammo",
  weapon: "weapon",
  body: "body",
  shield: "shield",
  legs: "legs",
  hands: "hands",
  feet: "feet",
  ring: "ring",
};

export function wikiSyncToEquipment(wiki: WikiSyncLoadout): LoadoutEquipment {
  const equipment: LoadoutEquipment = {};
  const eq = wiki.equipment ?? {};
  for (const [wikiKey, slot] of Object.entries(SLOT_MAP)) {
    const item = eq[wikiKey as keyof typeof eq];
    if (item && typeof item === "object" && item.id != null && item.id > 0) {
      equipment[slot] = item.id;
    }
  }
  return equipment;
}

export function wikiSyncToSkills(wiki: WikiSyncLoadout): Partial<PlayerSkills> {
  const s = wiki.skills ?? {};
  return {
    attack: s.atk ?? undefined,
    strength: s.str ?? undefined,
    defence: s.def ?? undefined,
    hitpoints: s.hp ?? undefined,
    ranged: s.ranged ?? undefined,
    prayer: s.prayer ?? undefined,
    magic: s.magic ?? undefined,
    mining: s.mining ?? undefined,
  };
}

export function applyWikiSyncToLoadout(loadout: Loadout, wiki: WikiSyncLoadout): Loadout {
  const skills = wikiSyncToSkills(wiki);
  return {
    ...loadout,
    name: wiki.name ? `${wiki.name}'s gear` : loadout.name,
    equipment: wikiSyncToEquipment(wiki),
    skills: { ...loadout.skills, ...skills },
    onTask: wiki.buffs?.onSlayerTask ?? loadout.onTask,
  };
}

export function countRecognizedEquipment(
  equipment: LoadoutEquipment,
  knownIds: Set<number>,
): { slots: number; recognized: number; ids: number[] } {
  const ids = Object.values(equipment).filter((id): id is number => id != null && id > 0);
  const recognized = ids.filter((id) => knownIds.has(id)).length;
  return { slots: ids.length, recognized, ids };
}
