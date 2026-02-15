---
title: Getting Started
description: Installation, basic setup, and your first real-time application using Dialogue
---

# Getting Started with Dialogue

This guide covers installation, basic setup, and your first real-time application using Dialogue.

## 1. Overview

Dialogue is an event-based realtime communication library built on Socket.IO, Hono, and Bun. It provides a simple, type-safe API for building real-time applications like chat, notifications, live dashboards, multiplayer games, and IoT systems.

### 1.1 Key Features

- **Config-first**: Define all rooms and events upfront in one configuration file
- **Event-centric**: Events are first-class citizens with optional Zod schema validation
- **Type-safe**: Full TypeScript support with inferred types from schemas
- **Bounded rooms**: Optional `maxSize` for predictable scaling
- **Unified mental model**: Backend and frontend share similar APIs

## 2. Installation

Install Dialogue and zod:

```bash
bun add dialogue-ts zod
```

Dialogue requires Bun runtime for the backend server.

## 3. Quick Start

### 3.1 Define Events

Create a configuration file to define your events and rooms:

```typescript
// dialogue.config.ts
import { createDialogue, defineEvent } from "dialogue-ts";
import { z } from "zod";

// Define events with optional schema validation
export const Message = defineEvent("message", {
  schema: z.object({
    text: z.string().min(1).max(1000),
    senderId: z.string(),
  }),
  description: "Chat message sent by a user",
});

export const Typing = defineEvent("typing", {
  schema: z.object({
    isTyping: z.boolean(),
  }),
});

// Create the dialogue instance
export const dialogue = createDialogue({
  port: 3000,
  rooms: {
    chat: {
      name: "Chat Room",
      events: [Message, Typing],
      defaultSubscriptions: ["message"],
    },
  },
  hooks: {
    clients: {
      onConnected: (client) => {
        console.log(`Client connected: ${client.userId}`);
        client.join("chat");
      },
    },
  },
});
```

### 3.2 Start the Server

```typescript
// server.ts
import { dialogue } from "./dialogue.config";

await dialogue.start();
// Server running on http://localhost:3000
```

Run with Bun:

```bash
bun run server.ts
```

### 3.3 Trigger Events from Backend

You can trigger events from anywhere in your backend code:

```typescript
import { dialogue, Message } from "./dialogue.config";

// From an API route, webhook, or background job
dialogue.trigger("chat", Message, {
  text: "Welcome to the chat!",
  senderId: "system",
});
```

### 3.4 Connect from Frontend

```typescript
import { createDialogueClient } from "dialogue-ts/client";

const client = createDialogueClient({
  url: "ws://localhost:3000",
  auth: { userId: "user-123" },
});

await client.connect();

// Join a room
const chat = await client.join("chat");

// Listen for events
chat.on("message", (msg) => {
  console.log(`${msg.from}: ${msg.data.text}`);
});

// Send events
chat.trigger("message", {
  text: "Hello, everyone!",
  senderId: "user-123",
});
```

## 4. Project Structure

A typical Dialogue project structure:

```
my-app/
├── dialogue.config.ts    # Events and rooms configuration
├── server.ts             # Server entry point
├── dialogue/             # Dialogue library (backend)
│   ├── index.ts
│   ├── types.ts
│   ├── define-event.ts
│   ├── room.ts
│   ├── client-handler.ts
│   ├── create-dialogue.ts
│   └── server.ts
├── client/               # Client SDK (frontend)
│   ├── index.ts
│   ├── types.ts
│   ├── dialogue-client.ts
│   └── room-context.ts
└── package.json
```

## 5. Next Steps

- Read the [Configuration Guide](/guide/configuration) for detailed configuration options
- Explore the [Backend API](/api/backend-api) for server-side features
- Learn about the [Client API](/api/client-api) for frontend integration
- See [Examples](/examples/) for complete use-case implementations

*This documentation reflects the current implementation and is subject to evolution. Contributions and feedback are welcome.*
