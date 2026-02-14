import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { defineEvent } from "../src/define-event.ts";
import { createHistoryManager } from "../src/history.ts";
import { createSilentLogger } from "../src/logger.ts";
import { createRoom } from "../src/room.ts";
import type { EventMessage, RoomConfig } from "../src/types.ts";

/** Silent logger for tests - suppresses all output */
const testLogger = createSilentLogger();

/**
 * Asserts an event exists at the given index and returns it with typed data.
 * Throws if index is out of bounds (test will fail with clear message).
 */
function getEvent<T>(events: EventMessage[], index: number): EventMessage<T> {
  const event = events[index];
  if (!event) {
    throw new Error(
      `Expected event at index ${index}, but array has ${events.length} items`
    );
  }
  return event as EventMessage<T>;
}

/**
 * Creates a mock Socket.IO server for testing
 */
function createMockIO() {
  const emitFn = vi.fn();
  const toFn = vi.fn(() => ({ emit: emitFn }));

  return {
    to: toFn,
    emit: emitFn,
    _getEmitCalls: () => emitFn.mock.calls,
    _reset: () => {
      emitFn.mockClear();
      toFn.mockClear();
    },
  };
}

describe("createHistoryManager", () => {
  let historyManager: ReturnType<typeof createHistoryManager>;

  beforeEach(() => {
    historyManager = createHistoryManager();
  });

  describe("push and get", () => {
    it("should store and retrieve events", () => {
      const event: EventMessage = {
        event: "message",
        roomId: "room1",
        data: { text: "Hello" },
        from: "user1",
        timestamp: Date.now(),
      };

      historyManager.push("room1", "message", event, 50);
      const events = historyManager.get("room1", "message", 0, 10);

      expect(events).toHaveLength(1);
      expect(events[0]).toEqual(event);
    });

    it("should return events newest first", () => {
      const event1: EventMessage = {
        event: "message",
        roomId: "room1",
        data: { text: "First" },
        from: "user1",
        timestamp: 1000,
      };
      const event2: EventMessage = {
        event: "message",
        roomId: "room1",
        data: { text: "Second" },
        from: "user1",
        timestamp: 2000,
      };

      historyManager.push("room1", "message", event1, 50);
      historyManager.push("room1", "message", event2, 50);

      const events = historyManager.get("room1", "message", 0, 10);

      expect(events).toHaveLength(2);
      expect(getEvent<{ text: string }>(events, 0).data.text).toBe("Second");
      expect(getEvent<{ text: string }>(events, 1).data.text).toBe("First");
    });

    it("should respect pagination (start/end)", () => {
      // Add 5 messages
      for (let i = 0; i < 5; i++) {
        historyManager.push(
          "room1",
          "message",
          {
            event: "message",
            roomId: "room1",
            data: { text: `Message ${i}` },
            from: "user1",
            timestamp: 1000 + i,
          },
          50
        );
      }

      // Get messages 1-3 (skip newest, get next 2)
      const events = historyManager.get("room1", "message", 1, 3);

      expect(events).toHaveLength(2);
      expect(getEvent<{ text: string }>(events, 0).data.text).toBe("Message 3"); // Second newest
      expect(getEvent<{ text: string }>(events, 1).data.text).toBe("Message 2"); // Third newest
    });

    it("should return empty array for non-existent room", () => {
      const events = historyManager.get("nonexistent", "message", 0, 10);
      expect(events).toEqual([]);
    });

    it("should return empty array for non-existent event type", () => {
      historyManager.push(
        "room1",
        "message",
        {
          event: "message",
          roomId: "room1",
          data: { text: "Hello" },
          from: "user1",
          timestamp: Date.now(),
        },
        50
      );

      const events = historyManager.get("room1", "other-event", 0, 10);
      expect(events).toEqual([]);
    });
  });

  describe("limit and eviction", () => {
    it("should evict oldest events when limit is exceeded", () => {
      const limit = 3;

      // Add 5 messages with limit of 3
      for (let i = 0; i < 5; i++) {
        historyManager.push(
          "room1",
          "message",
          {
            event: "message",
            roomId: "room1",
            data: { text: `Message ${i}` },
            from: "user1",
            timestamp: 1000 + i,
          },
          limit
        );
      }

      const events = historyManager.get("room1", "message", 0, 10);

      expect(events).toHaveLength(3);
      // Should have messages 2, 3, 4 (newest first)
      expect(getEvent<{ text: string }>(events, 0).data.text).toBe("Message 4");
      expect(getEvent<{ text: string }>(events, 1).data.text).toBe("Message 3");
      expect(getEvent<{ text: string }>(events, 2).data.text).toBe("Message 2");
    });

    it("should call onCleanup when events are evicted", () => {
      const onCleanup = vi.fn();
      const manager = createHistoryManager({ onCleanup });

      // Add 4 messages with limit of 2
      for (let i = 0; i < 4; i++) {
        manager.push(
          "room1",
          "message",
          {
            event: "message",
            roomId: "room1",
            data: { text: `Message ${i}` },
            from: "user1",
            timestamp: 1000 + i,
          },
          2
        );
      }

      // onCleanup should have been called for evicted events
      expect(onCleanup).toHaveBeenCalled();
      const firstCall = onCleanup.mock.calls[0] as [
        string,
        string,
        EventMessage[],
      ];
      const [roomId, eventName, evictedEvents] = firstCall;
      expect(roomId).toBe("room1");
      expect(eventName).toBe("message");
      expect(evictedEvents.length).toBeGreaterThan(0);
    });
  });

  describe("getAll", () => {
    it("should return all events across event types sorted by timestamp", () => {
      historyManager.push(
        "room1",
        "message",
        {
          event: "message",
          roomId: "room1",
          data: { text: "Hello" },
          from: "user1",
          timestamp: 1000,
        },
        50
      );
      historyManager.push(
        "room1",
        "user-joined",
        {
          event: "user-joined",
          roomId: "room1",
          data: { username: "user1" },
          from: "system",
          timestamp: 2000,
        },
        50
      );
      historyManager.push(
        "room1",
        "message",
        {
          event: "message",
          roomId: "room1",
          data: { text: "World" },
          from: "user1",
          timestamp: 3000,
        },
        50
      );

      const allEvents = historyManager.getAll("room1");

      expect(allEvents).toHaveLength(3);
      // Should be sorted newest first
      expect(getEvent(allEvents, 0).timestamp).toBe(3000);
      expect(getEvent(allEvents, 1).timestamp).toBe(2000);
      expect(getEvent(allEvents, 2).timestamp).toBe(1000);
    });

    it("should respect limit parameter", () => {
      for (let i = 0; i < 5; i++) {
        historyManager.push(
          "room1",
          "message",
          {
            event: "message",
            roomId: "room1",
            data: { text: `Message ${i}` },
            from: "user1",
            timestamp: 1000 + i,
          },
          50
        );
      }

      const limited = historyManager.getAll("room1", 2);

      expect(limited).toHaveLength(2);
      expect(getEvent<{ text: string }>(limited, 0).data.text).toBe(
        "Message 4"
      );
      expect(getEvent<{ text: string }>(limited, 1).data.text).toBe(
        "Message 3"
      );
    });
  });

  describe("count and getEventNames", () => {
    it("should return correct count", () => {
      for (let i = 0; i < 5; i++) {
        historyManager.push(
          "room1",
          "message",
          {
            event: "message",
            roomId: "room1",
            data: { text: `Message ${i}` },
            from: "user1",
            timestamp: 1000 + i,
          },
          50
        );
      }

      expect(historyManager.count("room1", "message")).toBe(5);
      expect(historyManager.count("room1", "other")).toBe(0);
      expect(historyManager.count("nonexistent", "message")).toBe(0);
    });

    it("should return event names for a room", () => {
      historyManager.push(
        "room1",
        "message",
        {
          event: "message",
          roomId: "room1",
          data: {},
          from: "user1",
          timestamp: 1000,
        },
        50
      );
      historyManager.push(
        "room1",
        "user-joined",
        {
          event: "user-joined",
          roomId: "room1",
          data: {},
          from: "system",
          timestamp: 2000,
        },
        50
      );

      const names = historyManager.getEventNames("room1");

      expect(names).toContain("message");
      expect(names).toContain("user-joined");
      expect(names).toHaveLength(2);
    });
  });

  describe("clearRoom", () => {
    it("should clear all history for a room", () => {
      historyManager.push(
        "room1",
        "message",
        {
          event: "message",
          roomId: "room1",
          data: {},
          from: "user1",
          timestamp: 1000,
        },
        50
      );

      historyManager.clearRoom("room1");

      expect(historyManager.count("room1", "message")).toBe(0);
      expect(historyManager.getEventNames("room1")).toEqual([]);
    });

    it("should call onCleanup when clearing room", () => {
      const onCleanup = vi.fn();
      const manager = createHistoryManager({ onCleanup });

      manager.push(
        "room1",
        "message",
        {
          event: "message",
          roomId: "room1",
          data: {},
          from: "user1",
          timestamp: 1000,
        },
        50
      );

      manager.clearRoom("room1");

      expect(onCleanup).toHaveBeenCalledWith(
        "room1",
        "message",
        expect.any(Array)
      );
    });
  });
});

