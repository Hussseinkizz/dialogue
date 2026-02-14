import { Err, Ok } from "slang-ts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { defineEvent } from "../src/define-event.ts";
import { createSilentLogger } from "../src/logger.ts";
import { createRoom, createRoomManager } from "../src/room.ts";
import type {
  ConnectedClient,
  DialogueContext,
  EventMessage,
  HooksConfig,
  Room,
  RoomConfig,
} from "../src/types.ts";

/** Silent logger for tests - suppresses all output */
const testLogger = createSilentLogger();

/**
 * Gets a room from the manager, throwing if not found.
 * Test-only helper to avoid non-null assertions.
 */
function getRoom(
  manager: ReturnType<typeof createRoomManager>,
  id: string
): Room {
  const room = manager.get(id);
  if (!room) {
    throw new Error(`Room '${id}' not found in test — check setup`);
  }
  return room;
}

/**
 * Creates a mock Socket.IO server for testing.
 * Since trigger() now emits directly to participant sockets (not via io.to()),
 * this mock is only needed for createRoom's signature and room manager operations.
 */
function createMockIO() {
  return {
    to: vi.fn(() => ({ emit: vi.fn() })),
    emit: vi.fn(),
  };
}

/**
 * Creates a mock DialogueContext for testing hooks.
 * Provides minimal context structure for hook testing.
 */
function createMockContext(
  clients: Record<string, ConnectedClient> = {},
  rooms: Record<string, Room> = {}
): DialogueContext {
  const mockIO = createMockIO();
  return {
    io: mockIO as never,
    clients,
    rooms,
  };
}

/**
 * Creates a mock connected client with subscription support for testing.
 * This mirrors the real ConnectedClient behavior for subscription filtering.
 */
function createMockClient(
  id: string,
  subscribedEvents: Record<string, string[]> = {}
): ConnectedClient {
  const socketEmit = vi.fn();

  return {
    id,
    userId: `user-${id}`,
    socket: {
      join: vi.fn(),
      leave: vi.fn(),
      emit: socketEmit,
    } as never,
    meta: {},
    join: vi.fn(),
    leave: vi.fn(),
    subscribe: vi.fn(),
    subscribeAll: vi.fn(),
    unsubscribe: vi.fn(),
    rooms: vi.fn(() => Object.keys(subscribedEvents)),
    subscriptions: vi.fn((roomId: string) => subscribedEvents[roomId] ?? []),
    send: vi.fn(),
    disconnect: vi.fn(),
  };
}

describe("createRoom", () => {
  const Message = defineEvent("message", {
    schema: z.object({ text: z.string() }),
  });
  const Typing = defineEvent("typing");

  let mockIO: ReturnType<typeof createMockIO>;
  let config: RoomConfig;

  beforeEach(() => {
    mockIO = createMockIO();
    config = {
      name: "Test Room",
      description: "A test room",
      events: [Message, Typing],
      defaultSubscriptions: ["message"],
      maxSize: 10,
    };
  });

  it("creates a room with correct properties", () => {
    const room = createRoom("test-room", config, mockIO as never, testLogger);

    expect(room.id).toBe("test-room");
    expect(room.name).toBe("Test Room");
    expect(room.description).toBe("A test room");
    expect(room.maxSize).toBe(10);
    expect(room.events).toHaveLength(2);
    expect(room.defaultSubscriptions).toEqual(["message"]);
  });

  it("returns 0 size initially", () => {
    const room = createRoom("test-room", config, mockIO as never, testLogger);
    expect(room.size()).toBe(0);
  });

  it("reports not full when below maxSize", () => {
    const room = createRoom("test-room", config, mockIO as never, testLogger);
    expect(room.isFull()).toBe(false);
  });

  it("reports not full when maxSize is undefined", () => {
    const unlimitedConfig = { ...config, maxSize: undefined };
    const room = createRoom(
      "test-room",
      unlimitedConfig,
      mockIO as never,
      testLogger
    );
    expect(room.isFull()).toBe(false);
  });

  it("returns empty participants initially", () => {
    const room = createRoom("test-room", config, mockIO as never, testLogger);
    expect(room.participants()).toEqual([]);
  });
});

