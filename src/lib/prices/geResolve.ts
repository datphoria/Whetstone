/**
 * Equipment ids from the Wiki calculator dataset frequently are not the ids
 * traded on the Grand Exchange: charged weapons, imbued jewellery and ornament
 * variants each have their own equipment id while only one variant is tradeable.
 * Pricing an item by its equipment id therefore silently yields no price (or a
 * stale hand-written one), which is how "Scythe of vitur (Charged)" ended up
 * costing 90M instead of the 1.18B uncharged scythe.
 *
 * These helpers map an equipment item onto the GE id that actually has a price.
 * They are pure so the sync script and the app can share them.
 */

/** Strip variant suffixes that describe charge/repair state rather than a different item. */
export function baseItemName(name: string): string {
  return name
    .replace(/\s*\((?:normal|charged|active|restored|full)\)\s*$/i, "")
    .trim();
}

/**
 * Names to try, in priority order, when the equipment id itself is not traded.
 * Charged gear is bought in its uncharged/empty/inactive form.
 */
export function geNameCandidates(name: string): string[] {
  const base = baseItemName(name);
  const candidates = [name, base];
  if (base !== name || /\((?:charged|active|restored)\)/i.test(name)) {
    candidates.push(
      `${base} (uncharged)`,
      `${base} (empty)`,
      `${base} (inactive)`,
      `${base} (u)`,
    );
  }
  return [...new Set(candidates)];
}

export interface GeMappingRow {
  id: number;
  name: string;
}

export interface GeResolveIndex {
  byId: Map<number, GeMappingRow>;
  byName: Map<string, GeMappingRow>;
  hasPrice: (id: number) => boolean;
}

export function buildGeResolveIndex(
  mapping: GeMappingRow[],
  hasPrice: (id: number) => boolean,
): GeResolveIndex {
  const byId = new Map<number, GeMappingRow>();
  const byName = new Map<string, GeMappingRow>();
  for (const row of mapping) {
    byId.set(row.id, row);
    // Keep the first mapping entry for a name; later duplicates are usually
    // placeholder or historical rows.
    const key = row.name.trim().toLowerCase();
    if (!byName.has(key)) byName.set(key, row);
  }
  return { byId, byName, hasPrice };
}

/**
 * Resolve the GE id to price an equipment item with, or null when the item is
 * genuinely not traded (in which case it must be earned or crafted).
 */
export function resolveGeItemId(
  item: { id: number; name: string },
  index: GeResolveIndex,
): number | null {
  if (index.byId.has(item.id) && index.hasPrice(item.id)) return item.id;
  for (const candidate of geNameCandidates(item.name)) {
    const row = index.byName.get(candidate.trim().toLowerCase());
    if (row && index.hasPrice(row.id)) return row.id;
  }
  // Traded but with no active offers: still the right id to watch.
  if (index.byId.has(item.id)) return item.id;
  for (const candidate of geNameCandidates(item.name)) {
    const row = index.byName.get(candidate.trim().toLowerCase());
    if (row) return row.id;
  }
  return null;
}
