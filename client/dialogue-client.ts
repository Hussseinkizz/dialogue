import { io, type Socket } from "socket.io-client";
import { createRoomContext } from "./room-context.ts";
import type {
  ClientConfig,
  ConnectionResult,
  ConnectionState,
  CreateRoomOptions,
  DialogueError,
  EventMessage,
  HistoryResponse,
  JoinResult,
  RoomContext,
  RoomInfo,
} from "./types.ts";

/**
 * Dialogue client instance returned by createDialogueClient
 */
export interface DialogueClientInstance {
  /** User ID assigned by the server */
  readonly userId: string;
  /** Whether the client is connected to the server */
  readonly connected: boolean;
  /** Current connection state */
  readonly state: ConnectionState;

  /**
   * Connect to the server
   * @returns Promise that resolves when connected
   */
  connect(): Promise<void>;

  /**
   * Disconnect from the server
   */
  disconnect(): void;

  /**
   * Join a room
   * @param roomId - Room ID to join
   * @returns Promise resolving to RoomContext
   */
  join(roomId: string): Promise<RoomContext>;

  /**
   * Get a joined room context
   * @param roomId - Room ID
   * @returns RoomContext or undefined if not joined
   */
  getRoom(roomId: string): RoomContext | undefined;

  /**
   * List all available rooms on the server
   * @returns Promise resolving to array of room info
   */
  listRooms(): Promise<RoomInfo[]>;

  /**
   * Create a new room on the server
   * @param options - Room creation options
   * @returns Promise resolving to created room info
   */
  createRoom(options: CreateRoomOptions): Promise<RoomInfo>;

  /**
   * Delete a room on the server (only creator can delete)
   * @param roomId - Room ID to delete
   * @returns Promise resolving when deleted
   */
  deleteRoom(roomId: string): Promise<void>;

  /**
   * Register a handler for when a new room is created
   * @param handler - Called when a room is created
   * @returns Unsubscribe function
   */
  onRoomCreated(handler: (room: RoomInfo) => void): () => void;

  /**
   * Register a handler for when a room is deleted
   * @param handler - Called when a room is deleted
   * @returns Unsubscribe function
   */
  onRoomDeleted(handler: (roomId: string) => void): () => void;

  /**
   * Register a connection handler
   * @param handler - Called when connected
   * @returns Unsubscribe function
   */
  onConnect(handler: () => void): () => void;

  /**
   * Register a disconnection handler
   * @param handler - Called when disconnected with reason
   * @returns Unsubscribe function
   */
  onDisconnect(handler: (reason: string) => void): () => void;

  /**
   * Register an error handler
   * @param handler - Called on errors
   * @returns Unsubscribe function
   */
  onError(handler: (error: Error) => void): () => void;

  /**
   * Register a handler for history events (sent when joining a room with syncHistoryOnJoin)
   * @param handler - Called when history is received
   * @returns Unsubscribe function
   */
  onHistory(
    handler: (roomId: string, events: EventMessage[]) => void
  ): () => void;
}

/**
 * Creates a Dialogue client for connecting to a Dialogue server from the frontend.
 * Manages WebSocket connection, room membership, and event handling.
 *
 * @param config - Client configuration
 * @returns DialogueClientInstance
 *
 * @example
 * const client = createDialogueClient({
 *   url: 'ws://localhost:3000',
 *   auth: { userId: 'user-123', token: 'jwt-token' }
 * })
 *
 * await client.connect()
 *
 * const chat = await client.join('chat')
 * chat.on('message', (msg) => console.log(msg.data))
 * chat.trigger('message', { text: 'Hello!' })
 */
