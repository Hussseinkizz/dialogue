---
title: Client API Reference
description: Client SDK for connecting to a Dialogue server from frontend applications
---

# Client API Reference

This document covers the client SDK for connecting to a Dialogue server from frontend applications.

## 1. Overview

The Dialogue client SDK provides a simple, type-safe API for connecting to a Dialogue server, joining rooms, and handling real-time events.

## 2. Installation

Install the package and its peer dependency:

```bash
bun add dialogue-ts zod
```

The client SDK is included in the Dialogue package:

```typescript
import { createDialogueClient } from "dialogue-ts/client";
```

## 3. DialogueClient

The main client factory for connecting to a Dialogue server.

### 3.1 Creating a Client

```typescript
import { createDialogueClient } from "./client";

const client = createDialogueClient({
  url: "ws://localhost:3000",
  auth: {
    userId: "user-123",
    token: "jwt-token-here",
  },
});
```

### 3.2 Configuration Options

| Property | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| **`url`** | `string` | Yes | - | WebSocket server URL |
| **`auth`** | `object` | No | - | Authentication data sent with connection |
| **`auth.userId`** | `string` | No | - | User ID for identification |
| **`auth.token`** | `string` | No | - | JWT or other auth token |
| **`autoConnect`** | `boolean` | No | `true` | Auto-connect on instantiation |
| **`reconnection`** | `boolean` | No | `true` | Enable automatic reconnection |
| **`reconnectionAttempts`** | `number` | No | `5` | Maximum reconnection attempts |

### 3.3 Properties

| Property | Type | Description |
|----------|------|-------------|
| **`userId`** | `string` | User ID assigned by the server |
| **`connected`** | `boolean` | Whether the client is connected |
| **`state`** | `ConnectionState` | Current connection state: `"disconnected"`, `"connecting"`, or `"connected"` |

### 3.4 client.connect()

Connects to the server. Returns a promise that resolves when connected.

**Signature:**

```typescript
client.connect(): Promise<void>
```

**Example:**

```typescript
try {
  await client.connect();
  console.log("Connected as:", client.userId);
} catch (error) {
  console.error("Connection failed:", error);
}
```

### 3.5 client.disconnect()

Disconnects from the server and leaves all joined rooms.

**Signature:**

```typescript
client.disconnect(): void
```

**Example:**

```typescript
// Cleanup on component unmount
useEffect(() => {
  return () => {
    client.disconnect();
  };
}, []);
```

### 3.6 client.join()

Joins a room and returns a RoomContext for interacting with it.

**Signature:**

```typescript
client.join(roomId: string): Promise<RoomContext>
```

**Example:**

```typescript
const chat = await client.join("chat");

console.log(`Joined ${chat.roomName}`);

// Listen for messages
chat.on("message", (msg) => {
  console.log(`${msg.from}: ${msg.data.text}`);
});
```

### 3.7 client.getRoom()

Gets a previously joined room context.

**Signature:**

```typescript
client.getRoom(roomId: string): RoomContext | undefined
```

**Example:**

```typescript
const chat = client.getRoom("chat");

if (chat) {
  chat.trigger("message", { text: "Hello!" });
}
```

### 3.8 client.listRooms()

Lists all available rooms on the server.

**Signature:**

```typescript
client.listRooms(): Promise<RoomInfo[]>
```

**Returns:**

Array of `RoomInfo` objects:

```typescript
interface RoomInfo {
  id: string;
  name: string;
  description?: string;
  size: number;
  maxSize?: number;
  createdById?: string; // User ID of room creator (for dynamic rooms)
}
```

**Example:**

```typescript
const rooms = await client.listRooms();

for (const room of rooms) {
  console.log(`${room.name}: ${room.size}/${room.maxSize ?? "∞"} participants`);
}
```

### 3.9 client.onConnect()

Registers a handler called when connected.

**Signature:**

```typescript
client.onConnect(handler: () => void): () => void
```

**Returns:** Unsubscribe function

**Example:**

```typescript
const unsubscribe = client.onConnect(() => {
  console.log("Connected!");
});
```

### 3.10 client.onDisconnect()

Registers a handler called when disconnected.

**Signature:**

```typescript
client.onDisconnect(handler: (reason: string) => void): () => void
```

**Example:**

```typescript
client.onDisconnect((reason) => {
  console.log("Disconnected:", reason);
});
```

### 3.11 client.onError()

Registers an error handler.

**Signature:**

```typescript
client.onError(handler: (error: Error) => void): () => void
```

**Example:**

```typescript
client.onError((error) => {
  console.error("Error:", error.message);
});
```

### 3.12 client.createRoom()

Creates a new room on the server. Requires server to support dynamic room creation.

**Signature:**

```typescript
client.createRoom(options: CreateRoomOptions): Promise<RoomInfo>
```

**CreateRoomOptions:**

