---
title: Backend API Reference
description: Complete backend API for Dialogue, including the Dialogue instance, rooms, and connected clients
---

# Backend API Reference

This document covers the complete backend API for Dialogue, including the Dialogue instance, rooms, and connected clients.

## 1. Overview

The backend API provides methods for triggering events, subscribing to events, managing rooms, and controlling the server lifecycle.

## 2. Dialogue Instance

The main Dialogue instance is created using `createDialogue()` and provides the core API.

### 2.1 Creating a Dialogue Instance

```typescript
import { createDialogue, defineEvent } from "./dialogue";
import { z } from "zod";

const Message = defineEvent("message", {
  schema: z.object({ text: z.string() }),
});

const dialogue = createDialogue({
  port: 3000,
  rooms: {
    chat: {
      name: "Chat",
      events: [Message],
    },
  },
});
```

### 2.2 Dialogue Properties

| Property | Type | Description |
|----------|------|-------------|
| **`app`** | `Hono` | The Hono app instance |
| **`io`** | `Server` | The Socket.IO server instance |

### 2.3 dialogue.trigger()

Triggers an event to all subscribers in a room. Call this from anywhere in your backend.

**Signature:**

```typescript
dialogue.trigger<T>(
  roomId: string,
  event: EventDefinition<T>,
  data: T,
  from?: string
): void
```

**Parameters:**

- **`roomId`**: The room to broadcast to
- **`event`**: The event definition
- **`data`**: The event payload (validated against schema if present)
- **`from`**: Optional sender identifier (defaults to "system")

**Example:**

```typescript
import { dialogue, Message } from "./dialogue.config";

// From an API route
app.post("/messages", async (c) => {
  const { text, userId } = await c.req.json();

  // Trigger to all clients in the chat room
  dialogue.trigger("chat", Message, { text, senderId: userId }, userId);

  return c.json({ status: true });
});

// From a webhook handler
app.post("/webhooks/payment", async (c) => {
  const event = await c.req.json();

  dialogue.trigger("orders", OrderUpdated, {
    orderId: event.orderId,
    status: "paid",
  });

  return c.json({ received: true });
});
```

## EventMessage Structure

All events are wrapped in a standardized `EventMessage` envelope. This structure is enforced by Dialogue and **not customizable** by developers (except for the `data` payload).

```typescript
interface EventMessage<T = unknown> {
  event: string;      // Event name
  roomId: string;     // Room ID where event occurred
  data: T;            // Your custom payload (validated by schema)
  from: string;       // User ID of sender (or "system")
  timestamp: number;  // Unix timestamp (milliseconds)
  meta?: Record<string, unknown>;  // Optional flexible metadata
}
```

### The `meta` Field

The `meta` field provides a flexible way to add contextual information without changing your event schemas:

```typescript
// Example: Add request context
dialogue.trigger('chat', chatMessage, {
  event: 'message',
  data: { text: 'Hello world' },
  from: 'user-123',
  timestamp: Date.now(),
  meta: {
    ip: '192.168.1.1',
    userAgent: 'Mozilla/5.0...',
    correlationId: 'abc-123'
  }
});

// Example: Add permission context
room.trigger(updateEvent, data, userId, {
  permissions: ['admin', 'write'],
  sessionId: 'xyz-789'
});
```

**Use cases:**
- Request metadata (IP, user agent, trace IDs)
- Permission/authorization context
- A/B test variants
- Feature flags
- Debug information

**Important:** `meta` is optional and has no schema validation - use responsibly.

### 2.4 dialogue.on()

Subscribes to events for backend side-effects like logging, persistence, or triggering other actions.

**Signature:**

```typescript
dialogue.on<T>(
  roomId: string,
  event: EventDefinition<T>,
  handler: (msg: EventMessage<T>) => void | Promise<void>
): () => void
```

**Parameters:**

- **`roomId`**: The room to listen to
- **`event`**: The event definition
- **`handler`**: Callback function receiving the event message

**Returns:** Unsubscribe function

**Example:**

```typescript
import { dialogue, Message } from "./dialogue.config";

// Log all messages
const unsubscribe = dialogue.on("chat", Message, (msg) => {
  console.log(`[${msg.roomId}] ${msg.from}: ${msg.data.text}`);
});

// Persist messages to database
dialogue.on("chat", Message, async (msg) => {
  await db.messages.create({
    roomId: msg.roomId,
    text: msg.data.text,
    senderId: msg.from,
    createdAt: new Date(msg.timestamp),
  });
});

// Send push notifications
dialogue.on("notifications", Alert, async (msg) => {
  const users = await getOfflineUsers(msg.roomId);
  await sendPushNotifications(users, msg.data);
});

// Unsubscribe when needed
unsubscribe();
```

