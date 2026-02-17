import { createServer, type Server as HttpServer } from "node:http";
import { getRequestListener } from "@hono/node-server";
import type { Server } from "socket.io";
import type { RuntimeAdapter, RuntimeStartOptions } from "./types.ts";

/**
 * Creates a runtime adapter for Node.js.
 * Uses Node's built-in http.createServer() and Socket.IO's native engine.io
 * (no special engine adapter needed — Socket.IO was designed for Node).
 */
export function createNodeAdapter(): RuntimeAdapter {
  let httpServer: HttpServer | null = null;
  let socketIoServer: Server | null = null;

  return {
    runtime: "node",

    bind(io: Server): void {
      // Socket.IO on Node doesn't need an explicit engine bind.
      // We store the reference and attach it in start() when the http server exists.
      socketIoServer = io;
    },

    start({ port, app, io, logger }: RuntimeStartOptions): Promise<void> {
      // Bridge Hono's fetch API to Node's req/res via @hono/node-server
      const requestListener = getRequestListener(app.fetch);

      httpServer = createServer(requestListener);

      // Attach Socket.IO to the Node http server.
      // Socket.IO uses its built-in engine.io for Node — handles both
      // long-polling and WebSocket upgrade automatically.
      io.attach(httpServer);

      return new Promise((resolve) => {
        httpServer?.listen(port, () => {
          logger.info({
            message: `Server running on http://localhost:${port} (node)`,
            atFunction: "nodeAdapter.start",
            data: { port, runtime: "node" },
          });
          resolve();
        });
      });
    },

    stop(): Promise<void> {
      return new Promise((resolve) => {
        if (socketIoServer) {
          socketIoServer = null;
        }

        if (httpServer) {
          httpServer.close(() => {
            httpServer = null;
            resolve();
          });
        } else {
          resolve();
        }
      });
    },
  };
}
