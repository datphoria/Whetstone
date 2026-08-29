import { baseItemName } from "@/lib/prices/geResolve";

/**
 * Untradeable gear that is still obtainable by buying tradeable parts. Without
 * this the optimizer either treats such items as free (nonsense: it would hand
 * you an Avernic defender you have never touched) or as impossible (also wrong:
 * the hilt is on the GE for ~28M).
 *
 * `kind: "ge"` parts are bought and priced. `kind: "earn"` parts must be
 * obtained in game and are reported to the user rather than priced.
 */
export interface RecipePart {
  name: string;
  /** GE item id for buyable parts. */
  geItemId?: number;
  quantity?: number;
  kind: "ge" | "earn";
}

export interface Recipe {
  /** Matched against the item name with charge/repair suffixes stripped. */
  match: RegExp;
  parts: RecipePart[];
  note: string;
}

export const RECIPES: Recipe[] = [
  {
    match: /^avernic defender$/i,
    parts: [
      { name: "Avernic defender hilt", geItemId: 22477, kind: "ge" },
      { name: "Dragon defender (Warriors' Guild)", kind: "earn" },
    ],
    note: "Buy the hilt and attach it to a Dragon defender",
  },
  {
    match: /^ferocious gloves$/i,
    parts: [{ name: "Hydra leather", geItemId: 22983, kind: "ge" }],
    note: "Craft from hydra leather at Lithkren Vault (Dragon Slayer II)",
  },
  {
    match: /^neitiznot faceguard$/i,
    parts: [
      { name: "Helm of neitiznot", geItemId: 10828, kind: "ge" },
      { name: "Basilisk jaw", geItemId: 24268, kind: "ge" },
    ],
    note: "Attach a basilisk jaw to a helm of neitiznot",
  },
  {
    match: /^abyssal tentacle$/i,
    parts: [
      { name: "Abyssal whip", geItemId: 4151, kind: "ge" },
      { name: "Kraken tentacle", geItemId: 12004, kind: "ge" },
    ],
    note: "Attach a kraken tentacle to an abyssal whip",
  },
  {
    match: /^volatile nightmare staff$/i,
    parts: [
      { name: "Nightmare staff", geItemId: 24422, kind: "ge" },
      { name: "Volatile orb", geItemId: 24514, kind: "ge" },
    ],
    note: "Attach a volatile orb to a nightmare staff",
  },
  {
    match: /^harmonised nightmare staff$/i,
    parts: [
      { name: "Nightmare staff", geItemId: 24422, kind: "ge" },
      { name: "Harmonised orb", geItemId: 24511, kind: "ge" },
    ],
    note: "Attach a harmonised orb to a nightmare staff",
  },
  {
    match: /^eldritch nightmare staff$/i,
    parts: [
      { name: "Nightmare staff", geItemId: 24422, kind: "ge" },
      { name: "Eldritch orb", geItemId: 24517, kind: "ge" },
    ],
    note: "Attach an eldritch orb to a nightmare staff",
  },
  {
    match: /^amulet of blood fury$/i,
    parts: [
      { name: "Amulet of fury", geItemId: 6585, kind: "ge" },
      { name: "Blood shard", geItemId: 24777, kind: "ge" },
    ],
    note: "Attach a blood shard to an amulet of fury",
  },
  {
    match: /^slayer helmet$/i,
    parts: [
      { name: "Black mask", geItemId: 8921, kind: "ge" },
      { name: "Spiny helmet", geItemId: 4551, kind: "ge" },
      { name: "Facemask", geItemId: 4164, kind: "ge" },
      { name: "Earmuffs", geItemId: 4166, kind: "ge" },
      { name: "Nose peg", geItemId: 4168, kind: "ge" },
      { name: "Enchanted gem (Slayer master)", kind: "earn" },
    ],
    note: "Craft from a black mask and slayer helmet parts (55 Crafting)",
  },
  {
    match: /^slayer helmet \(i\)$/i,
    parts: [
      { name: "Black mask", geItemId: 8921, kind: "ge" },
      { name: "Spiny helmet", geItemId: 4551, kind: "ge" },
      { name: "Facemask", geItemId: 4164, kind: "ge" },
      { name: "Earmuffs", geItemId: 4166, kind: "ge" },
      { name: "Nose peg", geItemId: 4168, kind: "ge" },
      { name: "Enchanted gem (Slayer master)", kind: "earn" },
      { name: "Imbue (Nightmare Zone or Soul Wars)", kind: "earn" },
    ],
    note: "Craft a slayer helmet, then imbue it at Nightmare Zone or Soul Wars",
  },
  {
    match: /^tome of fire$/i,
    parts: [{ name: "Tome of fire (empty)", geItemId: 20716, kind: "ge" }],
    note: "Buy an empty tome and charge it with burnt pages",
  },
  {
    match: /^tome of water$/i,
    parts: [{ name: "Tome of water (empty)", geItemId: 25576, kind: "ge" }],
    note: "Buy an empty tome and charge it with soaked pages",
  },
  {
    match: /^trident of the swamp$/i,
    parts: [{ name: "Uncharged toxic trident", geItemId: 12900, kind: "ge" }],
    note: "Buy an uncharged toxic trident and charge it",
  },
  {
    match: /^trident of the seas$/i,
    parts: [{ name: "Uncharged trident", geItemId: 11908, kind: "ge" }],
    note: "Buy an uncharged trident and charge it",
  },
];

/**
 * Imbued jewellery keeps the base item's name plus "(i)". The base is bought on
 * the GE and the imbue is earned, so these are handled generically rather than
 * with one recipe per ring.
 */
export function imbuedBaseName(name: string): string | null {
  const match = /^(.*) \(i\)$/i.exec(baseItemName(name));
  return match ? match[1].trim() : null;
}

export function recipeFor(item: { name: string }): Recipe | null {
  const bare = baseItemName(item.name);
  return RECIPES.find((recipe) => recipe.match.test(bare)) ?? null;
}