### 2.5 dialogue.room()

Gets a room instance by ID.

**Signature:**

```typescript
dialogue.room(id: string): Room | null
```

**Example:**

```typescript
const chatRoom = dialogue.room("chat");

if (chatRoom) {
  console.log(`${chatRoom.name} has ${chatRoom.size()} participants`);
}
```

### 2.6 dialogue.rooms()

Gets all registered rooms.

**Signature:**

```typescript
dialogue.rooms(): Room[]
```

**Example:**

```typescript
const allRooms = dialogue.rooms();

for (const room of allRooms) {
  console.log(`${room.name}: ${room.size()} participants`);
}
```

### 2.7 dialogue.createRoom()

Creates a new room at runtime. Useful for dynamic room creation based on user actions.

**Signature:**

```typescript
dialogue.createRoom(
  id: string,
  config: {
    name: string;
    description?: string;
    events: EventDefinition[];
    defaultSubscriptions?: string[];
    maxSize?: number;
  },
  createdById?: string
): Room
```

**Parameters:**

- **`id`**: Unique room identifier
- **`config.name`**: Human-readable room name
- **`config.description`**: Optional room description
- **`config.events`**: Array of allowed event definitions
- **`config.defaultSubscriptions`**: Event names to auto-subscribe on join
- **`config.maxSize`**: Optional maximum participants
- **`createdById`**: Optional user ID of the room creator

**Returns:** The created `Room` instance

**Example:**

```typescript
import { dialogue, Message, UserJoined } from "./dialogue.config";

// Create a room dynamically
const room = dialogue.createRoom(
  "project-123",
  {
    name: "Project Discussion",
    description: "Chat for project #123",
    events: [Message, UserJoined],
    defaultSubscriptions: ["message", "user-joined"],
    maxSize: 50,
  },
  "user-456" // Creator ID
);

console.log(`Created room: ${room.name}`);
```

**Best Practices:**

- **Always set `defaultSubscriptions`** for rooms with known events to ensure clients receive messages immediately upon joining
- Use explicit event names for most subscriptions: `defaultSubscriptions: ["message", "userJoined"]`
- Use wildcard `"*"` sparingly (debugging, logging, analytics): `events: [{ name: "*" }]`
- Use empty array `[]` for read-only/server-only rooms where clients can't trigger events
- Server-side `defaultSubscriptions` provides convenience but doesn't replace explicit client-side subscription when needed

**Note:** Creating a room broadcasts a `dialogue:roomCreated` event to all connected clients.

### 2.8 dialogue.deleteRoom()

Deletes a room at runtime. All clients in the room will be notified.

**Signature:**

```typescript
dialogue.deleteRoom(id: string): boolean
```

**Parameters:**

- **`id`**: The room ID to delete

**Returns:** `true` if the room was deleted, `false` if it didn't exist

**Example:**

```typescript
// Delete a room when no longer needed
const deleted = dialogue.deleteRoom("project-123");

if (deleted) {
  console.log("Room deleted successfully");
} else {
  console.log("Room not found");
}
```

**Note:** Deleting a room broadcasts a `dialogue:roomDeleted` event to all connected clients.

### 2.9 dialogue.start()

Starts the server.

**Signature:**

```typescript
dialogue.start(): Promise<void>
```

**Example:**

```typescript
await dialogue.start();
console.log("Server running on http://localhost:3000");
```

### 2.10 dialogue.stop()

Stops the server and disconnects all clients.

**Signature:**

```typescript
dialogue.stop(): Promise<void>
```

**Example:**

```typescript
process.on("SIGTERM", async () => {
  await dialogue.stop();
  process.exit(0);
});
```

### 2.11 dialogue.getClients()

Gets all connected clients for a specific user ID. Returns an array since a user may have multiple connections (e.g., multiple tabs or devices).

**Signature:**

```typescript
dialogue.getClients(userId: string): ConnectedClient[]
```

**Example:**

```typescript
const clients = dialogue.getClients("user-123");
console.log(`User has ${clients.length} active connections`);
```

### 2.12 dialogue.getAllClients()

Gets all currently connected clients.

**Signature:**

```typescript
dialogue.getAllClients(): ConnectedClient[]
```

