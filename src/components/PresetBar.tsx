"use client";

import { useEffect, useState } from "react";
import { getItemById, getItems } from "@/lib/data";
import { applyWikiSyncToLoadout, countRecognizedEquipment } from "@/lib/runelite/applyImport";
import { findWikiSyncInstances, importFromWikiSync } from "@/lib/runelite/wikisync";
import { useAppStore } from "@/lib/store/useAppStore";

export function PresetBar() {
  const {
    presets,
    savePreset,
    loadPreset,
    deletePreset,
    exportSharePayload,
    importSharePayload,
    setSkills,
    updateLoadout,
    applyEquipmentAndSkills,
    activeLoadoutId,
    loadouts,
    detailed,
    setDetailed,
    protectFromMonster,
    setProtectFromMonster,
  } = useAppStore();
  const [name, setName] = useState("");
  const [share, setShare] = useState("");
  const [rsn, setRsn] = useState("");
  const [msg, setMsg] = useState("");
  const [importingStats, setImportingStats] = useState(false);
  const [rlBusy, setRlBusy] = useState(false);
  const [rlAccounts, setRlAccounts] = useState<string[]>([]);

  const active = loadouts.find((l) => l.id === activeLoadoutId) ?? loadouts[0];
  const knownIds = new Set(getItems().map((i) => i.id));

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const s = params.get("share");
    if (s) {
      const ok = importSharePayload(s);
      setMsg(ok ? "Loaded shared setup from URL." : "Failed to load share payload.");
    }
  }, [importSharePayload]);

  async function scanRuneLite() {
    setRlBusy(true);
    setMsg("Looking for RuneLite WikiSync…");
    try {
      const found = await findWikiSyncInstances();
      setRlAccounts(found.map((f) => f.username));
      if (found.length === 0) {
        setMsg(
          "No WikiSync client found. Install WikiSync in RuneLite Plugin Hub, enable “Enable local WebSocket server”, stay logged in. Use Chrome or Firefox on localhost (Safari blocks this).",
        );
      } else {
        setMsg(`Found RuneLite: ${found.map((f) => f.username).join(", ")}`);
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "WikiSync scan failed");
    } finally {
      setRlBusy(false);
    }
  }

  async function importFromRuneLite() {
    if (!active) return;
    setRlBusy(true);
    setMsg("Importing worn gear from RuneLite…");
    try {
      const { username, loadout } = await importFromWikiSync();
      const next = applyWikiSyncToLoadout(active, loadout);
      applyEquipmentAndSkills(active.id, next.equipment, next.skills, {
        name: next.name,
        onTask: next.onTask,
      });
      const counts = countRecognizedEquipment(next.equipment, knownIds);
      setMsg(
        `Imported ${username}'s worn gear & stats (${counts.recognized}/${counts.slots} items in DB).` +
          (counts.recognized < counts.slots
            ? " Unrecognized items show as #id — expand item DB with npm run sync:data."
            : ""),
      );
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "RuneLite import failed");
    } finally {
      setRlBusy(false);
    }
  }

  async function importHiscores() {
    if (!rsn.trim() || !active) return;
    setImportingStats(true);
    setMsg("Fetching hiscores…");
    try {
      const res = await fetch(`/api/hiscores?username=${encodeURIComponent(rsn.trim())}`);
      const data = await res.json();
      if (!res.ok) {
        setMsg(data.error ?? "Hiscores failed");
        return;
      }
      setSkills(active.id, data.skills);
      setMsg(`Imported stats for ${data.username} (${data.source}). See skills below.`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Hiscores request failed");
    } finally {
      setImportingStats(false);
    }
  }

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-3 space-y-3">
      <div className="flex flex-wrap gap-2 items-end">
        <label className="text-xs space-y-1">
          <span className="text-[var(--muted)]">Preset name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="block rounded-lg bg-[var(--bg)] border border-[var(--border)] px-3 py-2 text-sm min-w-[160px]"
            placeholder="My setup"
          />
        </label>
        <button
          type="button"
          className="px-3 py-2 rounded-lg bg-[var(--accent)]/20 text-[var(--accent)] text-sm border border-[var(--accent)]/40"
          onClick={() => {
            if (!name.trim()) return;
            savePreset(name.trim());
            setMsg(`Saved preset “${name.trim()}”.`);
          }}
        >
          Save
        </button>
        <select
          className="rounded-lg bg-[var(--bg)] border border-[var(--border)] px-3 py-2 text-sm"
          defaultValue=""
          onChange={(e) => {
            if (e.target.value) loadPreset(e.target.value);
          }}
        >
          <option value="">Load preset…</option>
          {presets.map((p) => (
            <option key={p.name} value={p.name}>
              {p.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="px-3 py-2 rounded-lg border border-[var(--border)] text-sm text-[var(--muted)]"
          onClick={() => {
            if (!name.trim()) return;
            deletePreset(name.trim());
            setMsg(`Deleted “${name.trim()}”.`);
          }}
        >
          Delete
        </button>
        <label className="flex items-center gap-2 text-xs ml-auto">
          <input type="checkbox" checked={detailed} onChange={(e) => setDetailed(e.target.checked)} />
          Detailed
        </label>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={protectFromMonster}
            onChange={(e) => setProtectFromMonster(e.target.checked)}
          />
          Protect from monster
        </label>
      </div>

      <div className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)] p-3 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-sm font-semibold">Import from RuneLite (WikiSync)</div>
            <p className="text-[11px] text-[var(--muted)]">
              Imports your currently worn gear + skills. Requires WikiSync plugin with local WebSocket enabled.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={rlBusy}
              onClick={() => void scanRuneLite()}
              className="px-3 py-2 rounded-lg border border-[var(--border)] text-sm disabled:opacity-50"
            >
              Scan
            </button>
            <button
              type="button"
              disabled={rlBusy}
              onClick={() => void importFromRuneLite()}
              className="px-3 py-2 rounded-lg border border-[var(--accent-2)]/50 text-[var(--accent-2)] text-sm disabled:opacity-50"
            >
              {rlBusy ? "Working…" : "Import worn gear"}
            </button>
          </div>
        </div>
        {rlAccounts.length > 0 && (
          <p className="text-xs text-[var(--muted)]">Detected: {rlAccounts.join(", ")}</p>
        )}
      </div>

      <div className="flex flex-wrap gap-2 items-end">
        <button
          type="button"
          className="px-3 py-2 rounded-lg border border-[var(--border)] text-sm"
          onClick={() => {
            const payload = exportSharePayload();
            const url = `${window.location.origin}/dps?share=${encodeURIComponent(payload)}`;
            void navigator.clipboard.writeText(url);
            setShare(url);
            setMsg("Share URL copied to clipboard.");
          }}
        >
          Share setup
        </button>
        <input
          value={share}
          onChange={(e) => setShare(e.target.value)}
          placeholder="Paste share payload or URL…"
          className="flex-1 min-w-[200px] rounded-lg bg-[var(--bg)] border border-[var(--border)] px-3 py-2 text-sm"
        />
        <button
          type="button"
          className="px-3 py-2 rounded-lg border border-[var(--border)] text-sm"
          onClick={() => {
            let raw = share.trim();
            try {
              const u = new URL(raw);
              raw = u.searchParams.get("share") ?? raw;
            } catch {
              // raw payload
            }
            const ok = importSharePayload(decodeURIComponent(raw));
            setMsg(ok ? "Imported share payload." : "Import failed.");
          }}
        >
          Import share
        </button>
      </div>

      <div className="flex flex-wrap gap-2 items-end">
        <label className="text-xs space-y-1">
          <span className="text-[var(--muted)]">Hiscores RSN</span>
          <input
            value={rsn}
            onChange={(e) => setRsn(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void importHiscores();
            }}
            className="block rounded-lg bg-[var(--bg)] border border-[var(--border)] px-3 py-2 text-sm"
            placeholder="Username"
          />
        </label>
        <button
          type="button"
          disabled={importingStats}
          className="px-3 py-2 rounded-lg border border-[var(--accent-2)]/40 text-[var(--accent-2)] text-sm disabled:opacity-50"
          onClick={() => void importHiscores()}
        >
          {importingStats ? "Importing…" : "Import stats"}
        </button>
      </div>

      {active && (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3">
          <div className="text-xs text-[var(--muted)] mb-2">
            Skills — {active.name}
            {Object.values(active.equipment).some(Boolean) && (
              <span>
                {" "}
                · Gear:{" "}
                {Object.entries(active.equipment)
                  .filter(([, id]) => id)
                  .map(([slot, id]) => getItemById(id!)?.name ?? `#${id} (${slot})`)
                  .slice(0, 4)
                  .join(", ")}
                {Object.values(active.equipment).filter(Boolean).length > 4 ? "…" : ""}
              </span>
            )}
          </div>
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
                  value={active.skills[skill]}
                  onChange={(e) =>
                    updateLoadout(active.id, {
                      skills: { ...active.skills, [skill]: Number(e.target.value) },
                    })
                  }
                  className="w-full rounded bg-[var(--panel)] border border-[var(--border)] px-2 py-1 tabular-nums font-semibold text-[var(--accent)]"
                />
              </label>
            ))}
          </div>
        </div>
      )}

      {msg && (
        <p className="text-xs text-[var(--ok)] bg-[var(--ok)]/10 border border-[var(--ok)]/30 rounded-lg px-3 py-2">
          {msg}
        </p>
      )}
    </div>
  );
}
