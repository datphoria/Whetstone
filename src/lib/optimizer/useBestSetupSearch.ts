"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  BestSetupCandidate,
  BestSetupOptions,
  BestSetupProgress,
  UpgradePath,
} from "@/lib/optimizer/bestSetup";
import type {
  BestSetupStage,
  BestSetupWorkerRequest,
  BestSetupWorkerResponse,
} from "@/lib/optimizer/bestSetup.worker";
import { defaultStretchBudget } from "@/lib/prices/stretchBudget";
import type { Loadout, MonsterStats } from "@/lib/types";

export type BestSetupRunOptions = Omit<BestSetupOptions, "onProgress" | "signal" | "itemPool"> & {
  /** When above `budget`, run an extra pass for near-affordable setups. */
  stretchBudget?: number;
  /** Opt out of the stretch pass even when stretchBudget is higher. */
  includeStretch?: boolean;
};

interface UseBestSetupSearchResult {
  running: boolean;
  /** Which pass is running: bank, affordable, or stretch. */
  stage: BestSetupStage | null;
  progress: BestSetupProgress | null;
  /** Best setups using only imported bank items. */
  bankResults: BestSetupCandidate[];
  /** Best setups once purchases / in-game unlocks are allowed within budget. */
  results: BestSetupCandidate[];
  /** Best setups within the stretch ceiling (above cash on hand). */
  stretchResults: BestSetupCandidate[];
  /** Cheapest-first order for closing the gap between bank and affordable target. */
  upgradePath: UpgradePath | null;
  error: string | null;
  run: (base: Loadout, monster: MonsterStats, opts: BestSetupRunOptions) => void;
  cancel: () => void;
  reset: () => void;
}

/** The bank pass: same account, but nothing outside the imported bank. */
function bankStageOptions(opts: BestSetupRunOptions): BestSetupRunOptions {
  return {
    ...opts,
    budget: 0,
    restrictToOwned: true,
    includeUntradeables: false,
  };
}

function emptyCollected(): Record<BestSetupStage, BestSetupCandidate[]> {
  return { bank: [], target: [], stretch: [] };
}

/**
 * Runs Best Setup off the main thread when Workers are available; otherwise
 * falls back to an async main-thread search that yields between attack types.
 *
 * Searches run in passes so the user first sees the best setup from their bank,
 * then what buying within budget adds, then near-budget stretch goals.
 */
