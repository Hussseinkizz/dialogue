import type { Socket } from "socket.io-client";
import type {
  EventHandler,
  EventMessage,
  HistoryResponsePaginated,
  RoomContext,
  WildcardHandler,
} from "./types.ts";

/**
 * Creates a room context for a joined room.
 * Manages event subscriptions and triggers for a specific room.
 *
 * @param socket - Socket.IO client socket
 * @param roomId - Room identifier
 * @param roomName - Human-readable room name
 * @param onLeave - Callback when leaving room
 * @returns RoomContext with methods for interacting with the room
 */
export function createRoomContext(
  socket: Socket,
  roomId: string,
  roomName: string,
  onLeave: () => void
): RoomContext {
  const eventHandlers = new Map<string, Set<EventHandler>>();
  const wildcardHandlers = new Set<WildcardHandler>();

  /**
   * Internal handler for dialogue:event messages
   * Routes events to registered handlers
   */
  const eventListener = (msg: EventMessage<unknown>) => {
    if (msg.roomId !== roomId) {
      return;
    }

    const handlers = eventHandlers.get(msg.event);
    if (handlers) {
      for (const handler of handlers) {
        handler(msg);
      }
    }

    for (const handler of wildcardHandlers) {
      handler(msg.event, msg);
    }
  };

  socket.on("dialogue:event", eventListener);

  const context: RoomContext = {
    roomId,
    roomName,

    trigger<T>(eventName: string, data: T): void {
      socket.emit("dialogue:trigger", {
        roomId,
        event: eventName,
        data,
      });
    },

    on<T>(
      eventName: string,
      handler: (msg: EventMessage<T>) => void
    ): () => void {
      let handlers = eventHandlers.get(eventName);
      if (!handlers) {
        handlers = new Set();
        eventHandlers.set(eventName, handlers);
      }

      handlers.add(handler as EventHandler);

      return () => {
        handlers?.delete(handler as EventHandler);
        if (handlers?.size === 0) {
          eventHandlers.delete(eventName);
        }
      };
    },

    onAny(
      handler: (eventName: string, msg: EventMessage<unknown>) => void
    ): () => void {
      wildcardHandlers.add(handler);

      return () => {
        wildcardHandlers.delete(handler);
      };
    },

    subscribe(eventName: string): void {
      socket.emit("dialogue:subscribe", { roomId, eventName });
    },

    subscribeAll(): void {
      socket.emit("dialogue:subscribeAll", { roomId });
    },

    unsubscribe(eventName: string): void {
      socket.emit("dialogue:unsubscribe", { roomId, eventName });
    },

    getHistory<T = unknown>(
      eventName: string,
      start = 0,
      end = 50
    ): Promise<EventMessage<T>[]> {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          cleanup();
          reject(new Error(`Timeout getting history for '${eventName}'`));
        }, 5000);

        const cleanup = () => {
          clearTimeout(timeout);
          socket.off("dialogue:historyResponse", onResponse);
        };

        const onResponse = (data: HistoryResponsePaginated) => {
          // Only resolve if this matches our request
          if (data.roomId === roomId && data.eventName === eventName) {
            cleanup();
            resolve(data.events as EventMessage<T>[]);
          }
        };

        socket.on("dialogue:historyResponse", onResponse);
        socket.emit("dialogue:getHistory", { roomId, eventName, start, end });
      });
    },

    leave(): void {
      socket.off("dialogue:event", eventListener);
      eventHandlers.clear();
      wildcardHandlers.clear();

      socket.emit("dialogue:leave", { roomId });
      onLeave();
    },
  };

  return context;
}