**Example:**

```typescript
const allClients = dialogue.getAllClients();
console.log(`Total connected clients: ${allClients.length}`);
```

### 2.13 dialogue.getClientRooms()

Gets all room IDs that a user is currently in, with helper methods for managing room membership. Aggregates rooms across all connections for this user.

**Signature:**

```typescript
dialogue.getClientRooms(userId: string): ClientRooms
```

**Returns:** `ClientRooms` object with:

| Property/Method | Type | Description |
|-----------------|------|-------------|
| **`ids`** | `string[]` | Array of room IDs the user is in |
| **`forAll(callback)`** | `(cb: (roomId: string) => void) => void` | Execute callback for each room (no side effects) |
| **`leaveAll(callback?)`** | `(cb?: (roomId: string) => void) => void` | Remove user from all rooms, optionally executing callback for each |

**Example:**

```typescript
const rooms = dialogue.getClientRooms("user-123");

// Access room IDs
console.log(`User is in rooms: ${rooms.ids.join(", ")}`);

// Do something for all rooms (without leaving)
rooms.forAll((roomId) => {
  dialogue.trigger(roomId, UserTyping, { userId: "user-123", isTyping: false });
});

// Leave all rooms with notification
rooms.leaveAll((roomId) => {
  dialogue.trigger(roomId, UserLeft, { username: "user-123" });
});

// Or just leave without notification
rooms.leaveAll();
```

**Common pattern in onDisconnect:**

```typescript
onDisconnect: (client) => {
  dialogue.getClientRooms(client.userId).leaveAll((roomId) => {
    dialogue.trigger(roomId, UserLeft, { username: client.userId });
  });
}
```

### 2.14 dialogue.isInRoom()

Checks if a user is in a specific room (any of their connections).

**Signature:**

```typescript
dialogue.isInRoom(userId: string, roomId: string): boolean
```

**Example:**

```typescript
if (dialogue.isInRoom("user-123", "vip-room")) {
  // User has access to VIP features
}
```

## 3. Room API

Room instances provide methods for broadcasting and managing participants.

### 3.1 Room Properties

| Property | Type | Description |
|----------|------|-------------|
| **`id`** | `string` | Unique room identifier |
| **`name`** | `string` | Human-readable room name |
| **`description`** | `string \| undefined` | Room description |
| **`maxSize`** | `number \| undefined` | Maximum connections |
| **`events`** | `EventDefinition[]` | Allowed events |
| **`defaultSubscriptions`** | `string[]` | Auto-subscribe event names |
| **`createdById`** | `string \| undefined` | Room creator ID |

### 3.2 room.trigger()

Triggers an event to all subscribers in this room.

**Signature:**

```typescript
room.trigger<T>(event: EventDefinition<T>, data: T, from?: string): void
```

**Example:**

```typescript
const room = dialogue.room("chat");

room?.trigger(Message, { text: "Hello!" }, "system");
```

### 3.3 room.on()

Subscribes to events in this room.

**Signature:**

```typescript
room.on<T>(
  event: EventDefinition<T>,
  handler: (msg: EventMessage<T>) => void | Promise<void>
): () => void
```

**Example:**

```typescript
const room = dialogue.room("chat");

room?.on(Message, (msg) => {
  console.log(`Message in ${room.name}: ${msg.data.text}`);
});
```

### 3.4 room.size()

Returns the current number of connected participants.

**Signature:**

```typescript
room.size(): number
```

### 3.5 room.isFull()

Returns true if the room is at maximum capacity.

**Signature:**

```typescript
room.isFull(): boolean
```

### 3.6 room.participants()

Returns all connected clients in the room.

**Signature:**

```typescript
room.participants(): ConnectedClient[]
```

**Example:**

```typescript
const room = dialogue.room("chat");
const participants = room?.participants() ?? [];

for (const client of participants) {
  console.log(`- ${client.userId}`);
}
```

## 4. ConnectedClient API

Represents a connected socket with user context.

### 4.1 Client Properties

| Property | Type | Description |
|----------|------|-------------|
| **`id`** | `string` | Unique client/session ID |
| **`userId`** | `string` | Application user ID from auth (extracted from JWT sub claim) |
| **`socket`** | `Socket` | Underlying Socket.IO socket |
| **`auth`** | `AuthData \| undefined` | Authentication data with JWT claims (if authenticated) |
| **`meta`** | `Record<string, unknown>` | Additional user metadata (deprecated - use auth instead) |

