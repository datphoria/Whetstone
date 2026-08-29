"use client";

import { getDataMeta } from "@/lib/data";
import { useAppStore } from "@/lib/store/useAppStore";

export default function SettingsPage() {
  const { accountMode, setAccountMode, detailed, setDetailed, budget, setBudget } = useAppStore();
  const meta = getDataMeta();

  return (
    <div className="space-y-4 max-w-xl">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-[var(--muted)]">Preferences stored in your browser.</p>
      </div>
      <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-4 space-y-4">
        <label className="flex items-center justify-between gap-3 text-sm">
          <span>Default account mode</span>
          <select
            value={accountMode}
            onChange={(e) => setAccountMode(e.target.value as "main" | "iron")}
            className="rounded-lg bg-[var(--bg)] border border-[var(--border)] px-3 py-2"
          >
            <option value="main">Main</option>
            <option value="iron">Iron</option>
          </select>
        </label>
        <label className="flex items-center justify-between gap-3 text-sm">
          <span>Detailed equipment stats</span>
          <input
            type="checkbox"
            checked={detailed}
            onChange={(e) => setDetailed(e.target.checked)}
          />
        </label>
        <label className="flex items-center justify-between gap-3 text-sm">
          <span>Default budget (GP)</span>
          <input
            type="number"
            value={budget}
            onChange={(e) => setBudget(Number(e.target.value))}
            className="w-40 rounded-lg bg-[var(--bg)] border border-[var(--border)] px-3 py-2"
          />
        </label>
      </div>
      <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-4 text-sm text-[var(--muted)] space-y-1">
        <div>Data version: {meta.version}</div>
        <div>Generated: {meta.generatedAt}</div>
        <div>GE prices synced: {meta.pricesUpdatedAt ?? "unknown — run npm run sync:prices"}</div>
        <div>
          {meta.itemCount} items · {meta.monsterCount} monsters
        </div>
        <div className="pt-2">
          Refresh prices: <code className="text-[var(--accent-2)]">npm run sync:prices</code> (Best Setup also
          pulls live prices on load)
        </div>
        <div>
          Regenerate seed: <code className="text-[var(--accent-2)]">npm run sync:seed</code>
        </div>
      </div>
    </div>
  );
}
