---
title: Collaborative Editing
description: Real-time collaborative editing with cursor positions and document changes
---

# Collaborative Document Editing

Real-time collaborative editing with cursor positions and document changes.

## Backend Configuration

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

*This documentation reflects the current implementation and is subject to evolution. Contributions and feedback are welcome.*
