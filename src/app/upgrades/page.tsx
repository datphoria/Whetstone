"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { MonsterPicker } from "@/components/MonsterPicker";
import { getMonsterById } from "@/lib/data";
import { acquisitionLabel } from "@/lib/prices/acquisition";
import { suggestUpgrades } from "@/lib/upgrades/suggest";
import { useAppStore } from "@/lib/store/useAppStore";
import type { UpgradeSuggestion } from "@/lib/upgrades/suggest";

function formatGp(n: number | null) {
  if (n == null) return "—";
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function UpgradeCard({
  title,
  items,
  mode,
  onApply,
}: {
  title: string;
  items: UpgradeSuggestion[];
  mode: "main" | "iron";
  onApply: (u: UpgradeSuggestion) => void;
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-4 space-y-3">
      <h2 className="font-semibold text-[var(--accent)]">{title}</h2>
      {items.length === 0 && (
        <p className="text-sm text-[var(--muted)]">No upgrades found for this loadout.</p>
      )}
      {items.map((u) => (
        <div
          key={`${u.slot}-${u.upgradeItem.id}-${u.kind}`}
          className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)] p-3"
        >
          <div className="flex flex-wrap justify-between gap-2">
            <div>
              <div className="font-medium">
                <span className="capitalize text-[var(--muted)]">{u.slot}:</span>{" "}
                {u.currentItem?.name ?? "Empty"} → {u.upgradeItem.name}
              </div>
              <div className="text-xs text-[var(--muted)] mt-1">
                ΔDPS +{u.deltaDps.toFixed(3)} ({u.currentDps.toFixed(3)} → {u.newDps.toFixed(3)})
              </div>
              {mode === "main" ? (
                <div className="text-xs text-[var(--muted)]">
                  {acquisitionLabel(u.acquisition)} {formatGp(u.gePrice)}
                  {u.dpsPerGp != null && (
                    <> · {u.dpsPerGp.toExponential(2)} DPS/GP</>
                  )}
                  {u.acquisition.note && <> · {u.acquisition.note}</>}
                </div>
              ) : (
                <div className="text-xs text-[var(--muted)]">
                  {u.easiestDrop ? (
                    <>
                      Easiest: {u.easiestDrop.monsterName} 1/{u.easiestDrop.rarity} (~
                      {u.easiestDrop.rarity} KC)
                    </>
                  ) : (
                    "No drop source in seed data"
                  )}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => onApply(u)}
              className="px-3 py-1.5 h-fit rounded-lg border border-[var(--accent)]/40 text-[var(--accent)] text-sm"
            >
              Apply
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function UpgradesPage() {
  const {
    loadouts,
    activeLoadoutId,
    setActiveLoadout,
    monsterId,
    setMonsterId,
    accountMode,
    setAccountMode,
    budget,
    setBudget,
    ownedItemIds,
    setEquipmentSlot,
  } = useAppStore();
  const [ready, setReady] = useState(true);
  const monster = getMonsterById(monsterId);
  const loadout = loadouts.find((l) => l.id === activeLoadoutId) ?? loadouts[0];

  const suggestions = useMemo(() => {
    if (!monster || !loadout || !ready) return { best: [], valueOrEase: [] };
    return suggestUpgrades(loadout, monster, accountMode, {
      budget: accountMode === "main" ? budget : undefined,
      ownedItemIds: accountMode === "iron" ? ownedItemIds : undefined,
    });
  }, [monster, loadout, accountMode, budget, ownedItemIds, ready]);

  if (!monster || !loadout) return null;

  return (
    <div className="space-y-4 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold">Upgrade Advisor</h1>
        <p className="text-sm text-[var(--muted)]">
          Best DPS upgrade and most cost-effective (mains) or easiest to obtain (irons),
          scored with the DPS calculator.
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <MonsterPicker monsterId={monsterId} onChange={setMonsterId} />
        <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-4 space-y-3">
          <div className="flex gap-2">
            {(["main", "iron"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setAccountMode(m)}
                className={`px-3 py-1.5 rounded text-sm capitalize ${
                  accountMode === m
                    ? "bg-[var(--accent)]/20 text-[var(--accent)]"
                    : "bg-[var(--panel-2)] text-[var(--muted)]"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
          <label className="block text-sm space-y-1">
            <span className="text-xs text-[var(--muted)]">Loadout</span>
            <select
              value={loadout.id}
              onChange={(e) => setActiveLoadout(e.target.value)}
              className="w-full rounded-lg bg-[var(--bg)] border border-[var(--border)] px-3 py-2"
            >
              {loadouts.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
          {accountMode === "main" && (
            <label className="block text-sm space-y-1">
              <span className="text-xs text-[var(--muted)]">Max upgrade budget (GP)</span>
              <input
                type="number"
                value={budget}
                onChange={(e) => setBudget(Number(e.target.value))}
                className="w-full rounded-lg bg-[var(--bg)] border border-[var(--border)] px-3 py-2"
              />
            </label>
          )}
          <p className="text-xs text-[var(--muted)]">
            Tip: build your current gear on the{" "}
            <Link href="/dps" className="text-[var(--accent-2)]">
              DPS Calculator
            </Link>{" "}
            first. Irons: import a bank on Best Setup so owned items are filtered out of suggestions.
          </p>
          <button
            type="button"
            onClick={() => setReady((r) => !r)}
            className="hidden"
            aria-hidden
          />
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <UpgradeCard
          title="Best upgrade (max ΔDPS)"
          items={suggestions.best}
          mode={accountMode}
          onApply={(u) => setEquipmentSlot(loadout.id, u.slot, u.upgradeItem.id)}
        />
        <UpgradeCard
          title={
            accountMode === "main"
              ? "Most cost-effective (ΔDPS / GP)"
              : "Easiest to obtain (drop rate)"
          }
          items={suggestions.valueOrEase}
          mode={accountMode}
          onApply={(u) => setEquipmentSlot(loadout.id, u.slot, u.upgradeItem.id)}
        />
      </div>
    </div>
  );
}
