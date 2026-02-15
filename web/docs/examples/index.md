---
title: Examples
description: Complete examples for common real-time use cases with Dialogue
---

# Examples

This document provides complete examples for common real-time use cases with Dialogue.

## 1. Chat Application

A basic chat application with messages, typing indicators, and user presence.

### 1.1 Backend Configuration

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

### 1.2 Frontend Client

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

## 2. Live Notifications

A notification system that delivers real-time alerts to users.

### 2.1 Backend Configuration

```typescript
// notifications.config.ts
import { createDialogue, defineEvent } from "./dialogue";
import { z } from "zod";

export const Alert = defineEvent("alert", {
  schema: z.object({
    title: z.string(),
    message: z.string(),
    type: z.enum(["info", "warning", "error", "success"]),
    action: z
      .object({
        label: z.string(),
        url: z.string().url(),
      })
      .optional(),
  }),
});

export const Badge = defineEvent("badge", {
  schema: z.object({
    count: z.number().min(0),
    type: z.enum(["messages", "notifications", "tasks"]),
  }),
});

export const dialogue = createDialogue({
  port: 3000,
  rooms: {},
  hooks: {
    clients: {
      onConnected: (client) => {
        // Create a personal notification room for each user
        const roomId = `user:${client.userId}`;

        // Dynamically register room if not exists
        if (!dialogue.room(roomId)) {
          // Note: In production, register rooms upfront or use a factory
        }

        client.join(roomId);
      },
    },
  },
});

// API to send notifications
export function sendNotification(
  userId: string,
  notification: z.infer<typeof Alert.schema>
): void {
  dialogue.trigger(`user:${userId}`, Alert, notification, "system");
}

// API to update badge count
export function updateBadge(
  userId: string,
  type: "messages" | "notifications" | "tasks",
  count: number
): void {
  dialogue.trigger(`user:${userId}`, Badge, { count, type }, "system");
}
```

### 2.2 Usage in API Routes

```typescript
// routes/orders.ts
import { sendNotification } from "../notifications.config";

app.post("/orders/:id/ship", async (c) => {
  const order = await shipOrder(c.req.param("id"));

  // Send real-time notification to customer
  sendNotification(order.customerId, {
    title: "Order Shipped",
    message: `Your order #${order.id} has been shipped!`,
    type: "success",
    action: {
      label: "Track Order",
      url: `/orders/${order.id}/track`,
    },
  });

  return c.json({ status: true });
});
```

## 3. Live Dashboard

A real-time dashboard showing live metrics and updates.

### 3.1 Backend Configuration

```typescript
// dashboard.config.ts
import { createDialogue, defineEvent } from "./dialogue";
import { z } from "zod";

export const MetricsUpdate = defineEvent("metrics:update", {
  schema: z.object({
    cpu: z.number().min(0).max(100),
    memory: z.number().min(0).max(100),
    requests: z.number(),
    errors: z.number(),
    latency: z.number(),
  }),
});

export const AlertTriggered = defineEvent("alert:triggered", {
  schema: z.object({
    alertId: z.string(),
    severity: z.enum(["low", "medium", "high", "critical"]),
    message: z.string(),
    timestamp: z.number(),
  }),
});

export const dialogue = createDialogue({
  port: 3000,
  rooms: {
    dashboard: {
      name: "Dashboard",
      description: "Real-time metrics dashboard",
      events: [MetricsUpdate, AlertTriggered],
      defaultSubscriptions: ["metrics:update", "alert:triggered"],
    },
  },
  hooks: {
    clients: {
      onConnected: (client) => {
        // Only admins can view dashboard
        if (client.meta.role === "admin") {
          client.join("dashboard");
        }
      },
    },
  },
});

// Broadcast metrics every second
setInterval(async () => {
  const metrics = await collectMetrics();

  dialogue.trigger("dashboard", MetricsUpdate, {
    cpu: metrics.cpuUsage,
    memory: metrics.memoryUsage,
    requests: metrics.requestsPerSecond,
    errors: metrics.errorsPerSecond,
    latency: metrics.avgLatency,
  });
}, 1000);