describe("Room history integration", () => {
  const Message = defineEvent("message", {
    schema: z.object({ text: z.string() }),
    history: { enabled: true, limit: 10 },
  });

  const NoHistoryEvent = defineEvent("no-history", {
    schema: z.object({ data: z.string() }),
  });

  it("should store events with history enabled in history manager", () => {
    const mockIO = createMockIO();
    const historyManager = createHistoryManager();

    const config: RoomConfig = {
      name: "Test Room",
      events: [Message, NoHistoryEvent],
    };

    const room = createRoom(
      "test-room",
      config,
      mockIO as never,
      testLogger,
      historyManager
    );

    room.trigger(Message, { text: "Hello World" }, "user1");

    const history = historyManager.get("test-room", "message", 0, 10);
    expect(history).toHaveLength(1);
    expect(getEvent<{ text: string }>(history, 0).data.text).toBe(
      "Hello World"
    );
  });

  it("should NOT store events without history config", () => {
    const mockIO = createMockIO();
    const historyManager = createHistoryManager();

    const config: RoomConfig = {
      name: "Test Room",
      events: [Message, NoHistoryEvent],
    };

    const room = createRoom(
      "test-room",
      config,
      mockIO as never,
      testLogger,
      historyManager
    );

    room.trigger(NoHistoryEvent, { data: "test" }, "user1");

    const history = historyManager.get("test-room", "no-history", 0, 10);
    expect(history).toHaveLength(0);
  });

  it("should retrieve history via room.history() method", async () => {
    const mockIO = createMockIO();
    const historyManager = createHistoryManager();

    const config: RoomConfig = {
      name: "Test Room",
      events: [Message],
    };

    const room = createRoom(
      "test-room",
      config,
      mockIO as never,
      testLogger,
      historyManager
    );

    // Add some messages
    room.trigger(Message, { text: "First" }, "user1");
    room.trigger(Message, { text: "Second" }, "user1");
    room.trigger(Message, { text: "Third" }, "user1");

    const history = await room.history("message", 0, 10);

    expect(history).toHaveLength(3);
    expect(getEvent<{ text: string }>(history, 0).data.text).toBe("Third"); // Newest first
    expect(getEvent<{ text: string }>(history, 2).data.text).toBe("First"); // Oldest last
  });

  it("should return empty array for undefined eventName", async () => {
    const mockIO = createMockIO();
    const historyManager = createHistoryManager();

    const config: RoomConfig = {
      name: "Test Room",
      events: [Message],
    };

    const room = createRoom(
      "test-room",
      config,
      mockIO as never,
      testLogger,
      historyManager
    );

    room.trigger(Message, { text: "Hello" }, "user1");

    // Requesting history for a different event type
    const history = await room.history("other-event", 0, 10);

    expect(history).toEqual([]);
  });
});
