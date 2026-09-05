/*
 * Adapter around the generated OSRS Wiki DPS calculator engine.
 * Engine source: weirdgloop/osrs-dps-calc (GPL-3.0), revision recorded in
 * src/vendor/osrs-wiki/version.json.
 */
import {
  availableEquipment,
  ammoApplicability,
  calculateAttackSpeed,
  calculateEquipmentBonusesFromGear,
  getCanonicalItemId,
  getCombatStylesForCategory,
  getMonsters,
  INITIAL_MONSTER_INPUTS,
  NPCVsPlayerCalc,
  PlayerVsNPCCalc,
  Potion,
  PotionMap,
  Prayer,
  spells,
  type WikiCombatStyle,
  type WikiEquipment,
  type WikiMonster,
  type WikiPlayer,
  type WikiSpell,
} from "@/vendor/osrs-wiki/engine.generated.js";
import type {
  AttackType,
  CombatStyle,
  DpsResult,
  EquipmentItem,
  Loadout,
  MonsterDpsResult,
  MonsterStats,
  PotionName,
  PrayerName,
} from "@/lib/types";
import { EQUIPMENT_SLOTS } from "@/lib/types";

const equipmentById = new Map(availableEquipment.map((item) => [item.id, item]));
const wikiMonsters = getMonsters();
const wikiMonstersById = new Map(wikiMonsters.map((monster) => [monster.id, monster]));
// Unlike ordinary slayer monsters, these encounters cannot be entered off-task.
// Treating the task toggle as optional produces an impossible encounter state.
const TASK_ONLY_MONSTER_IDS = new Set([13668]); // Araxxor

const PRAYERS: Record<PrayerName, number | null> = {
  none: null,
  burstOfStrength: Prayer.BURST_OF_STRENGTH,
  clarityOfThought: Prayer.CLARITY_OF_THOUGHT,
  sharpEye: Prayer.SHARP_EYE,
  mysticWill: Prayer.MYSTIC_WILL,
  superhumanStrength: Prayer.SUPERHUMAN_STRENGTH,
  improvedReflexes: Prayer.IMPROVED_REFLEXES,
  hawkEye: Prayer.HAWK_EYE,
  mysticLore: Prayer.MYSTIC_LORE,
  piety: Prayer.PIETY,
  chivalry: Prayer.CHIVALRY,
  ultimateStrength: Prayer.ULTIMATE_STRENGTH,
  incredibleReflexes: Prayer.INCREDIBLE_REFLEXES,
  rigour: Prayer.RIGOUR,
  eagleEye: Prayer.EAGLE_EYE,
  augury: Prayer.AUGURY,
  mysticMight: Prayer.MYSTIC_MIGHT,
  deadeye: Prayer.DEADEYE,
  mysticVigour: Prayer.MYSTIC_VIGOUR,
  thickSkin: Prayer.THICK_SKIN,
  rockSkin: Prayer.ROCK_SKIN,
  steelSkin: Prayer.STEEL_SKIN,
};

const POTIONS: Record<PotionName, number[]> = {
  none: [],
  superCombat: [Potion.SUPER_COMBAT],
  superAttack: [Potion.SUPER_ATTACK],
  superStrength: [Potion.SUPER_STRENGTH],
  ranging: [Potion.RANGING],
  bastion: [Potion.RANGING, Potion.SUPER_DEFENCE],
  magic: [Potion.MAGIC],
  imbuedHeart: [Potion.IMBUED_HEART],
  smellingSalts: [Potion.SMELLING_SALTS],
  overloads: [Potion.OVERLOAD],
};

const STYLE_STANCES: Record<Loadout["combatStyle"], WikiCombatStyle["stance"]> = {
  accurate: "Accurate",
  aggressive: "Aggressive",
  defensive: "Defensive",
  controlled: "Controlled",
  rapid: "Rapid",
  longrange: "Longrange",
  autocast: "Autocast",
  defensive_autocast: "Defensive Autocast",
};

const STANCE_STYLES = new Map<WikiCombatStyle["stance"], CombatStyle>(
  Object.entries(STYLE_STANCES).map(([style, stance]) => [stance, style as CombatStyle]),
);

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function emptyBoosts(): WikiPlayer["skills"] {
  return {
    atk: 0,
    def: 0,
    hp: 0,
    magic: 0,
    prayer: 0,
    ranged: 0,
    str: 0,
    mining: 0,
    herblore: 0,
  };
}

