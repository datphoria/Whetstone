"use client";

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { calculatePlayerDps } from "@/lib/dps/calculate";
import { getItemById, getMonsterById } from "@/lib/data";
import { useAppStore } from "@/lib/store/useAppStore";
import { EQUIPMENT_SLOTS } from "@/lib/types";
import { MonsterPicker } from "@/components/MonsterPicker";

const COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

export default function GraphPage() {
  const { loadouts, monsterId, setMonsterId } = useAppStore();
  const monster = getMonsterById(monsterId);

  const data = useMemo(() => {
    if (!monster) return [];
    const points = [];
    const step = Math.max(1, Math.floor(monster.hitpoints / 20));
    for (let hp = monster.hitpoints; hp >= 0; hp -= step) {
      const row: Record<string, number> = { hp };
      for (const loadout of loadouts) {
        const equipped = EQUIPMENT_SLOTS.map(
          (s) => getItemById(loadout.equipment[s] ?? null) ?? null,
        );
        row[loadout.name] = calculatePlayerDps(
          { ...loadout, monsterHpOverride: hp },
          monster,
          equipped,
        ).dps;
      }
      points.push(row);
      if (hp === 0) break;
    }
    return points.reverse();
  }, [loadouts, monster]);

  if (!monster) return null;

  return (
    <div className="space-y-4 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold">DPS Graph</h1>
        <p className="text-sm text-[var(--muted)]">
          Compare loadout DPS across monster HP remaining.
        </p>
      </div>
      <MonsterPicker monsterId={monsterId} onChange={setMonsterId} />
      <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-4 h-[420px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" />
            <XAxis dataKey="hp" stroke="var(--muted)" label={{ value: "Monster HP", position: "insideBottom", offset: -2 }} />
            <YAxis stroke="var(--muted)" label={{ value: "DPS", angle: -90, position: "insideLeft" }} />
            <Tooltip
              contentStyle={{
                background: "var(--surface-2)",
                border: "1px solid var(--border-strong)",
                borderRadius: 6,
                color: "var(--fg)",
              }}
            />
            <Legend />
            {loadouts.map((l, i) => (
              <Area
                key={l.id}
                type="monotone"
                dataKey={l.name}
                stroke={COLORS[i % COLORS.length]}
                fill={COLORS[i % COLORS.length]}
                fillOpacity={i === 0 ? 0.18 : 0.08}
                dot={false}
                strokeWidth={2}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
