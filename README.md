# Whetstone

OSRS DPS calculator, setup optimizer, and upgrade advisor for mains (GE prices) and irons (drop rates).

## Stack

- Next.js (App Router) + TypeScript + React + Tailwind CSS
- Zustand for loadout state
- Recharts for DPS graphs
- Pinned, generated engine from [weirdgloop/osrs-dps-calc](https://github.com/weirdgloop/osrs-dps-calc) (GPL-3.0)

## Features

- **DPS Calculator** — multi-setup compare, equipment grid, prayers/potions/spells, monster targeting, player & monster DPS
- **Best Setup** — bank-first setups, affordable buys, and near-budget stretch goals, plus an upgrade order sorted by DPS per GP. Optional "On Slayer task" scores the slayer helmet; "Bank only" never suggests gear you do not own. Runs in a Web Worker with live progress.
- **DPS Graph** — compare loadouts visually
- **Items / Monsters** — searchable databases
- **Upgrade Advisor** — best ΔDPS upgrade + most cost-effective (GE) or easiest to obtain (drop rates), including close-to-affordable stretch upgrades

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

## Parity testing

Update the pinned OSRS Wiki calculation engine and run parity fixtures:

```bash
npm run sync:dps-engine
npm run test:parity
```

Combat maths come exclusively from the pinned Wiki calculator engine. Whetstone does **not**
reimplement combat formulas.

| Layer | Command | What it proves |
| --- | --- | --- |
| Integrity | `npm run test:parity:integrity` | Engine revision pin, equipment bonus reconciliation, sync script does not float on `main` |
| Adapter | `npm run test:parity:adapter` | Upstream fixtures (CombatCalc / BasicRolls / GeneratedTests / DamageTaken) match through native engine **and** Whetstone loadouts; strict mode rejects bad IDs |
| Optimizer | `npm run test:parity:optimizer` | Controlled pools match exhaustive search; iron/bank/2H rules; on-task slayer helmet; upgrade path covers every changed slot; Araxxor regression forbids greegrees/junk |
| Pricing | `npm run test:parity:pricing` | Every price traces to a mapped GE id; charged gear priced from its tradeable form; craft recipes priced from parts; owned items free |
| All | `npm run test:parity` | Full suite |

Fixtures live in [`tests/parity/fixtures/upstream.json`](tests/parity/fixtures/upstream.json) and record the upstream test name plus the pinned SHA. Tolerances match upstream: DPS to 3 dp, accuracy to 2 dp.

### Guarantees

- **Guaranteed:** for a given loadout + monster, DPS / max hit / accuracy match the pinned Wiki calculator (within tolerances above).
- **Guaranteed on tiny test pools:** Best Setup finds the exact best gear combination (`exhaustive: true`).
- **Heuristic on the full catalogue:** Best Setup uses shortlisting + beam search. The DPS printed for each result is still exact; the search may miss a globally better combination. The UI labels this accordingly.

## License

GPL-3.0-or-later. See [LICENSE](LICENSE) and [NOTICE](NOTICE).

## Data sources

- Item / monster stats: [OSRS Wiki Bucket API](https://oldschool.runescape.wiki/w/RuneScape:Bucket)
- GE prices: [Wiki Real-time Prices](https://oldschool.runescape.wiki/w/RuneScape:Real-time_Prices)
- Drop sources: Wiki `dropsline` bucket
