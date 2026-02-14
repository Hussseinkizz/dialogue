import { Err, Ok } from "slang-ts";
import { describe, expect, it, vi } from "vitest";
import type {
  ConnectedClient,
  DialogueContext,
  HooksConfig,
  Room,
} from "../src/types.ts";

describe("beforeJoin hook", () => {
  it("allows room join when returning Ok", () => {
    const beforeJoinFn = vi.fn(() => Ok(undefined));

    const hooks: HooksConfig = {
      clients: {
        beforeJoin: beforeJoinFn,
      },
    };

    expect(hooks.clients?.beforeJoin).toBeDefined();
  });

  it("denies room join when returning Err", () => {
    const beforeJoinFn = vi.fn(() => Err("Access denied"));

    const mockClient: ConnectedClient = {
      id: "socket-123",
      userId: "user-456",
      meta: {},
      auth: {
        jwt: {
          sub: "user-456",
          exp: Date.now() + 3_600_000,
          iat: Date.now(),
        },
      },
      send: vi.fn(),
      emit: vi.fn(),
      join: vi.fn(),
      leave: vi.fn(),
      leaveAll: vi.fn(),
      disconnect: vi.fn(),
    };

    const mockRoom: Room = {
      id: "room-789",
      name: "Private Room",
      meta: {},
      broadcast: vi.fn(),
      emit: vi.fn(),
      getClients: vi.fn(() => []),
      hasClient: vi.fn(() => false),
      delete: vi.fn(),
    };

    const result = beforeJoinFn({
      context: {
        io: {} as never,
        clients: {},
        rooms: {},
      },
      client: mockClient,
      roomId: "room-789",
      room: mockRoom,
    });

    expect(result.isErr).toBe(true);
    if (result.isErr) {
      expect(result.error).toBe("Access denied");
    }
  });

  it("passes DialogueContext to hook", () => {
    const beforeJoinFn = vi.fn(({ context }: { context: DialogueContext }) => {
      // Verify context has required properties
      expect(context).toHaveProperty("io");
      expect(context).toHaveProperty("clients");
      expect(context).toHaveProperty("rooms");
      return Ok(undefined);
    });

    const mockClient: ConnectedClient = {
      id: "socket-123",
      userId: "user-456",
      meta: {},
      send: vi.fn(),
      emit: vi.fn(),
      join: vi.fn(),
      leave: vi.fn(),
      leaveAll: vi.fn(),
      disconnect: vi.fn(),
    };

    const mockRoom: Room = {
      id: "room-test",
      name: "Test Room",
      meta: {},
      broadcast: vi.fn(),
      emit: vi.fn(),
      getClients: vi.fn(() => []),
      hasClient: vi.fn(() => false),
      delete: vi.fn(),
    };

    const result = beforeJoinFn({
      context: {
        io: {} as never,
        clients: {},
        rooms: {},
      },
      client: mockClient,
      roomId: "room-test",
      room: mockRoom,
    });

    expect(result.isOk).toBe(true);
    expect(beforeJoinFn).toHaveBeenCalled();
  });

  it("enforces role-based access control", () => {
    const beforeJoinFn = vi.fn(
      ({ client, room }: { client: ConnectedClient; room: Room }) => {
        const userRole = client.auth?.jwt?.role as string | undefined;
        const requiredRole = room.meta?.requiredRole as string | undefined;

        if (requiredRole && userRole !== requiredRole) {
          return Err(`Requires ${requiredRole} role`);
        }

        return Ok(undefined);
      }
    );

    // Test admin user accessing admin room - should succeed
    const adminClient: ConnectedClient = {
      id: "socket-admin",
      userId: "user-admin",
      meta: {},
      auth: {
        jwt: {
          sub: "user-admin",
          exp: Date.now() + 3_600_000,
          iat: Date.now(),
          role: "admin",
        },
      },
      send: vi.fn(),
      emit: vi.fn(),
      join: vi.fn(),
      leave: vi.fn(),
      leaveAll: vi.fn(),
      disconnect: vi.fn(),
    };

    const adminRoom: Room = {
      id: "admin-room",
      name: "Admin Room",
      meta: { requiredRole: "admin" },
      broadcast: vi.fn(),
      emit: vi.fn(),
      getClients: vi.fn(() => []),
      hasClient: vi.fn(() => false),
      delete: vi.fn(),
    };

    const adminResult = beforeJoinFn({
      context: { io: {} as never, clients: {}, rooms: {} },
      client: adminClient,
      roomId: "admin-room",
      room: adminRoom,
    });

    expect(adminResult.isOk).toBe(true);

    // Test regular user accessing admin room - should fail
    const regularClient: ConnectedClient = {
      id: "socket-user",
      userId: "user-regular",
      meta: {},
      auth: {
        jwt: {
          sub: "user-regular",
          exp: Date.now() + 3_600_000,
          iat: Date.now(),
          role: "user",
        },
      },
      send: vi.fn(),
      emit: vi.fn(),
      join: vi.fn(),
      leave: vi.fn(),
      leaveAll: vi.fn(),
      disconnect: vi.fn(),
    };

    const userResult = beforeJoinFn({
      context: { io: {} as never, clients: {}, rooms: {} },
      client: regularClient,
      roomId: "admin-room",
      room: adminRoom,
    });

    expect(userResult.isErr).toBe(true);
    if (userResult.isErr) {
      expect(userResult.error).toBe("Requires admin role");
    }
  });

  it("checks room capacity limits", () => {
    const beforeJoinFn = vi.fn(({ room }: { room: Room }) => {
      const maxCapacity = room.meta?.maxCapacity as number | undefined;
      const currentCount = room.getClients().length;

      if (maxCapacity && currentCount >= maxCapacity) {
        return Err("Room is full");
      }

      return Ok(undefined);
    });

    const mockClient: ConnectedClient = {
      id: "socket-new",
      userId: "user-new",
      meta: {},
      send: vi.fn(),
      emit: vi.fn(),
      join: vi.fn(),
      leave: vi.fn(),
      leaveAll: vi.fn(),
      disconnect: vi.fn(),
    };

    // Test room with space available
    const roomWithSpace: Room = {
      id: "room-space",
      name: "Room With Space",
      meta: { maxCapacity: 5 },
      broadcast: vi.fn(),
      emit: vi.fn(),
      getClients: vi.fn(() => [{}, {}, {}]), // 3 clients
      hasClient: vi.fn(() => false),
      delete: vi.fn(),
    };

    const spaceResult = beforeJoinFn({
      context: { io: {} as never, clients: {}, rooms: {} },
      client: mockClient,
      roomId: "room-space",
      room: roomWithSpace,
    });

    expect(spaceResult.isOk).toBe(true);

    // Test full room
    const fullRoom: Room = {
      id: "room-full",
      name: "Full Room",
      meta: { maxCapacity: 3 },
      broadcast: vi.fn(),
      emit: vi.fn(),
      getClients: vi.fn(() => [{}, {}, {}]), // 3 clients (at capacity)
      hasClient: vi.fn(() => false),
      delete: vi.fn(),
    };

    const fullResult = beforeJoinFn({
      context: { io: {} as never, clients: {}, rooms: {} },
      client: mockClient,
      roomId: "room-full",
      room: fullRoom,
    });

    expect(fullResult.isErr).toBe(true);
    if (fullResult.isErr) {
      expect(fullResult.error).toBe("Room is full");
    }
  });

  it("validates invite-only room access", () => {
    const beforeJoinFn = vi.fn(
      ({ client, room }: { client: ConnectedClient; room: Room }) => {
        const isInviteOnly = room.meta?.inviteOnly as boolean | undefined;
        const invitedUsers = (room.meta?.invitedUsers as string[]) ?? [];

        if (isInviteOnly && !invitedUsers.includes(client.userId)) {
          return Err("Not invited to this room");
        }

        return Ok(undefined);
      }
    );

    const invitedClient: ConnectedClient = {
      id: "socket-invited",
      userId: "user-invited",
      meta: {},
      send: vi.fn(),
      emit: vi.fn(),
      join: vi.fn(),
      leave: vi.fn(),
      leaveAll: vi.fn(),
      disconnect: vi.fn(),
    };

    const uninvitedClient: ConnectedClient = {
      id: "socket-uninvited",
      userId: "user-uninvited",
      meta: {},
      send: vi.fn(),
      emit: vi.fn(),
      join: vi.fn(),
      leave: vi.fn(),
      leaveAll: vi.fn(),
      disconnect: vi.fn(),
    };

    const inviteOnlyRoom: Room = {
      id: "private-room",
      name: "Private Room",
      meta: {
        inviteOnly: true,
        invitedUsers: ["user-invited", "user-another"],
      },
      broadcast: vi.fn(),
      emit: vi.fn(),
      getClients: vi.fn(() => []),
      hasClient: vi.fn(() => false),
      delete: vi.fn(),
    };

    // Invited user should succeed
    const invitedResult = beforeJoinFn({
      context: { io: {} as never, clients: {}, rooms: {} },
      client: invitedClient,
      roomId: "private-room",
      room: inviteOnlyRoom,
    });

    expect(invitedResult.isOk).toBe(true);

    // Uninvited user should fail
    const uninvitedResult = beforeJoinFn({
      context: { io: {} as never, clients: {}, rooms: {} },
      client: uninvitedClient,
      roomId: "private-room",
      room: inviteOnlyRoom,
    });

    expect(uninvitedResult.isErr).toBe(true);
    if (uninvitedResult.isErr) {
      expect(uninvitedResult.error).toBe("Not invited to this room");
    }
  });

  it("allows bypassing checks for public rooms", () => {
    const beforeJoinFn = vi.fn(({ room }: { room: Room }) => {
      const isPublic = room.meta?.public as boolean | undefined;

      // Public rooms allow anyone
      if (isPublic) {
        return Ok(undefined);
      }

      // Non-public rooms could have additional checks
      return Ok(undefined);
    });

    const anyClient: ConnectedClient = {
      id: "socket-any",
      userId: "user-any",
      meta: {},
      send: vi.fn(),
      emit: vi.fn(),
      join: vi.fn(),
      leave: vi.fn(),
      leaveAll: vi.fn(),
      disconnect: vi.fn(),
    };

    const publicRoom: Room = {
      id: "public-room",
      name: "Public Room",
      meta: { public: true },
      broadcast: vi.fn(),
      emit: vi.fn(),
      getClients: vi.fn(() => []),
      hasClient: vi.fn(() => false),
      delete: vi.fn(),
    };

    const result = beforeJoinFn({
      context: { io: {} as never, clients: {}, rooms: {} },
      client: anyClient,
      roomId: "public-room",
      room: publicRoom,
    });

    expect(result.isOk).toBe(true);
  });

  it("accesses client auth data for authorization", () => {
    const beforeJoinFn = vi.fn(({ client }: { client: ConnectedClient }) => {
      // Ensure client has valid auth
      if (!client.auth?.jwt) {
        return Err("Authentication required");
      }

      // Check if token is expired
      const now = Date.now();
      if (client.auth.jwt.exp < now) {
        return Err("Token expired");
      }

      return Ok(undefined);
    });

    // Client with valid auth
    const validClient: ConnectedClient = {
      id: "socket-valid",
      userId: "user-valid",
      meta: {},
      auth: {
        jwt: {
          sub: "user-valid",
          exp: Date.now() + 3_600_000, // Future expiry
          iat: Date.now(),
        },
      },
      send: vi.fn(),
      emit: vi.fn(),
      join: vi.fn(),
      leave: vi.fn(),
      leaveAll: vi.fn(),
      disconnect: vi.fn(),
    };

    // Client with expired token
    const expiredClient: ConnectedClient = {
      id: "socket-expired",
      userId: "user-expired",
      meta: {},
      auth: {
        jwt: {
          sub: "user-expired",
          exp: Date.now() - 3_600_000, // Past expiry
          iat: Date.now() - 7_200_000,
        },
      },
      send: vi.fn(),
      emit: vi.fn(),
      join: vi.fn(),
      leave: vi.fn(),
      leaveAll: vi.fn(),
      disconnect: vi.fn(),
    };

    // Client without auth
    const unauthClient: ConnectedClient = {
      id: "socket-unauth",
      userId: "user-unauth",
      meta: {},
      send: vi.fn(),
      emit: vi.fn(),
      join: vi.fn(),
      leave: vi.fn(),
      leaveAll: vi.fn(),
      disconnect: vi.fn(),
    };

    const mockRoom: Room = {
      id: "test-room",
      name: "Test Room",
      meta: {},
      broadcast: vi.fn(),
      emit: vi.fn(),
      getClients: vi.fn(() => []),
      hasClient: vi.fn(() => false),
      delete: vi.fn(),
    };

    // Valid client should succeed
    const validResult = beforeJoinFn({
      context: { io: {} as never, clients: {}, rooms: {} },
      client: validClient,
      roomId: "test-room",
      room: mockRoom,
    });

    expect(validResult.isOk).toBe(true);

    // Expired client should fail
    const expiredResult = beforeJoinFn({
      context: { io: {} as never, clients: {}, rooms: {} },
      client: expiredClient,
      roomId: "test-room",
      room: mockRoom,
    });

    expect(expiredResult.isErr).toBe(true);
    if (expiredResult.isErr) {
      expect(expiredResult.error).toBe("Token expired");
    }

    // Unauthenticated client should fail
    const unauthResult = beforeJoinFn({
      context: { io: {} as never, clients: {}, rooms: {} },
      client: unauthClient,
      roomId: "test-room",
      room: mockRoom,
    });

    expect(unauthResult.isErr).toBe(true);
    if (unauthResult.isErr) {
      expect(unauthResult.error).toBe("Authentication required");
    }
  });
});
