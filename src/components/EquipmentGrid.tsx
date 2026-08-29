"use client";

import { getItemById, getItemsBySlot } from "@/lib/data";
import type { EquipmentSlot, LoadoutEquipment } from "@/lib/types";
import { EQUIPMENT_SLOTS } from "@/lib/types";

const SLOT_LABEL: Record<EquipmentSlot, string> = {
  head: "Head",
  cape: "Cape",
  neck: "Neck",
  ammo: "Ammo",
  weapon: "Weapon",
  body: "Body",
  shield: "Shield",
  legs: "Legs",
  hands: "Hands",
  feet: "Feet",
  ring: "Ring",
};

interface Props {
  equipment: LoadoutEquipment;
  onChange: (slot: EquipmentSlot, itemId: number | null) => void;
  detailed?: boolean;
}

function formatGp(n: number | null | undefined) {
  if (n == null) return "—";
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function EquipmentGrid({ equipment, onChange, detailed }: Props) {
  return (
    <div className="grid grid-cols-3 gap-2 max-w-md">
      {EQUIPMENT_SLOTS.map((slot) => {
        const selected = equipment[slot] ?? null;
        const item = getItemById(selected);
        const options = getItemsBySlot(slot);
        const label = item?.name ?? (selected ? `Unknown item (#${selected})` : "Empty");
        return (
          <label
            key={slot}
            className="flex flex-col gap-1 rounded-lg border border-[var(--border)] bg-[var(--panel-2)] p-2"
          >
            <span className="text-[10px] uppercase tracking-wide text-[var(--muted)]">
              {SLOT_LABEL[slot]}
            </span>
            <select
              className="w-full rounded bg-[var(--bg)] border border-[var(--border)] px-2 py-1.5 text-xs"
              value={selected ?? ""}
              onChange={(e) =>
                onChange(slot, e.target.value ? Number(e.target.value) : null)
              }
            >
              <option value="">{label === "Empty" ? "Empty" : label}</option>
              {selected && !item && (
                <option value={selected}>{label}</option>
              )}
              {options.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.name}
                </option>
              ))}
            </select>
            {selected && !item && (
              <span className="text-[10px] text-[var(--danger)]">
                Item #{selected} not in DB — stats won&apos;t apply until data sync expands items.
              </span>
            )}
            {detailed && item && (
              <span className="text-[10px] text-[var(--muted)]">
                Str {item.bonuses.strength} · RAtk {item.bonuses.rangedAttack} ·{" "}
                {formatGp(item.gePrice)}
              </span>
            )}
          </label>
        );
      })}
    </div>
  );
}
