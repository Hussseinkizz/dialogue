import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createConnectedClient,
  extractUserFromSocket,
  isSubscribedToEvent,
} from "../src/client-handler.ts";
import { createSilentLogger } from "../src/logger.ts";
import type { RoomManagerInstance } from "../src/room.ts";
import type { Logger } from "../src/types.ts";

/** Silent logger for tests to avoid console output */
const testLogger: Logger = createSilentLogger();

/**
 * Creates a mock Socket for testing
 */
function createMockSocket(id = "socket-1", auth: Record<string, unknown> = {}) {
  return {
    id,
    handshake: { auth },
    join: vi.fn(),
    leave: vi.fn(),
    emit: vi.fn(),
    disconnect: vi.fn(),
  };
}

/**
 * Creates a mock RoomManager for testing
 */
function createMockRoomManager(): RoomManagerInstance {
  const rooms = new Map<
    string,
    { name: string; defaultSubscriptions: string[] }
  >();

  return {
    register: vi.fn((id, config) => {
      rooms.set(id, {
        name: config.name,
        defaultSubscriptions: config.defaultSubscriptions ?? [],
      });
      return {} as never;
    }),
    unregister: vi.fn(() => true),
    get: vi.fn((id) => {
      const room = rooms.get(id);
      if (!room) {
        return null;
      }
      return {
        id,
        name: room.name,
        defaultSubscriptions: room.defaultSubscriptions,
        events: [],
        isFull: () => false,
      } as never;
    }),
    all: vi.fn(() => []),
    addParticipant: vi.fn(() => true),
    removeParticipant: vi.fn(),
    removeFromAllRooms: vi.fn(),
    getParticipants: vi.fn(() => []),
    getRoomSize: vi.fn(() => 0),
  };
}

describe("createConnectedClient", () => {
  let mockSocket: ReturnType<typeof createMockSocket>;
  let mockRoomManager: RoomManagerInstance;

  beforeEach(() => {
    mockSocket = createMockSocket();
    mockRoomManager = createMockRoomManager();

    // Register test rooms
    mockRoomManager.register("chat", {
      name: "Chat",
      events: [],
      defaultSubscriptions: ["message"],
    });
    mockRoomManager.register("full-room", {
      name: "Full Room",
      events: [],
      maxSize: 0,
    });
  });

  it("creates a client with unique id", () => {
    const client = createConnectedClient(
      mockSocket as never,
      "user-1",
      {},
      mockRoomManager,
      testLogger
    );

    expect(client.id).toBeDefined();
    expect(client.id.length).toBeGreaterThan(0);
    expect(client.userId).toBe("user-1");
  });

  it("stores metadata", () => {
    const meta = { role: "admin", permissions: ["read", "write"] };
    const client = createConnectedClient(
      mockSocket as never,
      "user-1",
      meta,
      mockRoomManager,
      testLogger
    );

    expect(client.meta).toEqual(meta);
  });

  it("exposes underlying socket", () => {
    const client = createConnectedClient(
      mockSocket as never,
      "user-1",
      {},
      mockRoomManager,
      testLogger
    );

    expect(client.socket).toBe(mockSocket);
  });
});

describe("client.join", () => {
  let mockSocket: ReturnType<typeof createMockSocket>;
  let mockRoomManager: RoomManagerInstance;

  beforeEach(() => {
    mockSocket = createMockSocket();
    mockRoomManager = createMockRoomManager();

    mockRoomManager.register("chat", {
      name: "Chat",
      events: [],
      defaultSubscriptions: ["message"],
    });
  });

  it("joins a room successfully", () => {
    const client = createConnectedClient(
      mockSocket as never,
      "user-1",
      {},
      mockRoomManager,
      testLogger
    );

    client.join("chat");

    expect(mockRoomManager.addParticipant).toHaveBeenCalledWith("chat", client);
    expect(mockSocket.emit).toHaveBeenCalledWith("dialogue:joined", {
      roomId: "chat",
      roomName: "Chat",
    });
  });

  it("auto-subscribes to default subscriptions", () => {
    const client = createConnectedClient(
      mockSocket as never,
      "user-1",
      {},
      mockRoomManager,
      testLogger
    );

    client.join("chat");

    expect(client.subscriptions("chat")).toContain("message");
  });

  it("tracks joined rooms", () => {
    const client = createConnectedClient(
      mockSocket as never,
      "user-1",
      {},
      mockRoomManager,
      testLogger
    );

    client.join("chat");

    expect(client.rooms()).toContain("chat");
  });

  it("does not rejoin same room twice", () => {
    const client = createConnectedClient(
      mockSocket as never,
      "user-1",
      {},
      mockRoomManager,
      testLogger
    );

    client.join("chat");
    client.join("chat");

    expect(mockRoomManager.addParticipant).toHaveBeenCalledTimes(1);
  });

  it("handles non-existent room gracefully", () => {
    const client = createConnectedClient(
      mockSocket as never,
      "user-1",
      {},
      mockRoomManager,
      testLogger
    );

    client.join("non-existent");

    expect(mockRoomManager.addParticipant).not.toHaveBeenCalled();
  });

  it("handles full room", () => {
    // Override addParticipant to return false (room full)
    mockRoomManager.addParticipant = vi.fn(() => false);

    const client = createConnectedClient(
      mockSocket as never,
      "user-1",
      {},
      mockRoomManager,
      testLogger
    );

    client.join("chat");

    expect(mockSocket.emit).toHaveBeenCalledWith("dialogue:error", {
      code: "ROOM_FULL",
      message: expect.stringContaining("capacity"),
    });
  });
});

