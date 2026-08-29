"use client";

import { LoadoutEditor } from "@/components/LoadoutEditor";
import { MonsterPicker } from "@/components/MonsterPicker";
import { PresetBar } from "@/components/PresetBar";
import { getMonsterById } from "@/lib/data";
import { useAppStore } from "@/lib/store/useAppStore";

export default function DpsPage() {
  const { loadouts, monsterId, setMonsterId, addLoadout } = useAppStore();
  const monster = getMonsterById(monsterId);

  if (!monster) {
    return <p className="text-[var(--danger)]">Monster not found in data.</p>;
  }

  return (
    <div className="space-y-4 max-w-6xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">DPS Calculator</h1>
          <p className="text-sm text-[var(--muted)]">
            Multi-setup compare · prayers/pots · player & monster DPS
          </p>
        </div>
        <button
          type="button"
          onClick={addLoadout}
          className="px-3 py-2 rounded-lg bg-[var(--panel)] border border-[var(--border)] text-sm"
        >
          + Add setup
        </button>
      </div>

      <PresetBar />

      <div className="grid lg:grid-cols-[320px_1fr] gap-4">
        <MonsterPicker monsterId={monsterId} onChange={setMonsterId} />
        <div className="space-y-4">
          {loadouts.map((l) => (
            <LoadoutEditor key={l.id} loadout={l} monster={monster} />
          ))}
        </div>
      </div>
    </div>
  );
}
