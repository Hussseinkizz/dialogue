import type { Hono } from "hono";
import type { Server } from "socket.io";
import type { CorsConfig, Logger } from "../types.ts";

/** Supported runtime environments */
export type Runtime = "bun" | "node";

/**
 * Runtime adapter interface that abstracts the HTTP server and Socket.IO engine
 * binding for different JavaScript runtimes (Bun, Node.js).
 *
 * Each adapter handles:
 * - Binding the Socket.IO engine to the IO server
 * - Starting/stopping the HTTP server with Hono routing and Socket.IO transport
 */
export interface RuntimeAdapter {
  /** The runtime this adapter targets */
  readonly runtime: Runtime;

  /**
   * Bind the Socket.IO server to the runtime-specific engine.
   * For Bun: uses @socket.io/bun-engine
   * For Node: uses Socket.IO's built-in engine.io (attached to http.Server)
   */
  bind(io: Server): void;

  /**
   * Start the HTTP server on the given port, routing both Hono app
   * requests and Socket.IO transport (polling + websocket).
   */
  start(options: RuntimeStartOptions): Promise<void>;

  /** Stop the HTTP server and clean up resources */
  stop(): Promise<void>;
}

/** Options passed to RuntimeAdapter.start() */
export interface RuntimeStartOptions {
  port: number;
  app: Hono;
  io: Server;
  corsConfig: CorsConfig | boolean | undefined;
  logger: Logger;
}
