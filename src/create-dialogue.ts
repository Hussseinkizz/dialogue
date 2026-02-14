import { Hono } from "hono";
import { Err, type Result } from "slang-ts";
import { createHistoryManager } from "./history.ts";
import { createDefaultLogger } from "./logger.ts";
import { setupServer } from "./server.ts";
import type {
  ClientRooms,
  ConnectedClient,
  Dialogue,
  DialogueConfig,
  EventDefinition,
  EventMessage,
  Logger,
  Room,
  RoomConfig,
} from "./types.ts";

/**
 * Creates a Dialogue instance from configuration.
 * This is the main entry point for the library.
 *
 * @param config - Dialogue configuration with rooms, events, and handlers
 * @returns Dialogue instance for triggering events, subscribing, and server control
 *
 * @example
 * // Basic setup with rooms defined upfront
 * const dialogue = createDialogue({
 *   port: 3000,
 *   rooms: {
 *     chat: {
 *       name: 'Chat Room',
 *       events: [Message, Typing],
 *       defaultSubscriptions: ['message'],
 *       syncHistoryOnJoin: true,
 *     }
 *   },
 *   hooks: {
 *     clients: {
 *       onConnected: (client) => {
 *         client.join('chat')
 *       },
 *       onDisconnected: (client) => {
 *         console.log('Client disconnected:', client.userId)
 *       }
 *     },
 *     events: {
 *       onCleanup: async (roomId, eventName, events) => {
 *         await db.events.insertMany(events)
 *       }
 *     }
 *   }
 * })
 *
 * // Use elsewhere in your app
 * dialogue.trigger('chat', Message, { text: 'Hello!' })
 *
 * // Start the server
 * await dialogue.start()
 */
export function createDialogue(config: DialogueConfig): Dialogue {
  const app = config.app ?? new Hono();
  const logger: Logger = config.logger ?? createDefaultLogger();

  // Create history manager with hooks for cleanup and external loading
  const historyManager = createHistoryManager({
    onCleanup: config.hooks?.events?.onCleanup,
    onLoad: config.hooks?.events?.onLoad,
  });

  const {
    io,
    roomManager,
    start,
    stop,
    getConnectedClient: _getConnectedClient,
    getAllConnectedClients,
    getClientsByUserId,
    getClientRooms: getClientRoomIds,
    isUserInRoom,
  } = setupServer(app, config, historyManager);

  const dialogue: Dialogue = {
    app,
    io,

    trigger<T>(
      roomId: string,
      event: EventDefinition<T>,
      data: T,
      from?: string
    ): Result<void, string> {
      const room = roomManager.get(roomId);
      if (!room) {
        const errorMsg = `Room '${roomId}' does not exist`;
        logger.warn({
          message: errorMsg,
          atFunction: "dialogue.trigger",
          data: { roomId, eventName: event.name },
        });
        return Err(errorMsg);
      }

      return room.trigger(event, data, from);
    },

    on<T>(
      roomId: string,
      event: EventDefinition<T>,
      handler: (msg: EventMessage<T>) => void | Promise<void>
    ): () => void {
      const room = roomManager.get(roomId);
      if (!room) {
        logger.warn({
          message: `Room '${roomId}' does not exist`,
          atFunction: "dialogue.on",
          data: { roomId, eventName: event.name },
        });
        return () => {
          // No-op unsubscribe for non-existent room
        };
      }

      return room.on(event, handler);
    },

    room(id: string): Room | null {
      return roomManager.get(id);
    },

    rooms(): Room[] {
      return roomManager.all();
    },

    createRoom(id: string, config: RoomConfig): Room | null {
      // Check if room already exists
      if (roomManager.get(id)) {
        logger.warn({
          message: `Room '${id}' already exists`,
          atFunction: "dialogue.createRoom",
          data: { roomId: id },
        });
        return null;
      }

      const room = roomManager.register(id, config);

      // Broadcast room created event to all connected clients
      io.emit("dialogue:roomCreated", {
        id: room.id,
        name: room.name,
        description: room.description,
        maxSize: room.maxSize,
      });

      logger.info({
        message: `Room '${id}' created`,
        atFunction: "dialogue.createRoom",
        data: { roomId: id, roomName: config.name },
      });

      return room;
    },

    deleteRoom(id: string): boolean {
      const deleted = roomManager.unregister(id);

      if (deleted) {
        // Broadcast room deleted event to all connected clients
        io.emit("dialogue:roomDeleted", { roomId: id });
      }

      return deleted;
    },

    getClients(userId: string): ConnectedClient[] {
      return getClientsByUserId(userId);
    },

    getAllClients(): ConnectedClient[] {
      return getAllConnectedClients();
    },

    getClientRooms(userId: string): ClientRooms {
      const roomIds = getClientRoomIds(userId);
      const clients = getClientsByUserId(userId);

      return {
        ids: roomIds,
        forAll(callback: (roomId: string) => void): void {
          for (const roomId of roomIds) {
            callback(roomId);
          }
        },
        leaveAll(callback?: (roomId: string) => void): void {
          // Execute callback for each room before leaving
          if (callback) {
            for (const roomId of roomIds) {
              callback(roomId);
            }
          }

          // Leave all rooms for all connections
          for (const client of clients) {
            for (const roomId of client.rooms()) {
              client.leave(roomId);
            }
          }
        },
      };
    },

    isInRoom(userId: string, roomId: string): boolean {
      return isUserInRoom(userId, roomId);
    },

    start,
    stop,
  };

  return dialogue;
}