// Send alerts when thresholds exceeded
async function checkAlerts(): Promise<void> {
  const metrics = await collectMetrics();

  if (metrics.cpuUsage > 90) {
    dialogue.trigger("dashboard", AlertTriggered, {
      alertId: `cpu-${Date.now()}`,
      severity: "high",
      message: `CPU usage critical: ${metrics.cpuUsage}%`,
      timestamp: Date.now(),
    });
  }
}
```

## 4. Multiplayer Game

A simple multiplayer game with player positions and game state.

### 4.1 Backend Configuration

```typescript
// game.config.ts
import { createDialogue, defineEvent } from "./dialogue";
import { z } from "zod";

export const PlayerMove = defineEvent("player:move", {
  schema: z.object({
    playerId: z.string(),
    x: z.number(),
    y: z.number(),
    direction: z.enum(["up", "down", "left", "right"]),
  }),
});

export const GameState = defineEvent("game:state", {
  schema: z.object({
    players: z.array(
      z.object({
        id: z.string(),
        x: z.number(),
        y: z.number(),
        health: z.number(),
        score: z.number(),
      })
    ),
    gameTime: z.number(),
    status: z.enum(["waiting", "playing", "ended"]),
  }),
});

export const PlayerAction = defineEvent("player:action", {
  schema: z.object({
    playerId: z.string(),
    action: z.enum(["attack", "defend", "heal", "special"]),
    targetId: z.string().optional(),
  }),
});

export const dialogue = createDialogue({
  port: 3000,
  rooms: {
    "game:lobby": {
      name: "Game Lobby",
      events: [GameState],
      maxSize: 8,
      defaultSubscriptions: ["game:state"],
    },
    "game:match-1": {
      name: "Match 1",
      events: [PlayerMove, GameState, PlayerAction],
      maxSize: 4,
      defaultSubscriptions: ["player:move", "game:state", "player:action"],
    },
  },
  hooks: {
    clients: {
      onConnected: (client) => {
        client.join("game:lobby");
      },
    },
  },
});

// Game loop - broadcast state 30 times per second
const TICK_RATE = 1000 / 30;

setInterval(() => {
  const gameState = computeGameState();

  dialogue.trigger("game:match-1", GameState, {
    players: gameState.players,
    gameTime: gameState.time,
    status: gameState.status,
  });
}, TICK_RATE);

// Handle player moves
dialogue.on("game:match-1", PlayerMove, (msg) => {
  updatePlayerPosition(msg.data.playerId, msg.data.x, msg.data.y);
});

// Handle player actions
dialogue.on("game:match-1", PlayerAction, (msg) => {
  processPlayerAction(msg.data.playerId, msg.data.action, msg.data.targetId);
});
```

## 5. IoT Device Monitoring

Real-time monitoring of IoT devices with sensor data.

### 5.1 Backend Configuration

```typescript
// iot.config.ts
import { createDialogue, defineEvent } from "./dialogue";
import { z } from "zod";

export const SensorReading = defineEvent("sensor:reading", {
  schema: z.object({
    deviceId: z.string(),
    temperature: z.number(),
    humidity: z.number(),
    pressure: z.number(),
    battery: z.number().min(0).max(100),
    timestamp: z.number(),
  }),
});

export const DeviceStatus = defineEvent("device:status", {
  schema: z.object({
    deviceId: z.string(),
    status: z.enum(["online", "offline", "error", "maintenance"]),
    lastSeen: z.number(),
  }),
});

export const DeviceAlert = defineEvent("device:alert", {
  schema: z.object({
    deviceId: z.string(),
    alertType: z.enum(["temperature", "battery", "connectivity", "error"]),
    message: z.string(),
    value: z.number().optional(),
    threshold: z.number().optional(),
  }),
});

export const dialogue = createDialogue({
  port: 3000,
  rooms: {
    sensors: {
      name: "Sensor Data",
      description: "Real-time sensor readings",
      events: [SensorReading, DeviceStatus, DeviceAlert],
      defaultSubscriptions: ["sensor:reading", "device:status", "device:alert"],
    },
  },
});

