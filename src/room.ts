import { Err, Ok, type Result } from "slang-ts";
import type { Server } from "socket.io";
import {
  getEventByName,
  isEventAllowed,
  validateEventData,
} from "./define-event.ts";
import type { HistoryManager } from "./history.ts";
import type {
  ConnectedClient,
  DialogueContext,
  EventDefinition,
  EventMessage,
  HooksConfig,
  Logger,
  Room,
  RoomConfig,
} from "./types.ts";

/** Wildcard subscription matches all events */
const WILDCARD = "*";

/**
 * Checks if a participant is subscribed to an event in a room.
 * Returns true for specific event subscription or wildcard.
 */
function isParticipantSubscribed(
  participant: ConnectedClient,
  roomId: string,
  eventName: string
): boolean {
  const subs = participant.subscriptions(roomId);
  return subs.includes(eventName) || subs.includes(WILDCARD);
}

/** Handler function for room events */
type EventHandler<T = unknown> = (msg: EventMessage<T>) => void | Promise<void>;

/**
 * Creates a room instance with event management and participant tracking.
 * The room manages participants, subscriptions, and event broadcasting.
 *
 * @param id - Unique room identifier
 * @param config - Room configuration
 * @param _io - Socket.IO server instance (reserved for future use)
 * @param logger - Logger instance
 * @param historyManager - Optional history manager for event storage
 * @param hooks - Optional hooks config for event callbacks
 * @param externalParticipants - Optional shared participants Map (used by room manager)
 * @param getContext - Function to retrieve current DialogueContext for hook calls
 * @returns Room instance with methods
 */
