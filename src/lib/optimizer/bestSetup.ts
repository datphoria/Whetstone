import { calculatePlayerDps } from "@/lib/dps/calculate";
import {
  officialAmmoCompatible,
  officialAttackTypesForItem,
  officialBestSpellForLevel,
  officialCombatStylesForItem,
  officialIsEngineSupported,
  officialIsPoweredStaff,
  officialRequiresSlayerTask,
} from "@/lib/dps/wikiAdapter";
import { getComponentPrices, getItemById, getItems, getItemsBySlot } from "@/lib/data";
import {
  acquisitionFor,
  priceOf,
  type Acquisition,
  type AcquisitionContext,
  type PriceMap,
} from "@/lib/prices/acquisition";
import type {
  AttackType,
  EquipmentItem,
  EquipmentSlot,
  Loadout,
  LoadoutEquipment,
  MonsterStats,
  PrayerName,
  PotionName,
} from "@/lib/types";
import { EQUIPMENT_SLOTS } from "@/lib/types";

export interface BestSetupOptions {
  budget: number;
  accountMode?: "main" | "iron";
  /**
   * Mains: allow gear with in-game-only steps (fire cape, imbues, dragon
   * defender for an Avernic). Without this the best melee setups have empty cape
   * and shield slots because those items cannot simply be bought.
   */
  includeUntradeables?: boolean;
  /** Live GE prices keyed by GE item id; falls back to synced prices. */
  prices?: PriceMap;
  /**
   * Only consider items in `ownedItemIds`, even for mains. Answers "what is the
   * best I can build right now" instead of "what should I buy".
   */
  restrictToOwned?: boolean;
  ownedItemIds?: number[] | null;
  excludeItemIds?: number[];
  excludeSlots?: EquipmentSlot[];
  allowedAttackTypes?: AttackType[];
  allowedPrayers?: PrayerName[];
  potions?: PotionName[];
  onTask?: boolean;
  /** Restrict search to this fixed catalogue (tests / exhaustive oracle). */
  itemPool?: EquipmentItem[];
  /** Override shortlist size (default 60). Use a large value with tiny pools. */
  shortlistLimit?: number;
  /** Override beam width (default 36). */
  beamWidth?: number;
  /** Disable pruning for exact search on tiny pools. */
  exhaustive?: boolean;
  onProgress?: (progress: BestSetupProgress) => void;
  signal?: AbortSignal;
}

export interface BestSetupProgress {
  phase: "starting" | "attackType" | "slot" | "done" | "cancelled";
  attackType?: AttackType;
  slot?: EquipmentSlot;
  percent: number;
  message: string;
  evaluated?: number;
}

export interface BestSetupCandidate {
  loadout: Loadout;
  dps: number;
  ttk: number;
  maxHit: number;
  accuracy: number;
  totalCost: number;
  purchaseCost: number;
  ownedItemsUsed: number;
  /** How each item in this setup would actually be obtained. */
  plan: SetupPlanEntry[];
  prayer: PrayerName;
  potions: PotionName[];
  attackType: AttackType;
}

export interface SetupPlanEntry {
  slot: EquipmentSlot;
  itemId: number;
  itemName: string;
  acquisition: Acquisition;
}

function resolveEquipment(equipment: LoadoutEquipment): (EquipmentItem | null)[] {
  return EQUIPMENT_SLOTS.map((slot) => getItemById(equipment[slot] ?? null) ?? null);
}

function marketValue(equipment: LoadoutEquipment, model: CostModel): number {
  return EQUIPMENT_SLOTS.reduce((sum, slot) => {
    const item = getItemById(equipment[slot] ?? null);
    if (!item) return sum;
    return sum + (priceOf(item, model.ctx) ?? 0);
  }, 0);
}

function meetsRequirements(item: EquipmentItem, loadout: Loadout): boolean {
  return Object.entries(item.requirements ?? {}).every(([skill, level]) => {
    const playerLevel = loadout.skills[skill as keyof typeof loadout.skills];
    return playerLevel >= (level ?? 0);
  });
}

/**
 * Costing every candidate is hot enough that acquisition lookups (which may scan
 * the catalogue for recipe parts) must be memoised for the duration of a search.
 */
