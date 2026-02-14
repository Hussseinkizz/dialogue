import { Server as BunEngine } from "@socket.io/bun-engine";
import type { Hono } from "hono";
import { cors as honoCors } from "hono/cors";
import { Server } from "socket.io";
import {
  createConnectedClient,
  extractUserFromSocket,
} from "./client-handler.ts";
import type { HistoryManager } from "./history.ts";
import { createDefaultLogger } from "./logger.ts";
import { createRateLimiter } from "./rate-limiter.ts";
import { createRoomManager, type RoomManagerInstance } from "./room.ts";
import type {
  ConnectedClient,
  CorsConfig,
  DialogueConfig,
  DialogueContext,
  HooksConfig,
  Logger,
  Room,
} from "./types.ts";

/**
 * Builds Socket.IO CORS options from DialogueConfig cors setting.
 * Defaults to allowing all origins for ease of development.
 */
function buildCorsOptions(cors: CorsConfig | boolean | undefined): {
  origin: string | string[] | boolean;
  methods?: string[];
  credentials?: boolean;
} {
  // Default: allow all origins (development-friendly)
  if (cors === undefined || cors === true) {
    return {
      origin: true,
      methods: ["GET", "POST"],
      credentials: true,
    };
  }

  // Explicitly disabled
  if (cors === false) {
    return { origin: false };
  }

  // Custom config
  return {
    origin: cors.origin,
    methods: cors.methods ?? ["GET", "POST"],
    credentials: cors.credentials ?? true,
  };
}

/**
 * Builds Hono CORS middleware options from DialogueConfig cors setting.
 */
function buildHonoCorsOptions(cors: CorsConfig | boolean | undefined): {
  origin: string | string[] | ((origin: string) => string | undefined);
  allowMethods: string[];
  credentials: boolean;
} {
  // Default: allow all origins (development-friendly)
  if (cors === undefined || cors === true) {
    return {
      origin: "*",
      allowMethods: ["GET", "POST", "OPTIONS"],
      credentials: true,
    };
  }

  // Explicitly disabled - still need to return something valid
  if (cors === false) {
    return {
      origin: () => undefined,
      allowMethods: ["GET", "POST"],
      credentials: false,
    };
  }

  // Custom config
  const originValue = cors.origin;

  let resolvedOrigin:
    | string
    | string[]
    | ((origin: string) => string | undefined);
  if (originValue === true) {
    resolvedOrigin = "*";
  } else if (originValue === false) {
    resolvedOrigin = () => undefined;
  } else {
    resolvedOrigin = originValue;
  }

  return {
    origin: resolvedOrigin,
    allowMethods: cors.methods ?? ["GET", "POST", "OPTIONS"],
    credentials: cors.credentials ?? true,
  };
}

/**
 * Adds CORS headers to a response based on the request origin and config.
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

  // Determine allowed origin
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
 * Sends history to a client when they join a room (if syncHistoryOnJoin is enabled)
 */
function sendHistoryOnJoin(
  socket: import("socket.io").Socket,
  roomId: string,
  roomConfig: import("./types.ts").RoomConfig | undefined,
  historyManager: HistoryManager | undefined
): void {
  if (!(roomConfig?.syncHistoryOnJoin && historyManager)) {
    return;
  }

  const limit =
    typeof roomConfig.syncHistoryOnJoin === "number"
      ? roomConfig.syncHistoryOnJoin
      : undefined;

  const historyEvents = historyManager.getAll(roomId, limit);
  if (historyEvents.length > 0) {
    socket.emit("dialogue:history", {
      roomId,
      events: historyEvents,
    });
  }
}

/**
 * Helper function to create a DialogueContext from current runtime state.
 * This function converts internal state (Maps) to the Record format expected by DialogueContext.
 */
function createDialogueContext(
  io: Server,
  connectedClients: Map<string, ConnectedClient>,
  roomManager: RoomManagerInstance
): DialogueContext {
  // Convert Map to Record for clients
  const clientsRecord: Record<string, ConnectedClient> = {};
  for (const [id, client] of connectedClients.entries()) {
    clientsRecord[id] = client;
  }

  // Convert room manager's rooms to Record
  const roomsRecord: Record<string, Room> = {};
  for (const room of roomManager.all()) {
    roomsRecord[room.id] = room;
  }

  return {
    io,
    clients: clientsRecord,
    rooms: roomsRecord,
  };
}