describe("client.leave", () => {
  let mockSocket: ReturnType<typeof createMockSocket>;
  let mockRoomManager: RoomManagerInstance;

  beforeEach(() => {
    mockSocket = createMockSocket();
    mockRoomManager = createMockRoomManager();

    mockRoomManager.register("chat", {
      name: "Chat",
      events: [],
    });
  });

  it("leaves a joined room", () => {
    const client = createConnectedClient(
      mockSocket as never,
      "user-1",
      {},
      mockRoomManager,
      testLogger
    );

    client.join("chat");
    client.leave("chat");

    expect(mockRoomManager.removeParticipant).toHaveBeenCalledWith(
      "chat",
      client.id
    );
    expect(mockSocket.emit).toHaveBeenCalledWith("dialogue:left", {
      roomId: "chat",
    });
  });

  it("removes room from client's room list", () => {
    const client = createConnectedClient(
      mockSocket as never,
      "user-1",
      {},
      mockRoomManager,
      testLogger
    );

    client.join("chat");
    client.leave("chat");

    expect(client.rooms()).not.toContain("chat");
  });

  it("clears subscriptions on leave", () => {
    const client = createConnectedClient(
      mockSocket as never,
      "user-1",
      {},
      mockRoomManager,
      testLogger
    );

    client.join("chat");
    client.subscribe("chat", "typing");
    client.leave("chat");

    expect(client.subscriptions("chat")).toEqual([]);
  });

  it("does nothing when leaving room not joined", () => {
    const client = createConnectedClient(
      mockSocket as never,
      "user-1",
      {},
      mockRoomManager,
      testLogger
    );

    client.leave("chat");

    expect(mockRoomManager.removeParticipant).not.toHaveBeenCalled();
  });
});

describe("client.subscribe/unsubscribe", () => {
  let mockSocket: ReturnType<typeof createMockSocket>;
  let mockRoomManager: RoomManagerInstance;

  beforeEach(() => {
    mockSocket = createMockSocket();
    mockRoomManager = createMockRoomManager();

    mockRoomManager.register("chat", {
      name: "Chat",
      events: [],
    });
  });

  it("subscribes to an event in a joined room", () => {
    const client = createConnectedClient(
      mockSocket as never,
      "user-1",
      {},
      mockRoomManager,
      testLogger
    );

    client.join("chat");
    client.subscribe("chat", "typing");

    expect(client.subscriptions("chat")).toContain("typing");
  });

  it("does not subscribe when not in room", () => {
    const client = createConnectedClient(
      mockSocket as never,
      "user-1",
      {},
      mockRoomManager,
      testLogger
    );

    client.subscribe("chat", "typing");

    expect(client.subscriptions("chat")).toEqual([]);
  });

  it("unsubscribes from an event", () => {
    const client = createConnectedClient(
      mockSocket as never,
      "user-1",
      {},
      mockRoomManager,
      testLogger
    );

    client.join("chat");
    client.subscribe("chat", "typing");
    client.unsubscribe("chat", "typing");

    expect(client.subscriptions("chat")).not.toContain("typing");
  });

  it("subscribes to all events with subscribeAll", () => {
    const client = createConnectedClient(
      mockSocket as never,
      "user-1",
      {},
      mockRoomManager,
      testLogger
    );

    client.join("chat");
    client.subscribeAll("chat");

    expect(client.subscriptions("chat")).toContain("*");
  });
});

