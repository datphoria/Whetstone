#!/usr/bin/env tsx
/**
 * Offline pass over game-data.json that aligns item metadata with the pinned
 * calculator dataset. Safe to re-run; no network access required.
 *
 * Run: npm run sync:reconcile
 */
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { reconcileItems } from "./lib/reconcile-equipment";
import type { EquipmentItem } from "../src/lib/types";

const TARGETS = ["data/game-data.json", "src/lib/data/game-data.json"];

function main() {
  const source = join(process.cwd(), TARGETS[1]);
  const data = JSON.parse(readFileSync(source, "utf8")) as {
    items: EquipmentItem[];
    [key: string]: unknown;
  };

  const { items, stats } = reconcileItems(data.items);
  data.items = items;

  for (const target of TARGETS) {
    writeFileSync(join(process.cwd(), target), JSON.stringify(data, null, 2));
  }

  console.log(
    `Reconciled ${stats.matched}/${stats.total} items against the calculator dataset ` +
      `(${stats.renamed} renamed, ${stats.viaCanonicalId} via canonical id, ` +
      `${stats.unsupported} unsupported and excluded from the optimizer).`,
  );
}

main();