function findWikiEquipment(id: number | null | undefined): WikiEquipment | null {
  if (id == null) return null;
  return equipmentById.get(id) ?? equipmentById.get(getCanonicalItemId(id)) ?? null;
}

function isDart(item: WikiEquipment | null): boolean {
  return Boolean(item && /\bdart\b/i.test(item.name));
}

function buildEquipment(loadout: Loadout): WikiPlayer["equipment"] {
  const equipment = Object.fromEntries(
    EQUIPMENT_SLOTS.map((slot) => [slot, findWikiEquipment(loadout.equipment[slot])]),
  ) as WikiPlayer["equipment"];

  if (equipment.weapon && /blowpipe/i.test(equipment.weapon.name) && isDart(equipment.ammo)) {
    equipment.weapon = {
      ...equipment.weapon,
      itemVars: {
        ...equipment.weapon.itemVars,
        blowpipeDartId: equipment.ammo!.id,
        blowpipeDartName: equipment.ammo!.name,
      },
    };
  }
  return equipment;
}

function findSpell(value: string | null | undefined): WikiSpell | null {
  if (!value) return null;
  const normalized = value.replaceAll("_", " ").toLowerCase();
  const aliases: Record<string, string> = {
    "iban blast": "iban's blast",
  };
  const target = aliases[normalized] ?? normalized;
  return spells.find((spell) => spell.name.toLowerCase() === target) ?? null;
}

const MANUAL_CAST = "Manual Cast";

/** Styles the weapon itself provides; every category also allows a manual cast. */
function weaponStyles(weapon: WikiEquipment | null): WikiCombatStyle[] {
  if (!weapon) return getCombatStylesForCategory("");
  if (!weapon.category || weapon.category.toLowerCase() === "unarmed") {
    return getCombatStylesForCategory("");
  }
  return getCombatStylesForCategory(weapon.category);
}

function chooseStyle(
  weapon: WikiEquipment | null,
  attackType: AttackType,
  combatStyle: Loadout["combatStyle"],
  spell: WikiSpell | null,
): WikiCombatStyle {
  const styles = weaponStyles(weapon);
  const desiredStance = STYLE_STANCES[combatStyle];
  const exact = styles.find(
    (style) => style.type === attackType && style.stance === desiredStance,
  );
  if (exact) return exact;
  const matchingType =
    styles.find((style) => style.type === attackType && style.stance !== MANUAL_CAST) ??
    styles.find((style) => style.type === attackType);
  if (matchingType) return matchingType;
  if (attackType === "magic" && spell) {
    return { name: "Spell", type: "magic", stance: MANUAL_CAST };
  }
  // The weapon has no style for the requested attack type, so fall back to its
  // own default instead of inventing one the game does not offer.
  return styles.find((style) => style.type != null) ?? styles[0];
}

function potionIds(potions: PotionName[]): number[] {
  return [...new Set(potions.flatMap((potion) => POTIONS[potion] ?? []))];
}

function buildBoosts(
  skills: WikiPlayer["skills"],
  activePotions: number[],
): WikiPlayer["skills"] {
  const boosts = emptyBoosts();
  for (const potion of activePotions) {
    const calculated = PotionMap[potion]?.calculateFn(skills) ?? {};
    for (const [skill, amount] of Object.entries(calculated)) {
      if (amount == null) continue;
      const key = skill as keyof WikiPlayer["skills"];
      boosts[key] = Math.max(boosts[key], amount);
    }
  }
  return boosts;
}

function fallbackMonster(monster: MonsterStats): Omit<WikiMonster, "inputs"> {
  const id = monster.npcIds?.map(Number).find(Number.isFinite) ?? -1;
  return {
    id,
    name: monster.baseName ?? monster.name,
    version: monster.version,
    size: monster.size ?? 1,
    speed: 4,
    style: null,
    skills: {
      atk: monster.attack,
      def: monster.defence,
      hp: monster.hitpoints,
      magic: monster.magic,
      ranged: monster.ranged,
      str: monster.strength,
    },
    offensive: {
      atk: monster.attackBonus ?? 0,
      magic: monster.magicAttack ?? 0,
      magic_str: 0,
      ranged: monster.rangedAttack ?? 0,
      ranged_str: 0,
      str: monster.strengthBonus ?? 0,
    },
    defensive: {
      flat_armour: 0,
      stab: monster.stabDefence,
      slash: monster.slashDefence,
      crush: monster.crushDefence,
      magic: monster.magicDefence,
      light: monster.rangedDefence,
      standard: monster.rangedDefence,
      heavy: monster.rangedDefence,
    },
    attributes: monster.attributes ?? [],
    weakness: null,
    immunities: { burn: null },
    is_slayer_monster: Boolean(monster.group && monster.group !== "Other"),
  };
}

