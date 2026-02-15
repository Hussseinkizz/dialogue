---
title: Event Definitions
description: Define events with schema validation using Zod
---

# Event Definitions

Events are defined using the `defineEvent` function. Each event has a unique name and optional schema validation.

## Basic Event Definition

```typescript
import { defineEvent } from "./dialogue";

// Simple event without validation
const Typing = defineEvent("typing");

// Event with description
const Ping = defineEvent("ping", {
  description: "Health check event",
});
```

## Events with Schema Validation

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

## Event Definition Options

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| **`schema`** | `z.ZodType<T>` | No | Zod schema for validating event data |
| **`description`** | `string` | No | Human-readable description of the event |
| **`history`** | `{ enabled: boolean; limit: number }` | No | Enable history storage for this event type |

## Type Inference

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

## See Also

- [Room Configuration](./rooms) - Using events in rooms
- [Lifecycle Hooks](./hooks#event-middleware-hooks) - Event middleware and hooks
- [TypeScript Types](./types#eventdefinition) - EventDefinition interface
