import type { EventMessage } from "./types.ts";

/**
 * Configuration for the history manager
 */
export interface HistoryManagerConfig {
  /** Called when events are evicted from in-memory history (oldest first) */
  onCleanup?: (
    roomId: string,
    eventName: string,
    events: EventMessage[]
  ) => void | Promise<void>;
  /** Called to load historical events beyond in-memory (for pagination) */
  onLoad?: (
    roomId: string,
    eventName: string,
    start: number,
    end: number
  ) => Promise<EventMessage[]>;
}

/**
 * History manager instance returned by createHistoryManager
 */
export interface HistoryManager {
  /** Add an event to history, evict oldest if exceeds limit */
  push(
    roomId: string,
    eventName: string,
    event: EventMessage,
    limit: number
  ): void;
  /** Get events (0 = newest, reads backward) */
  get(
    roomId: string,
    eventName: string,
    start: number,
    end: number
  ): EventMessage[];
  /** Get all events for a room across all event types, sorted newest first */
  getAll(roomId: string, limit?: number): EventMessage[];
  /** Get total count of events for a specific event type in a room */
  count(roomId: string, eventName: string): number;
  /** Clear all history for a room */
  clearRoom(roomId: string): void;
  /** Get event names that have history for a room */
  getEventNames(roomId: string): string[];
}

/**
 * Creates a history manager for storing events in memory.
 * Stores per-room, per-event-type with FIFO eviction (oldest first).
 *
 * @param config - Configuration with optional cleanup and load callbacks
 * @returns HistoryManager instance
 *
 * @example
 * const history = createHistoryManager({
 *   onCleanup: async (roomId, eventName, events) => {
 *     await db.events.insertMany(events);
 *   }
 * });
 *
 * // Push an event
 * history.push("room-1", "message", eventMessage, 50);
 *
 * // Get last 10 messages (newest first)
 * const recent = history.get("room-1", "message", 0, 10);
 */
export function createHistoryManager(
  config: HistoryManagerConfig = {}
): HistoryManager {
  // Map<roomId, Map<eventName, EventMessage[]>>
  // Events are stored with newest at the END of the array
  // When retrieving, we reverse the index logic to return newest first
  const store = new Map<string, Map<string, EventMessage[]>>();

  /**
   * Ensures the room and event type exist in the store
   */
  function ensureRoomEvent(roomId: string, eventName: string): EventMessage[] {
    let roomHistory = store.get(roomId);
    if (!roomHistory) {
      roomHistory = new Map();
      store.set(roomId, roomHistory);
    }

    let eventHistory = roomHistory.get(eventName);
    if (!eventHistory) {
      eventHistory = [];
      roomHistory.set(eventName, eventHistory);
    }

    return eventHistory;
  }

  return {
    push(
      roomId: string,
      eventName: string,
      event: EventMessage,
      limit: number
    ): void {
      const events = ensureRoomEvent(roomId, eventName);

      // Add new event to the end (newest)
      events.push(event);

      // Evict oldest (from the beginning) if over limit
      if (events.length > limit) {
        const evictCount = events.length - limit;
        const evicted = events.splice(0, evictCount);

        // Call cleanup hook if provided
        if (config.onCleanup && evicted.length > 0) {
          config.onCleanup(roomId, eventName, evicted);
        }
      }
    },

    get(
      roomId: string,
      eventName: string,
      start: number,
      end: number
    ): EventMessage[] {
      const roomHistory = store.get(roomId);
      if (!roomHistory) {
        return [];
      }

      const events = roomHistory.get(eventName);
      if (!events || events.length === 0) {
        return [];
      }

      // Events are stored oldest-to-newest
      // We want to return newest-first, so we reverse the indexing
      // start=0, end=10 means "last 10 items" = items from length-10 to length
      const len = events.length;
      const actualStart = Math.max(0, len - end);
      const actualEnd = len - start;

      if (actualStart >= actualEnd) {
        return [];
      }

      // Slice and reverse to get newest first
      return events.slice(actualStart, actualEnd).reverse();
    },

    getAll(roomId: string, limit?: number): EventMessage[] {
      const roomHistory = store.get(roomId);
      if (!roomHistory) {
        return [];
      }

      // Collect all events from all event types
      const allEvents: EventMessage[] = [];
      for (const events of roomHistory.values()) {
        allEvents.push(...events);
      }

      // Sort by timestamp descending (newest first)
      allEvents.sort((a, b) => b.timestamp - a.timestamp);

      // Apply limit if provided
      if (limit !== undefined && limit > 0) {
        return allEvents.slice(0, limit);
      }

      return allEvents;
    },

    count(roomId: string, eventName: string): number {
      const roomHistory = store.get(roomId);
      if (!roomHistory) {
        return 0;
      }

      const events = roomHistory.get(eventName);
      return events?.length ?? 0;
    },

    clearRoom(roomId: string): void {
      const roomHistory = store.get(roomId);
      if (!roomHistory) {
        return;
      }

      // Call cleanup for each event type before clearing
      if (config.onCleanup) {
        for (const [eventName, events] of roomHistory.entries()) {
          if (events.length > 0) {
            config.onCleanup(roomId, eventName, events);
          }
        }
      }

      store.delete(roomId);
    },

    getEventNames(roomId: string): string[] {
      const roomHistory = store.get(roomId);
      if (!roomHistory) {
        return [];
      }

      return Array.from(roomHistory.keys());
    },
  };
}
