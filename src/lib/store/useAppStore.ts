"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  AttackType,
  CombatStyle,
  Loadout,
  LoadoutEquipment,
  PlayerSkills,
  PotionName,
  PrayerName,
} from "@/lib/types";
import { DEFAULT_SKILLS } from "@/lib/types";

function uid() {
  return `setup-${Math.random().toString(36).slice(2, 9)}`;
}

export function createEmptyLoadout(name = "Setup 1"): Loadout {
  return {
    id: uid(),
    name,
    skills: { ...DEFAULT_SKILLS },
    equipment: {},
    attackType: "slash",
    combatStyle: "aggressive",
    prayer: "piety",
    potions: ["superCombat"],
    spell: null,
    onTask: false,
    specialAttack: false,
    monsterHpOverride: null,
    distance: 1,
    flinching: false,
    inWilderness: false,
    forinthrySurge: false,
    soulreaperStacks: 0,
    baAttackerLevel: 0,
    kandarinDiary: false,
    chargeSpell: false,
    markOfDarknessSpell: false,
    usingSunfireRunes: false,
    toaInvocationLevel: 0,
    toaPathLevel: 0,
    partySize: 1,
    partyMaxCombatLevel: 126,
    partySumMiningLevel: 99,
    partyMaxHpLevel: 99,
    defenceReductions: {},
  };
}

interface PresetRecord {
  name: string;
  loadouts: Loadout[];
  monsterId: string;
  savedAt: string;
}

interface AppState {
  loadouts: Loadout[];
  activeLoadoutId: string;
  monsterId: string;
  detailed: boolean;
  protectFromMonster: boolean;
  presets: PresetRecord[];
  accountMode: "main" | "iron";
  budget: number;
  /** Liquid GP from last bank import (coins + plats×1000); used as Main budget default */
  bankGpStack: number;
  ownedItemIds: number[];
  excludeItemIds: number[];

  setMonsterId: (id: string) => void;
  setDetailed: (v: boolean) => void;
  setProtectFromMonster: (v: boolean) => void;
  setAccountMode: (m: "main" | "iron") => void;
  setBudget: (n: number) => void;
  setOwnedItemIds: (ids: number[]) => void;
  setBankGpStack: (n: number) => void;
  setExcludeItemIds: (ids: number[]) => void;

  addLoadout: () => void;
  duplicateLoadout: (id: string) => void;
  removeLoadout: (id: string) => void;
  setActiveLoadout: (id: string) => void;
  updateLoadout: (id: string, patch: Partial<Loadout>) => void;
  setEquipmentSlot: (loadoutId: string, slot: keyof LoadoutEquipment, itemId: number | null) => void;
  setSkills: (loadoutId: string, skills: Partial<PlayerSkills>) => void;
  applyEquipmentAndSkills: (
    loadoutId: string,
    equipment: LoadoutEquipment,
    skills: Partial<PlayerSkills>,
    extras?: Partial<Loadout>,
  ) => void;
  applyLoadout: (loadout: Loadout) => void;

  savePreset: (name: string) => void;
  loadPreset: (name: string) => void;
  deletePreset: (name: string) => void;

  exportSharePayload: () => string;
  importSharePayload: (raw: string) => boolean;
}

