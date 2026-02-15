---
title: Authentication
description: Client authentication and JWT setup
---

# Authentication

## Client Authentication

Clients pass authentication data in the `auth` option when connecting:

```typescript
// Frontend
const client = createDialogueClient({
  url: "ws://localhost:3000",
  auth: {
    userId: "user-123",
    token: "jwt-token-here",
    role: "admin",
  },
});
```

## Accessing Auth Data

The `onConnected` hook receives auth data via the `client` object:

```typescript
const dialogue = createDialogue({
  rooms: { /* ... */ },
  hooks: {
    clients: {
      onConnected: (client) => {
        console.log(client.userId);  // "user-123" or socket.id if not provided
        console.log(client.meta);    // { token: "jwt-token-here", role: "admin" }

        // Validate token and permissions
        if (!isValidToken(client.meta.token)) {
          client.disconnect();
          return;
        }

        // Join rooms based on role
        if (client.meta.role === "admin") {
          client.join("admin-dashboard");
        }
      },
    },
  },
});
```

## See Also

- [Lifecycle Hooks](./hooks#authentication-hook) - authenticate hook for JWT validation
- [TypeScript Types](./types#authdata) - AuthData and JwtClaims types
