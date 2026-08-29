"use client";

import { useMemo, useState } from "react";
import { searchItems } from "@/lib/data";

function formatGp(n: number | null | undefined) {
  if (n == null) return "—";
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export default function ItemsPage() {
  const [q, setQ] = useState("");
  const items = useMemo(() => searchItems(q), [q]);

  return (
    <div className="space-y-4 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold">Items</h1>
        <p className="text-sm text-[var(--muted)]">{items.length} equipment pieces</p>
      </div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search items…"
        className="w-full max-w-md rounded-lg bg-[var(--panel)] border border-[var(--border)] px-3 py-2"
      />
      <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
        <table className="w-full text-sm">
          <thead className="bg-[var(--panel)] text-[var(--muted)] text-left">
            <tr>
              <th className="p-3">Name</th>
              <th className="p-3">Slot</th>
              <th className="p-3">Str</th>
              <th className="p-3">RAtk</th>
              <th className="p-3">MAtk</th>
              <th className="p-3">GE</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-t border-[var(--border)] hover:bg-[var(--panel-2)]">
                <td className="p-3 font-medium">{item.name}</td>
                <td className="p-3 capitalize text-[var(--muted)]">{item.slot}</td>
                <td className="p-3 tabular-nums">{item.bonuses.strength}</td>
                <td className="p-3 tabular-nums">{item.bonuses.rangedAttack}</td>
                <td className="p-3 tabular-nums">{item.bonuses.magicAttack}</td>
                <td className="p-3 tabular-nums">{formatGp(item.gePrice)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
