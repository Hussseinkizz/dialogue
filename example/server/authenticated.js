/**
 * Dialogue Authenticated Example - Server
 *
 * Demonstrates authentication and authorization features:
 * - JWT-based authentication
 * - Role-based room access control
 * - Room capacity limits
 * - Event middleware (beforeEach/afterEach)
 * - Client auth data access
 */

import { Err, Ok } from "slang-ts";
import { z } from "zod";
import { createDialogue, defineEvent } from "../../dist/src/index.js";

// Define events
const Message = defineEvent("message", {
  schema: z.object({
    text: z.string().min(1).max(500),
    username: z.string(),
  }),
  history: { enabled: true, limit: 100 },
});

const AdminAction = defineEvent("admin-action", {
  schema: z.object({
    action: z.string(),
    target: z.string().optional(),
    reason: z.string().optional(),
  }),
});

const UserJoined = defineEvent("user-joined", {
  schema: z.object({
    username: z.string(),
    role: z.string(),
  }),
});

const UserLeft = defineEvent("user-left", {
  schema: z.object({
    username: z.string(),
  }),
});

// Simple JWT verification (in production, use a proper JWT library)
function verifyToken(token) {
  // This is a mock implementation - in production, use jsonwebtoken library
  // and verify against a real secret
  if (!token) {
    return null;
  }

  try {
    // Mock token format: "user-{userId}-{role}"
    // Example: "user-alice-admin"
    const parts = token.split("-");
    if (parts.length !== 3 || parts[0] !== "user") {
      return null;
    }

    const userId = parts[1];
    const role = parts[2];

    return {
      sub: userId,
      role: role,
      exp: Date.now() + 3_600_000, // 1 hour from now
      iat: Date.now(),
    };
  } catch (_error) {
    return null;
  }
}