describe("room.trigger", () => {
  const Message = defineEvent("message", {
    schema: z.object({ text: z.string() }),
  });
  const Typing = defineEvent("typing");

  let mockIO: ReturnType<typeof createMockIO>;

  beforeEach(() => {
    mockIO = createMockIO();
  });

  it("returns Ok for valid event", () => {
    const config: RoomConfig = { name: "Chat", events: [Message] };
    const room = createRoom("chat", config, mockIO as never, testLogger);

    const result = room.trigger(Message, { text: "Hello!" }, "user-1");

    expect(result.isOk).toBe(true);
  });

  it("uses 'system' as default sender", () => {
    const config: RoomConfig = { name: "Chat", events: [Message] };
    const manager = createRoomManager(
      mockIO as never,
      testLogger,
      undefined,
      undefined,
      vi.fn(() => createMockContext())
    );
    manager.register("chat", config);
    const room = getRoom(manager, "chat");

    // Add a subscribed participant to capture the emitted message
    const client = createMockClient("c1", { chat: ["message"] });
    manager.addParticipant("chat", client);

    room.trigger(Message, { text: "System message" });

    expect(client.socket.emit).toHaveBeenCalledWith(
      "dialogue:event",
      expect.objectContaining({ from: "system" })
    );
  });

  it("returns Err when event is not allowed", () => {
    const config: RoomConfig = { name: "Chat", events: [Message] };
    const room = createRoom("chat", config, mockIO as never, testLogger);

    const result = room.trigger(Typing, {});

    expect(result.isErr).toBe(true);
  });

  it("returns Err when validation fails", () => {
    const config: RoomConfig = { name: "Chat", events: [Message] };
    const room = createRoom("chat", config, mockIO as never, testLogger);

    // @ts-expect-error - intentionally invalid data
    const result = room.trigger(Message, { text: 123 });

    expect(result.isErr).toBe(true);
  });

  it("includes timestamp in emitted message", () => {
    const config: RoomConfig = { name: "Chat", events: [Message] };
    const manager = createRoomManager(
      mockIO as never,
      testLogger,
      undefined,
      undefined,
      vi.fn(() => createMockContext())
    );
    manager.register("chat", config);
    const room = getRoom(manager, "chat");

    const client = createMockClient("c1", { chat: ["message"] });
    manager.addParticipant("chat", client);

    const before = Date.now();
    room.trigger(Message, { text: "Hello!" });
    const after = Date.now();

    const emitCall = (client.socket.emit as ReturnType<typeof vi.fn>).mock
      .calls[0];
    const emittedMessage = emitCall?.[1] as EventMessage;

    expect(emittedMessage.timestamp).toBeGreaterThanOrEqual(before);
    expect(emittedMessage.timestamp).toBeLessThanOrEqual(after);
  });
});