// Process incoming sensor data (e.g., from MQTT bridge)
export function processSensorData(data: {
  deviceId: string;
  temperature: number;
  humidity: number;
  pressure: number;
  battery: number;
}): void {
  const reading = {
    ...data,
    timestamp: Date.now(),
  };

  // Broadcast to dashboard
  dialogue.trigger("sensors", SensorReading, reading, data.deviceId);

  // Check for alerts
  if (data.temperature > 40) {
    dialogue.trigger(
      "sensors",
      DeviceAlert,
      {
        deviceId: data.deviceId,
        alertType: "temperature",
        message: `High temperature detected: ${data.temperature}°C`,
        value: data.temperature,
        threshold: 40,
      },
      "system"
    );
  }

  if (data.battery < 20) {
    dialogue.trigger(
      "sensors",
      DeviceAlert,
      {
        deviceId: data.deviceId,
        alertType: "battery",
        message: `Low battery: ${data.battery}%`,
        value: data.battery,
        threshold: 20,
      },
      "system"
    );
  }
}
```

## 6. Collaborative Document Editing

Real-time collaborative editing with cursor positions and document changes.

### 6.1 Backend Configuration

```typescript
// collab.config.ts
import { createDialogue, defineEvent } from "./dialogue";
import { z } from "zod";

export const DocumentChange = defineEvent("doc:change", {
  schema: z.object({
    userId: z.string(),
    operations: z.array(
      z.object({
        type: z.enum(["insert", "delete", "retain"]),
        position: z.number(),
        text: z.string().optional(),
        length: z.number().optional(),
      })
    ),
    version: z.number(),
  }),
});

export const CursorUpdate = defineEvent("cursor:update", {
  schema: z.object({
    userId: z.string(),
    username: z.string(),
    position: z.number(),
    selection: z
      .object({
        start: z.number(),
        end: z.number(),
      })
      .optional(),
    color: z.string(),
  }),
});

export const UserPresence = defineEvent("user:presence", {
  schema: z.object({
    userId: z.string(),
    username: z.string(),
    color: z.string(),
    status: z.enum(["active", "idle", "away"]),
  }),
});

export const dialogue = createDialogue({
  port: 3000,
  rooms: {},
  hooks: {
    clients: {
      onConnected: (client) => {
        // Rooms are created per document
        // Join handled by explicit API call
      },
    },
  },
});

// Create room for a document
export function createDocumentRoom(documentId: string): void {
  // In a real app, you'd dynamically register rooms
  // or use a pattern-based room system
}

// Broadcast document change
export function broadcastChange(
  documentId: string,
  change: z.infer<typeof DocumentChange.schema>
): void {
  dialogue.trigger(`doc:${documentId}`, DocumentChange, change, change.userId);
}
```

## 7. Event History with Database Persistence

A chat application with persistent history using SQLite/PostgreSQL and the `onCleanup`/`onLoad` hooks.

### 7.1 Database Schema

```sql
-- messages table for persisted history
CREATE TABLE messages (
  id SERIAL PRIMARY KEY,
  room_id VARCHAR(255) NOT NULL,
  event_name VARCHAR(100) NOT NULL,
  event_data JSONB NOT NULL,
  from_user VARCHAR(255) NOT NULL,
  timestamp BIGINT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_messages_room_event ON messages(room_id, event_name);
CREATE INDEX idx_messages_timestamp ON messages(timestamp DESC);
```

### 7.2 Database Operations

```typescript
// db/messages.ts
import { EventMessage } from "dialogue-ts";

interface MessageRow {
  id: number;
  room_id: string;
  event_name: string;
  event_data: Record<string, unknown>;
  from_user: string;
  timestamp: number;
}

/**
 * Insert multiple messages into the database (for onCleanup)
 */
export async function insertMessages(
  roomId: string,
  eventName: string,
  events: EventMessage[]
): Promise<void> {
  const values = events.map((event) => ({
    room_id: roomId,
    event_name: eventName,
    event_data: event.data,
    from_user: event.from,
    timestamp: event.timestamp,
  }));

  await db.insert(messages).values(values);
}

/**
 * Load messages from the database (for onLoad pagination)
 */
export async function loadMessages(
  roomId: string,
  eventName: string,
  start: number,
  end: number
): Promise<EventMessage[]> {
  const rows = await db
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.room_id, roomId),
        eq(messages.event_name, eventName)
      )
    )
    .orderBy(desc(messages.timestamp))
    .offset(start)
    .limit(end - start);

  return rows.map((row) => ({
    event: row.event_name,
    roomId: row.room_id,
    data: row.event_data,
    from: row.from_user,
    timestamp: row.timestamp,
  }));
}
```

### 7.3 Dialogue Configuration with Persistence

```typescript
// dialogue.config.ts
import { createDialogue, defineEvent } from "dialogue-ts";
import { z } from "zod";
import { insertMessages, loadMessages } from "./db/messages";

