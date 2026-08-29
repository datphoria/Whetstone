"use client";

import { useEffect, useState } from "react";
import { BankImportPanel } from "@/components/BankImportPanel";
import { MonsterPicker } from "@/components/MonsterPicker";
import { getDataMeta, getMonsterById } from "@/lib/data";
import { officialRequiresSlayerTask } from "@/lib/dps/wikiAdapter";
import type { BestSetupCandidate, SetupPlanEntry, UpgradePath } from "@/lib/optimizer/bestSetup";
import { useBestSetupSearch } from "@/lib/optimizer/useBestSetupSearch";
import { acquisitionLabel } from "@/lib/prices/acquisition";
import { fetchLivePrices, type LivePriceSnapshot } from "@/lib/prices/livePrices";
import { useAppStore, createEmptyLoadout } from "@/lib/store/useAppStore";
import type { AttackType } from "@/lib/types";
import Link from "next/link";

function formatGp(n: number) {
  if (!Number.isFinite(n)) return "—";
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

const KIND_STYLES: Record<string, string> = {
  owned: "border-[var(--border)]",
  buy: "border-[var(--accent-2)]/60",
  craft: "border-[var(--accent-2)]/60",
  earn: "border-[var(--accent)]/50",
  unobtainable: "border-[var(--danger)]/60",
};

function planTooltip(entry: SetupPlanEntry): string {
  const { acquisition } = entry;
  const parts = [acquisitionLabel(acquisition)];
  if (acquisition.kind === "buy" || acquisition.kind === "craft") {
    parts.push(formatGp(acquisition.cost));
  }
  if (acquisition.note) parts.push(acquisition.note);
  for (const step of acquisition.steps) {
    parts.push(
      step.kind === "ge"
        ? `${step.name}: ${step.price != null ? formatGp(step.price) : "no price"}`
        : `${step.name}: earn in game`,
    );
  }
  return parts.join("\n");
}

function GearChips({ plan }: { plan: SetupPlanEntry[] }) {
  return (
    <div className="mt-3 flex flex-wrap gap-2 text-xs">
      {plan.map((entry) => (
        <span
          key={entry.slot}
          title={planTooltip(entry)}
          className={`px-2 py-1 rounded bg-[var(--panel-2)] border ${
            KIND_STYLES[entry.acquisition.kind] ?? KIND_STYLES.owned
          }`}
        >
          {entry.itemName}
          {entry.acquisition.kind === "buy" && (
            <span className="text-[var(--accent-2)]"> {formatGp(entry.acquisition.cost)}</span>
          )}
          {entry.acquisition.kind === "craft" && (
            <span className="text-[var(--accent-2)]"> parts {formatGp(entry.acquisition.cost)}</span>
          )}
          {entry.acquisition.kind === "earn" && <span className="text-[var(--accent)]"> ★</span>}
        </span>
      ))}
    </div>
  );
}

function SetupCard({
  candidate,
  headline,
  onApply,
}: {
  candidate: BestSetupCandidate;
  headline?: string;
  onApply: () => void;
}) {
  const earnCount = candidate.plan.filter(
    (entry) => entry.acquisition.kind === "earn" || entry.acquisition.earnSteps.length > 0,
  ).length;
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-4">
      <div className="flex flex-wrap justify-between gap-2">
        <div>
          <div className="font-semibold capitalize">
            {headline ? `${headline} · ` : ""}
            {candidate.attackType} ({candidate.loadout.combatStyle.replaceAll("_", " ")}) ·{" "}
            {candidate.prayer} · {candidate.potions.join(", ") || "no pot"}
          </div>
          <div className="text-sm text-[var(--muted)]">
            DPS {candidate.dps} · TTK {candidate.ttk}s · Acc {candidate.accuracy}%
            {candidate.purchaseCost > 0 && ` · Spend ${formatGp(candidate.purchaseCost)}`}
            {` · ${candidate.ownedItemsUsed} from bank`}
            {earnCount > 0 && ` · ${earnCount} to earn`}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="px-3 py-1.5 rounded-lg border border-[var(--accent)]/40 text-[var(--accent)] text-sm"
            onClick={onApply}
          >
            Add to DPS calc
          </button>
          <Link href="/dps" className="px-3 py-1.5 rounded-lg border border-[var(--border)] text-sm">
            Open DPS
          </Link>
        </div>
      </div>
      <GearChips plan={candidate.plan} />
      {candidate.loadout.spell && (
        <div className="mt-2 text-xs text-[var(--muted)]">Spell: {candidate.loadout.spell}</div>
      )}
    </div>
  );
}

