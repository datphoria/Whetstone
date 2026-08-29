#!/usr/bin/env tsx
/**
 * Refresh Grand Exchange prices without re-running the full Wiki sync.
 *
 * Run: npm run sync:prices
 */
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import {
  applyGePrices,
  fetchGeMapping,
  type LatestRow,
} from "./lib/apply-ge-prices";
import type { EquipmentItem } from "../src/lib/types";

const USER_AGENT =
  "Gearscape2DpsCalc/1.0 (OSRS gear calculator; local-dev; contact: local)";
const LATEST = "https://prices.runescape.wiki/api/v1/osrs/latest";

const DATA_PATHS = [
  join(process.cwd(), "data/game-data.json"),
  join(process.cwd(), "src/lib/data/game-data.json"),
];

async function main() {
  console.log("Fetching GE mapping and latest prices…");
  const [mapping, latest] = await Promise.all([
    fetchGeMapping(USER_AGENT),
    fetch(LATEST, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } }).then(
      async (res) => {
        if (!res.ok) throw new Error(`latest HTTP ${res.status}`);
        return (await res.json()) as { data: Record<string, LatestRow> };
      },
    ),
  ]);

  for (const path of DATA_PATHS) {
    const file = JSON.parse(readFileSync(path, "utf8")) as {
      items: EquipmentItem[];
      componentPrices?: Record<string, number>;
      pricesUpdatedAt?: string;
    };
    const result = applyGePrices(file.items, mapping, latest.data ?? {});
    file.componentPrices = result.componentPrices;
    file.pricesUpdatedAt = result.pricesUpdatedAt;
    writeFileSync(path, JSON.stringify(file, null, 2));
    console.log(
      `Wrote ${path} — ${result.pricedItems} priced, ${result.unpricedItems} without a GE price, ` +
        `${Object.keys(result.componentPrices).length} recipe components.`,
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
