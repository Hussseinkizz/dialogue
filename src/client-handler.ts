import { nanoid } from "nanoid";
import type { Socket } from "socket.io";
import type { RoomManagerInstance } from "./room.ts";
import type { ConnectedClient, Logger } from "./types.ts";

/** Wildcard subscription symbol */
const WILDCARD = "*";

/**
 * Creates a connected client wrapper for a socket connection.
 * Manages room membership and event subscriptions for the client.
 *
 * @param socket - The Socket.IO socket instance
 * @param userId - Application user ID from authentication
 * @param meta - Additional metadata (role, permissions, etc.)
 * @param roomManager - Room manager instance for coordination
 * @param logger - Logger instance
 * @returns ConnectedClient instance
 */
export function createConnectedClient(
  socket: Socket,
  userId: string,
  meta: Record<string, unknown>,
  roomManager: RoomManagerInstance,
  logger: Logger
): ConnectedClient {
  const id = nanoid();
  const joinedRooms = new Set<string>();
  const subscriptions = new Map<string, Set<string>>();

  const client: ConnectedClient = {
    id,
    userId,
    socket,
    meta,

    join(roomId: string): void {
      const room = roomManager.get(roomId);
      if (!room) {
        logger.warn({
          message: `Room '${roomId}' does not exist`,
          atFunction: "client.join",
          data: { roomId, clientId: id },
        });
        return;
      }

      if (joinedRooms.has(roomId)) {
        // Already joined, but still emit confirmation for client requests
        socket.emit("dialogue:joined", { roomId, roomName: room.name });
        return;
      }

      const added = roomManager.addParticipant(roomId, client);
      if (!added) {
        logger.warn({
          message: `Room '${roomId}' is full`,
          atFunction: "client.join",
          data: { roomId, clientId: id },
        });
        socket.emit("dialogue:error", {
          code: "ROOM_FULL",
          message: `Room '${roomId}' is at capacity`,
        });
        return;
      }

      joinedRooms.add(roomId);
      subscriptions.set(roomId, new Set());

      for (const eventName of room.defaultSubscriptions) {
        this.subscribe(roomId, eventName);
      }

      socket.emit("dialogue:joined", { roomId, roomName: room.name });
    },

    leave(roomId: string): void {
      if (!joinedRooms.has(roomId)) {
        return;
      }

      roomManager.removeParticipant(roomId, id);
      joinedRooms.delete(roomId);
      subscriptions.delete(roomId);

      socket.emit("dialogue:left", { roomId });
    },

    subscribe(roomId: string, eventName: string): void {
      if (!joinedRooms.has(roomId)) {
        logger.warn({
          message: `Cannot subscribe to '${eventName}' - not in room '${roomId}'`,
          atFunction: "client.subscribe",
          data: { roomId, eventName, clientId: id },
        });
        return;
      }

      const roomSubs = subscriptions.get(roomId);
      if (roomSubs) {
        roomSubs.add(eventName);
      }
    },

    subscribeAll(roomId: string): void {
      this.subscribe(roomId, WILDCARD);
    },

    unsubscribe(roomId: string, eventName: string): void {
      const roomSubs = subscriptions.get(roomId);
      if (roomSubs) {
        roomSubs.delete(eventName);
      }
    },

    rooms(): string[] {
      return Array.from(joinedRooms);
    },

    subscriptions(roomId: string): string[] {
      const roomSubs = subscriptions.get(roomId);
      return roomSubs ? Array.from(roomSubs) : [];
    },

    send<T>(event: string, data: T): void {
      socket.emit(event, data);
    },

    disconnect(): void {
      for (const roomId of joinedRooms) {
        roomManager.removeParticipant(roomId, id);
      }
      joinedRooms.clear();
      subscriptions.clear();
      socket.disconnect(true);
    },
  };

  return client;
}

/**
 * Checks if a client is subscribed to an event in a room.
 * Returns true if subscribed to the specific event or wildcard.
 */
export function isSubscribedToEvent(
  client: ConnectedClient,
  roomId: string,
  eventName: string
): boolean {
  const subs = client.subscriptions(roomId);
  return subs.includes(eventName) || subs.includes(WILDCARD);
}

/**
 * Extracts user ID and metadata from socket handshake.
 * Override this for custom authentication strategies.
 */
export function extractUserFromSocket(socket: Socket): {
  userId: string;
  meta: Record<string, unknown>;
} {
  const auth = socket.handshake.auth as Record<string, unknown>;

  let userId = socket.id;
  if (typeof auth.userId === "string") {
    userId = auth.userId;
  } else if (typeof auth.token === "string") {
    userId = auth.token;
  }

  const meta: Record<string, unknown> = {};

  if (typeof auth.role === "string") {
    meta.role = auth.role;
  }

  for (const [key, value] of Object.entries(auth)) {
    if (key !== "userId" && key !== "token") {
      meta[key] = value;
    }
  }

  return { userId, meta };
}