describe("subscription filtering", () => {
  const Message = defineEvent("message", {
    schema: z.object({ text: z.string() }),
  });
  const Typing = defineEvent("typing");

  let mockIO: ReturnType<typeof createMockIO>;

  beforeEach(() => {
    mockIO = createMockIO();
  });

  it("emits only to participants subscribed to the event", () => {
    const config: RoomConfig = {
      name: "Chat",
      events: [Message, Typing],
    };
    const manager = createRoomManager(
      mockIO as never,
      testLogger,
      undefined,
      undefined,
      vi.fn(() => createMockContext())
    );
    manager.register("chat", config);
    const room = getRoom(manager, "chat");

    // Client subscribed to "message" only
    const subscribedClient = createMockClient("c1", { chat: ["message"] });
    // Client subscribed to "typing" only — should NOT receive "message"
    const unsubscribedClient = createMockClient("c2", { chat: ["typing"] });

    manager.addParticipant("chat", subscribedClient);
    manager.addParticipant("chat", unsubscribedClient);

    room.trigger(Message, { text: "Hello!" });

    expect(subscribedClient.socket.emit).toHaveBeenCalledWith(
      "dialogue:event",
      expect.objectContaining({ event: "message" })
    );
    expect(unsubscribedClient.socket.emit).not.toHaveBeenCalled();
  });

  it("emits to wildcard-subscribed participants", () => {
    const config: RoomConfig = {
      name: "Chat",
      events: [Message, Typing],
    };
    const manager = createRoomManager(
      mockIO as never,
      testLogger,
      undefined,
      undefined,
      vi.fn(() => createMockContext())
    );
    manager.register("chat", config);
    const room = getRoom(manager, "chat");

    // Wildcard subscriber gets all events
    const wildcardClient = createMockClient("c1", { chat: ["*"] });
    manager.addParticipant("chat", wildcardClient);

    room.trigger(Message, { text: "Hello!" });

    expect(wildcardClient.socket.emit).toHaveBeenCalledWith(
      "dialogue:event",
      expect.objectContaining({ event: "message" })
    );
  });

  it("does not emit to participants with no subscriptions", () => {
    const config: RoomConfig = {
      name: "Chat",
      events: [Message],
    };
    const manager = createRoomManager(
      mockIO as never,
      testLogger,
      undefined,
      undefined,
      vi.fn(() => createMockContext())
    );
    manager.register("chat", config);
    const room = getRoom(manager, "chat");

    // Client in room but with empty subscriptions
    const noSubClient = createMockClient("c1", { chat: [] });
    manager.addParticipant("chat", noSubClient);

    room.trigger(Message, { text: "Hello!" });

    expect(noSubClient.socket.emit).not.toHaveBeenCalled();
  });

  it("does not emit when room has no participants", () => {
    const config: RoomConfig = { name: "Chat", events: [Message] };
    const room = createRoom("chat", config, mockIO as never, testLogger);

    const result = room.trigger(Message, { text: "Hello!" });

    expect(result.isOk).toBe(true);
    // No participants means nothing was emitted — no errors either
  });
});

describe("room.on", () => {
  const Message = defineEvent("message", {
    schema: z.object({ text: z.string() }),
  });

  let mockIO: ReturnType<typeof createMockIO>;

  beforeEach(() => {
    mockIO = createMockIO();
  });

  it("calls handler synchronously when event is triggered", () => {
    const config: RoomConfig = { name: "Chat", events: [Message] };
    const room = createRoom("chat", config, mockIO as never, testLogger);
    const handler = vi.fn();

    room.on(Message, handler);
    room.trigger(Message, { text: "Hello!" });

    // Handler is called via Promise.resolve().catch() — which is microtask
    // But the handler fn itself is invoked immediately via Promise.resolve(handler(msg))
    // Since handler is sync, it's called within the same tick
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "message",
        data: { text: "Hello!" },
      })
    );
  });

  it("allows multiple handlers for same event", () => {
    const config: RoomConfig = { name: "Chat", events: [Message] };
    const room = createRoom("chat", config, mockIO as never, testLogger);
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    room.on(Message, handler1);
    room.on(Message, handler2);
    room.trigger(Message, { text: "Hello!" });

    expect(handler1).toHaveBeenCalled();
    expect(handler2).toHaveBeenCalled();
  });

  it("returns unsubscribe function", async () => {
    const config: RoomConfig = { name: "Chat", events: [Message] };
    const room = createRoom("chat", config, mockIO as never, testLogger);
    const handler = vi.fn();

    const unsubscribe = room.on(Message, handler);
    unsubscribe();
    room.trigger(Message, { text: "Hello!" });

    // Give time for any async handlers
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(handler).not.toHaveBeenCalled();
  });
});