interface CostModel {
  ctx: AcquisitionContext;
  owned: Set<number>;
  bankOnly: boolean;
  cache: Map<number, Acquisition>;
}

function createCostModel(opts: BestSetupOptions, owned: Set<number>): CostModel {
  const bankOnly = opts.restrictToOwned === true || (opts.accountMode ?? "main") === "iron";
  return {
    owned,
    bankOnly,
    cache: new Map(),
    ctx: {
      owned,
      prices: opts.prices,
      componentPrices: getComponentPrices(),
      allowEarned: !bankOnly && opts.includeUntradeables !== false,
    },
  };
}

function acquisitionOf(item: EquipmentItem, model: CostModel): Acquisition {
  const cached = model.cache.get(item.id);
  if (cached) return cached;
  const acquisition = acquisitionFor(item, model.ctx);
  model.cache.set(item.id, acquisition);
  return acquisition;
}

function purchasePrice(item: EquipmentItem, model: CostModel): number {
  if (model.owned.has(item.id)) return 0;
  if (model.bankOnly) return Infinity;
  return acquisitionOf(item, model).cost;
}

function eligibleItems(
  slot: EquipmentSlot,
  opts: BestSetupOptions,
  base: Loadout,
  model: CostModel,
): EquipmentItem[] {
  if (opts.excludeSlots?.includes(slot)) return [];
  let pool = opts.itemPool?.length
    ? opts.itemPool.filter((item) => item.slot === slot)
    : getItemsBySlot(slot);
  if (opts.excludeItemIds?.length) {
    const ex = new Set(opts.excludeItemIds);
    pool = pool.filter((i) => !ex.has(i.id));
  }
  return pool.filter(
    (item) =>
      // Items the engine cannot score would silently contribute no bonuses.
      officialIsEngineSupported(item) &&
      isUsableItem(item) &&
      meetsRequirements(item, base) &&
      Number.isFinite(purchasePrice(item, model)),
  );
}

function isUsableItem(item: EquipmentItem): boolean {
  const source = `${item.name} ${item.wikiName ?? ""}`.toLowerCase();
  if (
    /last man standing|deadman mode|unobtainable item|\bbeta\b|\btournament\b|\(bh\)|broken axe|broken pickaxe/.test(
      source,
    )
  ) {
    return false;
  }
  // Cosmetic / locked / broken / minigame-only variants inflate DPS as free gear.
  if (
    /\((broken|locked|minigame|tutorial|wrapped)\)|\bbirthday\b|\banniversary\b|soul wars/.test(
      source,
    )
  ) {
    return false;
  }
  // Charge-count variants ("Black mask ((10))") expire; the full item is the buy.
  if (/\(\(?\d+\)?\)$/.test(item.name.trim())) {
    return false;
  }
  // ToA challenge-mode gear only works inside the raid.
  if (/\bcorrupted\b/.test(source) && !/\bstaff of the dead\b/.test(source)) {
    return false;
  }
  // Gauntlet perfected/attuned/basic crystal gear only works inside the minigame.
  if (/\bcrystal\b/.test(source) && /\((?:perfected|attuned|basic)\)/.test(source)) {
    return false;
  }
  // Greegrees, crates, and other "Unarmed" joke weapons have no real combat styles.
  if (item.slot === "weapon" && (!item.attackTypes || item.attackTypes.length === 0)) {
    return false;
  }
  if (
    (item.slot === "weapon" || item.slot === "shield") &&
    /\b(uncharged|unpowered|inactive|empty|broken)\b/.test(source)
  ) {
    return false;
  }
  return true;
}

function defaultPrayersFor(type: AttackType): PrayerName[] {
  if (type === "ranged") return ["rigour"];
  if (type === "magic") return ["augury"];
  return ["piety"];
}

function defaultPotionsFor(type: AttackType): PotionName[] {
  if (type === "ranged") return ["ranging"];
  if (type === "magic") return ["magic"];
  return ["superCombat"];
}

interface SearchState {
  equipment: LoadoutEquipment;
  spent: number;
  dps: number;
  combatStyle: Loadout["combatStyle"];
}

function combatStyleFor(type: AttackType): Loadout["combatStyle"] {
  return type === "ranged" ? "rapid" : type === "magic" ? "autocast" : "aggressive";
}

/**
 * Staves need a spell to deal any damage, while powered staves supply their own
 * and must not have one selected.
 */