```typescript
interface CreateRoomOptions {
  id: string;
  name: string;
  description?: string;
  maxSize?: number;
}
```

**Returns:** `RoomInfo` object with the created room details

**Example:**

```typescript
const roomInfo = await client.createRoom({
  id: "tech-talk",
  name: "Tech Talk",
  description: "Discuss the latest in technology",
  maxSize: 100,
});

console.log(`Created room: ${roomInfo.name}`);

// Now join the room
const room = await client.join(roomInfo.id);
```

### 3.13 client.deleteRoom()

Deletes a room from the server. Only the room creator can delete a room.

**Signature:**

```typescript
client.deleteRoom(roomId: string): Promise<void>
```

**Example:**

```typescript
try {
  await client.deleteRoom("tech-talk");
  console.log("Room deleted successfully");
} catch (error) {
  console.error("Failed to delete room:", error.message);
}
```

### 3.14 client.onRoomCreated()

Registers a handler called when a new room is created on the server.

**Signature:**

```typescript
client.onRoomCreated(handler: (room: RoomInfo) => void): () => void
```

**Returns:** Unsubscribe function

**Example:**

```typescript
client.onRoomCreated((room) => {
  console.log(`New room available: ${room.name}`);
  // Update UI to show new room in list
  updateRoomList();
});
```

### 3.15 client.onRoomDeleted()

Registers a handler called when a room is deleted from the server.

**Signature:**

```typescript
client.onRoomDeleted(handler: (roomId: string) => void): () => void
```

**Returns:** Unsubscribe function

**Example:**

```typescript
client.onRoomDeleted((roomId) => {
  console.log(`Room deleted: ${roomId}`);
  
  // If user was in this room, redirect them
  if (currentRoomId === roomId) {
    showMessage("This room has been deleted");
    navigateToRoomList();
  }
});
```

### 3.16 client.onHistory()

Registers a handler called when historical events are received on room join (when `syncHistoryOnJoin` is enabled).

**Signature:**

```typescript
client.onHistory(handler: (roomId: string, events: EventMessage[]) => void): () => void
```

**Returns:** Unsubscribe function

**Example:**

```typescript
client.onHistory((roomId, events) => {
  console.log(`Received ${events.length} historical events for ${roomId}`);
  
  // Render historical messages
  events.forEach((event) => {
    addMessage(event, { isHistory: true });
  });
});
```

## 4. RoomContext

Returned by `client.join()`, provides methods for interacting with a joined room.

### 4.1 Properties

| Property | Type | Description |
|----------|------|-------------|
| **`roomId`** | `string` | Room identifier |
| **`roomName`** | `string` | Human-readable room name |

### 4.2 room.trigger()

Triggers an event to all subscribers in the room.

**Signature:**

```typescript
room.trigger<T>(eventName: string, data: T): void
```

**Example:**

```typescript
// Send a message
room.trigger("message", {
  text: "Hello, everyone!",
  senderId: client.userId,
});

// Send a typing indicator
room.trigger("typing", { isTyping: true });
```

### 4.3 room.on()

Listens for a specific event. Returns an unsubscribe function.

**Signature:**

```typescript
room.on<T>(eventName: string, handler: (msg: EventMessage<T>) => void): () => void
```

**EventMessage structure:**

```typescript
interface EventMessage<T> {
  event: string;
  roomId: string;
  data: T;
  from: string;
  timestamp: number;
}
```

**Example:**

```typescript
// Listen for messages
const unsubscribe = room.on<{ text: string; senderId: string }>(
  "message",
  (msg) => {
    console.log(`[${msg.from}] ${msg.data.text}`);
    console.log(`Received at: ${new Date(msg.timestamp)}`);
  }
);

// Stop listening
unsubscribe();
```

### 4.4 room.onAny()

Listens for all events in the room. Useful for logging or debugging.

**Signature:**

```typescript
room.onAny(
  handler: (eventName: string, msg: EventMessage<unknown>) => void
): () => void
```

**Example:**

```typescript
room.onAny((eventName, msg) => {
  console.log(`Event: ${eventName}`, msg.data);
});
```

### 4.5 room.subscribe()

Subscribes to an additional event type.

**Signature:**

```typescript
room.subscribe(eventName: string): void
```

**Example:**

```typescript
// Subscribe to typing events (if not in defaultSubscriptions)
room.subscribe("typing");
```

### 4.6 room.subscribeAll()

Subscribes to all events in the room. This is useful when joining rooms with dynamic or unknown event types.

**Signature:**

```typescript
room.subscribeAll(): void
```

**Example:**

```typescript
const room = await client.join("project-123");

// Subscribe to all events in this room
room.subscribeAll();

// Now set up handlers
room.on("message", (msg) => {
  console.log(msg.data);
});
```

