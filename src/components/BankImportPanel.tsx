"use client";

import { useState } from "react";
import { getItemById } from "@/lib/data";
import { parseBankMemoryPaste } from "@/lib/runelite/bankMemory";
import { useAppStore } from "@/lib/store/useAppStore";

function formatGp(n: number) {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

/**
 * Always-visible Bank Memory import (not hidden behind Iron toggle).
 */
export function BankImportPanel({ compact = false }: { compact?: boolean }) {
  const {
    ownedItemIds,
    setOwnedItemIds,
    accountMode,
    setBudget,
    budget,
    setBankGpStack,
    bankGpStack,
  } = useAppStore();
  const [bankPaste, setBankPaste] = useState("");
  const [bankMsg, setBankMsg] = useState("");

  const preview = ownedItemIds
    .map((id) => getItemById(id))
    .filter(Boolean)
    .slice(0, compact ? 12 : 24);

  function importBank(text: string) {
    const parsed = parseBankMemoryPaste(text);
    if (parsed.itemIds.length === 0) {
      setBankMsg(
        "Could not parse that paste. Copy from RuneLite Bank Memory → Saved Banks → right-click → Copy item data to clipboard.",
      );
      return;
    }
    setOwnedItemIds(parsed.itemIds);
    setBankGpStack(parsed.gpStack);

    // Mains: default Best Setup / Upgrade budget to liquid GP in bank (coins + plats)
    if (accountMode === "main" && parsed.gpStack > 0) {
      setBudget(parsed.gpStack);
    }

    const unmatched = parsed.itemIds.length - parsed.matchedInDb;
    const parts = [
      `Imported ${parsed.itemIds.length} items (${parsed.format}, ${parsed.matchedInDb} in item DB` +
        (unmatched ? `, ${unmatched} not in DB yet` : "") +
        ")",
    ];
    if (parsed.gpStack > 0) {
      parts.push(
        `GP stack ${formatGp(parsed.gpStack)}` +
          (parsed.platinumTokens > 0
            ? ` (${formatGp(parsed.coins)} coins + ${parsed.platinumTokens.toLocaleString()} plats)`
            : " coins"),
      );
      if (accountMode === "main") {
        parts.push(`Main budget set to ${formatGp(parsed.gpStack)}`);
      } else {
        parts.push("Switch to Main to use this as budget");
      }
    } else if (accountMode === "main") {
      parts.push(`No coins/plats found — budget left at ${formatGp(budget)}`);
    }
    if (accountMode === "iron") {
      parts.push("Iron mode (bank-only filter)");
    }
    setBankMsg(parts.join(". ") + ".");
  }

  return (
    <div
      id="bank-import"
      className="rounded-xl border border-[var(--accent)]/40 bg-[var(--panel)] p-4 space-y-3"
    >
      <div>
        <h2 className="text-base font-semibold text-[var(--accent)]">Import bank (RuneLite)</h2>
        <p className="text-xs text-[var(--muted)] mt-1">
          1. Install <strong>Bank Memory</strong> from the RuneLite Plugin Hub · 2. Deposit worn gear, open
          your bank · 3. Bank Memory side panel → <strong>Saved Banks</strong> → right-click your account →{" "}
          <strong>Copy item data to clipboard</strong> · 4. Paste below and click Import.
          {accountMode === "main" && (
            <> On <strong>Main</strong>, budget defaults to your coins (+ platinum tokens).</>
          )}
        </p>
      </div>

      <textarea
        value={bankPaste}
        onChange={(e) => setBankPaste(e.target.value)}
        rows={compact ? 4 : 6}
        className="w-full rounded-lg bg-[var(--bg)] border border-[var(--border)] px-3 py-2 text-xs font-mono"
        placeholder={"Item id\tItem name\tItem quantity\n995\tCoins\t50000000\n4151\tAbyssal whip\t1\n…"}
      />

      <div className="flex flex-wrap gap-2 items-center">
        <button
          type="button"
          onClick={() => importBank(bankPaste)}
          className="px-4 py-2 rounded-lg bg-[var(--accent)] text-black text-sm font-semibold"
        >
          Import bank
        </button>
        <button
          type="button"
          className="px-3 py-2 rounded-lg border border-[var(--border)] text-sm"
          onClick={async () => {
            try {
              const text = await navigator.clipboard.readText();
              setBankPaste(text);
              importBank(text);
            } catch {
              setBankMsg("Clipboard blocked — paste into the box with ⌘V / Ctrl+V, then Import bank.");
            }
          }}
        >
          Paste from clipboard
        </button>
        {ownedItemIds.length > 0 && (
          <button
            type="button"
            className="px-3 py-2 rounded-lg border border-[var(--danger)]/40 text-[var(--danger)] text-sm"
            onClick={() => {
              setOwnedItemIds([]);
              setBankGpStack(0);
              setBankPaste("");
              setBankMsg("Cleared bank filter.");
            }}
          >
            Clear bank
          </button>
        )}
        <span className="text-xs text-[var(--muted)]">
          {ownedItemIds.length} items loaded
          {bankGpStack > 0 ? ` · GP ${formatGp(bankGpStack)}` : ""}
          {accountMode === "iron" ? " · Iron mode" : " · Main mode"}
        </span>
      </div>

      {bankMsg && (
        <p className="text-xs text-[var(--ok)] bg-[var(--ok)]/10 border border-[var(--ok)]/30 rounded-lg px-3 py-2">
          {bankMsg}
        </p>
      )}

      {preview.length > 0 && (
        <div className="flex flex-wrap gap-1 max-h-28 overflow-y-auto">
          {preview.map((item) => (
            <span
              key={item!.id}
              className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg)] border border-[var(--border)]"
            >
              {item!.name}
            </span>
          ))}
          {ownedItemIds.length > preview.length && (
            <span className="text-[10px] text-[var(--muted)]">
              +{ownedItemIds.length - preview.length} more
            </span>
          )}
        </div>
      )}
    </div>
  );
}
