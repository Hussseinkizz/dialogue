# Configuration Guide

**Version:** 1.0  
**Date:** February 12, 2026  
**Author:** Hussein Kizz

This guide covers all configuration options for Dialogue, including event definitions, room configurations, and server settings.

## 1. Overview

Dialogue uses a config-first approach where all rooms and events are defined upfront. This enables type safety, validation, and predictable behavior across your application.

## 2. Event Definitions

Events are defined using the `defineEvent` function. Each event has a unique name and optional schema validation.

### 2.1 Basic Event Definition

```typescript
import { defineEvent } from "./dialogue";

// Simple event without validation
const Typing = defineEvent("typing");

// Event with description
const Ping = defineEvent("ping", {
  description: "Health check event",
});
```

### 2.2 Events with Schema Validation

Use Zod schemas to validate event payloads at runtime:

```typescript
import { defineEvent } from "./dialogue";
import { z } from "zod";

const Message = defineEvent("message", {
  schema: z.object({
    text: z.string().min(1).max(1000),
    senderId: z.string(),
    replyTo: z.string().optional(),
  }),
  description: "Chat message sent by a user",
});
```

### 2.3 Event Definition Options

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| **`schema`** | `z.ZodType<T>` | No | Zod schema for validating event data |
| **`description`** | `string` | No | Human-readable description of the event |
| **`history`** | `{ enabled: boolean; limit: number }` | No | Enable history storage for this event type |

### 2.4 Type Inference

Event types are automatically inferred from the schema:

```typescript
const OrderUpdated = defineEvent("order:updated", {
  schema: z.object({
    orderId: z.string().uuid(),
    status: z.enum(["pending", "processing", "shipped", "delivered"]),
    updatedAt: z.coerce.date(),
  }),
});

// TypeScript infers the data type from the schema
type OrderData = z.infer<typeof OrderUpdated.schema>;
// { orderId: string; status: "pending" | "processing" | "shipped" | "delivered"; updatedAt: Date }
```

## 3. Room Configuration

Rooms are defined in the `DialogueConfig.rooms` object, keyed by room ID.

### 3.1 Basic Room Configuration

```typescript
import { createDialogue, defineEvent } from "./dialogue";

const Message = defineEvent("message");
const Typing = defineEvent("typing");

const dialogue = createDialogue({
  rooms: {
    chat: {
      name: "Chat Room",
      events: [Message, Typing],
    },
  },
});
```

### 3.2 Room Configuration Options

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| **`name`** | `string` | Yes | Human-readable room name |
| **`description`** | `string` | No | Room description |
| **`maxSize`** | `number` | No | Maximum concurrent connections. Undefined means unlimited |
| **`events`** | `EventDefinition[]` | Yes | Events allowed in this room. Empty array allows any event |
| **`defaultSubscriptions`** | `string[]` | No | Event names to auto-subscribe clients to on join |
| **`createdById`** | `string` | No | User ID of room creator for ownership tracking |
| **`syncHistoryOnJoin`** | `boolean \| number` | No | Auto-send history on join. `true` = all, number = limit per event type |

### 3.3 Bounded Rooms

Limit concurrent connections for predictable scaling:

```typescript
const dialogue = createDialogue({
  rooms: {
    game: {
      name: "Game Lobby",
      events: [GameState, PlayerMove],
      maxSize: 4, // Max 4 players per game
    },
  },
});
```

When a room is full, new clients receive a `dialogue:error` event with code `ROOM_FULL`.

### 3.4 Default Subscriptions

Auto-subscribe clients to specific events when they join:

```typescript
const dialogue = createDialogue({
  rooms: {
    notifications: {
      name: "Notifications",
      events: [Alert, Message, SystemUpdate],
      defaultSubscriptions: ["alert", "message"], // Skip system-update by default
    },
  },
});
```

### 3.5 Open Rooms

Allow any event by passing an empty events array:

```typescript
const dialogue = createDialogue({
  rooms: {
    sandbox: {
      name: "Sandbox",
      events: [], // Any event allowed
    },
  },
});
```

## 4. Dialogue Configuration

The main configuration object passed to `createDialogue`.

### 4.1 Full Configuration Example

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