**Note:** If the room has `defaultSubscriptions` configured on the server, clients are automatically subscribed to those events when joining. Use `subscribeAll()` for rooms without default subscriptions or when you need to ensure you receive all events.

### 4.7 room.unsubscribe()

Unsubscribes from an event type.

**Signature:**

```typescript
room.unsubscribe(eventName: string): void
```

**Example:**

```typescript
// Stop receiving typing events
room.unsubscribe("typing");
```

### 4.8 room.leave()

Leaves the room and cleans up all event handlers.

**Signature:**

```typescript
room.leave(): void
```

**Example:**

```typescript
// Leave when closing a chat
room.leave();
```

### 4.8 room.getHistory()

Fetches historical events for a specific event type with pagination.

**Signature:**

```typescript
room.getHistory(eventName: string, start?: number, end?: number): Promise<EventMessage[]>
```

**Parameters:**

- **`eventName`**: The event type to fetch history for
- **`start`**: Starting index (0 = most recent). Defaults to 0
- **`end`**: Ending index (exclusive). Defaults to 50

**Returns:** Promise resolving to array of historical events (newest first)

**Example:**

```typescript
// Get the last 20 messages
const recentMessages = await room.getHistory("message", 0, 20);

// Paginate: skip first 20, get next 20
const olderMessages = await room.getHistory("message", 20, 40);

// Load more on scroll
async function loadMore() {
  const currentCount = messages.length;
  const older = await room.getHistory("message", currentCount, currentCount + 20);
  setMessages((prev) => [...prev, ...older]);
}
```

## 5. Complete Example

```typescript
import { createDialogueClient } from "./client";

async function main() {
  // Create client with authentication
  const client = createDialogueClient({
    url: "ws://localhost:3000",
    auth: {
      userId: "user-123",
      token: "my-jwt-token",
    },
  });

  // Set up connection handlers
  client.onConnect(() => {
    console.log("Connected as:", client.userId);
  });

  client.onDisconnect((reason) => {
    console.log("Disconnected:", reason);
  });

  client.onError((error) => {
    console.error("Error:", error.message);
  });

  // Connect to server
  await client.connect();

  // List available rooms
  const rooms = await client.listRooms();
  console.log("Available rooms:", rooms);

  // Join chat room
  const chat = await client.join("chat");
  console.log(`Joined: ${chat.roomName}`);

  // Listen for messages
  chat.on<{ text: string; senderId: string }>("message", (msg) => {
    console.log(`[${msg.from}] ${msg.data.text}`);
  });

  // Listen for typing indicators
  chat.on<{ isTyping: boolean }>("typing", (msg) => {
    if (msg.data.isTyping) {
      console.log(`${msg.from} is typing...`);
    }
  });

  // Send a message
  chat.trigger("message", {
    text: "Hello, everyone!",
    senderId: client.userId,
  });

  // Send typing indicator
  chat.trigger("typing", { isTyping: true });

  // Later: leave room and disconnect
  // chat.leave();
  // client.disconnect();
}

main().catch(console.error);
```

## 6. React Integration

### 6.1 Basic Hook

```typescript
import { useEffect, useState } from "react";
import { createDialogueClient } from "./client";
import type { RoomContext } from "./client/types";

export function useDialogue(url: string, userId: string) {
  const [client] = useState(
    () =>
      createDialogueClient({
        url,
        auth: { userId },
        autoConnect: false,
      })
  );
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    client.onConnect(() => setConnected(true));
    client.onDisconnect(() => setConnected(false));
    client.connect();

    return () => {
      client.disconnect();
    };
  }, [client]);

  return { client, connected };
}

export function useRoom(client: ReturnType<typeof createDialogueClient>, roomId: string) {
  const [room, setRoom] = useState<RoomContext | null>(null);

  useEffect(() => {
    if (!client.connected) return;

    client.join(roomId).then(setRoom);

    return () => {
      room?.leave();
    };
  }, [client, roomId, client.connected]);

  return room;
}
```

### 6.2 Usage in Component

```typescript
function ChatRoom({ roomId }: { roomId: string }) {
  const { client, connected } = useDialogue("ws://localhost:3000", "user-123");
  const room = useRoom(client, roomId);
  const [messages, setMessages] = useState<Message[]>([]);

  useEffect(() => {
    if (!room) return;

    const unsubscribe = room.on<MessageData>("message", (msg) => {
      setMessages((prev) => [...prev, msg]);
    });

    return unsubscribe;
  }, [room]);

  if (!connected || !room) {
    return <div>Connecting...</div>;
  }

  return (
    <div>
      <h2>{room.roomName}</h2>
      {messages.map((msg) => (
        <div key={msg.timestamp}>
          <strong>{msg.from}:</strong> {msg.data.text}
        </div>
      ))}
    </div>
  );
}
```
*This documentation reflects the current implementation and is subject to evolution. Contributions and feedback are welcome.*
