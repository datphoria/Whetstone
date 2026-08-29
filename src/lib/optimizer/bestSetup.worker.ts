/// <reference lib="webworker" />
/**
 * Best Setup Web Worker — keeps the multi-second beam search off the UI thread.
 */
import {
  computeUpgradePath,
  findBestSetup,
  type BestSetupCandidate,
  type BestSetupOptions,
  type BestSetupProgress,
  type UpgradePath,
  type UpgradePathInput,
} from "./bestSetup";
import type { Loadout, MonsterStats } from "@/lib/types";

/** Which pass of a bank-then-upgrades search a message belongs to. */
export type BestSetupStage = "bank" | "target";

export type BestSetupWorkerRequest =
  | {
      type: "run";
      requestId: number;
      stage: BestSetupStage;
      base: Loadout;
      monster: MonsterStats;
      opts: Omit<BestSetupOptions, "onProgress" | "signal" | "itemPool">;
    }
  | {
      type: "upgradePath";
      requestId: number;
      base: Loadout;
      monster: MonsterStats;
      opts: Omit<BestSetupOptions, "onProgress" | "signal" | "itemPool">;
      input: UpgradePathInput;
    }
  | { type: "cancel"; requestId: number };

export type BestSetupWorkerResponse =
  | { type: "progress"; requestId: number; stage: BestSetupStage; progress: BestSetupProgress }
  | { type: "result"; requestId: number; stage: BestSetupStage; results: BestSetupCandidate[] }
  | { type: "upgradePath"; requestId: number; path: UpgradePath }
  | { type: "error"; requestId: number; stage: BestSetupStage; message: string };

let activeRequestId: number | null = null;
let cancelled = false;

self.onmessage = (event: MessageEvent<BestSetupWorkerRequest>) => {
  const message = event.data;
  if (message.type === "cancel") {
    if (activeRequestId === message.requestId) cancelled = true;
    return;
  }

  if (message.type === "upgradePath") {
    try {
      const path = computeUpgradePath(
        message.base,
        message.monster,
        message.opts,
        message.input,
      );
      self.postMessage({
        type: "upgradePath",
        requestId: message.requestId,
        path,
      } satisfies BestSetupWorkerResponse);
    } catch (error) {
      self.postMessage({
        type: "error",
        requestId: message.requestId,
        stage: "target",
        message: error instanceof Error ? error.message : String(error),
      } satisfies BestSetupWorkerResponse);
    }
    return;
  }

  if (message.type !== "run") return;

  activeRequestId = message.requestId;
  cancelled = false;

  try {
    const results = findBestSetup(message.base, message.monster, {
      ...message.opts,
      signal: {
        get aborted() {
          return cancelled;
        },
        // Minimal AbortSignal-compatible surface for the optimizer checks.
        reason: undefined,
        onabort: null,
        throwIfAborted() {
          if (cancelled) throw new Error("Aborted");
        },
        addEventListener() {},
        removeEventListener() {},
        dispatchEvent() {
          return false;
        },
      } as AbortSignal,
      onProgress: (progress) => {
        const response: BestSetupWorkerResponse = {
          type: "progress",
          requestId: message.requestId,
          stage: message.stage,
          progress,
        };
        self.postMessage(response);
      },
    });

    if (cancelled) {
      self.postMessage({
        type: "progress",
        requestId: message.requestId,
        stage: message.stage,
        progress: { phase: "cancelled", percent: 100, message: "Cancelled" },
      } satisfies BestSetupWorkerResponse);
    }

    self.postMessage({
      type: "result",
      requestId: message.requestId,
      stage: message.stage,
      results: cancelled ? [] : results,
    } satisfies BestSetupWorkerResponse);
  } catch (error) {
    self.postMessage({
      type: "error",
      requestId: message.requestId,
      stage: message.stage,
      message: error instanceof Error ? error.message : String(error),
    } satisfies BestSetupWorkerResponse);
  } finally {
    activeRequestId = null;
  }
};

export {};
