# Dialogue Ts

An event-based realtime communication library based on Socket.IO, Hono, and Bun.

Dialogue is basically asking how do we scale to different real time use cases using same mental model and api.

## 📚 Documentation

**[📖 View Full Documentation →](https://hussseinkizz.github.io/dialogue/)**

Complete guides, API references, and examples available at: **https://hussseinkizz.github.io/dialogue/**

## Prerequisites

- [Bun](https://bun.sh/) - Fast all-in-one JavaScript runtime (required for server)
- [Zod](https://zod.dev/) - TypeScript-first schema validation

## Installation

```bash
bun add dialogue-ts zod
```

## Key Concepts

### Events

Events are the core building blocks. Each event has a name and an optional Zod schema for validation:

```typescript
import { defineEvent } from "dialogue-ts";
import { z } from "zod";

const Message = defineEvent("message", {
  schema: z.object({
    text: z.string().min(1).max(1000),
    senderId: z.string(),
  }),
});

const Typing = defineEvent("typing", {
  schema: z.object({ isTyping: z.boolean() }),
});
```

### Rooms

Rooms are channels where events are broadcast. Clients join rooms to send and receive events:

```typescript
const dialogue = createDialogue({
  port: 3000,
  rooms: {
    chat: {
      name: "Chat Room",
      events: [Message, Typing],
      defaultSubscriptions: ["message"],
      maxSize: 100, // Optional capacity limit
    },
  },
});
```

### Subscriptions

Clients can subscribe to specific event types within a room. Only subscribed events are received, reducing unnecessary traffic.

## Quick Start: Chat Example

### Server (Bun)

```typescript
// server.ts
import { createDialogue, defineEvent } from "dialogue-ts";
import { z } from "zod";

// Define events
const Message = defineEvent("message", {
  schema: z.object({
    text: z.string().min(1),
    username: z.string(),
  }),
});

const UserJoined = defineEvent("user-joined", {
  schema: z.object({ username: z.string() }),
});

// Create dialogue instance
const dialogue = createDialogue({
  port: 3000,
  rooms: {
    general: {
      name: "General Chat",
      events: [Message, UserJoined],
      defaultSubscriptions: ["message", "user-joined"],
    },
  },
  hooks: {
    clients: {
      onConnected: (client) => {
        console.log(`Client connected: ${client.userId}`);
        client.join("general");

        // Notify others
        dialogue.trigger("general", UserJoined, {
          username: client.userId,
        });
      },
      onDisconnected: (client) => {
        console.log(`Client disconnected: ${client.userId}`);
      },
    },
  },
});

// Start server
await dialogue.start();
console.log("Chat server running on http://localhost:3000");
```

Run with:

```bash
bun run server.ts
```

### Client (Browser/Node)

```typescript
// client.ts
import { createDialogueClient } from "dialogue-ts/client";

const client = createDialogueClient({
  url: "ws://localhost:3000",
  auth: { userId: "alice" },
});

// Connect and join room
await client.connect();
const chat = await client.join("general");

// Listen for messages
chat.on("message", (msg) => {
  console.log(`${msg.data.username}: ${msg.data.text}`);
});

// Listen for users joining
chat.on("user-joined", (msg) => {
  console.log(`${msg.data.username} joined the chat`);
});

// Send a message
chat.trigger("message", {
  text: "Hello everyone!",
  username: "alice",
});
```

## Server API

### createDialogue(config)

Creates a Dialogue server instance.

```typescript
const dialogue = createDialogue({
  port: 3000,
  rooms: { /* room configs */ },
  hooks: {
    clients: {
      onConnected: (client) => { /* handle connection */ },
      onDisconnected: (client) => { /* handle disconnection */ },
    },
  },
  logger: createDefaultLogger(), // Optional custom logger
});
```

### dialogue.start()

Starts the server. Returns a promise.

### dialogue.trigger(roomId, event, data, from?)

Triggers an event from the server to all subscribers in a room.

```typescript
dialogue.trigger("general", Message, { text: "Hello!", username: "system" });
```

### dialogue.getRoom(roomId)

Gets a room instance for direct manipulation.

### dialogue.createRoom(id, config, createdById?)

Creates a new room at runtime.

```typescript
const room = dialogue.createRoom("project-123", {
  name: "Project Discussion",
  events: [Message, UserJoined],
  defaultSubscriptions: ["message"],
  maxSize: 50,
}, "user-456");
```

### dialogue.deleteRoom(id)

Deletes a room. Returns `true` if successful.

```typescript
dialogue.deleteRoom("project-123");
```

### User Management

```typescript
// Get all connections for a user
const clients = dialogue.getClients("user-123");

// Get rooms a user is in
const rooms = dialogue.getClientRooms("user-123");

// Check if user is in a room
if (dialogue.isInRoom("user-123", "vip-room")) { ... }

// Remove user from all rooms (with notifications)
dialogue.getClientRooms("user-123").leaveAll((roomId) => {
  dialogue.trigger(roomId, UserLeft, { username: "user-123" });
});
```

## Client API

### DialogueClient

```typescript
import { createDialogueClient } from "dialogue-ts/client";

const client = createDialogueClient({
  url: "ws://localhost:3000",
  auth: { userId: "user-123", token: "jwt-token" },
});
```

### client.connect() / client.disconnect()

Connect to or disconnect from the server.

### client.join(roomId)

Joins a room and returns a `RoomContext`.

### client.createRoom(options)

Creates a new room on the server.

```typescript
const roomInfo = await client.createRoom({
  id: "tech-talk",
  name: "Tech Talk",
  description: "Discuss technology",
  maxSize: 100,
});
```

### client.deleteRoom(roomId)

Deletes a room (only creator can delete).

### client.onRoomCreated(handler) / client.onRoomDeleted(handler)

Listen for room lifecycle events.

```typescript
client.onRoomCreated((room) => console.log("New room:", room.name));
client.onRoomDeleted((roomId) => console.log("Deleted:", roomId));
```

### RoomContext

```typescript
const room = await client.join("chat");

// Listen for events
const unsubscribe = room.on("message", (msg) => {
  console.log(msg.data);
});

// Send events
room.trigger("message", { text: "Hello!" });

// Subscribe/unsubscribe from event types
room.subscribe("typing");
room.unsubscribe("typing");

// Leave room
room.leave();
```

## Hooks

Hooks provide lifecycle callbacks for clients, rooms, and events.

### Client Hooks

```typescript
const dialogue = createDialogue({
  rooms: { /* ... */ },
  hooks: {
    clients: {
      onConnected: (client) => {
        console.log(`${client.userId} connected`);
        client.join("general");
      },
      onDisconnected: (client) => {
        console.log(`${client.userId} disconnected`);
      },
      onJoined: (client, roomId) => {
        dialogue.trigger(roomId, UserJoined, { username: client.userId });
      },
      onLeft: (client, roomId) => {
        dialogue.trigger(roomId, UserLeft, { username: client.userId });
      },
    },
  },
});
```

### Room Hooks

```typescript
hooks: {
  rooms: {
    onCreated: (room) => {
      console.log(`Room ${room.name} created`);
    },
    onDeleted: (roomId) => {
      console.log(`Room ${roomId} deleted`);
    },
  },
}
```

### Event Hooks (for persistence)

```typescript
hooks: {
  events: {
    onTriggered: (roomId, event) => {
      // Called for every event
      analytics.track(event.event, event.data);
    },
    onCleanup: async (roomId, eventName, events) => {
      // Called when events are evicted from memory
      await db.events.insertMany(events);
    },
    onLoad: async (roomId, eventName, start, end) => {
      // Load historical events from database for pagination
      return db.events.find({ roomId, eventName }).skip(start).limit(end - start);
    },
  },
}
```

## Event History

Store and retrieve historical events per room. Useful for chat history, activity feeds, etc.

### Enabling History

Enable history per event type:

```typescript
const Message = defineEvent("message", {
  schema: z.object({ text: z.string(), username: z.string() }),
  history: { enabled: true, limit: 100 }, // Keep last 100 messages
});
```

### Auto-sync on Join

Automatically send history when clients join a room:

```typescript
const dialogue = createDialogue({
  rooms: {
    chat: {
      name: "Chat",
      events: [Message],
      syncHistoryOnJoin: true, // Send all history
      // syncHistoryOnJoin: 50, // Or limit to 50 events
    },
  },
});
```

### Client-side History

```typescript
// Automatic history on join
client.onHistory((roomId, events) => {
  events.forEach((event) => renderMessage(event));
});

// Manual pagination
const room = await client.join("chat");
const olderMessages = await room.getHistory("message", 50, 100); // Skip 50, get 50
```

### Server-side History Access

```typescript
const room = dialogue.room("chat");
const recentMessages = await room.history("message", 0, 20); // Last 20 messages
```

## Documentation

For complete documentation, visit **[hussseinkizz.github.io/dialogue](https://hussseinkizz.github.io/dialogue/)**

Quick links:
- [Getting Started](https://hussseinkizz.github.io/dialogue/guide/start/getting-started) - Installation and basic setup
- [Configuration Guide](https://hussseinkizz.github.io/dialogue/guide/api/configuration/) - Detailed configuration options
- [Backend API](https://hussseinkizz.github.io/dialogue/guide/api/backend-api) - Server-side API reference
- [Client API](https://hussseinkizz.github.io/dialogue/guide/api/client-api) - Client SDK reference
- [Examples](https://hussseinkizz.github.io/dialogue/guide/examples/chat-application) - Complete use-case implementations
- [Architecture](https://hussseinkizz.github.io/dialogue/guide/others/architecture) - Internal design and patterns

## Example App

A working chat application is included in the [`example/`](./example) folder. See the [example README](./example/README.md) for setup instructions.

## Built With

- [Socket.IO](https://socket.io/) - Real-time bidirectional event-based communication
- [Slang Ts](https://github.com/Hussseinkizz/slang-ts) - Pattern Matching And Functional Utilities
- [Hono](https://hono.dev/) - Ultrafast web framework for the Edge
- [Bun](https://bun.sh/) - Fast all-in-one JavaScript runtime
- [Zod](https://zod.dev/) - TypeScript-first schema validation

## License

MIT
