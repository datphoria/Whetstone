"use client";

import { useMemo, useState } from "react";
import { getMonsterVariants, searchMonsters } from "@/lib/data";

export default function MonstersPage() {
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(100);
  const monsters = useMemo(() => searchMonsters(q), [q]);
  const visible = monsters.slice(0, limit);

  return (
    <div className="space-y-4 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold">Monsters</h1>
        <p className="text-sm text-[var(--muted)]">
          {monsters.length.toLocaleString()} OSRS Wiki monster variants
        </p>
      </div>
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setLimit(100);
        }}
        placeholder="Search every boss, monster, or Slayer category…"
        className="w-full max-w-md rounded-lg bg-[var(--panel)] border border-[var(--border)] px-3 py-2"
      />
      <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
        <table className="w-full text-sm">
          <thead className="bg-[var(--panel)] text-[var(--muted)] text-left">
            <tr>
              <th className="p-3">Name</th>
              <th className="p-3">Group</th>
              <th className="p-3">Combat</th>
              <th className="p-3">HP</th>
              <th className="p-3">Def</th>
              <th className="p-3">Slash def</th>
              <th className="p-3">Mage def</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((m) => (
              <tr key={m.id} className="border-t border-[var(--border)] hover:bg-[var(--panel-2)]">
                <td className="p-3 font-medium">
                  {m.wikiName ? (
                    <a
                      href={`https://oldschool.runescape.wiki/w/${encodeURIComponent(
                        m.wikiName.replace(/ /g, "_"),
                      )}`}
                      target="_blank"
                      rel="noreferrer"
                      className="hover:text-[var(--accent-2)] hover:underline"
                    >
                      {m.baseName ?? m.name}
                    </a>
                  ) : (
                    m.baseName ?? m.name
                  )}
                  {getMonsterVariants(m).length > 1 && (
                    <span className="ml-2 text-[10px] font-normal text-[var(--muted)]">
                      {getMonsterVariants(m).length} variants
                    </span>
                  )}
                </td>
                <td className="p-3 text-[var(--muted)]">{m.group ?? "—"}</td>
                <td className="p-3 tabular-nums">{m.combatLevel}</td>
                <td className="p-3 tabular-nums">{m.hitpoints}</td>
                <td className="p-3 tabular-nums">{m.defence}</td>
                <td className="p-3 tabular-nums">{m.slashDefence}</td>
                <td className="p-3 tabular-nums">{m.magicDefence}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {visible.length < monsters.length && (
        <button
          type="button"
          onClick={() => setLimit((current) => current + 250)}
          className="rounded-lg border border-[var(--border)] bg-[var(--panel)] px-4 py-2 text-sm"
        >
          Show 250 more ({(monsters.length - visible.length).toLocaleString()} remaining)
        </button>
      )}
    </div>
  );
}
