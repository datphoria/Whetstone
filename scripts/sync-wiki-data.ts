#!/usr/bin/env tsx
/**
 * Optional live sync from OSRS Wiki Bucket + prices API.
 * Requires network. Always sends a descriptive User-Agent.
 *
 * Run: npm run sync:data
 *
 * Falls back / merges with seed generation if Bucket queries fail.
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { applyGePrices, fetchGeMapping } from "./lib/apply-ge-prices";
import { reconcileItems } from "./lib/reconcile-equipment";
import type {
  AttackType,
  EquipmentItem,
  EquipmentSlot,
  MonsterStats,
} from "../src/lib/types";

const USER_AGENT =
  "WhetstoneDpsCalc/1.0 (OSRS gear calculator; local-dev; contact: local)";

const WIKI = "https://oldschool.runescape.wiki/api.php";
const PRICES = "https://prices.runescape.wiki/api/v1/osrs/latest";

function pinnedCalculatorEquipmentUrl(): string {
  const versionPath = join(process.cwd(), "src/vendor/osrs-wiki/version.json");
  const version = JSON.parse(readFileSync(versionPath, "utf8")) as { revision: string };
  return `https://raw.githubusercontent.com/weirdgloop/osrs-dps-calc/${version.revision}/cdn/json/equipment.json`;
}

async function wikiBucket(query: string) {
  const url = `${WIKI}?action=bucket&format=json&query=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Bucket HTTP ${res.status}`);
  return res.json();
}

async function fetchPrices(): Promise<Record<string, { high?: number; low?: number }>> {
  const res = await fetch(PRICES, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Prices HTTP ${res.status}`);
  const json = (await res.json()) as { data: Record<string, { high?: number; low?: number }> };
  return json.data ?? {};
}

async function fetchCalculatorEquipmentIds(): Promise<Set<number>> {
  const url = pinnedCalculatorEquipmentUrl();
  console.log(`Fetching calculator equipment IDs from pinned revision:\n  ${url}`);
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Calculator equipment HTTP ${res.status}`);
  const rows = (await res.json()) as { id?: number }[];
  return new Set(rows.map((row) => row.id).filter((id): id is number => Number.isInteger(id)));
}

type WikiBonusRow = {
  page_name_sub?: string;
  equipment_slot?: string;
  combat_style?: string;
  weapon_attack_speed?: number;
  stab_attack_bonus?: number;
  slash_attack_bonus?: number;
  crush_attack_bonus?: number;
  magic_attack_bonus?: number;
  range_attack_bonus?: number;
  stab_defence_bonus?: number;
  slash_defence_bonus?: number;
  crush_defence_bonus?: number;
  magic_defence_bonus?: number;
  range_defence_bonus?: number;
  strength_bonus?: number;
  ranged_strength_bonus?: number;
  magic_damage_bonus?: number;
  prayer_bonus?: number;
};

type WikiItemRow = {
  page_name_sub?: string;
  item_name?: string;
  item_id?: string[] | string;
  tradeable?: unknown;
};

const BONUS_FIELDS = [
  "page_name_sub",
  "equipment_slot",
  "combat_style",
  "weapon_attack_speed",
  "stab_attack_bonus",
  "slash_attack_bonus",
  "crush_attack_bonus",
  "magic_attack_bonus",
  "range_attack_bonus",
  "stab_defence_bonus",
  "slash_defence_bonus",
  "crush_defence_bonus",
  "magic_defence_bonus",
  "range_defence_bonus",
  "strength_bonus",
  "ranged_strength_bonus",
  "magic_damage_bonus",
  "prayer_bonus",
] as const;

const ITEM_FIELDS = [
  "page_name_sub",
  "item_name",
  "item_id",
  "tradeable",
] as const;

async function fetchBucketPages<T>(
  bucket: string,
  fields: readonly string[],
  label: string,
): Promise<T[]> {
  const batchSize = 1000;
  const rows: T[] = [];
  for (let offset = 0; ; offset += batchSize) {
    const query =
      `bucket('${bucket}').select(${fields.map((field) => `'${field}'`).join(",")})` +
      `.offset(${offset}).limit(${batchSize}).run()`;
    const response = (await wikiBucket(query)) as { bucket?: T[] };
    const batch = response.bucket ?? [];
    rows.push(...batch);
    console.log(`Fetched ${rows.length} ${label}…`);
    if (batch.length < batchSize) break;
  }
  return rows;
}

function equipmentSlot(value: string | undefined): {
  slot: EquipmentSlot;
  twoHanded: boolean;
} | null {
  if (value === "2h") return { slot: "weapon", twoHanded: true };
  const slots: EquipmentSlot[] = [
    "head", "cape", "neck", "ammo", "weapon", "body",
    "shield", "legs", "hands", "feet", "ring",
  ];
  if (slots.includes(value as EquipmentSlot)) {
    return { slot: value as EquipmentSlot, twoHanded: false };
  }
  return null;
}

function inferAttackTypes(row: WikiBonusRow): AttackType[] | undefined {
  if (!["weapon", "2h"].includes(row.equipment_slot ?? "")) return undefined;
  const style = (row.combat_style ?? "").toLowerCase();
  if (/bow|crossbow|thrown|chinchompa|gun|blaster/.test(style)) return ["ranged"];
  if (/powered staff|powered wand/.test(style)) return ["magic"];
  if (/salamander|multi-style/.test(style)) return ["stab", "slash", "crush", "ranged", "magic"];
  if (/whip|slash/.test(style)) return ["slash"];
  if (/bludgeon|blunt|spiked|pickaxe|staff|bulwark|flail/.test(style)) return ["crush"];
  if (/partisan/.test(style)) return ["stab"];
  if (/stab sword/.test(style)) return ["stab", "slash"];
  if (/spear|polearm|polestaff|multi-melee/.test(style)) return ["stab", "slash", "crush"];
  if (/axe|2h sword|claw|scythe|banner|bladed/.test(style)) return ["slash", "crush", "stab"];

  const inferred: AttackType[] = [];
  if (asNumber(row.stab_attack_bonus) > 0) inferred.push("stab");
  if (asNumber(row.slash_attack_bonus) > 0) inferred.push("slash");
  if (asNumber(row.crush_attack_bonus) > 0) inferred.push("crush");
  if (asNumber(row.range_attack_bonus) > 0) inferred.push("ranged");
  if (asNumber(row.magic_attack_bonus) > 0) inferred.push("magic");
  return inferred.length ? inferred : ["crush"];
}

function mapWikiEquipment(
  bonuses: WikiBonusRow[],
  itemRows: WikiItemRow[],
  prices: Record<string, { high?: number; low?: number }>,
  calculatorIds: Set<number>,
): EquipmentItem[] {
  const itemsByPage = new Map<string, WikiItemRow[]>();
  for (const item of itemRows) {
    if (!item.page_name_sub) continue;
    const pageItems = itemsByPage.get(item.page_name_sub) ?? [];
    pageItems.push(item);
    itemsByPage.set(item.page_name_sub, pageItems);
  }

  const results: EquipmentItem[] = [];
  const seenIds = new Set<number>();
  for (const row of bonuses) {
    const slot = equipmentSlot(row.equipment_slot);
    const page = row.page_name_sub;
    if (!slot || !page) continue;
    const matchingItems = itemsByPage.get(page) ?? [];

    for (const itemRow of matchingItems) {
      const ids = asStrings(itemRow.item_id)
        .map(Number)
        .filter((id) => Number.isInteger(id) && id > 0);
      for (const id of ids) {
        if (seenIds.has(id)) continue;
        seenIds.add(id);
        const price = prices[String(id)];
        results.push({
          id,
          name: itemRow.item_name?.trim() || page.replace("#", " (").replace(/$/, page.includes("#") ? ")" : ""),
          slot: slot.slot,
          twoHanded: slot.twoHanded || undefined,
          attackTypes: inferAttackTypes(row),
          combatStyle: row.combat_style,
          bonuses: {
            stabAttack: asNumber(row.stab_attack_bonus),
            slashAttack: asNumber(row.slash_attack_bonus),
            crushAttack: asNumber(row.crush_attack_bonus),
            magicAttack: asNumber(row.magic_attack_bonus),
            rangedAttack: asNumber(row.range_attack_bonus),
            stabDefence: asNumber(row.stab_defence_bonus),
            slashDefence: asNumber(row.slash_defence_bonus),
            crushDefence: asNumber(row.crush_defence_bonus),
            magicDefence: asNumber(row.magic_defence_bonus),
            rangedDefence: asNumber(row.range_defence_bonus),
            strength: asNumber(row.strength_bonus),
            rangedStrength: asNumber(row.ranged_strength_bonus),
            magicDamage: asNumber(row.magic_damage_bonus),
            prayer: asNumber(row.prayer_bonus),
            attackSpeed: asNumber(row.weapon_attack_speed, 4),
          },
          gePrice: price?.high ?? price?.low ?? null,
          tradeable: Object.prototype.hasOwnProperty.call(itemRow, "tradeable"),
          wikiName: page,
          dataSource: "wiki",
          optimizerEligible: calculatorIds.has(id),
        });
      }
    }
  }
  return results;
}

async function fetchAllWikiEquipment(
  prices: Record<string, { high?: number; low?: number }>,
): Promise<EquipmentItem[]> {
  const [bonuses, items, calculatorIds] = await Promise.all([
    fetchBucketPages<WikiBonusRow>("infobox_bonuses", BONUS_FIELDS, "equipment bonus rows"),
    fetchBucketPages<WikiItemRow>("infobox_item", ITEM_FIELDS, "item rows"),
    fetchCalculatorEquipmentIds(),
  ]);
  return mapWikiEquipment(bonuses, items, prices, calculatorIds);
}

type WikiMonsterRow = {
  page_name_sub?: string;
  name?: string;
  version_anchor?: string;
  id?: string[] | string;
  combat_level?: number;
  hitpoints?: number;
  attack_level?: number;
  strength_level?: number;
  defence_level?: number;
  magic_level?: number;
  ranged_level?: number;
  attack_bonus?: number;
  strength_bonus?: number;
  magic_attack_bonus?: number;
  range_attack_bonus?: number;
  stab_defence_bonus?: number;
  slash_defence_bonus?: number;
  crush_defence_bonus?: number;
  magic_defence_bonus?: number;
  range_defence_bonus?: number;
  size?: number;
  attribute?: string[] | string;
  slayer_category?: string[] | string;
  default_version?: unknown;
};

const MONSTER_FIELDS = [
  "page_name_sub",
  "name",
  "version_anchor",
  "id",
  "combat_level",
  "hitpoints",
  "attack_level",
  "strength_level",
  "defence_level",
  "magic_level",
  "ranged_level",
  "attack_bonus",
  "strength_bonus",
  "magic_attack_bonus",
  "range_attack_bonus",
  "stab_defence_bonus",
  "slash_defence_bonus",
  "crush_defence_bonus",
  "magic_defence_bonus",
  "range_defence_bonus",
  "size",
  "attribute",
  "slayer_category",
  "default_version",
] as const;

function asNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function asStrings(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (value == null || value === "") return [];
  return [String(value)];
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function wikiMonsterId(row: WikiMonsterRow, index: number): string {
  const npcIds = asStrings(row.id);
  const source = row.page_name_sub || `${row.name ?? "monster"}-${row.version_anchor ?? ""}`;
  return `wiki-${npcIds[0] ?? slug(source) ?? index}-${slug(row.version_anchor ?? "") || "default"}`;
}

function mapWikiMonster(row: WikiMonsterRow, index: number): MonsterStats | null {
  const name = row.name?.trim();
  if (!name) return null;

  const version = row.version_anchor?.trim();
  const categories = asStrings(row.slayer_category);
  const baseName = (row.page_name_sub?.split("#")[0] || name).trim();
  const displayName = version ? `${name} (${version})` : name;

  return {
    id: wikiMonsterId(row, index),
    name: displayName,
    combatLevel: asNumber(row.combat_level),
    hitpoints: Math.max(1, asNumber(row.hitpoints, 1)),
    attack: Math.max(1, asNumber(row.attack_level, 1)),
    strength: Math.max(1, asNumber(row.strength_level, 1)),
    defence: Math.max(1, asNumber(row.defence_level, 1)),
    magic: Math.max(1, asNumber(row.magic_level, 1)),
    ranged: Math.max(1, asNumber(row.ranged_level, 1)),
    stabDefence: asNumber(row.stab_defence_bonus),
    slashDefence: asNumber(row.slash_defence_bonus),
    crushDefence: asNumber(row.crush_defence_bonus),
    magicDefence: asNumber(row.magic_defence_bonus),
    rangedDefence: asNumber(row.range_defence_bonus),
    attackBonus: asNumber(row.attack_bonus),
    strengthBonus: asNumber(row.strength_bonus),
    magicAttack: asNumber(row.magic_attack_bonus),
    rangedAttack: asNumber(row.range_attack_bonus),
    size: Math.max(1, asNumber(row.size, 1)),
    attributes: asStrings(row.attribute),
    group: categories[0] ?? "Other",
    wikiName: row.page_name_sub ?? name,
    npcIds: asStrings(row.id),
    version: version || undefined,
    baseName,
    // Bucket writes an empty string when the default_version field is present.
    isDefaultVariant: Object.prototype.hasOwnProperty.call(row, "default_version"),
  };
}

async function fetchAllWikiMonsters(): Promise<MonsterStats[]> {
  const batchSize = 500;
  const rows: WikiMonsterRow[] = [];

  for (let offset = 0; ; offset += batchSize) {
    const query =
      `bucket('infobox_monster').select(${MONSTER_FIELDS.map((f) => `'${f}'`).join(",")})` +
      `.offset(${offset}).limit(${batchSize}).run()`;
    const response = (await wikiBucket(query)) as { bucket?: WikiMonsterRow[] };
    const batch = response.bucket ?? [];
    rows.push(...batch);
    console.log(`Fetched ${rows.length} Wiki monster variants…`);
    if (batch.length < batchSize) break;
  }

  const seen = new Set<string>();
  return rows
    .map(mapWikiMonster)
    .filter((monster): monster is MonsterStats => {
      if (!monster || seen.has(monster.id)) return false;
      seen.add(monster.id);
      return true;
    })
    .sort((a, b) => a.name.localeCompare(b.name) || a.combatLevel - b.combatLevel);
}

function mergeMonsters(seedMonsters: MonsterStats[], wikiMonsters: MonsterStats[]): MonsterStats[] {
  // Keep seed records first so saved IDs and curated encounter stats remain valid.
  const merged = [...seedMonsters];
  const exactSeedKeys = new Set(
    seedMonsters.map((m) => `${m.name.toLowerCase()}|${m.combatLevel}|${m.hitpoints}`),
  );

  for (const monster of wikiMonsters) {
    const key = `${monster.name.toLowerCase()}|${monster.combatLevel}|${monster.hitpoints}`;
    if (!exactSeedKeys.has(key)) merged.push(monster);
  }

  return merged.sort((a, b) => a.name.localeCompare(b.name) || a.combatLevel - b.combatLevel);
}

async function main() {
  const seedPath = join(process.cwd(), "data/game-data.json");
  if (!existsSync(seedPath)) {
    console.log("Seed data missing — run npm run sync:seed first.");
    process.exit(1);
  }

  const seed = JSON.parse(readFileSync(seedPath, "utf8"));
  console.log("Fetching GE prices…");
  let prices: Record<string, { high?: number; low?: number }> = {};
  try {
    // Item prices are applied after reconciliation, once names are final, so
    // that GE-id resolution sees the same names the app will show.
    prices = await fetchPrices();
    console.log(`Fetched ${Object.keys(prices).length} live GE prices.`);
  } catch (e) {
    console.warn("Price sync failed:", e);
  }

  try {
    console.log("Fetching all equipment from Wiki Bucket…");
    const wikiItems = await fetchAllWikiEquipment(prices);
    if (wikiItems.length < 1000) {
      throw new Error(`Wiki returned only ${wikiItems.length} equipment items`);
    }
    const curatedItems = (seed.items as EquipmentItem[]).filter(
      (item) => item.dataSource !== "wiki",
    );
    const byId = new Map<number, EquipmentItem>();
    for (const item of wikiItems) byId.set(item.id, item);
    // Curated records retain hand-authored requirements and attack-style metadata.
    for (const item of curatedItems) {
      const wikiItem = byId.get(item.id);
      byId.set(item.id, {
        ...wikiItem,
        ...item,
        gePrice: prices[String(item.id)]?.high
          ?? prices[String(item.id)]?.low
          ?? item.gePrice
          ?? null,
        dataSource: "seed",
        optimizerEligible: true,
      });
    }
    seed.items = [...byId.values()].sort(
      (a, b) => a.name.localeCompare(b.name) || a.id - b.id,
    );
    console.log(
      `Equipment data ready: ${seed.items.length} items (${wikiItems.length} Wiki item IDs).`,
    );
  } catch (e) {
    console.warn("Equipment sync failed (existing item data retained):", e);
  }

  try {
    console.log("Fetching all monster variants from Wiki Bucket…");
    const wikiMonsters = await fetchAllWikiMonsters();
    if (wikiMonsters.length < 100) {
      throw new Error(`Wiki returned only ${wikiMonsters.length} monster variants`);
    }
    // Preserve hand-curated offline records, but replace all previously synced Wiki
    // rows so schema/default-variant changes do not leave stale duplicates behind.
    const curatedMonsters = (seed.monsters as MonsterStats[]).filter(
      (monster) => !monster.wikiName,
    );
    seed.monsters = mergeMonsters(curatedMonsters, wikiMonsters);
    console.log(
      `Monster data ready: ${seed.monsters.length} total (${wikiMonsters.length} Wiki variants).`,
    );
  } catch (e) {
    console.warn("Monster sync failed (seed data retained):", e);
  }

  const reconciled = reconcileItems(seed.items as EquipmentItem[]);
  seed.items = reconciled.items;
  console.log(
    `Aligned ${reconciled.stats.matched}/${reconciled.stats.total} items with the ` +
      `calculator dataset (${reconciled.stats.renamed} renamed, ` +
      `${reconciled.stats.unsupported} unsupported).`,
  );

  try {
    const mapping = await fetchGeMapping(USER_AGENT);
    const pricing = applyGePrices(seed.items as EquipmentItem[], mapping, prices);
    seed.componentPrices = pricing.componentPrices;
    seed.pricesUpdatedAt = pricing.pricesUpdatedAt;
    console.log(
      `Priced ${pricing.pricedItems} items from the GE (${pricing.unpricedItems} have no GE route), ` +
        `${Object.keys(pricing.componentPrices).length} recipe components.`,
    );
  } catch (e) {
    console.warn("GE price mapping failed (item prices left unchanged):", e);
  }

  seed.generatedAt = new Date().toISOString();
  mkdirSync(join(process.cwd(), "data"), { recursive: true });
  mkdirSync(join(process.cwd(), "src/lib/data"), { recursive: true });
  writeFileSync(seedPath, JSON.stringify(seed, null, 2));
  writeFileSync(join(process.cwd(), "src/lib/data/game-data.json"), JSON.stringify(seed, null, 2));
  console.log("Wrote updated game-data.json");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
