---
title: Chat Application
description: A basic chat application with messages, typing indicators, and user presence
---

# Chat Application

A basic chat application with messages, typing indicators, and user presence.

## Backend Configuration

```typescript
// dialogue.config.ts
import { createDialogue, defineEvent } from "./dialogue";
import { z } from "zod";

// Define events
export const Message = defineEvent("message", {
  schema: z.object({
    text: z.string().min(1).max(2000),
    senderId: z.string(),
    replyTo: z.string().optional(),
  }),
});

export const Typing = defineEvent("typing", {
  schema: z.object({
    isTyping: z.boolean(),
  }),
});

export const UserJoined = defineEvent("user:joined", {
  schema: z.object({
    userId: z.string(),
    username: z.string(),
  }),
});

export const UserLeft = defineEvent("user:left", {
  schema: z.object({
    userId: z.string(),
  }),
});

export const dialogue = createDialogue({
  port: 3000,
  rooms: {
    general: {
      name: "General Chat",
      description: "Public chat room for everyone",
      events: [Message, Typing, UserJoined, UserLeft],
      defaultSubscriptions: ["message", "user:joined", "user:left"],
      syncHistoryOnJoin: 50, // Send last 50 messages on join
    },
  },
  hooks: {
    clients: {
      onConnected: async (client) => {
        // Get user info from database
        const user = await getUserById(client.userId);

        // Auto-join general chat
        client.join("general");

        // Notify others
        dialogue.trigger(
          "general",
          UserJoined,
          {
            userId: client.userId,
            username: user.name,
          },
          client.userId
        );
      },
    },
  },
});

// Persist messages to database
dialogue.on("general", Message, async (msg) => {
  await db.messages.create({
    roomId: msg.roomId,
    text: msg.data.text,
    senderId: msg.from,
    replyTo: msg.data.replyTo,
    createdAt: new Date(msg.timestamp),
  });
});
```

## Frontend Client

```typescript
// chat-client.ts
import { createDialogueClient } from "./client";

interface ChatMessage {
  text: string;
  senderId: string;
  replyTo?: string;
}

function createChatClient(url: string, userId: string, token: string) {
  const client = createDialogueClient({
    url,
    auth: { userId, token },
  });
  let room: RoomContext | null = null;

  return {
    async connect(): Promise<void> {
      await client.connect();
      room = await client.join("general");
    },

    onMessage(handler: (msg: ChatMessage, from: string) => void): () => void {
      if (!room) throw new Error("Not connected");

      return room.on<ChatMessage>("message", (msg) => {
        handler(msg.data, msg.from);
      });
    },

    onUserJoined(handler: (userId: string, username: string) => void): () => void {
      if (!room) throw new Error("Not connected");

      return room.on<{ userId: string; username: string }>(
        "user:joined",
        (msg) => {
          handler(msg.data.userId, msg.data.username);
        }
      );
    },

    sendMessage(text: string, replyTo?: string): void {
      if (!room) throw new Error("Not connected");

      room.trigger("message", {
        text,
        senderId: client.userId,
        replyTo,
      });
    },

    setTyping(isTyping: boolean): void {
      if (!room) return;
      room.trigger("typing", { isTyping });
    },

    disconnect(): void {
      room?.leave();
      client.disconnect();
    },
  };
}
```

*This documentation reflects the current implementation and is subject to evolution. Contributions and feedback are welcome.*