describe("beforeEach hook", () => {
  const Message = defineEvent("message", {
    schema: z.object({ text: z.string() }),
  });

  let mockIO: ReturnType<typeof createMockIO>;

  beforeEach(() => {
    mockIO = createMockIO();
  });

  it("allows event when returning Ok", () => {
    const beforeEachHook = vi.fn((ctx) => Ok(ctx.message));
    const hooks: HooksConfig = { events: { beforeEach: beforeEachHook } };

    const config: RoomConfig = { name: "Chat", events: [Message] };

    // Create mock context getter for hooks
    const getContext = vi.fn(() => createMockContext());

    const manager = createRoomManager(
      mockIO as never,
      testLogger,
      undefined,
      hooks,
      getContext
    );
    manager.register("chat", config);
    const room = getRoom(manager, "chat");

    const client = createMockClient("c1", { chat: ["message"] });
    manager.addParticipant("chat", client);

    const result = room.trigger(Message, { text: "Hello!" });

    expect(result.isOk).toBe(true);
    expect(beforeEachHook).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.any(Object),
        roomId: "chat",
        from: "system",
        message: expect.objectContaining({ event: "message" }),
      })
    );
    expect(client.socket.emit).toHaveBeenCalled();
  });

  it("blocks event when returning Err", () => {
    const beforeEachHook = vi.fn(() => Err("blocked by policy"));
    const hooks: HooksConfig = { events: { beforeEach: beforeEachHook } };

    const config: RoomConfig = { name: "Chat", events: [Message] };
    const getContext = vi.fn(() => createMockContext());

    const manager = createRoomManager(
      mockIO as never,
      testLogger,
      undefined,
      hooks,
      getContext
    );
    manager.register("chat", config);
    const room = getRoom(manager, "chat");

    const client = createMockClient("c1", { chat: ["message"] });
    manager.addParticipant("chat", client);

    const result = room.trigger(Message, { text: "Bad content" });

    expect(result.isErr).toBe(true);
    if (result.isErr) {
      expect(result.error).toBe("blocked by policy");
    }
    // Message should NOT have been emitted to participants
    expect(client.socket.emit).not.toHaveBeenCalled();
  });

  it("transforms message when returning modified Ok", () => {
    const beforeEachHook = vi.fn((ctx) => {
      // Modify the message data (e.g., content filtering)
      const modified = {
        ...ctx.message,
        data: { text: "[filtered]" },
      };
      return Ok(modified);
    });
    const hooks: HooksConfig = { events: { beforeEach: beforeEachHook } };

    const config: RoomConfig = { name: "Chat", events: [Message] };
    const getContext = vi.fn(() => createMockContext());

    const manager = createRoomManager(
      mockIO as never,
      testLogger,
      undefined,
      hooks,
      getContext
    );
    manager.register("chat", config);
    const room = getRoom(manager, "chat");

    const client = createMockClient("c1", { chat: ["message"] });
    manager.addParticipant("chat", client);

    room.trigger(Message, { text: "Bad word" });

    expect(client.socket.emit).toHaveBeenCalledWith(
      "dialogue:event",
      expect.objectContaining({ data: { text: "[filtered]" } })
    );
  });

  it("runs before broadcast — blocked events never reach participants", () => {
    const handler = vi.fn();
    const beforeEachHook = vi.fn(() => Err("denied"));
    const hooks: HooksConfig = { events: { beforeEach: beforeEachHook } };

    const config: RoomConfig = { name: "Chat", events: [Message] };
    const manager = createRoomManager(
      mockIO as never,
      testLogger,
      undefined,
      hooks,
      createMockContext
    );
    manager.register("chat", config);
    const room = getRoom(manager, "chat");

    room.on(Message, handler);

    const client = createMockClient("c1", { chat: ["message"] });
    manager.addParticipant("chat", client);

    room.trigger(Message, { text: "Blocked" });

    // Neither socket emit nor server-side handler should be called
    expect(client.socket.emit).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  });
});

