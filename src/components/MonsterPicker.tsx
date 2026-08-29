"use client";

import {
  getMonsterById,
  getMonsterGroups,
  getMonsters,
  getPrimaryMonster,
  getMonsterVariants,
} from "@/lib/data";
import { useMemo, useState } from "react";

interface Props {
  monsterId: string;
  onChange: (id: string) => void;
}

export function MonsterPicker({ monsterId, onChange }: Props) {
  const [tab, setTab] = useState<"monsters" | "groups" | "custom">("monsters");
  const [query, setQuery] = useState("");
  const groups = getMonsterGroups();
  const [selectedGroup, setSelectedGroup] = useState(groups[0] ?? "Other");
  const monsters = useMemo(() => {
    const q = query.trim().toLowerCase();
    return getMonsters().filter(
      (m) => !q || m.name.toLowerCase().includes(q) || m.group?.toLowerCase().includes(q),
    );
  }, [query]);

  const selected = getMonsterById(monsterId);
  const selectedPrimary = selected ? getPrimaryMonster(selected) : undefined;
  const primaryId = selectedPrimary?.id ?? selected?.id ?? monsterId;
  const visibleMonsters =
    selectedPrimary && !monsters.some((m) => m.id === selectedPrimary.id)
      ? [selectedPrimary, ...monsters]
      : monsters;
  const variants = selected ? getMonsterVariants(selected) : [];
  const groupedMonsters = useMemo(
    () => getMonsters().filter((m) => m.group === selectedGroup),
    [selectedGroup],
  );

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-3 space-y-3">
      <div className="flex gap-2 text-xs">
        {(["monsters", "groups", "custom"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 rounded-md capitalize ${
              tab === t
                ? "bg-[var(--accent)]/20 text-[var(--accent)] border border-[var(--accent)]/40"
                : "bg-[var(--panel-2)] text-[var(--muted)]"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "monsters" && (
        <>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${getMonsters().length.toLocaleString()} Wiki monsters…`}
            className="w-full rounded-lg bg-[var(--bg)] border border-[var(--border)] px-3 py-2 text-sm"
          />
          <div className="text-[11px] text-[var(--muted)]">
            {monsters.length.toLocaleString()} result{monsters.length === 1 ? "" : "s"} · OSRS Wiki
            variants included
          </div>
          <select
            value={primaryId}
            onChange={(e) => onChange(e.target.value)}
            className="w-full rounded-lg bg-[var(--bg)] border border-[var(--border)] px-3 py-2 text-sm"
          >
            {visibleMonsters.map((m) => (
              <option key={m.id} value={m.id}>
                {m.baseName ?? m.name} (lvl {m.combatLevel})
              </option>
            ))}
          </select>
          {variants.length > 1 && (
            <label className="block text-xs text-[var(--muted)]">
              Combat variant / state
              <select
                value={
                  variants.some((variant) => variant.id === monsterId)
                    ? monsterId
                    : variants[0].id
                }
                onChange={(e) => onChange(e.target.value)}
                className="mt-1 w-full rounded-lg bg-[var(--bg)] border border-[var(--border)] px-3 py-2 text-sm text-[var(--text)]"
              >
                {variants.map((variant) => (
                  <option key={variant.id} value={variant.id}>
                    {variant.version ?? "Standard"}
                    {variant.isDefaultVariant ? " (default)" : ""} · lvl{" "}
                    {variant.combatLevel} · {variant.hitpoints} HP
                  </option>
                ))}
              </select>
            </label>
          )}
        </>
      )}

      {tab === "groups" && (
        <div className="space-y-2">
          <label className="block text-xs text-[var(--muted)]">
            Wiki / Slayer category
            <select
              value={selectedGroup}
              onChange={(e) => setSelectedGroup(e.target.value)}
              className="mt-1 w-full rounded-lg bg-[var(--bg)] border border-[var(--border)] px-3 py-2 text-sm text-[var(--text)]"
            >
              {groups.map((group) => (
                <option key={group} value={group}>
                  {group} ({getMonsters().filter((m) => m.group === group).length})
                </option>
              ))}
            </select>
          </label>
          <select
            value={groupedMonsters.some((m) => m.id === monsterId) ? monsterId : ""}
            onChange={(e) => e.target.value && onChange(e.target.value)}
            className="w-full rounded-lg bg-[var(--bg)] border border-[var(--border)] px-3 py-2 text-sm"
          >
            <option value="">Choose from {groupedMonsters.length.toLocaleString()} monsters…</option>
            {groupedMonsters.map((monster) => (
              <option key={monster.id} value={monster.id}>
                {monster.baseName ?? monster.name} (lvl {monster.combatLevel})
              </option>
            ))}
          </select>
        </div>
      )}

      {tab === "custom" && selected && (
        <div className="text-xs text-[var(--muted)] space-y-1">
          <p>Using selected monster as custom baseline (edit via seed/sync for full custom NPCs).</p>
          <p>
            HP {selected.hitpoints} · Def {selected.defence} · Stab/Slash/Crush{" "}
            {selected.stabDefence}/{selected.slashDefence}/{selected.crushDefence}
          </p>
        </div>
      )}

      {selected && (
        <div className="text-sm border-t border-[var(--border)] pt-2">
          <div className="font-semibold">{selected.name}</div>
          <div className="text-xs text-[var(--muted)]">
            Combat {selected.combatLevel} · HP {selected.hitpoints} · Size {selected.size ?? 1}
            {selected.attributes?.length ? ` · ${selected.attributes.join(", ")}` : ""}
          </div>
          {selected.wikiName && (
            <a
              href={`https://oldschool.runescape.wiki/w/${encodeURIComponent(
                selected.wikiName.replace(/ /g, "_"),
              )}`}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-[var(--accent-2)] hover:underline"
            >
              Open OSRS Wiki page
            </a>
          )}
        </div>
      )}
    </div>
  );
}