### 4.2 Configuration Options

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| **`port`** | `number` | No | Port to run server on. Defaults to 3000 |
| **`app`** | `Hono` | No | Existing Hono app to attach to. Creates new one if not provided |
| **`rooms`** | `Record<string, RoomConfig>` | Yes | Room configurations keyed by room ID |
| **`hooks`** | `HooksConfig` | No | Lifecycle hooks for clients, rooms, and events |
| **`logger`** | `Logger` | No | Custom logger implementation. Uses console logger if not provided |
| **`cors`** | `CorsConfig \| boolean` | No | CORS configuration. Defaults to allowing all origins |

### 4.3 CORS Configuration

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

### 4.4 Lifecycle Hooks

Handle client and room lifecycle events using the `hooks` configuration:

```typescript
const dialogue = createDialogue({
  rooms: {
    chat: {
      name: "Chat",
      events: [Message, UserLeft],
    },
  },
  hooks: {
    clients: {
      onConnected: (client) => {
        client.join("chat");
        dialogue.trigger("chat", UserJoined, { username: client.userId });
      },
      onDisconnected: (client) => {
        // Notify others when a user leaves
        dialogue.trigger("chat", UserLeft, { username: client.userId });
        console.log(`${client.userId} disconnected`);
      },
      onJoined: (client, roomId) => {
        console.log(`${client.userId} joined ${roomId}`);
      },
      onLeft: (client, roomId) => {
        console.log(`${client.userId} left ${roomId}`);
      },
    },
    rooms: {
      onCreated: (room) => {
        console.log(`Room ${room.name} created`);
      },
      onDeleted: (roomId) => {
        console.log(`Room ${roomId} deleted`);
      },
    },
  },
});
```

**HooksConfig Options:**

| Hook | Type | Description |
|------|------|-------------|
| **`socket.authenticate`** | `(params: { context: DialogueContext, clientSocket: Socket, authData: unknown }) => Result<AuthData, string>` | Validates authentication and returns JWT claims |
| **`socket.onConnect`** | `(params: { context: DialogueContext, clientSocket: Socket }) => void \| Promise<void>` | Called when a socket connects (before ConnectedClient creation) |
| **`socket.onDisconnect`** | `(params: { context: DialogueContext, clientSocket: Socket }) => void \| Promise<void>` | Called when a socket disconnects |
| **`clients.beforeJoin`** | `(params: { context: DialogueContext, client: ConnectedClient, roomId: string, room: Room }) => Result<void, string>` | Called before client joins a room (can block) |
| **`clients.onConnected`** | `(client: ConnectedClient) => void \| Promise<void>` | Called when a client connects |
| **`clients.onDisconnected`** | `(client: ConnectedClient) => void \| Promise<void>` | Called when a client disconnects |
| **`clients.onJoined`** | `(client: ConnectedClient, roomId: string) => void \| Promise<void>` | Called when a client joins a room |
| **`clients.onLeft`** | `(client: ConnectedClient, roomId: string) => void \| Promise<void>` | Called when a client leaves a room |
| **`rooms.onCreated`** | `(room: Room) => void \| Promise<void>` | Called when a room is created |
| **`rooms.onDeleted`** | `(roomId: string) => void \| Promise<void>` | Called when a room is deleted |
| **`events.beforeEach`** | `(params: { context: DialogueContext, roomId: string, message: EventMessage, from: string }) => Result<EventMessage, string>` | Called before event broadcast (can block or transform) |
| **`events.afterEach`** | `(params: { context: DialogueContext, roomId: string, message: EventMessage, recipientCount: number }) => void` | Called after event broadcast (for side effects) |
| **`events.onTriggered`** | `(roomId: string, event: EventMessage) => void \| Promise<void>` | Called when any event is triggered |
| **`events.onCleanup`** | `(roomId: string, eventName: string, events: EventMessage[]) => void \| Promise<void>` | Called when events are evicted from memory |
| **`events.onLoad`** | `(roomId: string, eventName: string, start: number, end: number) => Promise<EventMessage[]>` | Called to load historical events from external storage |

### 4.5 Authentication Hook

The `authenticate` hook allows you to validate client authentication data and return JWT claims:

