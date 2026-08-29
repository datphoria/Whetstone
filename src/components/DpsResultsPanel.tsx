"use client";

import type { DpsResult, MonsterDpsResult } from "@/lib/types";

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-[var(--bg)] border border-[var(--border)] px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-[var(--muted)]">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

export function DpsResultsPanel({
  player,
  monster,
  mode,
}: {
  player: DpsResult;
  monster?: MonsterDpsResult | null;
  mode: "player" | "monster";
}) {
  if (mode === "monster" && monster) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Stat label="Monster DPS" value={monster.dps} />
        <Stat label="Max Hit" value={monster.maxHit} />
        <Stat label="Accuracy" value={`${monster.accuracy}%`} />
        <Stat label="Avg Hit" value={monster.avgHit} />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
      <Stat label="DPS" value={player.dps} />
      <Stat label="Max Hit" value={player.maxHit} />
      <Stat label="Accuracy" value={`${player.accuracy}%`} />
      <Stat label="Avg Hit" value={player.avgHit} />
      <Stat label="TTK" value={`${player.ttk}s`} />
      <Stat label="Attack speed" value={`${player.attackSpeed} ticks`} />
    </div>
  );
}
