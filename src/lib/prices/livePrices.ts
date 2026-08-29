import type { PriceMap } from "@/lib/prices/acquisition";

export interface LivePriceSnapshot {
  prices: PriceMap;
  /** "wiki" / "cache" come from the live API; "synced" means the baked prices. */
  source: "wiki" | "cache" | "seed" | "synced";
  fetchedAt: string | null;
  count: number;
}

const EMPTY: LivePriceSnapshot = {
  prices: {},
  source: "synced",
  fetchedAt: null,
  count: 0,
};

let snapshot: LivePriceSnapshot = EMPTY;

export function getLivePrices(): LivePriceSnapshot {
  return snapshot;
}

export function setLivePrices(next: LivePriceSnapshot): void {
  snapshot = next;
}

/**
 * Pull current GE prices. Keys are GE item ids, which is why equipment rows
 * carry `geItemId` — the equipment id is frequently a different, untraded item.
 */
export async function fetchLivePrices(signal?: AbortSignal): Promise<LivePriceSnapshot> {
  const res = await fetch("/api/prices", { signal });
  if (!res.ok) throw new Error(`Prices HTTP ${res.status}`);
  const json = (await res.json()) as {
    source: LivePriceSnapshot["source"];
    prices: Record<string, number>;
  };
  const prices: PriceMap = {};
  for (const [id, price] of Object.entries(json.prices ?? {})) {
    const numeric = Number(id);
    if (Number.isFinite(numeric) && price > 0) prices[numeric] = price;
  }
  const next: LivePriceSnapshot = {
    prices,
    source: json.source ?? "wiki",
    fetchedAt: new Date().toISOString(),
    count: Object.keys(prices).length,
  };
  setLivePrices(next);
  return next;
}