```typescript
import { Ok, Err } from "slang-ts";
import jwt from "jsonwebtoken";

const dialogue = createDialogue({
  rooms: { /* ... */ },
  hooks: {
    authenticate: ({ context, clientSocket, authData }) => {
      // Validate token from auth data
      const token = authData?.token as string;
      
      if (!token) {
        return Err("Authentication token required");
      }

      try {
        // Verify and decode JWT
        const claims = jwt.verify(token, process.env.JWT_SECRET) as {
          sub: string;      // User ID (required)
          exp: number;      // Expiration timestamp
          iat: number;      // Issued at timestamp
          role?: string;
          email?: string;
        };

        // Return auth data with JWT claims
        return Ok({
          jwt: claims,
          // Add any additional auth fields here
        });
      } catch (error) {
        return Err(`Invalid token: ${error.message}`);
      }
    },
  },
});
```

**Hook Signature:**

```typescript
authenticate: (params: {
  context: DialogueContext;
  clientSocket: Socket;
  authData: unknown;
}) => Result<AuthData, string>
```

**Parameters:**

- **`context`**: Global context with `io`, `clients`, and `rooms`
- **`clientSocket`**: The raw Socket.IO socket
- **`authData`**: Data sent from client during connection

**Returns:** `Ok(AuthData)` on success or `Err(string)` with error message

**AuthData Structure:**

```typescript
interface AuthData {
  jwt: {
    sub: string;      // User ID (extracted to client.userId)
    exp: number;      // Expiration timestamp
    iat: number;      // Issued at timestamp
    [key: string]: unknown;  // Additional JWT claims
  };
  // Additional auth fields can be added here
}
```

The authenticated user's data is available via `client.auth` and the user ID is extracted from `jwt.sub`.

### 4.6 Socket Lifecycle Hooks

The `socket.onConnect` and `socket.onDisconnect` hooks provide low-level access to Socket.IO socket lifecycle events. These hooks receive the raw socket before the `ConnectedClient` wrapper is created, making them useful for socket-level operations.

```typescript
const dialogue = createDialogue({
  rooms: { /* ... */ },
  hooks: {
    socket: {
      onConnect: ({ context, clientSocket }) => {
        // Called when socket connects (before ConnectedClient is created)
        console.log(`Socket ${clientSocket.id} connected`);
        
        // Access socket-level data
        console.log('Handshake:', clientSocket.handshake);
        console.log('IP:', clientSocket.handshake.address);
        
        // You can also emit directly to the socket
        clientSocket.emit('server-info', { version: '1.0.0' });
      },
      
      onDisconnect: ({ context, clientSocket }) => {
        // Called when socket disconnects
        console.log(`Socket ${clientSocket.id} disconnected`);
        console.log('Disconnect reason:', clientSocket.disconnected);
      },
    },
  },
});
```

**onConnect Hook Signature:**

```typescript
onConnect: (params: {
  context: DialogueContext;
  clientSocket: Socket;
}) => void | Promise<void>
```

**onDisconnect Hook Signature:**

```typescript
onDisconnect: (params: {
  context: DialogueContext;
  clientSocket: Socket;
}) => void | Promise<void>
```

**Parameters:**

- **`context`**: Global context with `io`, `clients`, and `rooms`
- **`clientSocket`**: The raw Socket.IO socket instance

**When to use socket hooks vs client hooks:**

- Use **`socket.onConnect`/`onDisconnect`** when you need:
  - Access to raw socket data (handshake, IP address, socket rooms)
  - Socket-level operations before ConnectedClient creation
  - Logging or monitoring at the socket layer

- Use **`clients.onConnected`/`onDisconnected`** when you need:
  - Access to the high-level ConnectedClient API
  - User-level operations (joining rooms, sending messages)
  - Business logic based on user ID or auth data

### 4.7 Room Join Hook

The `beforeJoin` hook allows you to control room access and validate join requests:

```typescript
const dialogue = createDialogue({
  rooms: { /* ... */ },
  hooks: {
    clients: {
      beforeJoin: ({ context, client, roomId, room }) => {
        // Check permissions
        if (roomId === "vip-room" && client.auth?.jwt.role !== "vip") {
          return Err("VIP access required");
        }

        // Check room capacity
        if (room.isFull()) {
          return Err("Room is full");
        }

        // Allow join
        return Ok(undefined);
      },
    },
  },
});
```

**Hook Signature:**

```typescript
beforeJoin: (params: {
  context: DialogueContext;
  client: ConnectedClient;
  roomId: string;
  room: Room;
}) => Result<void, string>
```