// Create dialogue instance with authentication
const dialogue = createDialogue({
  port: 3000,
  rooms: {
    lobby: {
      name: "Lobby",
      description: "Public lobby for all users",
      events: [Message, UserJoined, UserLeft],
      defaultSubscriptions: ["message", "user-joined", "user-left"],
      syncHistoryOnJoin: true,
    },
    "admin-room": {
      name: "Admin Room",
      description: "Admins only",
      events: [Message, AdminAction, UserJoined, UserLeft],
      defaultSubscriptions: ["message", "admin-action", "user-joined", "user-left"],
    },
    "vip-lounge": {
      name: "VIP Lounge",
      description: "VIP members only (max 10 users)",
      events: [Message, UserJoined, UserLeft],
      defaultSubscriptions: ["message", "user-joined", "user-left"],
      maxSize: 10,
    },
  },
  hooks: {
    socket: {
      // Authenticate incoming connections
      authenticate: ({ context, clientSocket, authData }) => {
        console.log("Authenticating connection...");

        const token = authData?.token;
        const claims = verifyToken(token);

        if (!claims) {
          console.log("Authentication failed: Invalid token");
          return Err("Invalid authentication token");
        }

        console.log(`Authenticated user: ${claims.sub} (${claims.role})`);

        return Ok({
          jwt: claims,
        });
      },

      onConnect: ({ context, clientSocket }) => {
        console.log(`Socket ${clientSocket.id} connected from ${clientSocket.handshake.address}`);
      },

      onDisconnect: ({ context, clientSocket }) => {
        console.log(`Socket ${clientSocket.id} disconnected`);
      },
    },

    clients: {
      // Control room access based on roles and capacity
      beforeJoin: ({ context, client, roomId, room }) => {
        const userRole = client.auth?.jwt?.role;
        const userId = client.userId;

        console.log(`Access check: ${userId} (${userRole}) -> ${roomId}`);

        // Check admin room access
        if (roomId === "admin-room" && userRole !== "admin") {
          console.log(`Access denied: ${userId} is not an admin`);
          return Err("Admin access required");
        }

        // Check VIP lounge access
        if (roomId === "vip-lounge" && userRole !== "vip" && userRole !== "admin") {
          console.log(`Access denied: ${userId} is not VIP`);
          return Err("VIP membership required");
        }

        // Check room capacity
        if (room.isFull()) {
          console.log(`Access denied: ${roomId} is full`);
          return Err("Room is at full capacity");
        }

        console.log(`Access granted: ${userId} -> ${roomId}`);
        return Ok(undefined);
      },

      onConnected: (client) => {
        const role = client.auth?.jwt?.role || "user";
        console.log(`Client connected: ${client.userId} (${role})`);

        // Auto-join lobby for all users
        client.join("lobby");
        dialogue.trigger("lobby", UserJoined, {
          username: client.userId,
          role: role,
        });
      },

      onDisconnected: (client) => {
        console.log(`Client disconnected: ${client.userId}`);

        // Notify all rooms the user was in
        dialogue.getClientRooms(client.userId).leaveAll((roomId) => {
          dialogue.trigger(roomId, UserLeft, { username: client.userId });
        });
      },

      onJoined: (client, roomId) => {
        const role = client.auth?.jwt?.role || "user";
        console.log(`${client.userId} joined ${roomId}`);

        // Notify room of new member
        dialogue.trigger(roomId, UserJoined, {
          username: client.userId,
          role: role,
        });
      },

      onLeft: (client, roomId) => {
        console.log(`${client.userId} left ${roomId}`);
      },
    },

    events: {
      // Middleware: validate and transform messages before broadcast
      beforeEach: ({ context, roomId, message, from }) => {
        // Log event
        console.log(`[${roomId}] ${message.event} from ${from}`);

        // Filter profanity (simple example)
        if (message.event === "message") {
          const text = message.data.text;
          const profanity = ["badword1", "badword2"]; // Example list

          for (const word of profanity) {
            if (text.toLowerCase().includes(word)) {
              console.log(`Blocked message from ${from}: contains profanity`);
              return Err("Message contains inappropriate content");
            }
          }

          // Transform: add timestamp
          const transformed = {
            ...message,
            data: {
              ...message.data,
              timestamp: Date.now(),
            },
          };

          return Ok(transformed);
        }

        // Validate admin actions
        if (message.event === "admin-action") {
          const client = context.clients[from];
          const userRole = client?.auth?.jwt?.role;

          if (userRole !== "admin") {
            console.log(`Blocked admin action from ${from}: not an admin`);
            return Err("Admin access required");
          }
        }

        return Ok(message);
      },

      // After event is broadcast - for logging/analytics
      afterEach: ({ context, roomId, message, recipientCount }) => {
        console.log(`Broadcast complete: ${message.event} -> ${recipientCount} recipients in ${roomId}`);

        // Log to analytics (example)
        if (message.event === "message") {
          console.log(`[Analytics] Message sent in ${roomId} by ${message.from}`);
        }
      },

      onTriggered: (roomId, event) => {
        // This fires for every event (including history replays)
        // Useful for persistence
      },
    },
  },
});

// Example: Trigger admin action from server
setTimeout(() => {
  console.log("\n=== Simulating server-side admin action ===");
  dialogue.trigger(
    "admin-room",
    AdminAction,
    {
      action: "announcement",
      reason: "System maintenance in 10 minutes",
    },
    "system"
  );
}, 5000);

// Start the server
await dialogue.start();

console.log("\n=== Authenticated Chat Server Running ===");
console.log("Server: http://localhost:3000");
console.log("\nTest tokens (format: user-{name}-{role}):");
console.log("  Admin:   user-alice-admin");
console.log("  VIP:     user-bob-vip");
console.log("  Regular: user-charlie-user");
console.log("\nRooms:");
console.log("  - lobby: Public (all users)");
console.log("  - admin-room: Admins only");
console.log("  - vip-lounge: VIP/Admin only (max 10)");
console.log("\nFeatures:");
console.log("  ✓ JWT authentication");
console.log("  ✓ Role-based access control");
console.log("  ✓ Room capacity limits");
console.log("  ✓ Content filtering (profanity)");
console.log("  ✓ Event middleware (beforeEach/afterEach)");
console.log("  ✓ Message history\n");
