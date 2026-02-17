import { Server as BunEngine } from "@socket.io/bun-engine";
import type { Server } from "socket.io";
import type { CorsConfig } from "../types.ts";
import type { RuntimeAdapter, RuntimeStartOptions } from "./types.ts";

/**
 * Adds CORS headers to a response based on the request origin and config.
 * Needed for Socket.IO polling transport on the Bun adapter since
 * Bun.serve handles fetch directly without Hono middleware for /socket.io.
 */
function addCorsHeaders(
  response: Response,
  request: Request,
  corsConfig: CorsConfig | boolean | undefined
): Response {
  const origin = request.headers.get("Origin");
  if (!origin) {
    return response;
  }

  const headers = new Headers(response.headers);

  if (corsConfig === undefined || corsConfig === true) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Credentials", "true");
  } else if (corsConfig === false) {
    return response;
  } else {
    const allowedOrigin = corsConfig.origin;
    if (allowedOrigin === true) {
      headers.set("Access-Control-Allow-Origin", origin);
    } else if (typeof allowedOrigin === "string" && allowedOrigin === origin) {
      headers.set("Access-Control-Allow-Origin", origin);
    } else if (Array.isArray(allowedOrigin) && allowedOrigin.includes(origin)) {
      headers.set("Access-Control-Allow-Origin", origin);
    }

    if (corsConfig.credentials !== false) {
      headers.set("Access-Control-Allow-Credentials", "true");
    }
  }

  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Creates a runtime adapter for Bun.
 * Uses @socket.io/bun-engine for WebSocket transport and Bun.serve() for HTTP.
 */
export function createBunAdapter(): RuntimeAdapter {
  const engine = new BunEngine();
  let bunServer: ReturnType<typeof Bun.serve> | null = null;

  return {
    runtime: "bun",

    bind(io: Server): void {
      io.bind(engine);
    },

    start({
      port,
      app,
      corsConfig,
      logger,
    }: RuntimeStartOptions): Promise<void> {
      const { websocket } = engine.handler();

      bunServer = Bun.serve({
        port,
        idleTimeout: 30,

        async fetch(req: Request, server) {
          const url = new URL(req.url);

          if (url.pathname.startsWith("/socket.io")) {
            if (req.method === "OPTIONS") {
              return addCorsHeaders(
                new Response(null, { status: 204 }),
                req,
                corsConfig
              );
            }

            const response = await engine.handleRequest(req, server);
            return addCorsHeaders(response, req, corsConfig);
          }

          return app.fetch(req);
        },

        websocket,
      });

      logger.info({
        message: `Server running on http://localhost:${port} (bun)`,
        atFunction: "bunAdapter.start",
        data: { port, runtime: "bun" },
      });

      return Promise.resolve();
    },

    stop(): Promise<void> {
      if (bunServer) {
        bunServer.stop();
        bunServer = null;
      }
      return Promise.resolve();
    },
  };
}
