"use client";

import { useState } from "react";
import { EquipmentGrid } from "@/components/EquipmentGrid";
import { DpsResultsPanel } from "@/components/DpsResultsPanel";
import { calculateMonsterDps, calculatePlayerDps, sumBonuses } from "@/lib/dps/calculate";
import { getItemById } from "@/lib/data";
import {
  officialRequiresSlayerTask,
  officialSpellNames,
} from "@/lib/dps/wikiAdapter";
import type { Loadout, MonsterStats, PrayerName } from "@/lib/types";
import { EQUIPMENT_SLOTS } from "@/lib/types";
import { useAppStore } from "@/lib/store/useAppStore";

function formatGp(n: number) {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

const PRAYER_OPTIONS: { value: PrayerName; label: string }[] = [
  { value: "none", label: "None" },
  { value: "piety", label: "Piety" },
  { value: "chivalry", label: "Chivalry" },
  { value: "rigour", label: "Rigour" },
  { value: "deadeye", label: "Deadeye" },
  { value: "eagleEye", label: "Eagle Eye" },
  { value: "augury", label: "Augury" },
  { value: "mysticVigour", label: "Mystic Vigour" },
  { value: "mysticMight", label: "Mystic Might" },
  { value: "ultimateStrength", label: "Ultimate Strength" },
  { value: "incredibleReflexes", label: "Incredible Reflexes" },
  { value: "superhumanStrength", label: "Superhuman Strength" },
  { value: "improvedReflexes", label: "Improved Reflexes" },
  { value: "burstOfStrength", label: "Burst of Strength" },
  { value: "clarityOfThought", label: "Clarity of Thought" },
  { value: "sharpEye", label: "Sharp Eye" },
  { value: "hawkEye", label: "Hawk Eye" },
  { value: "mysticWill", label: "Mystic Will" },
  { value: "mysticLore", label: "Mystic Lore" },
  { value: "thickSkin", label: "Thick Skin" },
  { value: "rockSkin", label: "Rock Skin" },
  { value: "steelSkin", label: "Steel Skin" },
];

interface Props {
  loadout: Loadout;
  monster: MonsterStats;
}

export function LoadoutEditor({ loadout, monster }: Props) {
  const {
    detailed,
    protectFromMonster,
    updateLoadout,
    setEquipmentSlot,
    duplicateLoadout,
    removeLoadout,
  } = useAppStore();
  const [dpsMode, setDpsMode] = useState<"player" | "monster">("player");

  const equipped = EQUIPMENT_SLOTS.map((s) => getItemById(loadout.equipment[s] ?? null) ?? null);
  const player = calculatePlayerDps(loadout, monster, equipped);
  const mon = calculateMonsterDps(loadout, monster, equipped, protectFromMonster);
  const bonuses = sumBonuses(equipped);
  const taskRequired = officialRequiresSlayerTask(monster);

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-4 space-y-4">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <input
          value={loadout.name}
          onChange={(e) => updateLoadout(loadout.id, { name: e.target.value })}
          className="bg-transparent border-b border-[var(--border)] text-lg font-semibold px-1 py-0.5"
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => duplicateLoadout(loadout.id)}
            className="text-xs px-2 py-1 rounded border border-[var(--border)] text-[var(--muted)]"
          >
            Duplicate
          </button>
          <button
            type="button"
            onClick={() => removeLoadout(loadout.id)}
            className="text-xs px-2 py-1 rounded border border-[var(--danger)]/40 text-[var(--danger)]"
          >
            Remove
          </button>
        </div>
      </div>

      <div className="flex gap-2 text-xs">
        <button
          type="button"
          onClick={() => setDpsMode("player")}
          className={`px-3 py-1.5 rounded ${dpsMode === "player" ? "bg-[var(--accent)]/20 text-[var(--accent)]" : "bg-[var(--panel-2)] text-[var(--muted)]"}`}
        >
          Player DPS
        </button>
        <button
          type="button"
          onClick={() => setDpsMode("monster")}
          className={`px-3 py-1.5 rounded ${dpsMode === "monster" ? "bg-[var(--accent)]/20 text-[var(--accent)]" : "bg-[var(--panel-2)] text-[var(--muted)]"}`}
        >
          Monster DPS
        </button>
      </div>

      <DpsResultsPanel player={player} monster={mon} mode={dpsMode} />
      {player.issues && player.issues.length > 0 && (
        <div className="rounded-lg border border-[var(--danger)]/40 bg-[var(--danger)]/10 p-3 text-xs text-[var(--danger)]">
          {player.issues.map((issue) => <div key={issue}>{issue}</div>)}
        </div>
      )}

      <EquipmentGrid
        equipment={loadout.equipment}
        detailed={detailed}
        onChange={(slot, id) => setEquipmentSlot(loadout.id, slot, id)}
      />

      {detailed && (
        <div className="text-xs text-[var(--muted)] grid grid-cols-2 md:grid-cols-4 gap-2">
          <div>Stab atk {bonuses.stabAttack}</div>
          <div>Slash atk {bonuses.slashAttack}</div>
          <div>Crush atk {bonuses.crushAttack}</div>
          <div>Range atk {bonuses.rangedAttack}</div>
          <div>Magic atk {bonuses.magicAttack}</div>
          <div>Strength {bonuses.strength}</div>
          <div>Ranged str {bonuses.rangedStrength}</div>
          <div>Magic dmg {bonuses.magicDamage}%</div>
          <div>Slash def {bonuses.slashDefence}</div>
          <div>Total GE {formatGp(bonuses.totalGePrice)}</div>
        </div>
      )}

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
        <label className="space-y-1">
          <span className="text-xs text-[var(--muted)]">Attack type</span>
          <select
            className="w-full rounded-lg bg-[var(--bg)] border border-[var(--border)] px-2 py-2"
            value={loadout.attackType}
            onChange={(e) =>
              updateLoadout(loadout.id, {
                attackType: e.target.value as Loadout["attackType"],
              })
            }
          >
            <option value="stab">Stab</option>
            <option value="slash">Slash</option>
            <option value="crush">Crush</option>
            <option value="ranged">Ranged</option>
            <option value="magic">Magic</option>
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs text-[var(--muted)]">Combat style</span>
          <select
            className="w-full rounded-lg bg-[var(--bg)] border border-[var(--border)] px-2 py-2"
            value={loadout.combatStyle}
            onChange={(e) =>
              updateLoadout(loadout.id, {
                combatStyle: e.target.value as Loadout["combatStyle"],
              })
            }
          >
            <option value="accurate">Accurate</option>
            <option value="aggressive">Aggressive</option>
            <option value="defensive">Defensive</option>
            <option value="controlled">Controlled</option>
            <option value="rapid">Rapid</option>
            <option value="longrange">Longrange</option>
            <option value="autocast">Autocast</option>
            <option value="defensive_autocast">Defensive autocast</option>
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs text-[var(--muted)]">Prayer</span>
          <select
            className="w-full rounded-lg bg-[var(--bg)] border border-[var(--border)] px-2 py-2"
            value={loadout.prayer}
            onChange={(e) =>
              updateLoadout(loadout.id, {
                prayer: e.target.value as Loadout["prayer"],
                prayers: undefined,
              })
            }
          >
            {PRAYER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs text-[var(--muted)]">Potion</span>
          <select
            className="w-full rounded-lg bg-[var(--bg)] border border-[var(--border)] px-2 py-2"
            value={loadout.potions[0] ?? "none"}
            onChange={(e) =>
              updateLoadout(loadout.id, {
                potions: e.target.value === "none" ? [] : [e.target.value as Loadout["potions"][number]],
              })
            }
          >
            <option value="none">None</option>
            <option value="superCombat">Super combat</option>
            <option value="superAttack">Super attack</option>
            <option value="superStrength">Super strength</option>
            <option value="ranging">Ranging</option>
            <option value="bastion">Bastion</option>
            <option value="magic">Magic</option>
            <option value="imbuedHeart">Imbued heart</option>
            <option value="smellingSalts">Smelling salts</option>
            <option value="overloads">Overloads</option>
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs text-[var(--muted)]">Spell</span>
          <select
            className="w-full rounded-lg bg-[var(--bg)] border border-[var(--border)] px-2 py-2"
            value={loadout.spell ?? ""}
            onChange={(e) =>
              updateLoadout(loadout.id, { spell: e.target.value || null })
            }
          >
            <option value="">Auto / weapon</option>
            {officialSpellNames.map((spell) => (
              <option key={spell} value={spell}>{spell}</option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap items-end gap-3 pb-1">
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={loadout.onTask || taskRequired}
              disabled={taskRequired}
              onChange={(e) => updateLoadout(loadout.id, { onTask: e.target.checked })}
            />
            On task{taskRequired ? " (required)" : ""}
          </label>
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={loadout.specialAttack}
              onChange={(e) => updateLoadout(loadout.id, { specialAttack: e.target.checked })}
            />
            Spec
          </label>
        </div>
      </div>

      <details className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3">
        <summary className="cursor-pointer text-sm font-medium">
          Exact-calculation inputs
        </summary>
        <div className="mt-3 space-y-4 text-xs">
          <div>
            <div className="mb-2 text-[var(--muted)]">Active prayers (supports valid combinations)</div>
            <div className="flex flex-wrap gap-2">
              {PRAYER_OPTIONS.filter((option) => option.value !== "none").map((option) => {
                const active = loadout.prayers
                  ?? (loadout.prayer === "none" ? [] : [loadout.prayer]);
                const checked = active.includes(option.value);
                return (
                  <label key={option.value} className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        const prayers = checked
                          ? active.filter((prayer) => prayer !== option.value)
                          : [...active, option.value];
                        updateLoadout(loadout.id, {
                          prayers,
                          prayer: prayers[0] ?? "none",
                        });
                      }}
                    />
                    {option.label}
                  </label>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {([
              ["kandarinDiary", "Kandarin hard diary"],
              ["inWilderness", "In Wilderness"],
              ["forinthrySurge", "Forinthry surge"],
              ["chargeSpell", "Charge spell"],
              ["markOfDarknessSpell", "Mark of Darkness"],
              ["usingSunfireRunes", "Sunfire runes"],
            ] as const).map(([key, label]) => (
              <label key={key} className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={Boolean(loadout[key])}
                  onChange={(event) => updateLoadout(loadout.id, { [key]: event.target.checked })}
                />
                {label}
              </label>
            ))}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {([
              ["distance", "Distance (tiles)", 0, 10],
              ["soulreaperStacks", "Soulreaper stacks", 0, 5],
              ["baAttackerLevel", "BA attacker level", 0, 5],
              ["toaInvocationLevel", "ToA invocation", 0, 600],
              ["toaPathLevel", "ToA path level", 0, 6],
              ["partySize", "Party size", 1, 100],
              ["partyMaxCombatLevel", "Party max combat", 3, 126],
              ["partySumMiningLevel", "Party mining sum", 1, 9900],
              ["partyMaxHpLevel", "Party max HP", 1, 99],
            ] as const).map(([key, label, min, max]) => (
              <label key={key} className="space-y-1">
                <span className="text-[var(--muted)]">{label}</span>
                <input
                  type="number"
                  min={min}
                  max={max}
                  value={loadout[key] ?? min}
                  onChange={(event) =>
                    updateLoadout(loadout.id, { [key]: Number(event.target.value) })
                  }
                  className="w-full rounded bg-[var(--panel)] border border-[var(--border)] px-2 py-1"
                />
              </label>
            ))}
          </div>

          <div>
            <div className="mb-2 text-[var(--muted)]">Monster defence reductions</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {([
                ["dwh", "Dragon warhammer"],
                ["elderMaul", "Elder maul"],
                ["arclight", "Arclight"],
                ["emberlight", "Emberlight"],
                ["bgs", "BGS damage"],
                ["tonalztic", "Tonalztics"],
                ["seercull", "Seercull damage"],
                ["ayak", "Eye of ayak"],
              ] as const).map(([key, label]) => (
                <label key={key} className="space-y-1">
                  <span className="text-[var(--muted)]">{label}</span>
                  <input
                    type="number"
                    min={0}
                    value={loadout.defenceReductions?.[key] ?? 0}
                    onChange={(event) =>
                      updateLoadout(loadout.id, {
                        defenceReductions: {
                          ...loadout.defenceReductions,
                          [key]: Number(event.target.value),
                        },
                      })
                    }
                    className="w-full rounded bg-[var(--panel)] border border-[var(--border)] px-2 py-1"
                  />
                </label>
              ))}
              {([
                ["vulnerability", "Vulnerability"],
                ["accursed", "Accursed sceptre"],
              ] as const).map(([key, label]) => (
                <label key={key} className="flex items-center gap-1.5 pt-4">
                  <input
                    type="checkbox"
                    checked={Boolean(loadout.defenceReductions?.[key])}
                    onChange={(event) =>
                      updateLoadout(loadout.id, {
                        defenceReductions: {
                          ...loadout.defenceReductions,
                          [key]: event.target.checked,
                        },
                      })
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>
        </div>
      </details>

      <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3">
        <div className="text-xs text-[var(--muted)] mb-2">Skills</div>
        <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
          {(
            [
              "attack",
              "strength",
              "defence",
              "hitpoints",
              "ranged",
              "prayer",
              "magic",
              "mining",
            ] as const
          ).map((skill) => (
            <label key={skill} className="text-[11px] space-y-1">
              <span className="capitalize text-[var(--muted)]">{skill}</span>
              <input
                type="number"
                min={1}
                max={99}
                value={loadout.skills[skill]}
                onChange={(e) =>
                  updateLoadout(loadout.id, {
                    skills: { ...loadout.skills, [skill]: Number(e.target.value) },
                  })
                }
                className="w-full rounded bg-[var(--panel)] border border-[var(--border)] px-2 py-1 tabular-nums"
              />
            </label>
          ))}
        </div>
      </div>
    </section>
  );
}