export function createRoom(
  id: string,
  config: RoomConfig,
  _io: Server,
  logger: Logger,
  historyManager?: HistoryManager,
  hooks?: HooksConfig,
  externalParticipants?: Map<string, ConnectedClient>,
  getContext?: () => DialogueContext
): Room {
  const participants =
    externalParticipants ?? new Map<string, ConnectedClient>();
  const eventHandlers = new Map<string, Set<EventHandler>>();

  /** Handles post-broadcast work: history storage, hooks, and server-side handlers */
  function handlePostBroadcast(eventName: string, message: EventMessage): void {
    // Store in history if event has history enabled
    const eventDef = getEventByName(eventName, config.events);
    if (eventDef?.history?.enabled && historyManager) {
      historyManager.push(id, eventName, message, eventDef.history.limit);
    }

    // Call onTriggered hook if provided
    if (hooks?.events?.onTriggered) {
      Promise.resolve(hooks.events.onTriggered(id, message)).catch((err) => {
        logger.error({
          message: `Error in onTriggered hook for '${eventName}'`,
          atFunction: "room.trigger.onTriggered",
          data: err,
        });
      });
    }

    // Call server-side event handlers
    const handlers = eventHandlers.get(eventName);
    if (handlers) {
      for (const handler of handlers) {
        Promise.resolve(handler(message)).catch((err) => {
          logger.error({
            message: `Error in event handler for '${eventName}'`,
            atFunction: "room.trigger.handler",
            data: err,
          });
        });
      }
    }
  }

  const room: Room = {
    id,
    name: config.name,
    description: config.description,
    maxSize: config.maxSize,
    events: config.events,
    defaultSubscriptions: config.defaultSubscriptions ?? [],
    createdById: config.createdById,

    trigger<T>(
      event: EventDefinition<T>,
      data: T,
      from?: string,
      meta?: Record<string, unknown>
    ): Result<void, string> {
      if (!isEventAllowed(event.name, config.events)) {
        const errorMsg = `Event '${event.name}' is not allowed in room '${id}'`;
        logger.warn({
          message: errorMsg,
          atFunction: "room.trigger",
          data: { eventName: event.name, roomId: id },
        });
        return Err(errorMsg);
      }

      const eventDef = getEventByName(event.name, config.events) ?? event;
      const validation = validateEventData(eventDef, data);

      if (validation.isErr) {
        logger.warn({
          message: validation.error,
          atFunction: "room.trigger",
          data: {
            eventName: event.name,
            roomId: id,
            validationError: validation.error,
          },
        });
        return Err(validation.error);
      }

      const message: EventMessage<T> = {
        event: event.name,
        roomId: id,
        data: validation.value as T,
        from: from ?? "system",
        timestamp: Date.now(),
        ...(meta && { meta }),
      };

      // Run beforeEach hook — can block or transform the message
      let finalMessage: EventMessage = message;
      if (hooks?.events?.beforeEach && getContext) {
        const context = getContext();
        const hookResult = hooks.events.beforeEach({
          context,
          roomId: id,
          message,
          from: message.from,
        });

        if (hookResult.isErr) {
          logger.debug({
            message: `Event '${event.name}' blocked by beforeEach: ${hookResult.error}`,
            atFunction: "room.trigger.beforeEach",
            data: {
              eventName: event.name,
              roomId: id,
              reason: hookResult.error,
            },
          });
          return Err(hookResult.error);
        }

        finalMessage = hookResult.value;
      }

      // Emit only to participants subscribed to this event (or wildcard)
      let recipientCount = 0;
      for (const [, participant] of participants) {
        if (isParticipantSubscribed(participant, id, event.name)) {
          participant.socket.emit("dialogue:event", finalMessage);
          recipientCount++;
        }
      }

      handlePostBroadcast(event.name, finalMessage);

      // Run afterEach hook — fire-and-forget for side-effects
      if (hooks?.events?.afterEach && getContext) {
        const context = getContext();
        hooks.events.afterEach({
          context,
          roomId: id,
          message: finalMessage,
          recipientCount,
        });
      }

      return Ok(undefined);
    },

    on<T>(
      event: EventDefinition<T>,
      handler: (msg: EventMessage<T>) => void | Promise<void>
    ): () => void {
      let handlers = eventHandlers.get(event.name);
      if (!handlers) {
        handlers = new Set();
        eventHandlers.set(event.name, handlers);
      }

      handlers.add(handler as EventHandler);

      return () => {
        handlers?.delete(handler as EventHandler);
        if (handlers?.size === 0) {
          eventHandlers.delete(event.name);
        }
      };
    },

    size(): number {
      return participants.size;
    },

    isFull(): boolean {
      if (config.maxSize === undefined) {
        return false;
      }
      return participants.size >= config.maxSize;
    },

    participants(): ConnectedClient[] {
      return Array.from(participants.values());
    },

    async history(
      eventName: string,
      start: number,
      end: number
    ): Promise<EventMessage[]> {
      // Return empty array if no history manager
      if (!historyManager) {
        return [];
      }

      // Get from in-memory history first
      const inMemoryEvents = historyManager.get(id, eventName, start, end);
      const inMemoryCount = historyManager.count(id, eventName);

      // If we have enough in-memory or no onLoad hook, return what we have
      if (inMemoryEvents.length >= end - start || !hooks?.events?.onLoad) {
        return inMemoryEvents;
      }

      // If requesting beyond in-memory, try loading from external storage
      // Only load what's missing
      const missingStart = Math.max(start, inMemoryCount);
      const missingEnd = end;

      if (missingStart >= missingEnd) {
        return inMemoryEvents;
      }

      try {
        const externalEvents = await hooks.events.onLoad(
          id,
          eventName,
          missingStart - inMemoryCount,
          missingEnd - inMemoryCount
        );

        // Combine in-memory and external events
        return [...inMemoryEvents, ...externalEvents];
      } catch (err) {
        logger.error({
          message: `Error loading history for '${eventName}'`,
          atFunction: "room.history.onLoad",
          data: err,
        });
        return inMemoryEvents;
      }
    },
  };

  return room;
}

/**
 * Internal: Adds a participant to the room.
 * Used by the room manager, not directly by consumers.
 */
export function addParticipantToRoom(
  room: Room,
  client: ConnectedClient,
  participants: Map<string, ConnectedClient>
): boolean {
  // Check capacity using the passed-in participants map (room manager's map)
  if (room.maxSize !== undefined && participants.size >= room.maxSize) {
    return false;
  }

  participants.set(client.id, client);
  client.socket.join(room.id);

  return true;
}

/**
 * Internal: Removes a participant from the room.
 */
export function removeParticipantFromRoom(
  room: Room,
  clientId: string,
  participants: Map<string, ConnectedClient>
): void {
  const client = participants.get(clientId);
  if (client) {
    client.socket.leave(room.id);
    participants.delete(clientId);
  }
}