describe("afterEach hook", () => {
  const Message = defineEvent("message", {
    schema: z.object({ text: z.string() }),
  });

  let mockIO: ReturnType<typeof createMockIO>;

  beforeEach(() => {
    mockIO = createMockIO();
  });

  it("is called after successful broadcast", () => {
    const afterEachHook = vi.fn();
    const hooks: HooksConfig = { events: { afterEach: afterEachHook } };

    const config: RoomConfig = { name: "Chat", events: [Message] };
    const manager = createRoomManager(
      mockIO as never,
      testLogger,
      undefined,
      hooks,
      createMockContext
    );
    manager.register("chat", config);
    const room = getRoom(manager, "chat");

    const client = createMockClient("c1", { chat: ["message"] });
    manager.addParticipant("chat", client);

    room.trigger(Message, { text: "Hello!" });

    expect(afterEachHook).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.any(Object),
        roomId: "chat",
        message: expect.objectContaining({ event: "message" }),
        recipientCount: 1,
      })
    );
  });

  it("reports correct recipient count", () => {
    const afterEachHook = vi.fn();
    const hooks: HooksConfig = { events: { afterEach: afterEachHook } };

    const config: RoomConfig = { name: "Chat", events: [Message] };
    const manager = createRoomManager(
      mockIO as never,
      testLogger,
      undefined,
      hooks,
      createMockContext
    );
    manager.register("chat", config);
    const room = getRoom(manager, "chat");

    // Two subscribed, one not
    const c1 = createMockClient("c1", { chat: ["message"] });
    const c2 = createMockClient("c2", { chat: ["message"] });
    const c3 = createMockClient("c3", { chat: ["typing"] });
    manager.addParticipant("chat", c1);
    manager.addParticipant("chat", c2);
    manager.addParticipant("chat", c3);

    room.trigger(Message, { text: "Hello!" });

    expect(afterEachHook).toHaveBeenCalledWith(
      expect.objectContaining({ recipientCount: 2 })
    );
  });

  it("reports 0 recipients when no one is subscribed", () => {
    const afterEachHook = vi.fn();
    const hooks: HooksConfig = { events: { afterEach: afterEachHook } };

    const config: RoomConfig = { name: "Chat", events: [Message] };
    const manager = createRoomManager(
      mockIO as never,
      testLogger,
      undefined,
      hooks,
      createMockContext
    );
    manager.register("chat", config);
    const room = getRoom(manager, "chat");

    room.trigger(Message, { text: "Hello!" });

    expect(afterEachHook).toHaveBeenCalledWith(
      expect.objectContaining({ recipientCount: 0 })
    );
  });

  it("is NOT called when beforeEach blocks the event", () => {
    const afterEachHook = vi.fn();
    const beforeEachHook = vi.fn(() => Err("blocked"));
    const hooks: HooksConfig = {
      events: {
        beforeEach: beforeEachHook,
        afterEach: afterEachHook,
      },
    };

    const config: RoomConfig = { name: "Chat", events: [Message] };
    const manager = createRoomManager(
      mockIO as never,
      testLogger,
      undefined,
      hooks,
      createMockContext
    );
    manager.register("chat", config);
    const room = getRoom(manager, "chat");

    room.trigger(Message, { text: "Blocked" });

    expect(beforeEachHook).toHaveBeenCalled();
    expect(afterEachHook).not.toHaveBeenCalled();
  });

  it("receives transformed message from beforeEach", () => {
    const beforeEachHook = vi.fn((ctx) =>
      Ok({ ...ctx.message, data: { text: "[censored]" } })
    );
    const afterEachHook = vi.fn();
    const hooks: HooksConfig = {
      events: {
        beforeEach: beforeEachHook,
        afterEach: afterEachHook,
      },
    };

    const config: RoomConfig = { name: "Chat", events: [Message] };
    const manager = createRoomManager(
      mockIO as never,
      testLogger,
      undefined,
      hooks,
      createMockContext
    );
    manager.register("chat", config);
    const room = getRoom(manager, "chat");

    const client = createMockClient("c1", { chat: ["message"] });
    manager.addParticipant("chat", client);

    room.trigger(Message, { text: "bad word" });

    expect(afterEachHook).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.any(Object),
        message: expect.objectContaining({ data: { text: "[censored]" } }),
      })
    );
  });
});