function UpgradePathCard({ path }: { path: UpgradePath }) {
  if (path.steps.length === 0) return null;
  return (
    <div className="rounded-xl border border-[var(--accent-2)]/40 bg-[var(--panel)] p-4">
      <div className="font-semibold">Upgrade order — cheapest DPS first</div>
      <div className="text-sm text-[var(--muted)]">
        {path.startDps} DPS from your bank ({path.startAttackType}) → {path.endDps} DPS for{" "}
        {formatGp(path.totalCost)}
      </div>
      <ol className="mt-3 space-y-2 text-sm">
        {path.steps.map((step, index) => (
          <li key={`${step.slot}-${step.toItemId}`} className="flex flex-wrap gap-x-2 items-baseline">
            <span className="text-[var(--muted)] w-5">{index + 1}.</span>
            <span className="capitalize text-[var(--muted)] w-16">{step.slot}</span>
            <span>
              {step.fromItemName ?? "empty"} → <span className="font-medium">{step.toItemName}</span>
            </span>
            <span className={step.dpsGain > 0 ? "text-[var(--accent)]" : "text-[var(--muted)]"}>
              {step.dpsGain > 0 ? "+" : ""}
              {step.dpsGain} DPS
            </span>
            <span className="text-[var(--muted)]">
              {step.cost > 0 ? formatGp(step.cost) : acquisitionLabel(step.acquisition)}
            </span>
            {step.acquisition.note && (
              <span className="text-xs text-[var(--muted)]">({step.acquisition.note})</span>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

export default function BestSetupPage() {
  const {
    monsterId,
    setMonsterId,
    budget,
    setBudget,
    accountMode,
    setAccountMode,
    ownedItemIds,
    bankGpStack,
    excludeItemIds,
    setExcludeItemIds,
    applyLoadout,
    loadouts,
  } = useAppStore();
  const monster = getMonsterById(monsterId);
  const [styles, setStyles] = useState<AttackType[]>(["stab", "slash", "crush", "ranged", "magic"]);
  const [findMsg, setFindMsg] = useState("");
  const [includeUntradeables, setIncludeUntradeables] = useState(true);
  const [restrictToOwned, setRestrictToOwned] = useState(false);
  const [onTask, setOnTask] = useState(false);
  const [prices, setPrices] = useState<LivePriceSnapshot | null>(null);
  const [priceError, setPriceError] = useState<string | null>(null);
  const { running, stage, progress, bankResults, results, upgradePath, error, run, cancel } =
    useBestSetupSearch();

  const base = loadouts[0] ?? createEmptyLoadout();
  const meta = getDataMeta();
  const taskRequired = monster ? officialRequiresSlayerTask(monster) : false;

  useEffect(() => {
    setOnTask(loadouts[0]?.onTask ?? false);
  }, [loadouts]);

  useEffect(() => {
    if (taskRequired) setOnTask(true);
  }, [taskRequired]);

  useEffect(() => {
    const controller = new AbortController();
    fetchLivePrices(controller.signal)
      .then(setPrices)
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setPriceError(err instanceof Error ? err.message : String(err));
      });
    return () => controller.abort();
  }, []);

  if (!monster) return null;

  const bankOnly = accountMode === "iron" || restrictToOwned;

  return (
    <div className="space-y-4 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold">Best Setup</h1>
        <p className="text-sm text-[var(--muted)]">
          Import your bank and Gearscape first shows the best setup you can build right now, then what buying or
          unlocking gear would add, ordered by cheapest DPS gain. Tick{" "}
          <span className="text-[var(--text)]">On Slayer task</span> for slayer-only bosses. DPS for every result comes
          from the exact Wiki engine; the full-catalogue search itself is a heuristic beam search.
        </p>
        <p className="text-xs text-[var(--muted)] mt-1">
          GE prices:{" "}
          {prices
            ? `live (${prices.count.toLocaleString()} items, ${prices.source})`
            : priceError
              ? `synced ${meta.pricesUpdatedAt?.slice(0, 10) ?? meta.generatedAt.slice(0, 10)} — live fetch failed (${priceError})`
              : "loading…"}
        </p>
      </div>

      <BankImportPanel />

      <div className="grid lg:grid-cols-2 gap-4">
        <MonsterPicker monsterId={monsterId} onChange={setMonsterId} />
        <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-4 space-y-3">
          <div className="flex gap-2">
            {(["main", "iron"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setAccountMode(m)}
                disabled={running}
                className={`px-3 py-1.5 rounded text-sm capitalize ${
                  accountMode === m
                    ? "bg-[var(--accent)]/20 text-[var(--accent)]"
                    : "bg-[var(--panel-2)] text-[var(--muted)]"
                }`}
              >
                {m === "main" ? "Main (bank + cash)" : "Iron (bank only)"}
              </button>
            ))}
          </div>

          {accountMode === "main" ? (
            <div className="space-y-2">
              <label className="block text-sm space-y-1">
                <span className="text-xs text-[var(--muted)]">
                  Budget (GP)
                  {bankGpStack > 0 ? ` · from bank cash stack` : ""}
                </span>
                <input
                  type="number"
                  value={budget}
                  disabled={running || restrictToOwned}
                  onChange={(e) => setBudget(Number(e.target.value))}
                  className="w-full rounded-lg bg-[var(--bg)] border border-[var(--border)] px-3 py-2"
                />
                {bankGpStack > 0 && budget !== bankGpStack && (
                  <button
                    type="button"
                    className="text-xs text-[var(--accent-2)] underline"
                    disabled={running}
                    onClick={() => setBudget(bankGpStack)}
                  >
                    Reset to bank GP stack
                  </button>
                )}
                <span className="block text-xs text-[var(--muted)]">
                  {ownedItemIds.length > 0
                    ? `${ownedItemIds.length} imported bank items are free to use.`
                    : "Import your bank to see what you can build right now."}
                </span>
              </label>
              <label className="flex items-center gap-2 text-xs text-[var(--muted)]">
                <input
                  type="checkbox"
                  checked={restrictToOwned}
                  disabled={running}
                  onChange={(e) => setRestrictToOwned(e.target.checked)}
                />
                Bank only — never suggest gear I do not own
              </label>
              <label className="flex items-center gap-2 text-xs text-[var(--muted)]">
                <input
                  type="checkbox"
                  checked={includeUntradeables}
                  disabled={running || restrictToOwned}
                  onChange={(e) => setIncludeUntradeables(e.target.checked)}
                />
                Allow gear with in-game steps (fire cape, imbues, Avernic hilt on a dragon defender…)
              </label>
            </div>
          ) : (
            <p className="text-xs text-[var(--muted)]">
              Iron mode uses only items from your imported bank ({ownedItemIds.length} items). Import above if
              empty.
            </p>
          )}

          <div>
            <div className="text-xs text-[var(--muted)] mb-1">Attack styles</div>
            <div className="flex flex-wrap gap-2">
              {(["stab", "slash", "crush", "ranged", "magic"] as AttackType[]).map((t) => {
                const on = styles.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    disabled={running}
                    onClick={() =>
                      setStyles((prev) => (on ? prev.filter((x) => x !== t) : [...prev, t]))
                    }
                    className={`text-xs px-2 py-1 rounded border capitalize ${
                      on
                        ? "border-[var(--accent)] text-[var(--accent)]"
                        : "border-[var(--border)] text-[var(--muted)]"
                    }`}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={onTask}
              disabled={running || taskRequired}
              onChange={(e) => setOnTask(e.target.checked)}
            />
            <span>
              On Slayer task{taskRequired ? " (required for this monster)" : ""}
              <span className="block text-xs text-[var(--muted)]">
                Applies the black mask / slayer helmet multiplier and lets the search pick one.
              </span>
            </span>
          </label>

          <label className="block text-sm space-y-1">
            <span className="text-xs text-[var(--muted)]">Exclude item IDs (comma-separated)</span>
            <input
              value={excludeItemIds.join(",")}
              disabled={running}
              onChange={(e) =>
                setExcludeItemIds(
                  e.target.value
                    .split(",")
                    .map((x) => Number(x.trim()))
                    .filter((n) => Number.isFinite(n) && n > 0),
                )
              }
              className="w-full rounded-lg bg-[var(--bg)] border border-[var(--border)] px-3 py-2 text-sm"
            />
          </label>

          {(findMsg || error) && (
            <p className="text-xs text-[var(--danger)]">{findMsg || error}</p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              disabled={running || styles.length === 0}
              onClick={() => {
                if (bankOnly && ownedItemIds.length === 0) {
                  setFindMsg("Import your bank in the panel above first — bank-only search needs owned items.");
                  return;
                }
                setFindMsg("");
                run(base, monster, {
                  budget,
                  accountMode,
                  includeUntradeables: restrictToOwned ? false : includeUntradeables,
                  restrictToOwned: accountMode === "main" ? restrictToOwned : false,
                  ownedItemIds,
                  excludeItemIds,
                  allowedAttackTypes: styles,
                  onTask,
                  prices: prices?.prices,
                });
              }}
              className="flex-1 py-2.5 rounded-xl bg-[var(--accent)] text-black font-semibold disabled:opacity-50"
            >
              {running ? "Searching…" : "Find setup"}
            </button>
            {running && (
              <button
                type="button"
                onClick={cancel}
                className="px-4 py-2.5 rounded-xl border border-[var(--border)] text-sm"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      </div>

      {running && (
        <div className="rounded-xl border border-[var(--accent)]/40 bg-[var(--panel)] p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="font-medium">
              {stage === "bank" ? "Pass 1 — best from your bank: " : "Pass 2 — best you can obtain: "}
              {progress?.message ?? "Searching…"}
            </span>
            <span className="text-[var(--muted)]">{Math.round(progress?.percent ?? 0)}%</span>
          </div>
          <div className="h-2 rounded-full bg-[var(--panel-2)] overflow-hidden">
            <div
              className="h-full bg-[var(--accent)] transition-[width] duration-200"
              style={{ width: `${Math.max(2, progress?.percent ?? 0)}%` }}
            />
          </div>
        </div>
      )}

      {bankResults.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Best from your bank</h2>
          <p className="text-xs text-[var(--muted)]">
            Nothing here costs GP — every item came from your bank import.
          </p>
          {bankResults.map((r) => (
            <SetupCard
              key={`bank-${r.attackType}-${r.prayer}`}
              candidate={r}
              onApply={() => applyLoadout(r.loadout)}
            />
          ))}
        </section>
      )}

      {results.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">
            {bankResults.length > 0 ? "Best you can obtain" : "Best setup"}
          </h2>
          {results.map((r) => (
            <SetupCard
              key={`target-${r.attackType}-${r.prayer}`}
              candidate={r}
              onApply={() => applyLoadout(r.loadout)}
            />
          ))}
        </section>
      )}

      {upgradePath && <UpgradePathCard path={upgradePath} />}

      {!running && progress?.phase === "done" && results.length === 0 && bankResults.length === 0 && (
        <p className="text-sm text-[var(--muted)]">
          No setups found — check budget, bank import, or enabled styles.
        </p>
      )}
    </div>
  );
}