export function resolveWikiMonster(
  monster: MonsterStats,
  currentHp?: number | null,
  loadout?: Loadout,
): WikiMonster {
  let resolved: Omit<WikiMonster, "inputs"> | undefined;
  for (const rawId of monster.npcIds ?? []) {
    const id = Number(rawId);
    if (Number.isFinite(id)) {
      resolved = wikiMonstersById.get(id);
      if (resolved) break;
    }
  }

  if (!resolved) {
    const targetName = (monster.baseName ?? monster.name).toLowerCase();
    const matches = wikiMonsters.filter(
      (candidate) =>
        candidate.name.toLowerCase() === targetName &&
        (!monster.version || candidate.version === monster.version),
    );
    resolved = monster.version
      ? matches[0]
      : matches.find((candidate) => candidate.version === "Standard" || !candidate.version)
        ?? matches[0];
  }
  const base = resolved ?? fallbackMonster(monster);
  return {
    ...base,
    inputs: {
      ...INITIAL_MONSTER_INPUTS,
      toaInvocationLevel: loadout?.toaInvocationLevel ?? 0,
      toaPathLevel: loadout?.toaPathLevel ?? 0,
      partySize: loadout?.partySize ?? 1,
      partyMaxCombatLevel: loadout?.partyMaxCombatLevel ?? 126,
      partySumMiningLevel: loadout?.partySumMiningLevel ?? loadout?.skills.mining ?? 99,
      partyMaxHpLevel: loadout?.partyMaxHpLevel ?? loadout?.skills.hitpoints ?? 99,
      phase: resolveMonsterPhase(monster, loadout),
      defenceReductions: {
        ...INITIAL_MONSTER_INPUTS.defenceReductions,
        ...loadout?.defenceReductions,
      },
      monsterCurrentHp: Math.max(1, currentHp ?? base.skills.hp),
    },
  };
}

export function officialRequiresSlayerTask(monster: MonsterStats): boolean {
  return (monster.npcIds ?? []).some((id) => TASK_ONLY_MONSTER_IDS.has(Number(id)));
}

function resolveMonsterPhase(monster: MonsterStats, loadout?: Loadout): string | undefined {
  if (loadout?.phase) return loadout.phase;
  // Araxxor's Standard/Enraged forms share NPC id 13668. Upstream models the
  // latter through monster.inputs.phase rather than a second monster record.
  if (
    officialRequiresSlayerTask(monster) &&
    monster.version?.toLowerCase() === "enraged"
  ) {
    return "Enraged";
  }
  return undefined;
}

export function buildWikiPlayer(loadout: Loadout, monster: WikiMonster): WikiPlayer {
  const equipment = buildEquipment(loadout);
  const spell = findSpell(loadout.spell);
  const style = chooseStyle(
    equipment.weapon,
    loadout.attackType,
    loadout.combatStyle,
    spell,
  );
  const skills: WikiPlayer["skills"] = {
    atk: loadout.skills.attack,
    def: loadout.skills.defence,
    hp: loadout.skills.hitpoints,
    magic: loadout.skills.magic,
    prayer: loadout.skills.prayer,
    ranged: loadout.skills.ranged,
    str: loadout.skills.strength,
    mining: loadout.skills.mining,
    herblore: 99,
  };
  const activePotions = potionIds(loadout.potions);
  const player: WikiPlayer = {
    name: loadout.name,
    style,
    skills,
    boosts: buildBoosts(skills, activePotions),
    equipment,
    attackSpeed: 4,
    prayers: [
      ...new Set(
        (loadout.prayers?.length ? loadout.prayers : [loadout.prayer])
          .map((prayer) => PRAYERS[prayer])
          .filter((prayer): prayer is number => prayer != null),
      ),
    ],
    buffs: {
      potions: activePotions,
      onSlayerTask: loadout.onTask || TASK_ONLY_MONSTER_IDS.has(monster.id),
      inWilderness: loadout.inWilderness ?? false,
      forinthrySurge: loadout.forinthrySurge ?? false,
      soulreaperStacks: loadout.soulreaperStacks ?? 0,
      baAttackerLevel: loadout.baAttackerLevel ?? 0,
      chinchompaDistance: loadout.distance ?? 0,
      kandarinDiary: loadout.kandarinDiary ?? false,
      chargeSpell: loadout.chargeSpell ?? false,
      markOfDarknessSpell: loadout.markOfDarknessSpell ?? false,
      usingSunfireRunes: loadout.usingSunfireRunes ?? false,
    },
    spell,
    bonuses: { str: 0, ranged_str: 0, magic_str: 0, prayer: 0 },
    offensive: { stab: 0, slash: 0, crush: 0, magic: 0, ranged: 0 },
    defensive: { stab: 0, slash: 0, crush: 0, magic: 0, ranged: 0 },
  };
  Object.assign(player, calculateEquipmentBonusesFromGear(player, monster));
  player.attackSpeed = calculateAttackSpeed(player, monster);
  return player;
}

