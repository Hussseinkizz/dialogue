---
title: Getting Started
description: Installation, basic setup, and your first real-time application using Dialogue
---

# Getting Started with Dialogue

This guide covers installation, basic setup, and your first real-time application using Dialogue.

## 1. Overview

Dialogue is an event-based realtime communication library built on Socket.IO and Hono. It supports both **Bun** and **Node.js** runtimes, auto-detecting which to use. It provides a simple, type-safe API for building real-time applications like chat, notifications, live dashboards, multiplayer games, and IoT systems.

### 1.1 Key Features

- **Config-first with dynamic rooms**: Define common rooms upfront, create others at runtime
- **Event-centric**: Events are first-class citizens with optional Zod schema validation
- **Type-safe**: Full TypeScript support with inferred types from schemas
- **Bounded rooms**: Optional `maxSize` for predictable scaling
- **Unified mental model**: Backend and frontend share similar APIs

## 2. Installation

Install Dialogue and zod:

:::tabs

@tab Bun

```bash
bun add dialogue-ts zod
```

@tab npm

```bash
npm install dialogue-ts zod
```

@tab pnpm

```bash
pnpm add dialogue-ts zod
```

:::

Dialogue supports both **Bun** and **Node.js** runtimes. The runtime is auto-detected by default, or you can set it explicitly via the `runtime` config option.

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

### Dynamic Room Creation

While config-first is recommended, you can also create rooms dynamically at runtime:

```typescript
// Create room on-demand
dialogue.createRoom({
  id: `game-${gameId}`,
  name: 'Game Session',
  events: [
    { name: 'move', schema: z.object({ x: z.number(), y: z.number() }) },
    { name: 'chat', schema: z.object({ message: z.string() }) }
  ]
});
```

**Recommendation:** Use predefined rooms for ~80% of your use cases (known room types), and dynamic creation for ~20% (user-generated content, temporary sessions).

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

Or with Node.js (using tsx or ts-node):

```bash
npx tsx server.ts
```

Dialogue auto-detects the runtime. To set it explicitly, pass `runtime: "bun"` or `runtime: "node"` in your `createDialogue()` config. See the [Configuration Guide](/guide/api/configuration/dialogue-config) for details.

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

Here's the recommended structure for a Dialogue application:

```
my-app/
├── server/
│   ├── index.ts          # Dialogue server setup
│   └── rooms.ts          # Room configurations
├── client/
│   ├── App.tsx           # React app (or your framework)
│   └── useDialogue.ts    # Client hooks
└── package.json
```

This is a minimal, focused view showing only application code. The Dialogue library itself is installed as dependencies and doesn't appear in your project structure.

## 5. Next Steps

- Read the [Configuration Guide](/guide/api/configuration) for detailed configuration options
- Explore the [Backend API](/guide/api/backend-api) for server-side features
- Learn about the [Client API](/guide/api/client-api) for frontend integration
- See [Examples](/guide/examples/chat-application) for complete use-case implementations

*This documentation reflects the current implementation and is subject to evolution. Contributions and feedback are welcome.*