function spellFor(
  type: AttackType,
  base: Loadout,
  equipment: LoadoutEquipment,
): string | null {
  if (type !== "magic") return null;
  const weapon = getItemById(equipment.weapon ?? null) ?? null;
  if (officialIsPoweredStaff(weapon)) return null;
  return base.spell ?? officialBestSpellForLevel(base.skills.magic);
}

function itemStatScore(item: EquipmentItem, type: AttackType): number {
  const b = item.bonuses;
  if (type === "ranged") {
    return b.rangedAttack + b.rangedStrength * 4 + (8 - b.attackSpeed) * (item.slot === "weapon" ? 30 : 0);
  }
  if (type === "magic") {
    return b.magicAttack + b.magicDamage * 8 + (8 - b.attackSpeed) * (item.slot === "weapon" ? 30 : 0);
  }
  const attack =
    type === "stab" ? b.stabAttack : type === "slash" ? b.slashAttack : b.crushAttack;
  return attack + b.strength * 4 + (8 - b.attackSpeed) * (item.slot === "weapon" ? 30 : 0);
}

function sameStatsKey(item: EquipmentItem, owned: Set<number>, cost: number): string {
  const b = item.bonuses;
  return [
    item.slot,
    item.twoHanded ? 1 : 0,
    item.attackTypes?.join(",") ?? "",
    item.combatStyle ?? "",
    b.stabAttack, b.slashAttack, b.crushAttack, b.magicAttack, b.rangedAttack,
    b.strength, b.rangedStrength, b.magicDamage, b.attackSpeed,
    owned.has(item.id) ? "owned" : cost,
  ].join("|");
}

