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
  Runtime,
  RuntimeAdapter,
  RuntimeStartOptions,
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

## Runtime Types

### Runtime

```typescript
type Runtime = "bun" | "node";
```

Supported runtime environments. Used with the `runtime` config option or returned by `detectRuntime()`.

### RuntimeAdapter

```typescript
interface RuntimeAdapter {
  /** The runtime this adapter targets */
  readonly runtime: Runtime;

  /** Bind the Socket.IO server to the runtime-specific engine */
  bind(io: Server): void;

  /** Start the HTTP server on the given port */
  start(options: RuntimeStartOptions): Promise<void>;

  /** Stop the HTTP server and clean up resources */
  stop(): Promise<void>;
}
```

Abstracts the HTTP server and Socket.IO engine binding for different runtimes. You typically don't interact with this directly — `createDialogue()` creates the appropriate adapter based on the `runtime` config option.

### RuntimeStartOptions

```typescript
interface RuntimeStartOptions {
  port: number;
  app: Hono;
  io: Server;
  corsConfig: CorsConfig | boolean | undefined;
  logger: Logger;
}
```

Options passed internally to `RuntimeAdapter.start()`. These are assembled by the Dialogue server setup and not typically constructed manually.

## See Also

- [Event Definitions](./events) - Using EventDefinition
- [Authentication](./authentication) - Using AuthData and JwtClaims
- [Dialogue Configuration](./dialogue-config) - Using DialogueContext

---

*This documentation reflects the current implementation and is subject to evolution. Contributions and feedback are welcome.*