describe("client.send", () => {
  it("sends data directly to client socket", () => {
    const mockSocket = createMockSocket();
    const mockRoomManager = createMockRoomManager();

    const client = createConnectedClient(
      mockSocket as never,
      "user-1",
      {},
      mockRoomManager,
      testLogger
    );

    client.send("custom-event", { message: "hello" });

    expect(mockSocket.emit).toHaveBeenCalledWith("custom-event", {
      message: "hello",
    });
  });
});

describe("client.disconnect", () => {
  it("disconnects the underlying socket", () => {
    const mockSocket = createMockSocket();
    const mockRoomManager = createMockRoomManager();
    mockRoomManager.register("chat", { name: "Chat", events: [] });

    const client = createConnectedClient(
      mockSocket as never,
      "user-1",
      {},
      mockRoomManager,
      testLogger
    );

    client.join("chat");
    client.disconnect();

    expect(mockSocket.disconnect).toHaveBeenCalledWith(true);
  });

  it("clears all joined rooms and subscriptions", () => {
    const mockSocket = createMockSocket();
    const mockRoomManager = createMockRoomManager();
    mockRoomManager.register("chat", { name: "Chat", events: [] });

    const client = createConnectedClient(
      mockSocket as never,
      "user-1",
      {},
      mockRoomManager,
      testLogger
    );

    client.join("chat");
    client.disconnect();

    expect(client.rooms()).toEqual([]);
    expect(client.subscriptions("chat")).toEqual([]);
  });
});

describe("isSubscribedToEvent", () => {
  let mockSocket: ReturnType<typeof createMockSocket>;
  let mockRoomManager: RoomManagerInstance;

  beforeEach(() => {
    mockSocket = createMockSocket();
    mockRoomManager = createMockRoomManager();
    mockRoomManager.register("chat", { name: "Chat", events: [] });
  });

  it("returns true when subscribed to specific event", () => {
    const client = createConnectedClient(
      mockSocket as never,
      "user-1",
      {},
      mockRoomManager,
      testLogger
    );

    client.join("chat");
    client.subscribe("chat", "message");

    expect(isSubscribedToEvent(client, "chat", "message")).toBe(true);
  });

  it("returns false when not subscribed", () => {
    const client = createConnectedClient(
      mockSocket as never,
      "user-1",
      {},
      mockRoomManager,
      testLogger
    );

    client.join("chat");

    expect(isSubscribedToEvent(client, "chat", "message")).toBe(false);
  });

  it("returns true for any event when subscribed to wildcard", () => {
    const client = createConnectedClient(
      mockSocket as never,
      "user-1",
      {},
      mockRoomManager,
      testLogger
    );

    client.join("chat");
    client.subscribeAll("chat");

    expect(isSubscribedToEvent(client, "chat", "message")).toBe(true);
    expect(isSubscribedToEvent(client, "chat", "typing")).toBe(true);
    expect(isSubscribedToEvent(client, "chat", "anything")).toBe(true);
  });
});

describe("extractUserFromSocket", () => {
  it("extracts userId from auth", () => {
    const socket = createMockSocket("socket-1", { userId: "user-123" });

    const { userId } = extractUserFromSocket(socket as never);

    expect(userId).toBe("user-123");
  });

  it("uses socket id when no auth userId", () => {
    const socket = createMockSocket("socket-1");

    const { userId } = extractUserFromSocket(socket as never);

    expect(userId).toBe("socket-1");
  });

  it("uses token as userId when no userId present", () => {
    const socket = createMockSocket("socket-1", { token: "jwt-token-123" });

    const { userId } = extractUserFromSocket(socket as never);

    expect(userId).toBe("jwt-token-123");
  });

  it("extracts role into meta", () => {
    const socket = createMockSocket("socket-1", {
      userId: "user-1",
      role: "admin",
    });

    const { meta } = extractUserFromSocket(socket as never);

    expect(meta.role).toBe("admin");
  });

  it("includes additional auth fields in meta", () => {
    const socket = createMockSocket("socket-1", {
      userId: "user-1",
      permissions: ["read", "write"],
      customField: 42,
    });

    const { meta } = extractUserFromSocket(socket as never);

    expect(meta.permissions).toEqual(["read", "write"]);
    expect(meta.customField).toBe(42);
  });
});
