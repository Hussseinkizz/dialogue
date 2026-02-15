---
title: Dialogue Configuration
description: Main server configuration, CORS, and options
---

# Dialogue Configuration

The main configuration object passed to `createDialogue`.

## Full Configuration Example

```typescript
import { Hono } from "hono";
import { createDialogue, defineEvent } from "./dialogue";
import { z } from "zod";

const Message = defineEvent("message", {
  schema: z.object({ text: z.string(), senderId: z.string() }),
  history: { enabled: true, limit: 100 }, // Enable history storage
});

const app = new Hono();

// Add HTTP routes
app.get("/health", (c) => c.json({ status: "ok" }));

const dialogue = createDialogue({
  port: 3000,
  app, // Use existing Hono app
  rooms: {
    chat: {
      name: "Chat",
      events: [Message],
      defaultSubscriptions: ["message"],
      syncHistoryOnJoin: true, // Auto-send history on join
    },
  },
  hooks: {
    clients: {
      onConnected: async (client) => {
        // Called when a client connects
        console.log(`Client ${client.userId} connected`);

        // Auto-join rooms based on user permissions
        const userRooms = await getUserRooms(client.userId);
        for (const roomId of userRooms) {
          client.join(roomId);
        }

        // Send initial data
        client.send("sync", { timestamp: Date.now() });
      },
      onDisconnected: (client) => {
        console.log(`Client ${client.userId} disconnected`);
      },
    },
  },
});
```

## Configuration Options

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| **`port`** | `number` | No | Port to run server on. Defaults to 3000 |
| **`app`** | `Hono` | No | Existing Hono app to attach to. Creates new one if not provided |
| **`rooms`** | `Record<string, RoomConfig>` | Yes | Room configurations keyed by room ID |
| **`hooks`** | `HooksConfig` | No | Lifecycle hooks for clients, rooms, and events |
| **`logger`** | `Logger` | No | Custom logger implementation. Uses console logger if not provided |
| **`cors`** | `CorsConfig \| boolean` | No | CORS configuration. Defaults to allowing all origins |

## CORS Configuration

By default, Dialogue enables CORS for all origins, making it easy to develop with frontend and backend on different ports. CORS is applied to both HTTP requests (Socket.IO polling) and WebSocket connections.

```typescript
// Default behavior - allows all origins
const dialogue = createDialogue({
  rooms: { /* ... */ },
});

// Restrict to specific origins
const dialogue = createDialogue({
  rooms: { /* ... */ },
  cors: {
    origin: "https://myapp.com",
    credentials: true,
  },
});

// Allow multiple origins
const dialogue = createDialogue({
  rooms: { /* ... */ },
  cors: {
    origin: ["https://myapp.com", "https://admin.myapp.com"],
  },
});

// Disable CORS (same-origin only)
const dialogue = createDialogue({
  rooms: { /* ... */ },
  cors: false,
});
```

**CorsConfig Options:**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| **`origin`** | `string \| string[] \| boolean` | `true` | Allowed origins. Use `true` for all origins |
| **`methods`** | `string[]` | `["GET", "POST"]` | Allowed HTTP methods |
| **`credentials`** | `boolean` | `true` | Whether to allow credentials (cookies, auth headers) |

## DialogueContext

All authentication and event hooks receive a `DialogueContext` object providing global runtime awareness:

```typescript
interface DialogueContext {
  io: Server;                              // Socket.IO server instance
  clients: Record<string, ConnectedClient>; // All connected clients by ID
  rooms: Record<string, Room>;             // All active rooms by ID
}
```

**Example usage in hooks:**

```typescript
beforeEach: ({ context, roomId, message }) => {
  // Access all clients
  const totalClients = Object.keys(context.clients).length;
  
  // Access specific room
  const room = context.rooms[roomId];
  
  // Access Socket.IO server
  context.io.emit("global-event", { data: "..." });
  
  return Ok(message);
}
```

## See Also

- [Lifecycle Hooks](./hooks) - Configure hooks option
- [Room Configuration](./rooms) - Configure rooms option
- [Authentication](./authentication) - Auth setup and JWT