export function useBestSetupSearch(): UseBestSetupSearchResult {
  const [running, setRunning] = useState(false);
  const [stage, setStage] = useState<BestSetupStage | null>(null);
  const [progress, setProgress] = useState<BestSetupProgress | null>(null);
  const [bankResults, setBankResults] = useState<BestSetupCandidate[]>([]);
  const [results, setResults] = useState<BestSetupCandidate[]>([]);
  const [stretchResults, setStretchResults] = useState<BestSetupCandidate[]>([]);
  const [upgradePath, setUpgradePath] = useState<UpgradePath | null>(null);
  const [error, setError] = useState<string | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
      abortRef.current?.abort();
    };
  }, []);

  const ensureWorker = useCallback(() => {
    if (typeof Worker === "undefined") return null;
    if (workerRef.current) return workerRef.current;
    try {
      const worker = new Worker(new URL("./bestSetup.worker.ts", import.meta.url), {
        type: "module",
      });
      workerRef.current = worker;
      return worker;
    } catch {
      return null;
    }
  }, []);

  const cancel = useCallback(() => {
    const id = requestIdRef.current;
    workerRef.current?.postMessage({ type: "cancel", requestId: id } satisfies BestSetupWorkerRequest);
    abortRef.current?.abort();
    setRunning(false);
    setStage(null);
    setProgress({ phase: "cancelled", percent: 100, message: "Cancelled" });
  }, []);

  const reset = useCallback(() => {
    cancel();
    setResults([]);
    setBankResults([]);
    setStretchResults([]);
    setUpgradePath(null);
    setProgress(null);
    setError(null);
  }, [cancel]);

  const run = useCallback(
    (base: Loadout, monster: MonsterStats, opts: BestSetupRunOptions) => {
      const requestId = ++requestIdRef.current;
      const hasBank = (opts.ownedItemIds?.length ?? 0) > 0;
      // A bank-only request, or an iron, already answers "what can I build now".
      const bankOnly = opts.restrictToOwned === true || opts.accountMode === "iron";
      const stretchCeiling =
        opts.stretchBudget ?? defaultStretchBudget(opts.budget);
      const wantStretch =
        !bankOnly &&
        opts.includeStretch !== false &&
        opts.accountMode === "main" &&
        stretchCeiling > opts.budget;

      const stages: { stage: BestSetupStage; opts: BestSetupRunOptions }[] = [];
      if (hasBank && !bankOnly) stages.push({ stage: "bank", opts: bankStageOptions(opts) });
      stages.push({ stage: bankOnly ? "bank" : "target", opts });
      if (wantStretch) {
        stages.push({
          stage: "stretch",
          opts: { ...opts, budget: stretchCeiling },
        });
      }

      setRunning(true);
      setError(null);
      setResults([]);
      setBankResults([]);
      setStretchResults([]);
      setUpgradePath(null);
      setStage(stages[0].stage);
      setProgress({ phase: "starting", percent: 0, message: "Starting search…" });

      const collected = emptyCollected();
      const store = (stageName: BestSetupStage, found: BestSetupCandidate[]) => {
        let next = found;
        if (stageName === "stretch") {
          // Only keep stretch setups that actually spend above cash-on-hand and
          // improve on the affordable pass — otherwise it's a duplicate card.
          const affordableBest = collected.target[0]?.dps ?? -Infinity;
          next = found.filter(
            (candidate) =>
              candidate.purchaseCost > opts.budget && candidate.dps > affordableBest + 0.001,
          );
        }
        collected[stageName] = next;
        if (stageName === "bank") setBankResults(next);
        else if (stageName === "stretch") setStretchResults(next);
        else setResults(next);
      };

      const finishUpgradePath = (worker: Worker | null) => {
        const target = collected.target[0] ?? collected.bank[0];
        const bank = collected.bank[0];
        if (target && bank && collected.target[0]) {
          if (worker) {
            worker.postMessage({
              type: "upgradePath",
              requestId,
              base,
              monster,
              opts,
              input: {
                from: bank.loadout.equipment,
                to: target.loadout.equipment,
                attackTypes: opts.allowedAttackTypes,
              },
            } satisfies BestSetupWorkerRequest);
            return true;
          }
        }
        return false;
      };

      const worker = ensureWorker();
      if (worker) {
        let index = 0;
        const post = () => {
          const current = stages[index];
          setStage(current.stage);
          worker.postMessage({
            type: "run",
            requestId,
            stage: current.stage,
            base,
            monster,
            opts: current.opts,
          } satisfies BestSetupWorkerRequest);
        };
        const onMessage = (event: MessageEvent<BestSetupWorkerResponse>) => {
          const message = event.data;
          if (message.requestId !== requestId) return;
          if (message.type === "progress") {
            setProgress(message.progress);
            return;
          }
          if (message.type === "error") {
            setError(message.message);
            setRunning(false);
            setStage(null);
            worker.removeEventListener("message", onMessage);
            return;
          }
          if (message.type === "upgradePath") {
            setUpgradePath(message.path);
            worker.removeEventListener("message", onMessage);
            return;
          }
          store(message.stage, message.results);
          index++;
          if (index < stages.length) {
            post();
            return;
          }
          const waitingForPath = finishUpgradePath(worker);
          if (!waitingForPath) worker.removeEventListener("message", onMessage);
          setRunning(false);
          setStage(null);
          setProgress({
            phase: "done",
            percent: 100,
            message: message.results.length
              ? `Found ${message.results.length} setup${message.results.length === 1 ? "" : "s"}`
              : "No setups found",
          });
        };
        worker.addEventListener("message", onMessage);
        post();
        return;
      }

      // Fallback: async main-thread search with yields (loads engine on demand).
      const controller = new AbortController();
      abortRef.current = controller;
      void import("@/lib/optimizer/bestSetup")
        .then(async ({ findBestSetupAsync, computeUpgradePath }) => {
          for (const current of stages) {
            if (controller.signal.aborted) break;
            setStage(current.stage);
            const found = await findBestSetupAsync(base, monster, {
              ...current.opts,
              signal: controller.signal,
              onProgress: (p) => {
                if (requestIdRef.current !== requestId) return;
                setProgress(p);
              },
            });
            if (requestIdRef.current !== requestId) return;
            store(current.stage, found);
          }
          if (requestIdRef.current !== requestId) return;
          const target = collected.target[0];
          const bank = collected.bank[0];
          if (target && bank && !controller.signal.aborted) {
            setUpgradePath(
              computeUpgradePath(base, monster, opts, {
                from: bank.loadout.equipment,
                to: target.loadout.equipment,
                attackTypes: opts.allowedAttackTypes,
              }),
            );
          }
          setRunning(false);
          setStage(null);
          setProgress({
            phase: controller.signal.aborted ? "cancelled" : "done",
            percent: 100,
            message: controller.signal.aborted ? "Cancelled" : "Search complete",
          });
        })
        .catch((err: unknown) => {
          if (requestIdRef.current !== requestId) return;
          setError(err instanceof Error ? err.message : String(err));
          setRunning(false);
          setStage(null);
        });
    },
    [ensureWorker],
  );

  return {
    running,
    stage,
    progress,
    bankResults,
    results,
    stretchResults,
    upgradePath,
    error,
    run,
    cancel,
    reset,
  };
}
