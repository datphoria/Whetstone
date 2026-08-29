import { getItems } from "@/lib/data";
import { imbuedBaseName, recipeFor, type RecipePart } from "@/lib/prices/recipes";
import type { EquipmentItem } from "@/lib/types";

export type PriceMap = Record<number, number>;

export type AcquisitionKind =
  /** Already in the imported bank. */
  | "owned"
  /** Buy the item itself on the GE. */
  | "buy"
  /** Buy tradeable parts and combine them (Avernic defender, Ferocious gloves…). */
  | "craft"
  /** No GE route at all — must be earned in game (Infernal cape, Fighter torso…). */
  | "earn"
  /** Not obtainable under the current options. */
  | "unobtainable";

export interface AcquisitionStep {
  name: string;
  geItemId?: number;
  quantity: number;
  price: number | null;
  kind: "ge" | "earn";
}

export interface Acquisition {
  kind: AcquisitionKind;
  /** GP that must be spent. `Infinity` when unobtainable. */
  cost: number;
  steps: AcquisitionStep[];
  /** Things the player has to do in game rather than buy. */
  earnSteps: string[];
  note?: string;
}

export interface AcquisitionContext {
  owned?: Set<number>;
  /** Live GE prices keyed by GE item id. Falls back to synced prices. */
  prices?: PriceMap;
  /** Baked component prices for parts that are not wearable equipment. */
  componentPrices?: PriceMap;
  /** Whether items with in-game-only steps may be assumed obtained. */
  allowEarned?: boolean;
}

const OWNED_FREE: Acquisition = { kind: "owned", cost: 0, steps: [], earnSteps: [] };
const UNOBTAINABLE: Acquisition = {
  kind: "unobtainable",
  cost: Infinity,
  steps: [],
  earnSteps: [],
};

/**
 * Gear with no GE route that a serious account is still expected to have. These
 * are reported as "earn" rather than priced.
 */
const EARNABLE_COMBAT_GEAR =
  /^(?:fire cape|infernal cape|imbued (?:saradomin|guthix|zamorak|zammy) cape|ava'?s assembler|assembler max cape|blessed dizana'?s quiver|dizana'?s quiver|dragon defender|rune defender|fighter torso|barrows gloves|salve amulet|void knight (?:top|robe|gloves)|void (?:melee|ranger|mage) helm|elite void (?:top|robe)|book of the dead|mage'?s book|ancient book|holy book|book of law|book of war|book of balance|book of darkness|elidinis'? ward|crystal (?:helm|body|legs|halberd)|blade of saeldor|bow of faerdhinen|venator bow|eclipse atlatl|dual macuahuitl|emberlight|burning claws|arclight|darklight|soulreaper axe)\b/i;

function priceById(id: number | null | undefined, ctx: AcquisitionContext): number | null {
  if (id == null) return null;
  const live = ctx.prices?.[id];
  if (live != null && live > 0) return live;
  const component = ctx.componentPrices?.[id];
  if (component != null && component > 0) return component;
  return null;
}

/** Current buy price for an item: live GE price by GE id, else the synced price. */
export function priceOf(item: EquipmentItem, ctx: AcquisitionContext = {}): number | null {
  const byGeId = priceById(item.geItemId ?? null, ctx);
  if (byGeId != null) return byGeId;
  // Older data has no geItemId; the equipment id is often also the GE id.
  const byOwnId = priceById(item.id, ctx);
  if (byOwnId != null) return byOwnId;
  return item.gePrice ?? null;
}

function partPrice(part: RecipePart, ctx: AcquisitionContext): number | null {
  if (part.kind !== "ge") return null;
  const direct = priceById(part.geItemId, ctx);
  if (direct != null) return direct;
  // Fall back to an equipment row with the same GE id (e.g. helm of neitiznot).
  const item = getItems().find(
    (candidate) => candidate.geItemId === part.geItemId || candidate.id === part.geItemId,
  );
  return item?.gePrice ?? null;
}

function craftAcquisition(
  item: EquipmentItem,
  ctx: AcquisitionContext,
): Acquisition | null {
  const recipe = recipeFor(item);
  if (!recipe) return null;

  const steps: AcquisitionStep[] = [];
  const earnSteps: string[] = [];
  let cost = 0;
  for (const part of recipe.parts) {
    const quantity = part.quantity ?? 1;
    if (part.kind === "earn") {
      earnSteps.push(part.name);
      steps.push({ ...part, quantity, price: null });
      continue;
    }
    const price = partPrice(part, ctx);
    if (price == null) return null;
    cost += price * quantity;
    steps.push({ ...part, quantity, price });
  }
  if (earnSteps.length > 0 && !ctx.allowEarned) return UNOBTAINABLE;
  return { kind: "craft", cost, steps, earnSteps, note: recipe.note };
}

function imbuedAcquisition(
  item: EquipmentItem,
  ctx: AcquisitionContext,
): Acquisition | null {
  const baseName = imbuedBaseName(item.name);
  if (!baseName) return null;
  const base = getItems().find(
    (candidate) => candidate.name.toLowerCase() === baseName.toLowerCase(),
  );
  if (!base) return null;
  const price = priceOf(base, ctx);
  if (price == null) return null;
  if (!ctx.allowEarned) return UNOBTAINABLE;
  return {
    kind: "craft",
    cost: price,
    steps: [
      { name: base.name, geItemId: base.geItemId ?? base.id, quantity: 1, price, kind: "ge" },
      { name: "Imbue (Nightmare Zone or Soul Wars)", quantity: 1, price: null, kind: "earn" },
    ],
    earnSteps: ["Imbue (Nightmare Zone or Soul Wars)"],
    note: `Buy ${base.name} and imbue it`,
  };
}

/**
 * How the player would actually get this item, and what it costs them.
 *
 * Order matters: owned beats buying, buying beats crafting from parts, and
 * "earn" is the last resort for gear with no GE route.
 */
export function acquisitionFor(
  item: EquipmentItem,
  ctx: AcquisitionContext = {},
): Acquisition {
  if (ctx.owned?.has(item.id)) return OWNED_FREE;

  const price = priceOf(item, ctx);
  if (price != null && price > 0) {
    return {
      kind: "buy",
      cost: price,
      steps: [
        {
          name: item.name,
          geItemId: item.geItemId ?? item.id,
          quantity: 1,
          price,
          kind: "ge",
        },
      ],
      earnSteps: [],
    };
  }

  const crafted = craftAcquisition(item, ctx);
  if (crafted) return crafted;

  const imbued = imbuedAcquisition(item, ctx);
  if (imbued) return imbued;

  if (EARNABLE_COMBAT_GEAR.test(item.name.replace(/\s*\((?:normal|charged|active|restored)\)\s*$/i, "").trim())) {
    if (!ctx.allowEarned) return UNOBTAINABLE;
    return {
      kind: "earn",
      cost: 0,
      steps: [{ name: item.name, quantity: 1, price: null, kind: "earn" }],
      earnSteps: [item.name],
      note: "No Grand Exchange route — earn it in game",
    };
  }

  return UNOBTAINABLE;
}

/** Short human label for a result chip. */
export function acquisitionLabel(acquisition: Acquisition): string {
  switch (acquisition.kind) {
    case "owned":
      return "in your bank";
    case "buy":
      return "buy on GE";
    case "craft":
      return acquisition.earnSteps.length > 0 ? "buy parts + earn" : "buy parts";
    case "earn":
      return "earn in game";
    default:
      return "unobtainable";
  }
}