### 4.8 Event Middleware Hooks

The `beforeEach` and `afterEach` hooks allow you to intercept and transform events:

```typescript
const dialogue = createDialogue({
  rooms: { /* ... */ },
  hooks: {
    events: {
      // Run before event is broadcast - can block or transform
      beforeEach: ({ context, roomId, message, from }) => {
        // Filter profanity
        if (containsProfanity(message.data.text)) {
          return Err("Message contains inappropriate content");
        }

        // Transform message
        const transformed = {
          ...message,
          data: {
            ...message.data,
            text: sanitize(message.data.text),
          },
        };

        return Ok(transformed);
      },

      // Run after event is broadcast - for side effects
      afterEach: ({ context, roomId, message, recipientCount }) => {
        console.log(`Event ${message.event} sent to ${recipientCount} clients`);
        
        // Log to analytics
        analytics.track("event_broadcast", {
          roomId,
          eventName: message.event,
          recipientCount,
        });
      },
    },
  },
});
```

**beforeEach Hook Signature:**

```typescript
beforeEach: (params: {
  context: DialogueContext;
  roomId: string;
  message: EventMessage;
  from: string;
}) => Result<EventMessage, string>
```

**afterEach Hook Signature:**

```typescript
afterEach: (params: {
  context: DialogueContext;
  roomId: string;
  message: EventMessage;
  recipientCount: number;
}) => void
```

### 4.9 DialogueContext

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

## 5. Authentication

### 5.1 Client Authentication

Clients pass authentication data in the `auth` option when connecting:

```typescript
// Frontend
const client = createDialogueClient({
  url: "ws://localhost:3000",
  auth: {
    userId: "user-123",
    token: "jwt-token-here",
    role: "admin",
  },
});
```

### 5.2 Accessing Auth Data

The `onConnected` hook receives auth data via the `client` object:

```typescript
const dialogue = createDialogue({
  rooms: { /* ... */ },
  hooks: {
    clients: {
      onConnected: (client) => {
        console.log(client.userId);  // "user-123" or socket.id if not provided
        console.log(client.meta);    // { token: "jwt-token-here", role: "admin" }

        // Validate token and permissions
        if (!isValidToken(client.meta.token)) {
          client.disconnect();
          return;
        }

        // Join rooms based on role
        if (client.meta.role === "admin") {
          client.join("admin-dashboard");
        }
      },
    },
  },
});
```

## 6. TypeScript Types

### 6.1 Core Types

```typescript
import type {
  Dialogue,
  DialogueConfig,
  DialogueContext,
  AuthData,
  JwtClaims,
  RoomConfig,
  EventDefinition,
  EventHistoryConfig,
  EventMessage,
  ConnectedClient,
  Room,
  HooksConfig,
} from "./dialogue";
```

### 6.2 EventDefinition

```typescript
interface EventDefinition<T = unknown> {
  readonly name: string;
  readonly description?: string;
  readonly schema?: z.ZodType<T>;
  readonly history?: EventHistoryConfig;
}
```

### 6.3 EventHistoryConfig

```typescript
interface EventHistoryConfig {
  /** Whether to store this event type in history */
  enabled: boolean;
  /** Maximum number of events to keep in memory per room */
  limit: number;
}
```

### 6.4 EventMessage

```typescript
interface EventMessage<T = unknown> {
  event: string;
  roomId: string;
  data: T;
  from: string;
  timestamp: number;
}
```

### 6.5 DialogueContext

```typescript
interface DialogueContext {
  io: Server;                              // Socket.IO server instance
  clients: Record<string, ConnectedClient>; // All connected clients
  rooms: Record<string, Room>;             // All active rooms
}
```

### 6.6 AuthData

```typescript
interface AuthData {
  jwt: JwtClaims;
  // Additional authentication fields can be added
}
```

### 6.7 JwtClaims

```typescript
interface JwtClaims {
  sub: string;      // Subject (user ID)
  exp: number;      // Expiration timestamp
  iat: number;      // Issued at timestamp
  [key: string]: unknown;  // Additional custom claims
}
```

**Author:** [Hussein Kizz](https://github.com/Hussseinkizz)

*This documentation reflects the current implementation and is subject to evolution. Contributions and feedback are welcome.*