const initial = createEmptyLoadout();

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      loadouts: [initial],
      activeLoadoutId: initial.id,
      monsterId: "abyssal-demon",
      detailed: true,
      protectFromMonster: false,
      presets: [],
      accountMode: "main",
      budget: 100_000_000,
      bankGpStack: 0,
      ownedItemIds: [],
      excludeItemIds: [],

      setMonsterId: (id) => set({ monsterId: id }),
      setDetailed: (v) => set({ detailed: v }),
      setProtectFromMonster: (v) => set({ protectFromMonster: v }),
      setAccountMode: (m) => {
        const { bankGpStack } = get();
        // Switching to Main: default budget to imported cash stack when available
        if (m === "main" && bankGpStack > 0) {
          set({ accountMode: m, budget: bankGpStack });
        } else {
          set({ accountMode: m });
        }
      },
      setBudget: (n) => set({ budget: n }),
      setOwnedItemIds: (ids) => set({ ownedItemIds: ids }),
      setBankGpStack: (n) => set({ bankGpStack: n }),
      setExcludeItemIds: (ids) => set({ excludeItemIds: ids }),

      addLoadout: () => {
        const next = createEmptyLoadout(`Setup ${get().loadouts.length + 1}`);
        set({ loadouts: [...get().loadouts, next], activeLoadoutId: next.id });
      },
      duplicateLoadout: (id) => {
        const src = get().loadouts.find((l) => l.id === id);
        if (!src) return;
        const next: Loadout = {
          ...structuredClone(src),
          id: uid(),
          name: `${src.name} copy`,
        };
        set({ loadouts: [...get().loadouts, next], activeLoadoutId: next.id });
      },
      removeLoadout: (id) => {
        const remaining = get().loadouts.filter((l) => l.id !== id);
        if (remaining.length === 0) {
          const fresh = createEmptyLoadout();
          set({ loadouts: [fresh], activeLoadoutId: fresh.id });
          return;
        }
        set({
          loadouts: remaining,
          activeLoadoutId:
            get().activeLoadoutId === id ? remaining[0].id : get().activeLoadoutId,
        });
      },
      setActiveLoadout: (id) => set({ activeLoadoutId: id }),
      updateLoadout: (id, patch) =>
        set({
          loadouts: get().loadouts.map((l) => (l.id === id ? { ...l, ...patch } : l)),
        }),
      setEquipmentSlot: (loadoutId, slot, itemId) =>
        set({
          loadouts: get().loadouts.map((l) => {
            if (l.id !== loadoutId) return l;
            const equipment = { ...l.equipment, [slot]: itemId };
            return { ...l, equipment };
          }),
        }),
      setSkills: (loadoutId, skills) =>
        set({
          loadouts: get().loadouts.map((l) =>
            l.id === loadoutId ? { ...l, skills: { ...l.skills, ...skills } } : l,
          ),
        }),
      applyEquipmentAndSkills: (
        loadoutId,
        equipment: LoadoutEquipment,
        skills: Partial<PlayerSkills>,
        extras?: Partial<Loadout>,
      ) =>
        set({
          loadouts: get().loadouts.map((l) => {
            if (l.id !== loadoutId) return l;
            const nextSkills = { ...l.skills };
            for (const [k, v] of Object.entries(skills)) {
              if (typeof v === "number" && Number.isFinite(v)) {
                nextSkills[k as keyof PlayerSkills] = v;
              }
            }
            return { ...l, ...extras, equipment, skills: nextSkills };
          }),
        }),
      applyLoadout: (loadout) => {
        const next = { ...loadout, id: uid() };
        set({ loadouts: [...get().loadouts, next], activeLoadoutId: next.id });
      },

      savePreset: (name) => {
        const record: PresetRecord = {
          name,
          loadouts: structuredClone(get().loadouts),
          monsterId: get().monsterId,
          savedAt: new Date().toISOString(),
        };
        const presets = [...get().presets.filter((p) => p.name !== name), record];
        set({ presets });
      },
      loadPreset: (name) => {
        const preset = get().presets.find((p) => p.name === name);
        if (!preset) return;
        set({
          loadouts: structuredClone(preset.loadouts),
          activeLoadoutId: preset.loadouts[0]?.id ?? get().activeLoadoutId,
          monsterId: preset.monsterId,
        });
      },
      deletePreset: (name) =>
        set({ presets: get().presets.filter((p) => p.name !== name) }),

      exportSharePayload: () => {
        const payload = {
          v: 1,
          monsterId: get().monsterId,
          loadouts: get().loadouts,
        };
        return typeof window !== "undefined"
          ? btoa(unescape(encodeURIComponent(JSON.stringify(payload))))
          : Buffer.from(JSON.stringify(payload)).toString("base64");
      },
      importSharePayload: (raw) => {
        try {
          const json =
            typeof window !== "undefined"
              ? decodeURIComponent(escape(atob(raw)))
              : Buffer.from(raw, "base64").toString("utf8");
          const payload = JSON.parse(json);
          if (!payload?.loadouts?.length) return false;
          set({
            loadouts: payload.loadouts,
            activeLoadoutId: payload.loadouts[0].id,
            monsterId: payload.monsterId ?? get().monsterId,
          });
          return true;
        } catch {
          return false;
        }
      },
    }),
    {
      name: "whetstone-store",
      partialize: (s) => ({
        loadouts: s.loadouts,
        activeLoadoutId: s.activeLoadoutId,
        monsterId: s.monsterId,
        detailed: s.detailed,
        presets: s.presets,
        accountMode: s.accountMode,
        budget: s.budget,
        bankGpStack: s.bankGpStack,
        ownedItemIds: s.ownedItemIds,
        excludeItemIds: s.excludeItemIds,
      }),
    },
  ),
);

export type { AttackType, CombatStyle, PrayerName, PotionName };