export function createDialogueClient(
  config: ClientConfig
): DialogueClientInstance {
  const socket: Socket = io(config.url, {
    auth: config.auth,
    autoConnect: config.autoConnect ?? true,
    reconnection: config.reconnection ?? true,
    reconnectionAttempts: config.reconnectionAttempts ?? 5,
  });

  let connectionState: ConnectionState = "disconnected";
  let userIdValue: string | null = null;

  const joinedRooms = new Map<string, RoomContext>();
  const connectHandlers = new Set<() => void>();
  const disconnectHandlers = new Set<(reason: string) => void>();
  const errorHandlers = new Set<(error: Error) => void>();
  const roomCreatedHandlers = new Set<(room: RoomInfo) => void>();
  const roomDeletedHandlers = new Set<(roomId: string) => void>();
  const historyHandlers = new Set<
    (roomId: string, events: EventMessage[]) => void
  >();

  /** Sets up internal socket event listeners */
  const setupSocketListeners = (): void => {
    socket.on("connect", () => {
      connectionState = "connecting";
    });

    socket.on("dialogue:connected", (result: ConnectionResult) => {
      connectionState = "connected";
      userIdValue = result.userId;

      for (const handler of connectHandlers) {
        handler();
      }
    });

    socket.on("disconnect", (reason) => {
      connectionState = "disconnected";

      for (const handler of disconnectHandlers) {
        handler(reason);
      }
    });

    socket.on("connect_error", (error) => {
      for (const handler of errorHandlers) {
        handler(error);
      }
    });

    socket.on("dialogue:error", (error: DialogueError) => {
      const err = new Error(`[${error.code}] ${error.message}`);
      for (const handler of errorHandlers) {
        handler(err);
      }
    });

    socket.on("dialogue:roomCreated", (room: RoomInfo) => {
      for (const handler of roomCreatedHandlers) {
        handler(room);
      }
    });

    socket.on("dialogue:roomDeleted", (data: { roomId: string }) => {
      // If we're in this room, clean up
      const context = joinedRooms.get(data.roomId);
      if (context) {
        joinedRooms.delete(data.roomId);
      }

      for (const handler of roomDeletedHandlers) {
        handler(data.roomId);
      }
    });

    // Handle history sync on join
    socket.on("dialogue:history", (data: HistoryResponse) => {
      for (const handler of historyHandlers) {
        handler(data.roomId, data.events);
      }
    });
  };

  // Initialize socket listeners
  setupSocketListeners();

  return {
    get userId(): string {
      return userIdValue ?? "";
    },

    get connected(): boolean {
      return connectionState === "connected";
    },

    get state(): ConnectionState {
      return connectionState;
    },

    connect(): Promise<void> {
      if (connectionState === "connected") {
        return Promise.resolve();
      }

      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("Connection timeout"));
        }, 10_000);

        const cleanup = () => {
          clearTimeout(timeout);
          socket.off("dialogue:connected", onConnect);
          socket.off("connect_error", onError);
        };

        const onConnect = () => {
          cleanup();
          resolve();
        };

        const onError = (error: Error) => {
          cleanup();
          reject(error);
        };

        socket.once("dialogue:connected", onConnect);
        socket.once("connect_error", onError);

        if (!socket.connected) {
          socket.connect();
        }
      });
    },

    disconnect(): void {
      for (const [, context] of joinedRooms) {
        context.leave();
      }
      joinedRooms.clear();
      socket.disconnect();
    },

    join(roomId: string): Promise<RoomContext> {
      const existing = joinedRooms.get(roomId);
      if (existing) {
        return Promise.resolve(existing);
      }

      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          cleanup();
          reject(new Error(`Timeout joining room '${roomId}'`));
        }, 5000);

        const cleanup = () => {
          clearTimeout(timeout);
          socket.off("dialogue:joined", onJoined);
          socket.off("dialogue:error", onError);
        };

        const onJoined = (result: JoinResult) => {
          if (result.roomId !== roomId) {
            return;
          }

          cleanup();

          const context = createRoomContext(
            socket,
            result.roomId,
            result.roomName,
            () => {
              joinedRooms.delete(roomId);
            }
          );

          joinedRooms.set(roomId, context);
          resolve(context);
        };

        const onError = (error: DialogueError) => {
          cleanup();
          reject(new Error(`[${error.code}] ${error.message}`));
        };

        socket.on("dialogue:joined", onJoined);
        socket.once("dialogue:error", onError);

        socket.emit("dialogue:join", { roomId });
      });
    },

    getRoom(roomId: string): RoomContext | undefined {
      return joinedRooms.get(roomId);
    },

    listRooms(): Promise<RoomInfo[]> {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          cleanup();
          reject(new Error("Timeout listing rooms"));
        }, 5000);

        const cleanup = () => {
          clearTimeout(timeout);
          socket.off("dialogue:rooms", onRooms);
        };

        const onRooms = (rooms: RoomInfo[]) => {
          cleanup();
          resolve(rooms);
        };

        socket.once("dialogue:rooms", onRooms);
        socket.emit("dialogue:listRooms");
      });
    },

    createRoom(options: CreateRoomOptions): Promise<RoomInfo> {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          cleanup();
          reject(new Error("Timeout creating room"));
        }, 5000);

        const cleanup = () => {
          clearTimeout(timeout);
          socket.off("dialogue:roomCreated", onCreated);
          socket.off("dialogue:error", onError);
        };

        const onCreated = (room: RoomInfo) => {
          // Only resolve if this is the room we created
          if (room.id === options.id) {
            cleanup();
            resolve(room);
          }
        };

        const onError = (error: DialogueError) => {
          cleanup();
          reject(new Error(`[${error.code}] ${error.message}`));
        };

        socket.on("dialogue:roomCreated", onCreated);
        socket.once("dialogue:error", onError);

        socket.emit("dialogue:createRoom", {
          id: options.id,
          name: options.name,
          description: options.description,
          maxSize: options.maxSize,
        });
      });
    },

    deleteRoom(roomId: string): Promise<void> {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          cleanup();
          reject(new Error("Timeout deleting room"));
        }, 5000);

        const cleanup = () => {
          clearTimeout(timeout);
          socket.off("dialogue:roomDeleted", onDeleted);
          socket.off("dialogue:error", onError);
        };

        const onDeleted = (data: { roomId: string }) => {
          if (data.roomId === roomId) {
            cleanup();
            resolve();
          }
        };

        const onError = (error: DialogueError) => {
          cleanup();
          reject(new Error(`[${error.code}] ${error.message}`));
        };

        socket.on("dialogue:roomDeleted", onDeleted);
        socket.once("dialogue:error", onError);

        socket.emit("dialogue:deleteRoom", { roomId });
      });
    },

    onRoomCreated(handler: (room: RoomInfo) => void): () => void {
      roomCreatedHandlers.add(handler);
      return () => {
        roomCreatedHandlers.delete(handler);
      };
    },

    onRoomDeleted(handler: (roomId: string) => void): () => void {
      roomDeletedHandlers.add(handler);
      return () => {
        roomDeletedHandlers.delete(handler);
      };
    },

    onConnect(handler: () => void): () => void {
      connectHandlers.add(handler);
      return () => {
        connectHandlers.delete(handler);
      };
    },

    onDisconnect(handler: (reason: string) => void): () => void {
      disconnectHandlers.add(handler);
      return () => {
        disconnectHandlers.delete(handler);
      };
    },

    onError(handler: (error: Error) => void): () => void {
      errorHandlers.add(handler);
      return () => {
        errorHandlers.delete(handler);
      };
    },

    onHistory(
      handler: (roomId: string, events: EventMessage[]) => void
    ): () => void {
      historyHandlers.add(handler);
      return () => {
        historyHandlers.delete(handler);
      };
    },
  };
}
