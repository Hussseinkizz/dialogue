---
title: Event Persistence
description: A chat application with persistent history using SQLite/PostgreSQL and the onCleanup/onLoad hooks
---

# Event History with Database Persistence

A chat application with persistent history using SQLite/PostgreSQL and the `onCleanup`/`onLoad` hooks.

## Database Schema

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

## Database Operations

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

## Dialogue Configuration with Persistence

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

## Client-Side Infinite Scroll

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

## How It Works

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
