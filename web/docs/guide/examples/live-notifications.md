---
title: Live Notifications
description: A notification system that delivers real-time alerts to users
---

# Live Notifications

A notification system that delivers real-time alerts to users.

## Backend Configuration

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

## Usage in API Routes

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

*This documentation reflects the current implementation and is subject to evolution. Contributions and feedback are welcome.*