/**
 * Sets up the Socket.IO server and wires up all handlers.
 * Handles connection lifecycle and message routing.
 *
 * @param app - Hono app instance
 * @param config - Dialogue configuration
 * @param historyManager - Optional history manager for event storage
 * @returns Server components and lifecycle methods
 */
export function setupServer(
  app: Hono,
  config: DialogueConfig,
  historyManager?: HistoryManager
): {
  io: Server;
  engine: BunEngine;
  roomManager: RoomManagerInstance;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  getConnectedClient: (socketId: string) => ConnectedClient | undefined;
  getAllConnectedClients: () => ConnectedClient[];
  getClientsByUserId: (userId: string) => ConnectedClient[];
  getClientRooms: (userId: string) => string[];
  isUserInRoom: (userId: string, roomId: string) => boolean;
} {
  const logger: Logger = config.logger ?? createDefaultLogger();
  const hooks: HooksConfig | undefined = config.hooks;

  /** Connected clients registry keyed by socket ID (instance-scoped) */
  const connectedClients = new Map<string, ConnectedClient>();

  /** Secondary index: userId -> Set of socket IDs for O(1) lookup (instance-scoped) */
  const userIdToSocketIds = new Map<string, Set<string>>();

  // Build CORS configuration for Socket.IO
  const corsOptions = buildCorsOptions(config.cors);

  // Apply Hono CORS middleware for HTTP requests (needed for Socket.IO polling)
  const honoCorsOptions = buildHonoCorsOptions(config.cors);
  app.use("*", honoCors(honoCorsOptions));

  const io = new Server({ cors: corsOptions });
  const engine = new BunEngine();

  io.bind(engine);

  // Create a helper function to build context - will be passed to roomManager
  const getContextForHooks = (): DialogueContext => {
    return createDialogueContext(io, connectedClients, roomManager);
  };

  const roomManager = createRoomManager(
    io,
    logger,
    historyManager,
    hooks,
    getContextForHooks
  );

  // Rate limiter for history requests: 20 requests per minute per socket
  const historyRateLimiter = createRateLimiter({
    maxRequests: 20,
    windowMs: 60_000,
  });

  for (const [roomId, roomConfig] of Object.entries(config.rooms)) {
    roomManager.register(roomId, roomConfig);
  }

  // Wire socket authentication middleware if provided.
  // Runs during handshake — rejects connection before it enters connectedClients.
  if (hooks?.socket?.authenticate) {
    const authenticateHook = hooks.socket.authenticate;

    io.use(async (socket, next) => {
      const authData = socket.handshake.auth;

      // Build context for the authenticate hook
      // Note: At this point, the client hasn't been added to connectedClients yet
      const context = createDialogueContext(io, connectedClients, roomManager);

      try {
        const result = await Promise.resolve(
          authenticateHook({
            context,
            clientSocket: socket,
            authData,
          })
        );

        if (result.isErr) {
          logger.warn({
            message: `Authentication rejected: ${result.error}`,
            atFunction: "setupServer.authenticate",
            data: { socketId: socket.id },
          });
          return next(new Error(result.error));
        }

        // Store authenticated auth data on socket for the connection handler
        // The authData contains jwt field with claims
        socket.data = {
          ...socket.data,
          authenticatedAuthData: result.value,
        };

        return next();
      } catch (err) {
        logger.error({
          message: "Error in authenticate hook",
          atFunction: "setupServer.authenticate",
          data: err,
        });
        return next(new Error("Authentication failed"));
      }
    });
  }

  io.on("connection", (socket) => {
    // Use authenticated data from middleware if available, otherwise fall back to extraction
    let userId: string;
    let meta: Record<string, unknown>;
    let authData: import("./types.ts").AuthData | undefined;

    if (socket.data?.authenticatedAuthData) {
      authData = socket.data
        .authenticatedAuthData as import("./types.ts").AuthData;
      // Extract userId from JWT claims (sub field is standard for user ID)
      userId = authData.jwt.sub;
      // For now, use empty meta - can be extended later if needed
      meta = {};
    } else {
      const extracted = extractUserFromSocket(socket);
      userId = extracted.userId;
      meta = extracted.meta;
    }

    const client = createConnectedClient(
      socket,
      userId,
      meta,
      roomManager,
      logger
    );

    // Attach auth data to client if it exists
    if (authData) {
      // We need to update the client's auth field
      // Since ConnectedClient is readonly, we'll need to handle this differently
      // For now, we can cast and assign (TODO: refactor createConnectedClient to accept auth)
      (client as { auth?: import("./types.ts").AuthData }).auth = authData;
    }

    connectedClients.set(socket.id, client);

    // Add to userId index
    const userSockets = userIdToSocketIds.get(client.userId) ?? new Set();
    userSockets.add(socket.id);
    userIdToSocketIds.set(client.userId, userSockets);

    socket.emit("dialogue:connected", {
      clientId: client.id,
      userId: client.userId,
    });

    // Call onConnected hook if provided
    if (hooks?.clients?.onConnected) {
      Promise.resolve(hooks.clients.onConnected(client)).catch((err) => {
        logger.error({
          message: "Error in onConnected hook",
          atFunction: "setupServer.onConnected",
          data: err,
        });
      });
    }

    socket.on("dialogue:join", (data: { roomId: string }) => {
      if (typeof data?.roomId !== "string") {
        return;
      }

      const room = roomManager.get(data.roomId);
      if (!room) {
        socket.emit("dialogue:error", {
          code: "ROOM_NOT_FOUND",
          message: `Room '${data.roomId}' does not exist`,
        });
        return;
      }

      // Run beforeJoin hook — can deny room access
      if (hooks?.clients?.beforeJoin) {
        // Build fresh context for this hook call
        const context = createDialogueContext(
          io,
          connectedClients,
          roomManager
        );

        const joinResult = hooks.clients.beforeJoin({
          context,
          client,
          roomId: data.roomId,
          room,
        });

        if (joinResult.isErr) {
          logger.warn({
            message: `Join denied for room '${data.roomId}': ${joinResult.error}`,
            atFunction: "setupServer.beforeJoin",
            data: {
              roomId: data.roomId,
              clientId: client.id,
              reason: joinResult.error,
            },
          });
          socket.emit("dialogue:error", {
            code: "JOIN_DENIED",
            message: joinResult.error,
          });
          return;
        }
      }

      client.join(data.roomId);

      // Call onJoined hook if provided
      if (hooks?.clients?.onJoined) {
        Promise.resolve(hooks.clients.onJoined(client, data.roomId)).catch(
          (err) => {
            logger.error({
              message: "Error in onJoined hook",
              atFunction: "setupServer.onJoined",
              data: err,
            });
          }
        );
      }

      // Send history on join if syncHistoryOnJoin is enabled
      sendHistoryOnJoin(
        socket,
        data.roomId,
        config.rooms[data.roomId],
        historyManager
      );
    });

    socket.on("dialogue:leave", (data: { roomId: string }) => {
      if (typeof data?.roomId === "string") {
        client.leave(data.roomId);

        // Call onLeft hook if provided
        if (hooks?.clients?.onLeft) {
          Promise.resolve(hooks.clients.onLeft(client, data.roomId)).catch(
            (err) => {
              logger.error({
                message: "Error in onLeft hook",
                atFunction: "setupServer.onLeft",
                data: err,
              });
            }
          );
        }
      }
    });

    socket.on(
      "dialogue:subscribe",
      (data: { roomId: string; eventName: string }) => {
        if (
          typeof data?.roomId === "string" &&
          typeof data?.eventName === "string"
        ) {
          client.subscribe(data.roomId, data.eventName);
        }
      }
    );

    socket.on("dialogue:subscribeAll", (data: { roomId: string }) => {
      if (typeof data?.roomId === "string") {
        client.subscribeAll(data.roomId);
      }
    });

    socket.on(
      "dialogue:unsubscribe",
      (data: { roomId: string; eventName: string }) => {
        if (
          typeof data?.roomId === "string" &&
          typeof data?.eventName === "string"
        ) {
          client.unsubscribe(data.roomId, data.eventName);
        }
      }
    );

    // Handle history requests from clients (rate limited)
    socket.on(
      "dialogue:getHistory",
      async (data: {
        roomId: string;
        eventName?: string;
        start?: number;
        end?: number;
      }) => {
        // Rate limit check: 20 requests per minute per socket
        if (!historyRateLimiter.isAllowed(socket.id)) {
          socket.emit("dialogue:error", {
            code: "RATE_LIMITED",
            message:
              "Too many history requests. Please wait before trying again.",
          });
          return;
        }

        if (typeof data?.roomId !== "string") {
          socket.emit("dialogue:error", {
            code: "INVALID_REQUEST",
            message: "roomId is required",
          });
          return;
        }

        const room = roomManager.get(data.roomId);
        if (!room) {
          socket.emit("dialogue:error", {
            code: "ROOM_NOT_FOUND",
            message: `Room '${data.roomId}' does not exist`,
          });
          return;
        }

        const start = data.start ?? 0;
        const end = data.end ?? 50;

        // If no eventName provided, return empty array (use room.events to get types)
        if (!data.eventName) {
          socket.emit("dialogue:historyResponse", {
            roomId: data.roomId,
            eventName: null,
            events: [],
            start,
            end,
          });
          return;
        }

        const events = await room.history(data.eventName, start, end);
        socket.emit("dialogue:historyResponse", {
          roomId: data.roomId,
          eventName: data.eventName,
          events,
          start,
          end,
        });
      }
    );

    socket.on(
      "dialogue:trigger",
      (data: { roomId: string; event: string; data: unknown }) => {
        if (
          typeof data?.roomId !== "string" ||
          typeof data?.event !== "string"
        ) {
          return;
        }

        const room = roomManager.get(data.roomId);
        if (!room) {
          socket.emit("dialogue:error", {
            code: "ROOM_NOT_FOUND",
            message: `Room '${data.roomId}' does not exist`,
          });
          return;
        }

        const eventDef = room.events.find((e) => e.name === data.event);
        if (!eventDef && room.events.length > 0) {
          socket.emit("dialogue:error", {
            code: "EVENT_NOT_ALLOWED",
            message: `Event '${data.event}' is not allowed in room '${data.roomId}'`,
          });
          return;
        }

        const triggerEvent = eventDef ?? { name: data.event };
        const result = room.trigger(triggerEvent, data.data, client.userId);

        if (result.isErr) {
          socket.emit("dialogue:error", {
            code: "VALIDATION_FAILED",
            message: result.error,
          });
        }
      }
    );

    socket.on("dialogue:listRooms", () => {
      const rooms = roomManager.all().map((room) => ({
        id: room.id,
        name: room.name,
        description: room.description,
        size: roomManager.getRoomSize(room.id),
        maxSize: room.maxSize,
      }));
      socket.emit("dialogue:rooms", rooms);
    });

    socket.on(
      "dialogue:createRoom",
      (data: {
        id: string;
        name: string;
        description?: string;
        maxSize?: number;
      }) => {
        if (typeof data?.id !== "string" || typeof data?.name !== "string") {
          socket.emit("dialogue:error", {
            code: "INVALID_REQUEST",
            message: "Room id and name are required",
          });
          return;
        }

        // Check if room already exists
        if (roomManager.get(data.id)) {
          socket.emit("dialogue:error", {
            code: "ROOM_EXISTS",
            message: `Room '${data.id}' already exists`,
          });
          return;
        }

        // Create the room with empty events (open room - any event allowed)
        const room = roomManager.register(data.id, {
          name: data.name,
          description: data.description,
          maxSize: data.maxSize,
          events: [],
          createdById: client.userId,
        });

        // Notify the creator
        socket.emit("dialogue:roomCreated", {
          id: room.id,
          name: room.name,
          description: room.description,
          maxSize: room.maxSize,
          createdById: room.createdById,
        });

        // Broadcast to all other clients
        socket.broadcast.emit("dialogue:roomCreated", {
          id: room.id,
          name: room.name,
          description: room.description,
          maxSize: room.maxSize,
          createdById: room.createdById,
        });

        logger.info({
          message: `Room '${data.id}' created by ${client.userId}`,
          atFunction: "setupServer.createRoom",
          data: { roomId: data.id, createdBy: client.userId },
        });
      }
    );

    socket.on("dialogue:deleteRoom", (data: { roomId: string }) => {
      if (typeof data?.roomId !== "string") {
        return;
      }

      const room = roomManager.get(data.roomId);
      if (!room) {
        socket.emit("dialogue:error", {
          code: "ROOM_NOT_FOUND",
          message: `Room '${data.roomId}' does not exist`,
        });
        return;
      }

      // Only allow creator or add admin check here
      if (room.createdById && room.createdById !== client.userId) {
        socket.emit("dialogue:error", {
          code: "PERMISSION_DENIED",
          message: "Only the room creator can delete this room",
        });
        return;
      }

      const deleted = roomManager.unregister(data.roomId);
      if (deleted) {
        // Broadcast deletion to all clients
        io.emit("dialogue:roomDeleted", { roomId: data.roomId });

        logger.info({
          message: `Room '${data.roomId}' deleted by ${client.userId}`,
          atFunction: "setupServer.deleteRoom",
          data: { roomId: data.roomId, deletedBy: client.userId },
        });
      }
    });

    socket.on("disconnect", () => {
      // Call onDisconnected hook before cleanup
      if (hooks?.clients?.onDisconnected) {
        Promise.resolve(hooks.clients.onDisconnected(client)).catch((err) => {
          logger.error({
            message: "Error in onDisconnected hook",
            atFunction: "setupServer.onDisconnected",
            data: err,
          });
        });
      }

      roomManager.removeFromAllRooms(client.id);
      connectedClients.delete(socket.id);

      // Remove from userId index
      const userSockets = userIdToSocketIds.get(client.userId);
      if (userSockets) {
        userSockets.delete(socket.id);
        if (userSockets.size === 0) {
          userIdToSocketIds.delete(client.userId);
        }
      }
    });
  });

  const { websocket } = engine.handler();

  const port = config.port ?? 3000;

  let bunServer: ReturnType<typeof Bun.serve> | null = null;

  return {
    io,
    engine,
    roomManager,

    start(): Promise<void> {
      bunServer = Bun.serve({
        port,
        idleTimeout: 30,

        async fetch(req: Request, server) {
          const url = new URL(req.url);

          if (url.pathname.startsWith("/socket.io")) {
            // Handle OPTIONS preflight requests
            if (req.method === "OPTIONS") {
              return addCorsHeaders(
                new Response(null, { status: 204 }),
                req,
                config.cors
              );
            }

            const response = await engine.handleRequest(req, server);
            return addCorsHeaders(response, req, config.cors);
          }

          return app.fetch(req);
        },

        websocket,
      });

      logger.info({
        message: `Server running on http://localhost:${port}`,
        atFunction: "setupServer.start",
        data: { port },
      });
      return Promise.resolve();
    },

    stop(): Promise<void> {
      if (bunServer) {
        bunServer.stop();
        bunServer = null;
      }

      for (const client of connectedClients.values()) {
        client.disconnect();
      }
      connectedClients.clear();
      userIdToSocketIds.clear();

      io.close();
      logger.info({
        message: "Server stopped",
        atFunction: "setupServer.stop",
        data: null,
      });
      return Promise.resolve();
    },

    /**
     * Gets a connected client by socket ID
     */
    getConnectedClient(socketId: string): ConnectedClient | undefined {
      return connectedClients.get(socketId);
    },

    /**
     * Gets all connected clients
     */
    getAllConnectedClients(): ConnectedClient[] {
      return Array.from(connectedClients.values());
    },

    /**
     * Gets all connected clients for a specific user ID.
     * Returns array since a user may have multiple connections.
     */
    getClientsByUserId(userId: string): ConnectedClient[] {
      const socketIds = userIdToSocketIds.get(userId);
      if (!socketIds) {
        return [];
      }

      const clients: ConnectedClient[] = [];
      for (const socketId of socketIds) {
        const client = connectedClients.get(socketId);
        if (client) {
          clients.push(client);
        }
      }
      return clients;
    },

    /**
     * Gets all room IDs that a user is currently in.
     * Aggregates rooms across all connections for this user.
     */
    getClientRooms(userId: string): string[] {
      const clients = this.getClientsByUserId(userId);
      const roomSet = new Set<string>();

      for (const client of clients) {
        for (const roomId of client.rooms()) {
          roomSet.add(roomId);
        }
      }

      return Array.from(roomSet);
    },

    /**
     * Checks if a user is in a specific room (any of their connections)
     */
    isUserInRoom(userId: string, roomId: string): boolean {
      const clients = this.getClientsByUserId(userId);
      return clients.some((client) => client.rooms().includes(roomId));
    },
  };
}
