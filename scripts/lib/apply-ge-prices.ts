/**
 * Shared GE pricing pass used by both the full Wiki sync and `sync:prices`.
 *
 * Equipment ids are not always GE ids, so each item is mapped onto the traded id
 * before pricing; recipe parts that are not wearable equipment get their own
 * price table.
 */
import {
  buildGeResolveIndex,
  resolveGeItemId,
  type GeMappingRow,
} from "../../src/lib/prices/geResolve";
import { RECIPES } from "../../src/lib/prices/recipes";
import type { EquipmentItem } from "../../src/lib/types";

export interface LatestRow {
  high?: number | null;
  low?: number | null;
}

export interface PricingResult {
  componentPrices: Record<string, number>;
  pricesUpdatedAt: string;
  pricedItems: number;
  unpricedItems: number;
}

export function priceFrom(row: LatestRow | undefined): number | null {
  const value = row?.high ?? row?.low ?? null;
  return value != null && value > 0 ? value : null;
}

export async function fetchGeMapping(userAgent: string): Promise<GeMappingRow[]> {
  const res = await fetch("https://prices.runescape.wiki/api/v1/osrs/mapping", {
    headers: { "User-Agent": userAgent, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`GE mapping HTTP ${res.status}`);
  return (await res.json()) as GeMappingRow[];
}

export function applyGePrices(
  items: EquipmentItem[],
  mapping: GeMappingRow[],
  latest: Record<string, LatestRow>,
): PricingResult {
  const index = buildGeResolveIndex(mapping, (id) => priceFrom(latest[String(id)]) != null);

  let pricedItems = 0;
  let unpricedItems = 0;
  for (const item of items) {
    const geItemId = resolveGeItemId(item, index);
    item.geItemId = geItemId;
    const price = geItemId != null ? priceFrom(latest[String(geItemId)]) : null;
    item.gePrice = price;
    if (price != null) pricedItems++;
    else unpricedItems++;
  }

  const componentPrices: Record<string, number> = {};
  for (const recipe of RECIPES) {
    for (const part of recipe.parts) {
      if (part.kind !== "ge" || part.geItemId == null) continue;
      const price = priceFrom(latest[String(part.geItemId)]);
      if (price != null) componentPrices[String(part.geItemId)] = price;
      else console.warn(`  no live price for component ${part.name} (${part.geItemId})`);
    }
  }

  return {
    componentPrices,
    pricesUpdatedAt: new Date().toISOString(),
    pricedItems,
    unpricedItems,
  };
}