function versionPreference(item: EquipmentItem): number {
  const name = item.name.toLowerCase();
  // Imbued variants are never worse than the base item, so break ties their way.
  if (/\(i\)$/.test(name)) return 4;
  if (/\((?:normal|charged|restored|active)\)/.test(name)) return 3;
  if (!/\(/.test(name)) return 2;
  if (/\((?:or|e|p\+*\+|unpoisoned)\)/.test(name)) return 1;
  return 0;
}

function shortlist(
  items: EquipmentItem[],
  type: AttackType,
  opts: BestSetupOptions,
  model: CostModel,
): EquipmentItem[] {
  const owned = model.owned;
  const ranked = items
    .filter((item) => purchasePrice(item, model) <= opts.budget)
    .sort((a, b) => {
      const score = itemStatScore(b, type) - itemStatScore(a, type);
      if (score) return score;
      const cost = purchasePrice(a, model) - purchasePrice(b, model);
      if (cost) return cost;
      // Prefer the standard charged/normal variant over ornament kits.
      return versionPreference(b) - versionPreference(a);
    });

  const selected = new Map<string, EquipmentItem>();
  if (items[0]?.slot === "ammo") {
    const families = [
      /\barrow/, /\bbolt/, /\bjavelin/, /\bdart/, /\bknife/, /blessing/,
    ];
    for (const family of families) {
      for (const item of ranked.filter((candidate) => family.test(candidate.name.toLowerCase())).slice(0, 6)) {
        selected.set(`ammo-${item.id}`, item);
      }
    }
  }
  for (const item of ranked.filter((candidate) => owned.has(candidate.id)).slice(0, 30)) {
    selected.set(`owned-${item.id}`, item);
  }
  for (const item of ranked) {
    if (
      /\b(twisted bow|tumeken|dragon hunter|scythe|osmumten|keris|arclight|emberlight|demonbane|blowpipe|atlatl|soulreaper)\b/i.test(
        item.name,
      )
    ) {
      selected.set(`special-${item.id}`, item);
    }
    // Slayer helmet stats are unremarkable, but the on-task multiplier is not.
    if (opts.onTask && /^(?:.*\bslayer helmet|black mask)/i.test(item.name)) {
      selected.set(`task-${item.id}`, item);
    }
  }
  for (const item of ranked) {
    const cost = purchasePrice(item, model);
    const key = sameStatsKey(item, owned, cost);
    if (!selected.has(key)) selected.set(key, item);
    if (selected.size >= 45) break;
  }

  // Set effects are not visible in an individual item's stat score.
  for (const item of ranked) {
    if (/\bvoid\b/i.test(item.name)) {
      selected.set(`set-${item.id}`, item);
    }
  }
  const limit = opts.shortlistLimit ?? 60;
  return [...selected.values()].slice(0, limit);
}

function ammoCompatible(ammo: EquipmentItem, weapon: EquipmentItem | null, type: AttackType): boolean {
  void type;
  return officialAmmoCompatible(weapon, ammo);
}

function pruneStates(
  states: SearchState[],
  width = 36,
  preserveWeaponBranches = false,
): SearchState[] {
  const unique = new Map<string, SearchState>();
  for (const state of states) {
    const key = EQUIPMENT_SLOTS.map((slot) => state.equipment[slot] ?? 0).join(",");
    const current = unique.get(key);
    if (!current || state.spent < current.spent) unique.set(key, state);
  }
  const all = [...unique.values()].sort((a, b) => b.dps - a.dps || a.spent - b.spent);
  const kept: SearchState[] = [];

  // A weapon can trail slightly with no armour and become best once strength
  // gear is equipped (Ursine chainmace vs zombie axe is a concrete example).
  // Preserve one branch per competitive weapon. The 90% floor avoids doubling
  // the expensive full-catalogue search for weapons too far behind to reverse.
  if (preserveWeaponBranches) {
    const bestByWeapon = new Map<number, SearchState>();
    const competitiveFloor = (all[0]?.dps ?? 0) * 0.9;
    for (const state of all) {
      const weaponId = state.equipment.weapon;
      if (
        weaponId != null &&
        state.dps >= competitiveFloor &&
        !bestByWeapon.has(weaponId)
      ) {
        bestByWeapon.set(weaponId, state);
      }
    }
    kept.push(...bestByWeapon.values());
  }

  for (const state of all.slice(0, Math.floor(width * 0.7))) {
    if (!kept.includes(state)) kept.push(state);
  }
  const cheapest = [...all].sort((a, b) => a.spent - b.spent || b.dps - a.dps);
  for (const state of cheapest) {
    if (!kept.includes(state)) kept.push(state);
    if (kept.length >= width) break;
  }
  return kept;
}

/**
 * Budget-aware beam search. Owned items cost no cash for mains; irons can only
 * use owned items. Keeping high-DPS and low-cost branches avoids the local
 * optima produced by the previous greedy slot fill.
 *
 * Full-catalogue results are heuristic (shortlist + beam). Pass a tiny
 * `itemPool` with `exhaustive: true` for exact winners in tests.
 */
export function findBestSetup(
  base: Loadout,
  monster: MonsterStats,
  opts: BestSetupOptions,
): BestSetupCandidate[] {
  if (officialRequiresSlayerTask(monster) && opts.onTask !== true) {
    opts = { ...opts, onTask: true };
  }
  const attackTypes = opts.allowedAttackTypes?.length
    ? opts.allowedAttackTypes
    : (["stab", "slash", "crush", "ranged", "magic"] as AttackType[]);

  const results: BestSetupCandidate[] = [];
  const owned = new Set(opts.ownedItemIds ?? []);
  const model = createCostModel(opts, owned);
  let evaluated = 0;
  const report = (progress: BestSetupProgress) => opts.onProgress?.(progress);

  report({ phase: "starting", percent: 0, message: "Starting search…" });

  for (let typeIndex = 0; typeIndex < attackTypes.length; typeIndex++) {
    if (opts.signal?.aborted) {
      report({ phase: "cancelled", percent: 100, message: "Cancelled" });
      break;
    }
    const attackType = attackTypes[typeIndex];
    const prayers = (opts.allowedPrayers?.length ? opts.allowedPrayers : defaultPrayersFor(attackType)).filter(
      (p) => p !== "none",
    );
    const potions = opts.potions?.length ? opts.potions : defaultPotionsFor(attackType);
    const typePercentBase = (typeIndex / attackTypes.length) * 100;

    report({
      phase: "attackType",
      attackType,
      percent: typePercentBase,
      message: `Searching ${attackType}…`,
      evaluated,
    });

    let bestForType: BestSetupCandidate | null = null;

    for (const prayer of prayers) {
      if (opts.signal?.aborted) break;
      const buildLoadout = (
        equipment: LoadoutEquipment,
        combatStyle: Loadout["combatStyle"],
      ): Loadout => ({
        ...base,
        attackType,
        prayer,
        prayers: [prayer],
        potions,
        onTask: opts.onTask ?? base.onTask,
        equipment,
        combatStyle,
        spell: spellFor(attackType, base, equipment),
      });
      const evaluate = (equipment: LoadoutEquipment) => {
        const weapon = getItemById(equipment.weapon ?? null) ?? null;
        const styles = officialCombatStylesForItem(weapon, attackType);
        if (styles.length === 0) styles.push(combatStyleFor(attackType));

        let best = { dps: -Infinity, combatStyle: styles[0] };
        for (const combatStyle of styles) {
          evaluated++;
          const dps = calculatePlayerDps(
            buildLoadout(equipment, combatStyle),
            monster,
            resolveEquipment(equipment),
          ).dps;
          if (dps > best.dps) best = { dps, combatStyle };
        }
        return best;
      };

      const pools = new Map<EquipmentSlot, EquipmentItem[]>();
      for (const slot of EQUIPMENT_SLOTS) {
        let items = eligibleItems(slot, opts, base, model);
        if (slot === "weapon") {
          items = items.filter(
            (weapon) => officialAttackTypesForItem(weapon).includes(attackType),
          );
        }
        pools.set(
          slot,
          opts.exhaustive
            ? items.filter((item) => purchasePrice(item, model) <= opts.budget)
            : shortlist(items, attackType, opts, model),
        );
      }

      const weaponPool = pools.get("weapon") ?? [];
      if (weaponPool.length === 0) continue;

      let states: SearchState[] = [];
      for (const weapon of weaponPool) {
        const spent = purchasePrice(weapon, model);
        if (spent > opts.budget) continue;
        const equipment: LoadoutEquipment = { weapon: weapon.id };
        states.push({ equipment, spent, ...evaluate(equipment) });
      }
      const slotsOrder: EquipmentSlot[] = [
        // A defender can turn a weaker one-handed weapon into the winner. Pair
        // weapon + shield before pruning so two-handed weapons do not get an
        // artificial head start. Ammo follows for the same reason.
        "shield", "ammo", "head", "cape", "neck", "body", "legs",
        "hands", "feet", "ring",
      ];

      for (let slotIndex = 0; slotIndex < slotsOrder.length; slotIndex++) {
        const slot = slotsOrder[slotIndex];
        const candidates = pools.get(slot) ?? [];
        const nextStates: SearchState[] = [...states];
        for (const state of states) {
          const weapon = getItemById(state.equipment.weapon ?? null) ?? null;
          if (slot === "shield" && weapon?.twoHanded) continue;
          for (const item of candidates) {
            if (slot === "ammo" && !ammoCompatible(item, weapon, attackType)) continue;
            const cost = purchasePrice(item, model);
            if (state.spent + cost > opts.budget) continue;
            const equipment = { ...state.equipment, [slot]: item.id };
            const evaluatedState = evaluate(equipment);
            nextStates.push({
              equipment,
              spent: state.spent + cost,
              ...evaluatedState,
            });
          }
        }
        states = opts.exhaustive
          ? pruneStates(nextStates, nextStates.length || 1)
          : pruneStates(nextStates, opts.beamWidth ?? 36, true);
        report({
          phase: "slot",
          attackType,
          slot,
          percent: typePercentBase + ((slotIndex + 1) / slotsOrder.length) * (100 / attackTypes.length),
          message: `Evaluating ${attackType} · ${slot}`,
          evaluated,
        });
      }

      const best = states.sort((a, b) => b.dps - a.dps || a.spent - b.spent)[0];
      if (!best) continue;
      const equipment = best.equipment;
      const loadout: Loadout = {
        ...buildLoadout(equipment, best.combatStyle),
        id: `best-${attackType}-${prayer}`,
        name: `Best ${attackType}`,
      };
      const result = calculatePlayerDps(loadout, monster, resolveEquipment(equipment));
      const plan: SetupPlanEntry[] = EQUIPMENT_SLOTS.flatMap((slot) => {
        const item = getItemById(equipment[slot] ?? null);
        if (!item) return [];
        return [
          {
            slot,
            itemId: item.id,
            itemName: item.name,
            acquisition: acquisitionOf(item, model),
          },
        ];
      });
      const candidate: BestSetupCandidate = {
        loadout,
        dps: result.dps,
        ttk: result.ttk,
        maxHit: result.maxHit,
        accuracy: result.accuracy,
        totalCost: marketValue(equipment, model),
        purchaseCost: plan.reduce(
          (sum, entry) => sum + (Number.isFinite(entry.acquisition.cost) ? entry.acquisition.cost : 0),
          0,
        ),
        ownedItemsUsed: plan.filter((entry) => entry.acquisition.kind === "owned").length,
        plan,
        prayer,
        potions,
        attackType,
      };

      if (!bestForType || candidate.dps > bestForType.dps) bestForType = candidate;
    }

    if (bestForType) results.push(bestForType);
  }

  report({
    phase: opts.signal?.aborted ? "cancelled" : "done",
    percent: 100,
    message: opts.signal?.aborted ? "Cancelled" : "Search complete",
    evaluated,
  });

  return results.sort((a, b) => b.dps - a.dps);
}

export interface UpgradeStep {
  slot: EquipmentSlot;
  fromItemId: number | null;
  fromItemName: string | null;
  toItemId: number;
  toItemName: string;
  cost: number;
  dpsGain: number;
  /** DPS with this step and every earlier step applied. */
  cumulativeDps: number;
  /** Best attack style once this step is applied — it can change mid-path. */
  attackType: AttackType;
  acquisition: Acquisition;
}

export interface UpgradePath {
  startDps: number;
  startAttackType: AttackType;
  endDps: number;
  steps: UpgradeStep[];
  totalCost: number;
}

export interface UpgradePathInput {
  from: LoadoutEquipment;
  to: LoadoutEquipment;
  /** Styles to consider; the best one is used at every step. */
  attackTypes?: AttackType[];
}

/**
 * Order the difference between two setups so the cheapest DPS per GP comes
 * first: the answer to "what should I buy next?" rather than "here is a 2B
 * shopping list".
 *
 * Each intermediate setup is scored with the best style it can use, because a
 * weapon upgrade often changes which style is strongest.
 */
export function computeUpgradePath(
  base: Loadout,
  monster: MonsterStats,
  opts: BestSetupOptions,
  input: UpgradePathInput,
): UpgradePath {
  if (officialRequiresSlayerTask(monster) && opts.onTask !== true) {
    opts = { ...opts, onTask: true };
  }
  const owned = new Set(opts.ownedItemIds ?? []);
  const model = createCostModel(opts, owned);
  const attackTypes = input.attackTypes?.length
    ? input.attackTypes
    : opts.allowedAttackTypes?.length
      ? opts.allowedAttackTypes
      : (["stab", "slash", "crush", "ranged", "magic"] as AttackType[]);

  const buildLoadout = (
    equipment: LoadoutEquipment,
    attackType: AttackType,
    combatStyle: Loadout["combatStyle"],
  ): Loadout => {
    const prayer =
      opts.allowedPrayers?.find((p) => p !== "none") ?? defaultPrayersFor(attackType)[0];
    return {
      ...base,
      attackType,
      prayer,
      prayers: [prayer],
      potions: opts.potions?.length ? opts.potions : defaultPotionsFor(attackType),
      onTask: opts.onTask ?? base.onTask,
      equipment,
      combatStyle,
      spell: spellFor(attackType, base, equipment),
    };
  };

  /** Best DPS this equipment can produce, and the style that achieves it. */
  const dpsOf = (equipment: LoadoutEquipment): { dps: number; attackType: AttackType } => {
    const weapon = getItemById(equipment.weapon ?? null) ?? null;
    const weaponStyles = weapon ? officialAttackTypesForItem(weapon) : [];
    const usable = attackTypes.filter((type) => weaponStyles.includes(type));
    const usableTypes = usable.length > 0 ? usable : [attackTypes[0]];
    let best = { dps: -Infinity, attackType: usableTypes[0] };
    for (const attackType of usableTypes) {
      const combatStyles = officialCombatStylesForItem(weapon, attackType);
      if (combatStyles.length === 0) combatStyles.push(combatStyleFor(attackType));
      for (const combatStyle of combatStyles) {
        const dps = calculatePlayerDps(
          buildLoadout(equipment, attackType, combatStyle),
          monster,
          resolveEquipment(equipment),
        ).dps;
        if (dps > best.dps) best = { dps, attackType };
      }
    }
    return best;
  };

  /** Applying a two-handed weapon also empties the shield slot. */
  const applySwap = (equipment: LoadoutEquipment, slot: EquipmentSlot, itemId: number) => {
    const next: LoadoutEquipment = { ...equipment, [slot]: itemId };
    if (slot === "weapon" && getItemById(itemId)?.twoHanded) delete next.shield;
    return next;
  };

  const pending = EQUIPMENT_SLOTS.filter(
    (slot) => (input.to[slot] ?? null) !== (input.from[slot] ?? null) && input.to[slot] != null,
  );

  let current: LoadoutEquipment = { ...input.from };
  const start = dpsOf(current);
  let currentDps = start.dps;
  const steps: UpgradeStep[] = [];

  while (pending.length > 0) {
    let bestIndex = -1;
    let bestValue = -Infinity;
    let best = { dps: currentDps, attackType: start.attackType };
    let bestCost = 0;

    for (let i = 0; i < pending.length; i++) {
      const slot = pending[i];
      const itemId = input.to[slot]!;
      const item = getItemById(itemId);
      if (!item) continue;
      const candidate = dpsOf(applySwap(current, slot, itemId));
      const gain = candidate.dps - currentDps;
      const cost = purchasePrice(item, model);
      // Rank by DPS per GP, with free unlocks and any gain preferred over none.
      const value = gain <= 0 ? gain : cost > 0 ? gain / cost : Number.MAX_SAFE_INTEGER;
      if (value > bestValue) {
        bestValue = value;
        bestIndex = i;
        best = candidate;
        bestCost = Number.isFinite(cost) ? cost : 0;
      }
    }

    if (bestIndex < 0) break;
    const slot = pending.splice(bestIndex, 1)[0];
    const toItemId = input.to[slot]!;
    const toItem = getItemById(toItemId)!;
    const fromItem = getItemById(current[slot] ?? null) ?? null;
    current = applySwap(current, slot, toItemId);
    steps.push({
      slot,
      fromItemId: fromItem?.id ?? null,
      fromItemName: fromItem?.name ?? null,
      toItemId,
      toItemName: toItem.name,
      cost: bestCost,
      dpsGain: Number((best.dps - currentDps).toFixed(3)),
      cumulativeDps: Number(best.dps.toFixed(3)),
      attackType: best.attackType,
      acquisition: acquisitionOf(toItem, model),
    });
    currentDps = best.dps;
  }

  return {
    startDps: Number(start.dps.toFixed(3)),
    startAttackType: start.attackType,
    endDps: Number(currentDps.toFixed(3)),
    steps,
    totalCost: steps.reduce((sum, step) => sum + step.cost, 0),
  };
}

function yieldToMain(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Same search as findBestSetup, but yields between attack types so the UI can paint. */
export async function findBestSetupAsync(
  base: Loadout,
  monster: MonsterStats,
  opts: BestSetupOptions,
): Promise<BestSetupCandidate[]> {
  const attackTypes = opts.allowedAttackTypes?.length
    ? opts.allowedAttackTypes
    : (["stab", "slash", "crush", "ranged", "magic"] as AttackType[]);

  const results: BestSetupCandidate[] = [];
  for (let i = 0; i < attackTypes.length; i++) {
    if (opts.signal?.aborted) break;
    const slice = await Promise.resolve(
      findBestSetup(base, monster, {
        ...opts,
        allowedAttackTypes: [attackTypes[i]],
        onProgress: (progress) => {
          const percent = (i / attackTypes.length) * 100 + progress.percent / attackTypes.length;
          opts.onProgress?.({
            ...progress,
            percent,
            message: progress.message,
          });
        },
      }),
    );
    results.push(...slice);
    await yieldToMain();
  }
  opts.onProgress?.({
    phase: opts.signal?.aborted ? "cancelled" : "done",
    percent: 100,
    message: opts.signal?.aborted ? "Cancelled" : "Search complete",
  });
  return results.sort((a, b) => b.dps - a.dps);
}

export function allTradeableItemIds(): number[] {
  return getItems().filter((i) => i.tradeable !== false).map((i) => i.id);
}