### 4.2 client.join()

Joins a room by ID.

**Signature:**

```typescript
client.join(roomId: string): void
```

**Example:**

```typescript
onConnect: (client) => {
  client.join("general");
  client.join("notifications");
}
```

### 4.3 client.leave()

Leaves a room by ID.

**Signature:**

```typescript
client.leave(roomId: string): void
```

### 4.4 client.subscribe()

Subscribes to a specific event in a room.

**Signature:**

```typescript
client.subscribe(roomId: string, eventName: string): void
```

### 4.5 client.subscribeAll()

Subscribes to all events in a room (wildcard).

**Signature:**

```typescript
client.subscribeAll(roomId: string): void
```

### 4.6 client.unsubscribe()

Unsubscribes from an event in a room.

**Signature:**

```typescript
client.unsubscribe(roomId: string, eventName: string): void
```

### 4.7 client.rooms()

Returns list of room IDs the client has joined.

**Signature:**

```typescript
client.rooms(): string[]
```

### 4.8 client.subscriptions()

Returns subscribed event names for a room.

**Signature:**

```typescript
client.subscriptions(roomId: string): string[]
```

### 4.9 client.send()

Sends data directly to this client only.

**Signature:**

```typescript
client.send<T>(event: string, data: T): void
```

**Example:**

```typescript
onConnect: (client) => {
  // Send welcome message to this client only
  client.send("welcome", {
    message: "Welcome to the server!",
    serverTime: Date.now(),
  });
}
```

### 4.10 client.disconnect()

Disconnects this client.

**Signature:**

```typescript
client.disconnect(): void
```

## 5. Utility Functions

### 5.1 defineEvent()

Creates a typed event definition.

**Signature:**

```typescript
function defineEvent<T = unknown>(
  name: string,
  options?: {
    schema?: z.ZodType<T>;
    description?: string;
    history?: EventHistoryConfig;
  }
): EventDefinition<T>
```

**Parameters:**

- **`name`**: Unique event name (e.g., 'message', 'order:updated')
- **`options.schema`**: Optional Zod schema for validation
- **`options.description`**: Human-readable description
- **`options.history`**: History configuration - when enabled, events are stored in memory

**Example:**

```typescript
import { defineEvent } from "./dialogue";
import { z } from "zod";

// Simple event
const Typing = defineEvent("typing");

// Event with validation
const Message = defineEvent("message", {
  schema: z.object({
    text: z.string().min(1).max(1000),
    senderId: z.string(),
  }),
  description: "Chat message sent by a user",
  history: { enabled: true, limit: 50 },
});
```

### 5.2 validateEventData()

Validates event data against its schema.

**Signature:**

```typescript
function validateEventData<T>(
  event: EventDefinition<T>,
  data: unknown
): Result<T, string>
```

**Parameters:**

- **`event`**: The event definition with optional schema
- **`data`**: Data to validate

**Returns:** `Result<T, string>` - `Ok(data)` on success or `Err(message)` on validation failure

**Example:**

```typescript
import { validateEventData, Message } from "./dialogue.config";

const result = validateEventData(Message, { text: "Hello" });

if (result.isOk) {
  console.log("Valid:", result.value);
} else {
  console.error("Invalid:", result.error);
}
```

### 5.3 isEventAllowed()

Checks if an event is allowed in a room based on the room's event list. If the room has no events defined (empty array), all events are allowed.

**Signature:**

```typescript
function isEventAllowed(
  eventName: string,
  allowedEvents: EventDefinition<unknown>[]
): boolean
```

**Parameters:**

- **`eventName`**: Name of the event to check
- **`allowedEvents`**: List of allowed events for the room

**Returns:** `true` if event is allowed, `false` otherwise

**Example:**

```typescript
import { isEventAllowed, Message, Typing } from "./dialogue.config";

const roomEvents = [Message, Typing];

console.log(isEventAllowed("message", roomEvents)); // true
console.log(isEventAllowed("unknown", roomEvents)); // false

// Empty array allows all events
console.log(isEventAllowed("anything", [])); // true
```

### 5.4 getEventByName()

Gets an event definition by name from a list of events.

**Signature:**

```typescript
function getEventByName(
  eventName: string,
  events: EventDefinition<unknown>[]
): EventDefinition<unknown> | undefined
```

**Parameters:**

- **`eventName`**: Name of the event to find
- **`events`**: List of event definitions to search

