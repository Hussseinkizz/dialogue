import { createBunAdapter } from "./bun-adapter.ts";
import { createNodeAdapter } from "./node-adapter.ts";
import type { Runtime, RuntimeAdapter } from "./types.ts";

/**
 * Detects the current JavaScript runtime by checking for Bun globals.
 * Falls back to "node" if Bun is not detected.
 */
export function detectRuntime(): Runtime {
  // biome-ignore lint/suspicious/noExplicitAny: runtime detection requires checking unknown global
  if (typeof (globalThis as any).Bun !== "undefined") {
    return "bun";
  }
  return "node";
}

/**
 * Creates the appropriate runtime adapter based on the specified runtime.
 * Uses auto-detection if no runtime is specified.
 *
 * @param runtime - Explicit runtime choice, or auto-detected if omitted
 * @returns A RuntimeAdapter for the target runtime
 */
export function createRuntimeAdapter(runtime?: Runtime): RuntimeAdapter {
  const resolved = runtime ?? detectRuntime();

  const adapters: Record<Runtime, () => RuntimeAdapter> = {
    bun: createBunAdapter,
    node: createNodeAdapter,
  };

  return adapters[resolved]();
}

export type { Runtime, RuntimeAdapter, RuntimeStartOptions } from "./types.ts";
