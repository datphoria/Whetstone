import { NextResponse } from "next/server";
import { getComponentPrices, getItems } from "@/lib/data";

/** Prices are keyed by GE item id, which is not always the equipment id. */
function syncedPrices(): Record<string, number> {
  const prices: Record<string, number> = { ...Object.fromEntries(
    Object.entries(getComponentPrices()).map(([id, price]) => [id, price]),
  ) };
  for (const item of getItems()) {
    const geId = item.geItemId ?? item.id;
    if (item.gePrice != null) prices[String(geId)] = item.gePrice;
  }
  return prices;
}

const USER_AGENT =
  "Gearscape2DpsCalc/1.0 (OSRS gear calculator; https://localhost; contact: local)";

let cache: { at: number; prices: Record<string, number> } | null = null;
const TTL_MS = 5 * 60 * 1000;

export async function GET() {
  try {
    if (cache && Date.now() - cache.at < TTL_MS) {
      return NextResponse.json({ source: "cache", prices: cache.prices });
    }

    const res = await fetch("https://prices.runescape.wiki/api/v1/osrs/latest", {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      next: { revalidate: 300 },
    });

    if (!res.ok) {
      return NextResponse.json({ source: "seed", prices: syncedPrices() }, { status: 200 });
    }

    const json = (await res.json()) as {
      data: Record<string, { high?: number | null; low?: number | null }>;
    };
    const prices: Record<string, number> = {};
    for (const [id, row] of Object.entries(json.data ?? {})) {
      const v = row.high ?? row.low;
      if (v != null) prices[id] = v;
    }
    cache = { at: Date.now(), prices };
    return NextResponse.json({ source: "wiki", prices });
  } catch {
    return NextResponse.json({ source: "seed", prices: syncedPrices() });
  }
}
