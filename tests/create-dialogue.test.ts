import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { defineEvent } from "../src/define-event.ts";
import type { DialogueConfig, RoomConfig } from "../src/types.ts";

/**
 * These tests focus on configuration validation and API structure.
 * Integration tests (tests/integration.test.ts) cover the full server lifecycle.
 */

describe("DialogueConfig structure", () => {
  const Message = defineEvent("message", {
    schema: z.object({ text: z.string() }),
  });
  const Typing = defineEvent("typing");

  it("accepts minimal valid config", () => {
    const chatRoom: RoomConfig = {
      name: "Chat Room",
      events: [Message],
    };

    const config: DialogueConfig = {
      rooms: { chat: chatRoom },
    };

    expect(config.rooms.chat).toBeDefined();
    expect(chatRoom.events).toHaveLength(1);
  });

  it("accepts config with multiple rooms", () => {
    const config: DialogueConfig = {
      rooms: {
        chat: {
          name: "Chat",
          events: [Message, Typing],
        },
        notifications: {
          name: "Notifications",
          events: [],
        },
      },
    };

    expect(Object.keys(config.rooms)).toHaveLength(2);
  });

  it("accepts config with all options", () => {
    const chatRoom: RoomConfig = {
      name: "Chat Room",
      description: "Main chat room",
      maxSize: 100,
      events: [Message],
      defaultSubscriptions: ["message"],
      createdById: "system",
    };

    const config: DialogueConfig = {
      port: 4000,
      rooms: { chat: chatRoom },
      hooks: {
        clients: {
          onConnected: vi.fn(),
        },
      },
    };

    expect(config.port).toBe(4000);
    expect(chatRoom.maxSize).toBe(100);
    expect(config.hooks?.clients?.onConnected).toBeDefined();
  });

  it("allows empty events array for unrestricted rooms", () => {
    const openRoom: RoomConfig = {
      name: "Open Room",
      events: [],
    };

    const config: DialogueConfig = {
      rooms: { open: openRoom },
    };

    expect(openRoom.events).toEqual([]);
    expect(config.rooms.open).toBe(openRoom);
  });
});

describe("Event definitions in config", () => {
  it("preserves event schemas in room config", () => {
    const Message = defineEvent("message", {
      schema: z.object({
        text: z.string().min(1).max(1000),
        senderId: z.string(),
      }),
    });

    const chatRoom: RoomConfig = {
      name: "Chat",
      events: [Message],
    };

    const config: DialogueConfig = {
      rooms: { chat: chatRoom },
    };

    const eventFromConfig = chatRoom.events[0];
    expect(eventFromConfig?.schema).toBeDefined();

    // Validate that schema works correctly
    const validResult = eventFromConfig?.schema?.safeParse({
      text: "Hello",
      senderId: "user-1",
    });
    expect(validResult?.success).toBe(true);

    const invalidResult = eventFromConfig?.schema?.safeParse({
      text: "",
      senderId: "user-1",
    });
    expect(invalidResult?.success).toBe(false);

    // Verify config structure
    expect(config.rooms.chat).toBe(chatRoom);
  });

  it("shares events between rooms", () => {
    const Message = defineEvent("message");

    const room1: RoomConfig = { name: "Room 1", events: [Message] };
    const room2: RoomConfig = { name: "Room 2", events: [Message] };

    const config: DialogueConfig = {
      rooms: { room1, room2 },
    };

    expect(room1.events[0]).toBe(room2.events[0]);
    expect(config.rooms.room1).toBe(room1);
  });
});

describe("Default subscriptions", () => {
  it("allows specifying default subscriptions", () => {
    const Message = defineEvent("message");
    const Typing = defineEvent("typing");
    const Presence = defineEvent("presence");

    const chatRoom: RoomConfig = {
      name: "Chat",
      events: [Message, Typing, Presence],
      defaultSubscriptions: ["message", "presence"],
    };

    const config: DialogueConfig = {
      rooms: { chat: chatRoom },
    };

    expect(chatRoom.defaultSubscriptions).toEqual(["message", "presence"]);
    expect(chatRoom.defaultSubscriptions).not.toContain("typing");
    expect(config.rooms.chat).toBe(chatRoom);
  });

  it("defaults to undefined when not specified", () => {
    const chatRoom: RoomConfig = {
      name: "Chat",
      events: [],
    };

    const config: DialogueConfig = {
      rooms: { chat: chatRoom },
    };

    expect(chatRoom.defaultSubscriptions).toBeUndefined();
    expect(config.rooms.chat).toBe(chatRoom);
  });
});

describe("onConnected hook", () => {
  it("accepts sync handler", () => {
    const handler = vi.fn();

    const config: DialogueConfig = {
      rooms: {},
      hooks: {
        clients: {
          onConnected: handler,
        },
      },
    };

    expect(config.hooks?.clients?.onConnected).toBe(handler);
  });

  it("accepts async handler", () => {
    const asyncHandler = vi.fn(async () => {
      await Promise.resolve();
    });

    const config: DialogueConfig = {
      rooms: {},
      hooks: {
        clients: {
          onConnected: asyncHandler,
        },
      },
    };

    expect(config.hooks?.clients?.onConnected).toBe(asyncHandler);
  });
});
