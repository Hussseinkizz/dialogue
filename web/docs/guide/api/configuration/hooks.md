---
title: Lifecycle Hooks
description: Client, room, socket, and event lifecycle hooks
---

# Lifecycle Hooks

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

## HooksConfig Options

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

## Authentication Hook

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

## Socket Lifecycle Hooks

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

## Room Join Hook

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

## Event Middleware Hooks

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

## See Also

- [Authentication](./authentication) - Auth data structure and client auth
- [TypeScript Types](./types) - Hook type signatures and interfaces
- [Dialogue Configuration](./dialogue-config#dialoguecontext) - DialogueContext object