function loadoutIssues(loadout: Loadout, player: WikiPlayer): string[] {
  const issues: string[] = [];
  if (player.style?.type && player.style.type !== loadout.attackType) {
    const weaponName = player.equipment.weapon?.name ?? "Unarmed";
    issues.push(
      `${weaponName} has no ${loadout.attackType} attack style — calculated with ` +
        `${player.style.name} (${player.style.type}).`,
    );
  }
  for (const slot of EQUIPMENT_SLOTS) {
    const id = loadout.equipment[slot];
    if (id != null && !findWikiEquipment(id)) {
      issues.push(`Item ${id} in the ${slot} slot is not in the calculator dataset; its bonuses are ignored.`);
    }
  }
  return issues;
}

export interface WikiCalcOptions {
  /**
   * When true, missing equipment IDs or an unsupported attack style throw
   * instead of silently dropping bonuses / falling back.
   */
  strict?: boolean;
}

function assertCompatible(loadout: Loadout, player: WikiPlayer, issues: string[]): void {
  const blocking = issues.filter(
    (issue) =>
      /not in the calculator dataset/i.test(issue) ||
      /has no .+ attack style/i.test(issue) ||
      /monster could not be resolved/i.test(issue),
  );
  if (blocking.length) {
    throw new Error(`Strict DPS calc rejected loadout:\n- ${blocking.join("\n- ")}`);
  }
  void player;
  void loadout;
}

export function calculateWikiPlayerDps(
  loadout: Loadout,
  monster: MonsterStats,
  options: WikiCalcOptions = {},
): DpsResult {
  const wikiMonster = resolveWikiMonster(monster, loadout.monsterHpOverride, loadout);
  if (options.strict && wikiMonster.id < 0) {
    throw new Error(
      `Strict DPS calc: monster "${monster.name}" could not be resolved to an engine NPC id.`,
    );
  }
  const player = buildWikiPlayer(loadout, wikiMonster);
  const issues = loadoutIssues(loadout, player);
  if (options.strict) assertCompatible(loadout, player, issues);

  const calc = new PlayerVsNPCCalc(player, wikiMonster, {
    loadoutName: loadout.name,
    usingSpecialAttack: loadout.specialAttack,
  });
  const accuracy = calc.getHitChance();
  const expectedDamage = calc.getExpectedDamage();
  const dps = calc.getDps();
  return {
    dps: round(dps, 3),
    maxHit: calc.getDistribution().getMax(),
    accuracy: round(accuracy * 100, 2),
    avgHit: round(expectedDamage, 3),
    ttk: round(Number.isFinite(calc.getTtk()) ? calc.getTtk() : 0, 1),
    overkill: 0,
    attackSpeed: calc.getAttackSpeed(),
    hitChance: accuracy,
    effectiveAttack: 0,
    effectiveStrength: 0,
    issues: [...issues, ...calc.userIssues.map((issue) => issue.message)],
  };
}

/** Direct engine result for parity tests (bypasses Whetstone rounding only after calc). */
export function calculateNativePlayerMetrics(
  loadout: Loadout,
  monster: MonsterStats,
): { maxHit: number; dps: number; accuracy: number; attackSpeed: number } {
  const wikiMonster = resolveWikiMonster(monster, loadout.monsterHpOverride, loadout);
  const player = buildWikiPlayer(loadout, wikiMonster);
  const calc = new PlayerVsNPCCalc(player, wikiMonster, {
    loadoutName: loadout.name,
    usingSpecialAttack: loadout.specialAttack,
  });
  return {
    maxHit: calc.getDistribution().getMax(),
    dps: calc.getDps(),
    accuracy: calc.getHitChance() * 100,
    attackSpeed: calc.getAttackSpeed(),
  };
}

