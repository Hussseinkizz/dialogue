---
title: TypeScript Types
description: Type definitions and interfaces
---

# TypeScript Types

## Core Types

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

## EventDefinition

```typescript
interface EventDefinition<T = unknown> {
  readonly name: string;
  readonly description?: string;
  readonly schema?: z.ZodType<T>;
  readonly history?: EventHistoryConfig;
}
```

## EventHistoryConfig

```typescript
interface EventHistoryConfig {
  /** Whether to store this event type in history */
  enabled: boolean;
  /** Maximum number of events to keep in memory per room */
  limit: number;
}
```

## EventMessage

```typescript
interface EventMessage<T = unknown> {
  event: string;
  roomId: string;
  data: T;
  from: string;
  timestamp: number;
}
```

## DialogueContext

```typescript
interface DialogueContext {
  io: Server;                              // Socket.IO server instance
  clients: Record<string, ConnectedClient>; // All connected clients
  rooms: Record<string, Room>;             // All active rooms
}
```

## AuthData

```typescript
interface AuthData {
  jwt: JwtClaims;
  // Additional authentication fields can be added
}
```

## JwtClaims

```typescript
interface JwtClaims {
  sub: string;      // Subject (user ID)
  exp: number;      // Expiration timestamp
  iat: number;      // Issued at timestamp
  [key: string]: unknown;  // Additional custom claims
}
```

## See Also

- [Event Definitions](./events) - Using EventDefinition
- [Authentication](./authentication) - Using AuthData and JwtClaims
- [Dialogue Configuration](./dialogue-config) - Using DialogueContext

---

*This documentation reflects the current implementation and is subject to evolution. Contributions and feedback are welcome.*
