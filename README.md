# Gearscape 2

OSRS gear DPS calculator inspired by Gearscape feature set, with an upgrade advisor for mains (GE prices) and irons (drop rates).

## Stack

- Next.js (App Router) + TypeScript + React + Tailwind CSS
- Zustand for loadout state
- Recharts for DPS graphs
- Pinned, generated engine from [weirdgloop/osrs-dps-calc](https://github.com/weirdgloop/osrs-dps-calc) (GPL-3.0)

## Features

- **DPS Calculator** — multi-setup compare, equipment grid, prayers/potions/spells, monster targeting, player & monster DPS
- **Best Setup** — two passes: the best setup you can build from your imported bank, then the best you can obtain, plus an upgrade order sorted by DPS per GP. Optional "On Slayer task" scores the slayer helmet; "Bank only" never suggests gear you do not own. Runs in a Web Worker with live progress.
- **DPS Graph** — compare loadouts visually
- **Items / Monsters** — searchable databases
- **Upgrade Advisor** — best ΔDPS upgrade + most cost-effective (GE) or easiest to obtain (drop rates)

## Getting started

```bash
npm install
npm run sync:seed   # generate bundled seed data
npm run sync:reconcile
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Optional live wiki sync (requires network + descriptive User-Agent):

```bash
npm run sync:data
```

`sync:data` fetches calculator equipment IDs from the **pinned** engine revision in
[`src/vendor/osrs-wiki/version.json`](src/vendor/osrs-wiki/version.json), then reconciles
item names/bonuses against that dataset.

```bash
npm run sync:reconcile
```

Update the pinned OSRS Wiki calculation engine and run parity fixtures:

```bash
npm run sync:dps-engine
npm run test:parity
```

## Proving DPS correctness

Combat maths come exclusively from the pinned Wiki calculator engine. Gearscape does **not**
re-implement hit rolls.

| Layer | Command | What it proves |
|-------|---------|----------------|
| Integrity | `npm run test:parity:integrity` | Engine revision pin, equipment bonus reconciliation, sync script does not float on `main` |
| Adapter | `npm run test:parity:adapter` | Upstream fixtures (CombatCalc / BasicRolls / GeneratedTests / DamageTaken) match through native engine **and** Gearscape loadouts; strict mode rejects bad IDs |
| Optimizer | `npm run test:parity:optimizer` | Controlled pools match exhaustive search; iron/bank/2H rules; on-task slayer helmet; upgrade path covers every changed slot; Araxxor regression forbids greegrees/junk |
| Pricing | `npm run test:parity:pricing` | Every price traces to a mapped GE id; charged gear priced from its tradeable form; craft recipes priced from parts; owned items free |
| All | `npm run test:parity` | Full suite |

Fixtures live in [`tests/parity/fixtures/upstream.json`](tests/parity/fixtures/upstream.json) and record the upstream test name plus the pinned SHA. Tolerances match upstream: DPS to 3 dp, accuracy to 2 dp.

### What is / is not guaranteed

- **Guaranteed:** for a given loadout + monster, DPS / max hit / accuracy match the pinned Wiki calculator (within tolerances above).
- **Guaranteed on tiny test pools:** Best Setup finds the exact best gear combination (`exhaustive: true`).
- **Heuristic on the full catalogue:** Best Setup uses shortlisting + beam search. The DPS printed for each result is still exact; the search may miss a globally better combination. The UI labels this accordingly.
- **Not covered by fixtures:** every niche special attack / ToA invocation permutation — expand `upstream.json` when upgrading the engine pin.

### Prices and obtainability

Equipment ids are frequently **not** GE ids: charged, imbued and ornament variants each have
their own equipment id while only one form is traded. Every item therefore carries a `geItemId`
resolved at sync time, and prices are only ever read through it — a charged Scythe of vitur is
priced as the tradeable uncharged scythe, not left on a hand-written guess.

Untradeable gear falls into two groups, described in [`src/lib/prices/recipes.ts`](src/lib/prices/recipes.ts):

- **Craftable from tradeable parts** — Avernic defender (hilt + dragon defender), Ferocious gloves
  (hydra leather), Neitiznot faceguard (basilisk jaw), imbued rings. Costed from part prices.
- **Earned only** — Infernal cape, Fighter torso, Barrows gloves. Reported as "earn in game" and
  only considered when "Allow gear with in-game steps" is on.

```bash
npm run sync:prices   # refresh GE prices + component prices only (fast, no Bucket queries)
```

Best Setup also pulls live prices from `/api/prices` on load and passes them into the search, so
results do not depend on when the data was last synced.

Reproduce a single failing fixture by reading its `id` / `source` in the JSON and comparing against the upstream test at that revision:

`https://github.com/weirdgloop/osrs-dps-calc/tree/<revision>/src/tests`

## Data sources

- Item / monster stats: [OSRS Wiki Bucket API](https://oldschool.runescape.wiki/w/RuneScape:Bucket)
- GE prices: [Wiki Real-time Prices](https://oldschool.runescape.wiki/w/RuneScape:Real-time_Prices)
- Drop sources: Wiki `dropsline` bucket
- Hiscores import: [Wise Old Man](https://wiseoldman.net/) / Jagex Hiscores

## License

GPL-3.0-or-later. See [LICENSE](LICENSE) and [NOTICE](NOTICE).

RuneScape and Old School RuneScape are trademarks of Jagex Limited. This project is not affiliated with Jagex or GearScape.