/**
 * Creates a room manager that coordinates all rooms.
 * Used internally by createDialogue.
 *
 * @param io - Socket.IO server instance
 * @param logger - Logger instance
 * @param historyManager - Optional history manager for event storage
 * @param hooks - Optional hooks config for lifecycle callbacks
 */
export function createRoomManager(
  io: Server,
  logger: Logger,
  historyManager?: HistoryManager,
  hooks?: HooksConfig,
  getContext?: () => DialogueContext
) {
  const rooms = new Map<string, Room>();
  const roomParticipants = new Map<string, Map<string, ConnectedClient>>();

  return {
    /**
     * Registers a room from config
     */
    register(id: string, config: RoomConfig): Room {
      const participantsMap = new Map<string, ConnectedClient>();
      roomParticipants.set(id, participantsMap);
      const room = createRoom(
        id,
        config,
        io,
        logger,
        historyManager,
        hooks,
        participantsMap,
        getContext
      );
      rooms.set(id, room);

      // Call onCreated hook if provided
      if (hooks?.rooms?.onCreated) {
        Promise.resolve(hooks.rooms.onCreated(room)).catch((err) => {
          logger.error({
            message: `Error in onCreated hook for room '${id}'`,
            atFunction: "roomManager.register.onCreated",
            data: err,
          });
        });
      }

      return room;
    },

    /**
     * Gets a room by ID
     */
    get(id: string): Room | null {
      return rooms.get(id) ?? null;
    },

    /**
     * Gets all rooms
     */
    all(): Room[] {
      return Array.from(rooms.values());
    },

    /**
     * Adds a participant to a room
     */
    addParticipant(roomId: string, client: ConnectedClient): boolean {
      const room = rooms.get(roomId);
      const participants = roomParticipants.get(roomId);

      if (!(room && participants)) {
        return false;
      }

      return addParticipantToRoom(room, client, participants);
    },

    /**
     * Removes a participant from a room
     */
    removeParticipant(roomId: string, clientId: string): void {
      const room = rooms.get(roomId);
      const participants = roomParticipants.get(roomId);

      if (room && participants) {
        removeParticipantFromRoom(room, clientId, participants);
      }
    },

    /**
     * Removes a client from all rooms
     */
    removeFromAllRooms(clientId: string): void {
      for (const [roomId] of rooms) {
        this.removeParticipant(roomId, clientId);
      }
    },

    /**
     * Gets participants for a room
     */
    getParticipants(roomId: string): ConnectedClient[] {
      const participants = roomParticipants.get(roomId);
      return participants ? Array.from(participants.values()) : [];
    },

    /**
     * Gets room size
     */
    getRoomSize(roomId: string): number {
      return roomParticipants.get(roomId)?.size ?? 0;
    },

    /**
     * Unregisters (deletes) a room by ID.
     * Removes all participants and cleans up resources.
     * @returns true if room was deleted, false if it didn't exist
     */
    unregister(id: string): boolean {
      const room = rooms.get(id);
      if (!room) {
        return false;
      }

      // Remove all participants from the room
      const participants = roomParticipants.get(id);
      if (participants) {
        for (const client of participants.values()) {
          client.socket.leave(id);
        }
        participants.clear();
      }

      // Clear history for this room
      if (historyManager) {
        historyManager.clearRoom(id);
      }

      // Notify all sockets in the room that it's been deleted
      io.to(id).emit("dialogue:roomDeleted", { roomId: id });

      rooms.delete(id);
      roomParticipants.delete(id);

      logger.info({
        message: `Room '${id}' deleted`,
        atFunction: "roomManager.unregister",
        data: { roomId: id },
      });

      // Call onDeleted hook if provided
      if (hooks?.rooms?.onDeleted) {
        Promise.resolve(hooks.rooms.onDeleted(id)).catch((err) => {
          logger.error({
            message: `Error in onDeleted hook for room '${id}'`,
            atFunction: "roomManager.unregister.onDeleted",
            data: err,
          });
        });
      }

      return true;
    },
  };
}

export type RoomManagerInstance = ReturnType<typeof createRoomManager>;
