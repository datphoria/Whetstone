import { getItemById } from "@/lib/data";

export interface BankItemEntry {
  id: number;
  quantity: number;
}

/** OSRS item id for Coins */
export const COINS_ITEM_ID = 995;
/** OSRS item id for Platinum token (worth 1,000 gp each) */
export const PLATINUM_TOKEN_ITEM_ID = 13204;

export interface BankParseResult {
  entries: BankItemEntry[];
  itemIds: number[];
  matchedInDb: number;
  format: "tsv" | "pairs" | "json" | "unknown";
  /** Liquid GP in bank: coins + platinum tokens × 1000 */
  gpStack: number;
  coins: number;
  platinumTokens: number;
}

/**
 * Parse RuneLite Bank Memory clipboard data.
 * Supports TSV export (v1.2+) and legacy comma-separated id,qty pairs.
 */
function sumQuantity(entries: BankItemEntry[], itemId: number): number {
  return entries
    .filter((e) => e.id === itemId)
    .reduce((sum, e) => sum + (e.quantity > 0 ? e.quantity : 0), 0);
}

/** Coins + platinum tokens (×1000) from a parsed bank. */
export function gpStackFromEntries(entries: BankItemEntry[]): {
  coins: number;
  platinumTokens: number;
  gpStack: number;
} {
  const coins = sumQuantity(entries, COINS_ITEM_ID);
  const platinumTokens = sumQuantity(entries, PLATINUM_TOKEN_ITEM_ID);
  return {
    coins,
    platinumTokens,
    gpStack: coins + platinumTokens * 1000,
  };
}

export function parseBankMemoryPaste(text: string): BankParseResult {
  const trimmed = text.replace(/^\uFEFF/, "").trim();
  if (!trimmed) {
    return {
      entries: [],
      itemIds: [],
      matchedInDb: 0,
      format: "unknown",
      gpStack: 0,
      coins: 0,
      platinumTokens: 0,
    };
  }

  let entries: BankItemEntry[] = [];
  let format: BankParseResult["format"] = "unknown";

  // JSON array: [{id:4151, quantity:1}, ...] or [4151, 4587]
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      format = "json";
      for (const row of parsed) {
        if (typeof row === "number") entries.push({ id: row, quantity: 1 });
        else if (row && typeof row === "object") {
          const id = Number(row.id ?? row.itemId ?? row.item_id);
          const quantity = Number(row.quantity ?? row.qty ?? 1);
          if (Number.isFinite(id) && id > 0) entries.push({ id, quantity: quantity || 1 });
        }
      }
    }
  } catch {
    // not JSON
  }

  if (entries.length === 0) {
    // TSV: "Item id\tItem name\tItem quantity\n4151\tAbyssal whip\t1"
    if (trimmed.includes("\t") || /^item id/i.test(trimmed.split("\n")[0] ?? "")) {
      format = "tsv";
      const lines = trimmed.split(/\r?\n/).filter(Boolean);
      for (const line of lines) {
        if (/^item id/i.test(line)) continue;
        const cols = line.split("\t");
        const id = Number(cols[0]?.trim());
        const quantity = Number(cols[2]?.trim() ?? 1);
        if (Number.isFinite(id) && id > 0) {
          entries.push({ id, quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1 });
        }
      }
    }
  }

  if (entries.length === 0) {
    // Comma pairs: "301,1,302,10," (Bank Memory save string format)
    const numbers = trimmed
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => Number(s))
      .filter((n) => Number.isFinite(n));

    if (numbers.length >= 2 && numbers.length % 2 === 0) {
      format = "pairs";
      for (let i = 0; i < numbers.length; i += 2) {
        const id = numbers[i];
        const quantity = numbers[i + 1];
        if (id > 0) entries.push({ id, quantity: quantity > 0 ? quantity : 1 });
      }
    }
  }

  if (entries.length === 0) {
    const fallbackIds = [
      ...new Set(
        trimmed
          .split(/[\s;\n|]+/)
          .map((s) => Number(s.trim()))
          .filter((n) => Number.isFinite(n) && n > 0),
      ),
    ];
    entries = fallbackIds.map((id) => ({ id, quantity: 1 }));
  }

  const itemIds = [...new Set(entries.map((e) => e.id))];
  const matchedInDb = itemIds.filter((id) => Boolean(getItemById(id))).length;
  const { coins, platinumTokens, gpStack } = gpStackFromEntries(entries);

  return { entries, itemIds, matchedInDb, format, gpStack, coins, platinumTokens };
}

/** @deprecated use parseBankMemoryPaste().itemIds */
export function parseBankMemoryItemIds(text: string): number[] {
  return parseBankMemoryPaste(text).itemIds;
}
