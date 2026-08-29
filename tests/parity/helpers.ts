/**
 * Shared helpers for DPS parity tests against the pinned OSRS Wiki calculator.
 */
import assert from "node:assert/strict";
import { createEmptyLoadout } from "../../src/lib/store/useAppStore";
import { getAllMonsterVariants } from "../../src/lib/data";
import {
  buildWikiPlayer,
  calculateNativePlayerMetrics,
  calculateWikiMonsterDps,
  calculateWikiPlayerDps,
  resolveWikiMonster,
} from "../../src/lib/dps/wikiAdapter";
import type {
  AttackType,
  CombatStyle,
  Loadout,
  LoadoutEquipment,
  MonsterStats,
  PrayerName,
} from "../../src/lib/types";
import version from "../../src/vendor/osrs-wiki/version.json";

export const PINNED_REVISION = version.revision;
export const DPS_PRECISION = 3;
export const ACCURACY_PRECISION = 2;

export interface FixtureEquipment {
  head?: number;
  cape?: number;
  neck?: number;
  ammo?: number;
  weapon?: number;
  body?: number;
  shield?: number;
  legs?: number;
  hands?: number;
  feet?: number;
  ring?: number;
}

export interface ParityFixture {
  id: string;
  source: string;
  monsterNpcId: number;
  monsterVersion?: string;
  skills?: Partial<{
    attack: number;
    strength: number;
    defence: number;
    hitpoints: number;
    ranged: number;
    prayer: number;
    magic: number;
    mining: number;
  }>;
  equipment?: FixtureEquipment;
  attackType: AttackType;
  combatStyle: CombatStyle;
  prayer?: PrayerName;
  prayers?: PrayerName[];
  potions?: Loadout["potions"];
  spell?: string | null;
  onTask?: boolean;
  inWilderness?: boolean;
  expected: {
    maxHit?: number;
    dps?: number;
    accuracy?: number;
    attackSpeed?: number;
    npcMaxHit?: number;
    npcDps?: number;
    npcAccuracy?: number;
  };
}

export function monsterFromNpcId(npcId: number, version?: string): MonsterStats {
  const matches = getAllMonsterVariants().filter((monster) =>
    (monster.npcIds ?? []).map(Number).includes(npcId),
  );
  assert.ok(matches.length, `No local monster with NPC id ${npcId}`);
  if (version) {
    const exact = matches.find((monster) => monster.version === version);
    if (exact) return exact;
  }
  return (
    matches.find((monster) => monster.isDefaultVariant) ||
    matches.find((monster) => !monster.version || monster.version === "Standard") ||
    matches[0]
  );
}

export function fixtureLoadout(fixture: ParityFixture): Loadout {
  const loadout = createEmptyLoadout(fixture.id);
  loadout.skills = {
    ...loadout.skills,
    attack: 99,
    strength: 99,
    defence: 99,
    hitpoints: 99,
    ranged: 99,
    prayer: 99,
    magic: 99,
    mining: 99,
    ...fixture.skills,
  };
  loadout.equipment = { ...(fixture.equipment ?? {}) } as LoadoutEquipment;
  loadout.attackType = fixture.attackType;
  loadout.combatStyle = fixture.combatStyle;
  loadout.prayer = fixture.prayer ?? "none";
  loadout.prayers = fixture.prayers ?? (fixture.prayer && fixture.prayer !== "none" ? [fixture.prayer] : []);
  loadout.potions = fixture.potions ?? ["none"];
  loadout.spell = fixture.spell ?? null;
  loadout.onTask = fixture.onTask ?? false;
  loadout.inWilderness = fixture.inWilderness ?? false;
  loadout.kandarinDiary = false;
  loadout.distance = 1;
  return loadout;
}

export function assertClose(actual: number, expected: number, places: number, label: string) {
  const factor = 10 ** places;
  assert.equal(
    Math.round(actual * factor) / factor,
    Math.round(expected * factor) / factor,
    `${label}: got ${actual}, expected ${expected} (±${places} dp)`,
  );
}

export function runPlayerFixture(fixture: ParityFixture, strict = true) {
  const monster = monsterFromNpcId(fixture.monsterNpcId, fixture.monsterVersion);
  const loadout = fixtureLoadout(fixture);
  const adapter = calculateWikiPlayerDps(loadout, monster, { strict });
  const native = calculateNativePlayerMetrics(loadout, monster);
  const wikiMonster = resolveWikiMonster(monster, null, loadout);
  const player = buildWikiPlayer(loadout, wikiMonster);

  return { monster, loadout, adapter, native, wikiMonster, player };
}

export function runMonsterFixture(fixture: ParityFixture, defenceLevel: number) {
  const monster = monsterFromNpcId(fixture.monsterNpcId, fixture.monsterVersion);
  const loadout = fixtureLoadout({
    ...fixture,
    skills: { ...fixture.skills, defence: defenceLevel },
  });
  return calculateWikiMonsterDps(loadout, monster, false, { strict: true });
}