**Returns:** The event definition or `undefined` if not found

**Example:**

```typescript
import { getEventByName, Message, Typing } from "./dialogue.config";

const roomEvents = [Message, Typing];

const messageEvent = getEventByName("message", roomEvents);
if (messageEvent) {
  console.log(`Found event: ${messageEvent.name}`);
  console.log(`Has schema: ${messageEvent.schema !== undefined}`);
}

const unknownEvent = getEventByName("unknown", roomEvents);
console.log(unknownEvent); // undefined
```

## 6. Factory Functions

These factory functions create specialized components for Dialogue.

### 6.1 createHistoryManager()

Creates a history manager for storing events in memory.

**Signature:**

```typescript
function createHistoryManager(config?: {
  maxEventsPerType?: number;
  maxRooms?: number;
}): HistoryManager
```

**Parameters:**

- **`config.maxEventsPerType`**: Maximum events to store per event type (default: 100)
- **`config.maxRooms`**: Maximum rooms to track (default: 1000)

**Returns:** `HistoryManager` instance

**Example:**

```typescript
import { createDialogue, createHistoryManager } from "./dialogue";

const historyManager = createHistoryManager({
  maxEventsPerType: 200,
  maxRooms: 500,
});

// History managers are automatically used when passed to createDialogue
// or when events have history.enabled = true
```

### 6.2 createRateLimiter()

Creates a rate limiter for throttling event triggers.

**Signature:**

```typescript
function createRateLimiter(config: {
  maxEvents: number;
  windowMs: number;
}): RateLimiter
```

**Parameters:**

- **`config.maxEvents`**: Maximum events allowed in the time window
- **`config.windowMs`**: Time window in milliseconds

**Returns:** `RateLimiter` instance

**Example:**

```typescript
import { createRateLimiter } from "./dialogue";

const limiter = createRateLimiter({
  maxEvents: 10,  // 10 events
  windowMs: 1000, // per second
});

// Check if action is allowed
if (limiter.isAllowed(userId)) {
  // Trigger event
  dialogue.trigger("chat", Message, data, userId);
} else {
  // Rate limit exceeded
  console.warn(`User ${userId} is rate limited`);
}
```

### 6.3 createDefaultLogger()

Creates a default console-based logger.

**Signature:**

```typescript
function createDefaultLogger(): Logger
```

**Example:**

```typescript
import { createDialogue, createDefaultLogger } from "./dialogue";

const logger = createDefaultLogger();

const dialogue = createDialogue({
  rooms: { /* ... */ },
  logger, // Use default logger
});
```

### 6.4 createSilentLogger()

Creates a silent logger that suppresses all output. Useful for tests.

**Signature:**

```typescript
function createSilentLogger(): Logger
```

**Example:**

```typescript
import { createDialogue, createSilentLogger } from "./dialogue";

const logger = createSilentLogger();

const dialogue = createDialogue({
  rooms: { /* ... */ },
  logger, // Suppress all logging
});
```

### 6.5 detectRuntime()

Detects the current JavaScript runtime by checking for Bun globals. Falls back to `"node"` if Bun is not detected.

**Signature:**

```typescript
function detectRuntime(): Runtime
```

**Returns:** `"bun"` if `globalThis.Bun` exists, otherwise `"node"`

**Example:**

```typescript
import { detectRuntime } from "dialogue-ts";

const runtime = detectRuntime();
console.log(`Running on: ${runtime}`); // "bun" or "node"
```

### 6.6 createRuntimeAdapter()

Creates the appropriate runtime adapter based on the specified runtime. Uses auto-detection if no runtime is specified.

**Signature:**

```typescript
function createRuntimeAdapter(runtime?: Runtime): RuntimeAdapter
```

**Parameters:**

- **`runtime`**: Explicit runtime choice (`"bun"` or `"node"`). Auto-detected if omitted.

**Returns:** A `RuntimeAdapter` for the target runtime

**Example:**

```typescript
import { createRuntimeAdapter } from "dialogue-ts";

// Auto-detect runtime
const adapter = createRuntimeAdapter();

// Explicit runtime
const bunAdapter = createRuntimeAdapter("bun");
const nodeAdapter = createRuntimeAdapter("node");
```

**Note:** You typically don't need to call this directly. `createDialogue()` uses it internally based on the `runtime` config option. It's exported for advanced use cases where you need manual control over the adapter lifecycle.
*This documentation reflects the current implementation and is subject to evolution. Contributions and feedback are welcome.*
