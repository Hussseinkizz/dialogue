import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineEvent, validateEventData } from "../src/define-event.ts";
import type { EventMessage } from "../src/types.ts";

/**
 * Integration tests for the Dialogue library.
 *
 * NOTE: Full server integration tests require Bun runtime.
 * These tests focus on end-to-end flows that can be tested without starting a server.
 *
 * For full server tests, run: `bun test tests/integration.test.ts`
 */

describe("Event flow integration", () => {
  it("validates and transforms data through the full event pipeline", () => {
    // Define event with schema
    const OrderUpdated = defineEvent("order:updated", {
      schema: z.object({
        orderId: z.string().uuid(),
        status: z.enum(["pending", "processing", "shipped", "delivered"]),
        updatedAt: z.coerce.date(),
      }),
    });

    // Simulate incoming data (as if from client)
    const incomingData = {
      orderId: "550e8400-e29b-41d4-a716-446655440000",
      status: "shipped",
      updatedAt: "2024-01-15T10:30:00Z",
    };

    // Validate
    const result = validateEventData(OrderUpdated, incomingData);

    expect(result.isOk).toBe(true);
    if (result.isOk) {
      expect(result.value.orderId).toBe("550e8400-e29b-41d4-a716-446655440000");
      expect(result.value.status).toBe("shipped");
      expect(result.value.updatedAt).toBeInstanceOf(Date);
    }
  });

  it("rejects invalid data with descriptive error", () => {
    const Message = defineEvent("message", {
      schema: z.object({
        text: z.string().min(1, "Message cannot be empty"),
        senderId: z.string(),
      }),
    });

    const invalidData = {
      text: "",
      senderId: "user-1",
    };

    const result = validateEventData(Message, invalidData);

    expect(result.isErr).toBe(true);
    if (result.isErr) {
      expect(result.error).toContain("message");
      expect(result.error).toContain("validation failed");
    }
  });
});

describe("EventMessage structure", () => {
  it("creates properly structured event messages", () => {
    const Message = defineEvent("message", {
      schema: z.object({ text: z.string() }),
    });

    // Simulate message creation (as done in room.trigger)
    const message: EventMessage<{ text: string }> = {
      event: Message.name,
      roomId: "chat",
      data: { text: "Hello, World!" },
      from: "user-123",
      timestamp: Date.now(),
    };

    expect(message.event).toBe("message");
    expect(message.roomId).toBe("chat");
    expect(message.data.text).toBe("Hello, World!");
    expect(message.from).toBe("user-123");
    expect(typeof message.timestamp).toBe("number");
  });

  it("handles complex nested data types", () => {
    const GameStateUpdate = defineEvent("game:state", {
      schema: z.object({
        players: z.array(
          z.object({
            id: z.string(),
            position: z.object({
              x: z.number(),
              y: z.number(),
            }),
            health: z.number().min(0).max(100),
          })
        ),
        gameTime: z.number(),
      }),
    });

    const gameData = {
      players: [
        { id: "p1", position: { x: 10, y: 20 }, health: 100 },
        { id: "p2", position: { x: 50, y: 30 }, health: 75 },
      ],
      gameTime: 120,
    };

    const result = validateEventData(GameStateUpdate, gameData);

    expect(result.isOk).toBe(true);
    if (result.isOk) {
      expect(result.value.players).toHaveLength(2);
      expect(result.value.players[0]?.position.x).toBe(10);
    }
  });
});

describe("Type safety across the pipeline", () => {
  it("maintains type information through event definition", () => {
    interface ChatMessage {
      text: string;
      senderId: string;
      timestamp: number;
    }

    const Message = defineEvent<ChatMessage>("message", {
      schema: z.object({
        text: z.string(),
        senderId: z.string(),
        timestamp: z.number(),
      }),
    });

    // Type checking at compile time
    const validData: ChatMessage = {
      text: "Hello",
      senderId: "user-1",
      timestamp: Date.now(),
    };

    const result = validateEventData(Message, validData);

    expect(result.isOk).toBe(true);
    if (result.isOk) {
      // TypeScript knows result.value is ChatMessage
      const msg: ChatMessage = result.value;
      expect(msg.text).toBe("Hello");
    }
  });
});

describe("Multiple event types in single room scenario", () => {
  it("validates different events independently", () => {
    const Message = defineEvent("message", {
      schema: z.object({ text: z.string() }),
    });

    const Typing = defineEvent("typing", {
      schema: z.object({ isTyping: z.boolean() }),
    });

    const Reaction = defineEvent("reaction", {
      schema: z.object({
        messageId: z.string(),
        emoji: z.string().emoji(),
      }),
    });

    // All events share the same room but have independent schemas
    const messageResult = validateEventData(Message, { text: "Hello" });
    const typingResult = validateEventData(Typing, { isTyping: true });
    const reactionResult = validateEventData(Reaction, {
      messageId: "msg-1",
      emoji: "👍",
    });

    expect(messageResult.isOk).toBe(true);
    expect(typingResult.isOk).toBe(true);
    expect(reactionResult.isOk).toBe(true);
  });
});