export function calculateWikiMonsterDps(
  loadout: Loadout,
  monster: MonsterStats,
  protecting = false,
  options: WikiCalcOptions = {},
): MonsterDpsResult {
  if (protecting) {
    return { dps: 0, maxHit: 0, accuracy: 0, avgHit: 0 };
  }
  const wikiMonster = resolveWikiMonster(monster, loadout.monsterHpOverride, loadout);
  if (options.strict && wikiMonster.id < 0) {
    throw new Error(
      `Strict DPS calc: monster "${monster.name}" could not be resolved to an engine NPC id.`,
    );
  }
  const player = buildWikiPlayer(loadout, wikiMonster);
  if (options.strict) assertCompatible(loadout, player, loadoutIssues(loadout, player));
  const calc = new NPCVsPlayerCalc(player, wikiMonster, {
    loadoutName: loadout.name,
  });
  const accuracy = calc.getHitChance();
  return {
    dps: round(calc.getDps(), 3),
    maxHit: calc.getNPCMaxHit(),
    accuracy: round(accuracy * 100, 2),
    avgHit: round(calc.getAverageDamageTaken(), 3),
  };
}

/**
 * Attack types a weapon genuinely offers. Every category also exposes a
 * "Manual Cast" spell style, which is why the raw upstream style list would
 * otherwise mark all 5400 equippable items - greegrees, crates, torches - as
 * valid crush and magic weapons.
 */
export function officialAttackTypesForItem(item: EquipmentItem): AttackType[] {
  const equipment = findWikiEquipment(item.id);
  if (!equipment || equipment.slot !== "weapon") return [];
  if (!equipment.category || equipment.category.toLowerCase() === "unarmed") return [];
  return [
    ...new Set(
      getCombatStylesForCategory(equipment.category)
        .filter((style) => style.stance !== MANUAL_CAST)
        .map((style) => style.type)
        .filter((type): type is AttackType => type != null),
    ),
  ];
}

/**
 * Every real stance the upstream calculator exposes for this weapon and attack
 * type. The optimizer must compare these rather than assuming aggressive/rapid:
 * on sufficiently accurate or inaccurate targets another stance can win.
 */
export function officialCombatStylesForItem(
  item: EquipmentItem | null,
  attackType: AttackType,
): CombatStyle[] {
  const equipment = item ? findWikiEquipment(item.id) : null;
  if (!equipment) return [];
  return [
    ...new Set(
      weaponStyles(equipment)
        .filter((style) => style.type === attackType && style.stance !== MANUAL_CAST)
        .map((style) => STANCE_STYLES.get(style.stance))
        .filter((style): style is CombatStyle => style != null),
    ),
  ];
}

export function officialIsEngineSupported(item: EquipmentItem): boolean {
  return findWikiEquipment(item.id) != null;
}

/** Powered staves carry their own spell, so a selected spell must be cleared. */
export function officialIsPoweredStaff(item: EquipmentItem | null): boolean {
  if (!item) return false;
  return findWikiEquipment(item.id)?.category === "Powered Staff";
}

const SPELL_LEVELS: [name: string, level: number][] = [
  ["Ice Barrage", 94],
  ["Fire Surge", 95],
  ["Ice Blitz", 82],
  ["Water Surge", 85],
  ["Fire Wave", 75],
  ["Earth Wave", 70],
  ["Fire Blast", 59],
  ["Earth Blast", 53],
  ["Fire Bolt", 35],
  ["Earth Bolt", 29],
  ["Fire Strike", 13],
  ["Wind Strike", 1],
];

/** Strongest standard/ancient combat spell the player's Magic level allows. */
export function officialBestSpellForLevel(magicLevel: number): string | null {
  for (const [name, level] of SPELL_LEVELS) {
    if (magicLevel < level) continue;
    if (spells.some((spell) => spell.name === name)) return name;
  }
  return null;
}

export function officialAmmoCompatible(
  weapon: EquipmentItem | null,
  ammo: EquipmentItem,
): boolean {
  const wikiWeapon = weapon ? findWikiEquipment(weapon.id) : null;
  const wikiAmmo = findWikiEquipment(ammo.id);
  if (!wikiAmmo) return false;
  // Upstream enum: INCLUDED = 0, ALLOWED = 1, INVALID = 2.
  return ammoApplicability(wikiWeapon?.id, wikiAmmo.id) !== 2;
}

export const officialSpellNames = spells.map((spell) => spell.name);
