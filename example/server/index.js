/**
 * Dialogue Chat Example - Server
 *
 * A chat server demonstrating the dialogue-ts library features:
 * - Multiple rooms (dynamic creation)
 * - Room listing and joining
 * - Leave room
 * - Global alert broadcast
 * - Simplified user room management via dialogue API
 * - Message history with sync on join
 * - Event middleware (beforeEach/afterEach)
 */

import { Err, Ok } from "slang-ts";
import { z } from "zod";
import { createDialogue, defineEvent } from "../../dist/src/index.js";

// Define events with Zod schemas
const Message = defineEvent("message", {
  schema: z.object({
    text: z.string().min(1),
    username: z.string(),
  }),
  // Store last 50 messages in history per room
  history: { enabled: true, limit: 50 },
});

const UserJoined = defineEvent("user-joined", {
  schema: z.object({
    username: z.string(),
  }),
});

const UserLeft = defineEvent("user-left", {
  schema: z.object({
    username: z.string(),
  }),
});

const Alert = defineEvent("alert", {
  schema: z.object({
    message: z.string(),
    timestamp: z.number(),
    triggeredBy: z.string(),
  }),
});

// Create dialogue instance
const dialogue = createDialogue({
  port: 3000,
  rooms: {
    // Pre-create a General room
    general: {
      name: "General Chat",
      description: "Default chat room for everyone",
      events: [Message, UserJoined, UserLeft, Alert],
      defaultSubscriptions: ["message", "user-joined", "user-left", "alert"],
      // Send history when clients join
      syncHistoryOnJoin: true,
    },
  },
  hooks: {
    clients: {
      onConnected: (client) => {
        console.log(`Client connected: ${client.userId}`);
      },
      onDisconnected: (client) => {
        console.log(`Client disconnected: ${client.userId}`);

        // Use dialogue API to notify all rooms the user was in
        dialogue.getClientRooms(client.userId).leaveAll((roomId) => {
          dialogue.trigger(roomId, UserLeft, { username: client.userId });
        });
      },
      onJoined: (client, roomId) => {
        console.log(`${client.userId} joined room: ${roomId}`);
      },
      onLeft: (client, roomId) => {
        console.log(`${client.userId} left room: ${roomId}`);
      },
    },
    events: {
      // Middleware: Filter and transform messages before broadcast
      beforeEach: ({ context, roomId, message, from }) => {
        console.log(`[beforeEach] ${roomId}/${message.event} from ${from}`);

        // Example: Filter spam messages
        if (message.event === "message") {
          const text = message.data.text.toLowerCase();
          
          // Block spam keywords
          const spamKeywords = ["spam", "advertisement"];
          if (spamKeywords.some((keyword) => text.includes(keyword))) {
            console.log(`Blocked spam message from ${from}`);
            return Err("Message blocked: spam detected");
          }

          // Transform: add server timestamp
          const transformed = {
            ...message,
            data: {
              ...message.data,
              serverTimestamp: Date.now(),
            },
          };

          return Ok(transformed);
        }

        return Ok(message);
      },

      // After event broadcast - for logging and analytics
      afterEach: ({ context, roomId, message, recipientCount }) => {
        console.log(
          `[afterEach] Broadcast complete: ${message.event} -> ${recipientCount} recipients`
        );

        // Example: Log to analytics
        if (message.event === "message") {
          console.log(`[Analytics] Message sent in ${roomId} by ${message.from}`);
        }
      },
    },
  },
});

// Start the server
await dialogue.start();
console.log("Chat server running on http://localhost:3000");
console.log(
  "Features: room list, create room, leave room, global alert, message history, event middleware"
);
