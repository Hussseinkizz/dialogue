---
title: Room Configuration
description: Configure rooms, capacity limits, and default subscriptions
---

# Room Configuration

Rooms are defined in the `DialogueConfig.rooms` object, keyed by room ID.

## Basic Room Configuration

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

## Room Configuration Options

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| **`name`** | `string` | Yes | Human-readable room name |
| **`description`** | `string` | No | Room description |
| **`maxSize`** | `number` | No | Maximum concurrent connections. Undefined means unlimited |
| **`events`** | `EventDefinition[]` | Yes | Events allowed in this room. Empty array allows any event |
| **`defaultSubscriptions`** | `string[]` | No | Event names to auto-subscribe clients to on join |
| **`createdById`** | `string` | No | User ID of room creator for ownership tracking |
| **`syncHistoryOnJoin`** | `boolean \| number` | No | Auto-send history on join. `true` = all, number = limit per event type |

## Bounded Rooms

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

## Default Subscriptions

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

## Event Control Patterns

**Accept All Events (Wildcard):**

To create a room that accepts any event type, use the wildcard `"*"`:

```typescript
const dialogue = createDialogue({
  rooms: {
    sandbox: {
      name: "Sandbox",
      events: [{ name: '*' }],  // Accepts any event name
      defaultSubscriptions: ['*']  // Subscribe to all events
    },
  },
});
```

**Reject All Events (Empty Array):**

To create a room that rejects all trigger attempts (listen-only or system-controlled):

```typescript
const dialogue = createDialogue({
  rooms: {
    readonly: {
      name: "Read-Only Notifications",
      events: [],  // No events can be triggered by clients
      // Server can still push via dialogue.trigger() if needed
    },
  },
});
```

**How it works:**
- `events: []` - No events allowed (all triggers rejected)
- `events: [{ name: '*' }]` - All events allowed (no validation)
- `events: [specificEvent1, specificEvent2]` - Only listed events allowed
- `defaultSubscriptions: ['*']` - Clients auto-subscribe to all events when joining

**Use cases:**
- **Wildcard (`*`)**: Chat rooms, debug channels, flexible communication
- **Empty array (`[]`)**: Read-only rooms, server-only broadcasting
- **Specific events**: Most production use cases with validated schemas

**Warning:** Wildcard rooms bypass event validation. Use with caution in production.

## See Also

- [Event Definitions](./events) - Defining events for rooms
- [Lifecycle Hooks](./hooks#room-join-hook) - Room access control with beforeJoin hook
- [Dialogue Configuration](./dialogue-config) - Full configuration example