export const Message = defineEvent("message", {
  schema: z.object({
    text: z.string().min(1).max(2000),
    username: z.string(),
  }),
  history: { enabled: true, limit: 100 }, // Keep 100 in memory
});

export const dialogue = createDialogue({
  port: 3000,
  rooms: {
    general: {
      name: "General Chat",
      events: [Message],
      syncHistoryOnJoin: 50, // Send last 50 on join
    },
  },
  hooks: {
    clients: {
      onConnected: (client) => {
        client.join("general");
      },
    },
    events: {
      // Persist events when evicted from memory
      onCleanup: async (roomId, eventName, events) => {
        console.log(`Persisting ${events.length} ${eventName} events from ${roomId}`);
        await insertMessages(roomId, eventName, events);
      },

      // Load older events from database for pagination
      onLoad: async (roomId, eventName, start, end) => {
        console.log(`Loading ${eventName} events ${start}-${end} from ${roomId}`);
        return loadMessages(roomId, eventName, start, end);
      },
    },
  },
});
```

### 7.4 Client-Side Infinite Scroll

```typescript
// client/chat.ts
import { createDialogueClient } from "dialogue-ts/client";

const client = createDialogueClient({
  url: "ws://localhost:3000",
  auth: { userId: "user-123" },
});

const messages: EventMessage[] = [];
let isLoadingMore = false;

// Handle history sent on join
client.onHistory((roomId, events) => {
  console.log(`Received ${events.length} historical messages`);
  messages.push(...events);
  renderMessages();
});

await client.connect();
const room = await client.join("general");

// Listen for new messages
room.on("message", (msg) => {
  messages.unshift(msg); // Add to beginning (newest)
  renderMessages();
});

// Load more when scrolling to top
async function loadMoreMessages(): Promise<void> {
  if (isLoadingMore) return;
  isLoadingMore = true;

  try {
    const currentCount = messages.length;
    const olderMessages = await room.getHistory("message", currentCount, currentCount + 20);
    
    if (olderMessages.length > 0) {
      messages.push(...olderMessages);
      renderMessages();
    }
  } finally {
    isLoadingMore = false;
  }
}

// Attach to scroll event
chatContainer.addEventListener("scroll", () => {
  if (chatContainer.scrollTop === 0) {
    loadMoreMessages();
  }
});
```

### 7.5 How It Works

1. **In-Memory Buffer**: Dialogue keeps the last 100 messages per event type in memory for fast access.

2. **Automatic Eviction**: When a new message arrives and the buffer exceeds 100, the oldest messages are evicted.

3. **onCleanup Hook**: Evicted messages are passed to `onCleanup`, where you persist them to your database.

4. **onLoad Hook**: When a client requests messages beyond the in-memory buffer, `onLoad` is called to fetch from the database.

5. **Seamless Pagination**: Clients can paginate through unlimited history - recent messages come from memory, older ones from the database.

```
┌─────────────────────────────────────────────────────────────┐
│                     Message Flow                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  New Message ──► In-Memory Buffer (100 events)             │
│                        │                                    │
│                        ▼                                    │
│              Buffer Full? ──Yes──► onCleanup() ──► Database │
│                        │                                    │
│                       No                                    │
│                        │                                    │
│                        ▼                                    │
│              Client Request (0-100)? ──► In-Memory Buffer   │
│                        │                                    │
│              Client Request (100+)?  ──► onLoad() ──► DB    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```
*This documentation reflects the current implementation and is subject to evolution. Contributions and feedback are welcome.*