describe("createRoomManager", () => {
  const Message = defineEvent("message");
  let mockIO: ReturnType<typeof createMockIO>;

  beforeEach(() => {
    mockIO = createMockIO();
  });

  it("registers rooms from config", () => {
    const manager = createRoomManager(
      mockIO as never,
      testLogger,
      undefined,
      undefined,
      vi.fn(() => createMockContext())
    );

    manager.register("chat", {
      name: "Chat Room",
      events: [Message],
    });

    const room = manager.get("chat");
    expect(room).not.toBeNull();
    expect(room?.name).toBe("Chat Room");
  });

  it("returns null for non-existent room", () => {
    const manager = createRoomManager(
      mockIO as never,
      testLogger,
      undefined,
      undefined,
      vi.fn(() => createMockContext())
    );
    expect(manager.get("unknown")).toBeNull();
  });

  it("returns all registered rooms", () => {
    const manager = createRoomManager(
      mockIO as never,
      testLogger,
      undefined,
      undefined,
      vi.fn(() => createMockContext())
    );

    manager.register("room1", { name: "Room 1", events: [] });
    manager.register("room2", { name: "Room 2", events: [] });

    const rooms = manager.all();
    expect(rooms).toHaveLength(2);
  });

  it("adds participant to room", () => {
    const manager = createRoomManager(
      mockIO as never,
      testLogger,
      undefined,
      undefined,
      vi.fn(() => createMockContext())
    );
    manager.register("chat", { name: "Chat", events: [], maxSize: 10 });

    const client = createMockClient("client-1");
    const added = manager.addParticipant("chat", client);

    expect(added).toBe(true);
    expect(manager.getRoomSize("chat")).toBe(1);
  });

  it("rejects participant when room is full", () => {
    const manager = createRoomManager(
      mockIO as never,
      testLogger,
      undefined,
      undefined,
      vi.fn(() => createMockContext())
    );
    manager.register("chat", { name: "Chat", events: [], maxSize: 1 });

    manager.addParticipant("chat", createMockClient("client-1"));
    const added = manager.addParticipant("chat", createMockClient("client-2"));

    expect(added).toBe(false);
    expect(manager.getRoomSize("chat")).toBe(1);
  });

  it("removes participant from room", () => {
    const manager = createRoomManager(
      mockIO as never,
      testLogger,
      undefined,
      undefined,
      vi.fn(() => createMockContext())
    );
    manager.register("chat", { name: "Chat", events: [] });

    const client = createMockClient("client-1");
    manager.addParticipant("chat", client);
    manager.removeParticipant("chat", "client-1");

    expect(manager.getRoomSize("chat")).toBe(0);
  });

  it("removes client from all rooms", () => {
    const manager = createRoomManager(
      mockIO as never,
      testLogger,
      undefined,
      undefined,
      vi.fn(() => createMockContext())
    );
    manager.register("room1", { name: "Room 1", events: [] });
    manager.register("room2", { name: "Room 2", events: [] });

    const client = createMockClient("client-1");
    manager.addParticipant("room1", client);
    manager.addParticipant("room2", client);
    manager.removeFromAllRooms("client-1");

    expect(manager.getRoomSize("room1")).toBe(0);
    expect(manager.getRoomSize("room2")).toBe(0);
  });

  it("gets participants for a room", () => {
    const manager = createRoomManager(
      mockIO as never,
      testLogger,
      undefined,
      undefined,
      vi.fn(() => createMockContext())
    );
    manager.register("chat", { name: "Chat", events: [] });

    const client1 = createMockClient("client-1");
    const client2 = createMockClient("client-2");
    manager.addParticipant("chat", client1);
    manager.addParticipant("chat", client2);

    const participants = manager.getParticipants("chat");
    expect(participants).toHaveLength(2);
  });

  it("unregisters a room and cleans up", () => {
    const manager = createRoomManager(
      mockIO as never,
      testLogger,
      undefined,
      undefined,
      vi.fn(() => createMockContext())
    );
    manager.register("chat", { name: "Chat", events: [] });

    const client = createMockClient("client-1");
    manager.addParticipant("chat", client);

    const deleted = manager.unregister("chat");

    expect(deleted).toBe(true);
    expect(manager.get("chat")).toBeNull();
  });

  it("returns false when unregistering non-existent room", () => {
    const manager = createRoomManager(
      mockIO as never,
      testLogger,
      undefined,
      undefined,
      vi.fn(() => createMockContext())
    );
    expect(manager.unregister("unknown")).toBe(false);
  });
});
