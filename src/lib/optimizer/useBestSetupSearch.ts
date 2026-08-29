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
import type { Loadout, MonsterStats } from "@/lib/types";

export type BestSetupRunOptions = Omit<BestSetupOptions, "onProgress" | "signal" | "itemPool">;

interface UseBestSetupSearchResult {
  running: boolean;
  /** Which pass is running: what you can build now, or what you can obtain. */
  stage: BestSetupStage | null;
  progress: BestSetupProgress | null;
  /** Best setups using only imported bank items. */
  bankResults: BestSetupCandidate[];
  /** Best setups once purchases / in-game unlocks are allowed. */
  results: BestSetupCandidate[];
  /** Cheapest-first order for closing the gap between the two, when both exist. */
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

/**
 * Runs Best Setup off the main thread when Workers are available; otherwise
 * falls back to an async main-thread search that yields between attack types.
 *
 * Searches run in two passes so the user first sees the best setup they can
 * build from their bank right now, then what buying / unlocking gear adds.
 */
export function useBestSetupSearch(): UseBestSetupSearchResult {
  const [running, setRunning] = useState(false);
  const [stage, setStage] = useState<BestSetupStage | null>(null);
  const [progress, setProgress] = useState<BestSetupProgress | null>(null);
  const [bankResults, setBankResults] = useState<BestSetupCandidate[]>([]);
  const [results, setResults] = useState<BestSetupCandidate[]>([]);
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
      const stages: { stage: BestSetupStage; opts: BestSetupRunOptions }[] = [];
      if (hasBank && !bankOnly) stages.push({ stage: "bank", opts: bankStageOptions(opts) });
      stages.push({ stage: bankOnly ? "bank" : "target", opts });

      setRunning(true);
      setError(null);
      setResults([]);
      setBankResults([]);
      setUpgradePath(null);
      setStage(stages[0].stage);
      setProgress({ phase: "starting", percent: 0, message: "Starting search…" });

      const collected: Record<BestSetupStage, BestSetupCandidate[]> = { bank: [], target: [] };
      const store = (stageName: BestSetupStage, found: BestSetupCandidate[]) => {
        collected[stageName] = found;
        if (stageName === "bank") setBankResults(found);
        else setResults(found);
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
          const target = collected.target[0];
          const bank = collected.bank[0];
          if (target && bank) {
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
          } else {
            worker.removeEventListener("message", onMessage);
          }
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
    upgradePath,
    error,
    run,
    cancel,
    reset,
  };
}
