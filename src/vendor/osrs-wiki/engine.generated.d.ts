export const availableEquipment: WikiEquipment[];
export function ammoApplicability(weaponId?: number, ammoId?: number): number;
export function calculateAttackSpeed(player: WikiPlayer, monster: WikiMonster): number;
export function calculateEquipmentBonusesFromGear(
  player: WikiPlayer,
  monster: WikiMonster,
): Pick<WikiPlayer, "bonuses" | "offensive" | "defensive" | "attackSpeed">;
export function getCanonicalEquipment(equipment: WikiPlayer["equipment"]): WikiPlayer["equipment"];
export function getCanonicalItemId(itemId: number): number;
export function getMonsters(): Omit<WikiMonster, "inputs">[];
export const INITIAL_MONSTER_INPUTS: WikiMonster["inputs"];
export function getCombatStylesForCategory(category: string): WikiCombatStyle[];
export const PotionMap: Record<number, {
  name: string;
  calculateFn: (skills: WikiPlayer["skills"]) => Partial<WikiPlayer["skills"]>;
}>;
export const Prayer: Record<string, number>;
export const PrayerMap: Record<number, unknown>;
export const Potion: Record<string, number>;
export const spells: WikiSpell[];

export class PlayerVsNPCCalc {
  constructor(
    player: WikiPlayer,
    monster: WikiMonster,
    options?: {
      loadoutName?: string;
      detailedOutput?: boolean;
      disableMonsterScaling?: boolean;
      usingSpecialAttack?: boolean;
    },
  );
  userIssues: { type: number; message: string; loadout?: string }[];
  getNPCDefenceRoll(): number;
  getMaxAttackRoll(): number;
  getDisplayHitChance(): number;
  getHitChance(): number;
  getMax(): number;
  getExpectedDamage(): number;
  getAttackSpeed(): number;
  getDps(): number;
  getTtk(): number;
  getDistribution(): { getMax(): number };
}

export class NPCVsPlayerCalc {
  constructor(
    player: WikiPlayer,
    monster: WikiMonster,
    options?: { loadoutName?: string; detailedOutput?: boolean },
  );
  getNPCMaxAttackRoll(): number;
  getNPCMaxHit(): number;
  getHitChance(): number;
  getDps(): number;
  getAverageDamageTaken(): number;
  getPlayerDefenceRoll(): number;
}

export interface WikiEquipment {
  id: number;
  name: string;
  weight: number;
  version: string;
  slot: keyof WikiPlayer["equipment"];
  image: string;
  speed: number;
  category: string;
  isTwoHanded: boolean;
  itemVars?: { blowpipeDartName?: string; blowpipeDartId?: number };
  bonuses: { str: number; ranged_str: number; magic_str: number; prayer: number };
  offensive: { stab: number; slash: number; crush: number; magic: number; ranged: number };
  defensive: { stab: number; slash: number; crush: number; magic: number; ranged: number };
}

export interface WikiCombatStyle {
  name: string;
  type: "stab" | "slash" | "crush" | "magic" | "ranged" | null;
  stance:
    | "Accurate"
    | "Aggressive"
    | "Autocast"
    | "Controlled"
    | "Defensive"
    | "Defensive Autocast"
    | "Longrange"
    | "Rapid"
    | "Manual Cast"
    | null;
}

export interface WikiSpell {
  name: string;
  spellbook: string;
}

export interface WikiMonster {
  id: number;
  name: string;
  version?: string;
  size: number;
  speed: number;
  style: "stab" | "slash" | "crush" | "magic" | "ranged" | null;
  skills: { atk: number; def: number; hp: number; magic: number; ranged: number; str: number };
  offensive: {
    atk: number;
    magic: number;
    magic_str: number;
    ranged: number;
    ranged_str: number;
    str: number;
  };
  defensive: {
    flat_armour: number;
    stab: number;
    slash: number;
    crush: number;
    magic: number;
    light: number;
    standard: number;
    heavy: number;
  };
  attributes: string[];
  weakness: { element: string; severity: number } | null;
  immunities: { burn: string | null };
  is_slayer_monster: boolean;
  inputs: {
    isFromCoxCm: boolean;
    toaInvocationLevel: number;
    toaPathLevel: number;
    partyMaxCombatLevel: number;
    partySumMiningLevel: number;
    partyMaxHpLevel: number;
    partySize: number;
    monsterCurrentHp: number;
    defenceReductions: Record<string, number | boolean>;
    phase?: string;
  };
}

export interface WikiPlayer {
  name: string;
  style: WikiCombatStyle;
  skills: {
    atk: number;
    def: number;
    hp: number;
    magic: number;
    prayer: number;
    ranged: number;
    str: number;
    mining: number;
    herblore: number;
  };
  boosts: WikiPlayer["skills"];
  equipment: {
    head: WikiEquipment | null;
    cape: WikiEquipment | null;
    neck: WikiEquipment | null;
    ammo: WikiEquipment | null;
    weapon: WikiEquipment | null;
    body: WikiEquipment | null;
    shield: WikiEquipment | null;
    legs: WikiEquipment | null;
    hands: WikiEquipment | null;
    feet: WikiEquipment | null;
    ring: WikiEquipment | null;
  };
  attackSpeed: number;
  prayers: number[];
  buffs: {
    potions: number[];
    onSlayerTask: boolean;
    inWilderness: boolean;
    forinthrySurge: boolean;
    soulreaperStacks: number;
    baAttackerLevel: number;
    chinchompaDistance: number;
    kandarinDiary: boolean;
    chargeSpell: boolean;
    markOfDarknessSpell: boolean;
    usingSunfireRunes: boolean;
  };
  spell: WikiSpell | null;
  bonuses: WikiEquipment["bonuses"];
  offensive: WikiEquipment["offensive"];
  defensive: WikiEquipment["defensive"];
}
