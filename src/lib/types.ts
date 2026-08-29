export type EquipmentSlot =
  | "head"
  | "cape"
  | "neck"
  | "ammo"
  | "weapon"
  | "body"
  | "shield"
  | "legs"
  | "hands"
  | "feet"
  | "ring";

export type CombatStyle =
  | "accurate"
  | "aggressive"
  | "defensive"
  | "controlled"
  | "rapid"
  | "longrange"
  | "autocast"
  | "defensive_autocast";

export type AttackType = "stab" | "slash" | "crush" | "ranged" | "magic";

export type PrayerName =
  | "none"
  | "burstOfStrength"
  | "clarityOfThought"
  | "sharpEye"
  | "mysticWill"
  | "superhumanStrength"
  | "improvedReflexes"
  | "hawkEye"
  | "mysticLore"
  | "piety"
  | "chivalry"
  | "ultimateStrength"
  | "incredibleReflexes"
  | "rigour"
  | "eagleEye"
  | "augury"
  | "mysticMight"
  | "deadeye"
  | "mysticVigour"
  | "thickSkin"
  | "rockSkin"
  | "steelSkin";

export type PotionName =
  | "none"
  | "superCombat"
  | "superAttack"
  | "superStrength"
  | "ranging"
  | "bastion"
  | "magic"
  | "imbuedHeart"
  | "smellingSalts"
  | "overloads";

export interface EquipmentBonuses {
  stabAttack: number;
  slashAttack: number;
  crushAttack: number;
  magicAttack: number;
  rangedAttack: number;
  stabDefence: number;
  slashDefence: number;
  crushDefence: number;
  magicDefence: number;
  rangedDefence: number;
  strength: number;
  rangedStrength: number;
  magicDamage: number;
  prayer: number;
  attackSpeed: number;
}

export interface EquipmentItem {
  id: number;
  name: string;
  slot: EquipmentSlot;
  twoHanded?: boolean;
  attackTypes?: AttackType[];
  combatStyle?: string;
  requirements?: Partial<Record<"attack" | "strength" | "defence" | "ranged" | "magic" | "prayer", number>>;
  bonuses: EquipmentBonuses;
  gePrice?: number | null;
  /**
   * The item id actually traded on the Grand Exchange. Equipment ids often
   * differ from GE ids (charged/imbued variants, ornament kits), so prices must
   * be looked up through this id rather than `id`.
   */
  geItemId?: number | null;
  tradeable?: boolean;
  wikiName?: string;
  dataSource?: "seed" | "wiki";
  /** Included in the OSRS Wiki DPS calculator's filtered equipment dataset. */
  optimizerEligible?: boolean;
}

export interface MonsterStats {
  id: string;
  name: string;
  /** Canonical Wiki page/subpage, when sourced from OSRS Wiki. */
  wikiName?: string;
  /** Internal RuneScape NPC ids for this exact monster variant. */
  npcIds?: string[];
  /** Wiki variant label, such as "Post-quest". */
  version?: string;
  /** Canonical monster/page name shared by all combat variants. */
  baseName?: string;
  /** Whether the Wiki marks this as the default infobox variant. */
  isDefaultVariant?: boolean;
  combatLevel: number;
  hitpoints: number;
  attack: number;
  strength: number;
  defence: number;
  magic: number;
  ranged: number;
  stabDefence: number;
  slashDefence: number;
  crushDefence: number;
  magicDefence: number;
  rangedDefence: number;
  attackBonus?: number;
  strengthBonus?: number;
  magicAttack?: number;
  rangedAttack?: number;
  size?: number;
  attributes?: string[];
  group?: string;
}

export interface DropSource {
  itemId: number;
  itemName: string;
  monsterId: string;
  monsterName: string;
  rarity: number; // expected kills per drop (e.g. 512 = 1/512)
  quantityMin: number;
  quantityMax: number;
  combatLevel: number;
}

export interface PlayerSkills {
  attack: number;
  strength: number;
  defence: number;
  hitpoints: number;
  ranged: number;
  prayer: number;
  magic: number;
  mining: number;
}

export interface LoadoutEquipment {
  head?: number | null;
  cape?: number | null;
  neck?: number | null;
  ammo?: number | null;
  weapon?: number | null;
  body?: number | null;
  shield?: number | null;
  legs?: number | null;
  hands?: number | null;
  feet?: number | null;
  ring?: number | null;
}

export interface Loadout {
  id: string;
  name: string;
  skills: PlayerSkills;
  equipment: LoadoutEquipment;
  attackType: AttackType;
  combatStyle: CombatStyle;
  prayer: PrayerName;
  prayers?: PrayerName[];
  potions: PotionName[];
  spell?: string | null;
  onTask: boolean;
  specialAttack: boolean;
  monsterHpOverride?: number | null;
  distance?: number;
  flinching?: boolean;
  inWilderness?: boolean;
  forinthrySurge?: boolean;
  soulreaperStacks?: number;
  baAttackerLevel?: number;
  kandarinDiary?: boolean;
  chargeSpell?: boolean;
  markOfDarknessSpell?: boolean;
  usingSunfireRunes?: boolean;
  toaInvocationLevel?: number;
  toaPathLevel?: number;
  partySize?: number;
  partyMaxCombatLevel?: number;
  partySumMiningLevel?: number;
  partyMaxHpLevel?: number;
  phase?: string;
  defenceReductions?: Partial<{
    vulnerability: boolean;
    accursed: boolean;
    elderMaul: number;
    dwh: number;
    arclight: number;
    emberlight: number;
    bgs: number;
    tonalztic: number;
    seercull: number;
    ayak: number;
  }>;
}

export interface DpsResult {
  dps: number;
  maxHit: number;
  accuracy: number;
  avgHit: number;
  ttk: number;
  overkill: number;
  attackSpeed: number;
  hitChance: number;
  effectiveAttack: number;
  effectiveStrength: number;
  issues?: string[];
}

export interface MonsterDpsResult {
  dps: number;
  maxHit: number;
  accuracy: number;
  avgHit: number;
}

export interface AggregatedBonuses extends EquipmentBonuses {
  totalGePrice: number;
}

export const EMPTY_BONUSES: EquipmentBonuses = {
  stabAttack: 0,
  slashAttack: 0,
  crushAttack: 0,
  magicAttack: 0,
  rangedAttack: 0,
  stabDefence: 0,
  slashDefence: 0,
  crushDefence: 0,
  magicDefence: 0,
  rangedDefence: 0,
  strength: 0,
  rangedStrength: 0,
  magicDamage: 0,
  prayer: 0,
  attackSpeed: 4,
};

export const DEFAULT_SKILLS: PlayerSkills = {
  attack: 99,
  strength: 99,
  defence: 99,
  hitpoints: 99,
  ranged: 99,
  prayer: 99,
  magic: 99,
  mining: 99,
};

export const EQUIPMENT_SLOTS: EquipmentSlot[] = [
  "head",
  "cape",
  "neck",
  "ammo",
  "weapon",
  "body",
  "shield",
  "legs",
  "hands",
  "feet",
  "ring",
];
