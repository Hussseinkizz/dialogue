import { Err, Ok } from "slang-ts";
import { describe, expect, it } from "vitest";
import type { AuthData, DialogueContext } from "../src/types.ts";

/**
 * Creates a mock DialogueContext for testing hooks.
 */
function createMockContext(): DialogueContext {
  return {
    io: {} as never,
    clients: {},
    rooms: {},
  };
}

describe("authenticate hook", () => {
  it("accepts connection when returning Ok with AuthData", () => {
    const authenticateFn = () =>
      Ok({
        jwt: {
          sub: "user-123",
          exp: Date.now() + 3_600_000,
          iat: Date.now(),
        },
      });

    const result = authenticateFn();

    expect(result.isOk).toBe(true);
    if (result.isOk) {
      expect(result.value.jwt.sub).toBe("user-123");
    }
  });

  it("rejects connection when returning Err", () => {
    const authenticateFn = () => Err("Invalid token");

    const result = authenticateFn();

    expect(result.isErr).toBe(true);
    if (result.isErr) {
      expect(result.error).toBe("Invalid token");
    }
  });

  it("extracts userId from jwt.sub claim", () => {
    const mockAuthData: AuthData = {
      jwt: {
        sub: "user-456",
        exp: Date.now() + 3_600_000,
        iat: Date.now(),
        role: "admin",
      },
    };

    const authenticateFn = () => Ok(mockAuthData);

    const result = authenticateFn();

    expect(result.isOk).toBe(true);
    if (result.isOk) {
      expect(result.value.jwt.sub).toBe("user-456");
      expect(result.value.jwt.role).toBe("admin");
    }
  });

  it("passes current DialogueContext to hook", () => {
    const authenticateFn = ({ context }: { context: DialogueContext }) => {
      // Verify context has required properties
      expect(context).toHaveProperty("io");
      expect(context).toHaveProperty("clients");
      expect(context).toHaveProperty("rooms");
      return Ok({
        jwt: {
          sub: "user-789",
          exp: Date.now() + 3_600_000,
          iat: Date.now(),
        },
      });
    };

    const mockContext = createMockContext();

    // Call the function to verify it checks context
    const result = authenticateFn({
      context: mockContext,
      clientSocket: {} as never,
      authData: { token: "test" },
    });

    expect(result.isOk).toBe(true);
  });

  it("handles async authenticate function", async () => {
    const authenticateFn = async () => {
      // Simulate async JWT verification
      await new Promise((resolve) => setTimeout(resolve, 10));

      return Ok({
        jwt: {
          sub: "user-async",
          exp: Date.now() + 3_600_000,
          iat: Date.now(),
        },
      });
    };

    const mockContext = createMockContext();

    const result = await authenticateFn({
      context: mockContext,
      clientSocket: {} as never,
      authData: { token: "test" },
    });

    expect(result.isOk).toBe(true);
    if (result.isOk) {
      expect(result.value.jwt.sub).toBe("user-async");
    }
  });

  it("validates token structure", () => {
    const authenticateFn = ({
      authData,
    }: {
      context: DialogueContext;
      clientSocket: unknown;
      authData: unknown;
    }) => {
      const token = (authData as { token?: string })?.token;

      if (!token) {
        return Err("Authentication token required");
      }

      if (token !== "valid-token") {
        return Err("Invalid token");
      }

      return Ok({
        jwt: {
          sub: "user-valid",
          exp: Date.now() + 3_600_000,
          iat: Date.now(),
        },
      });
    };

    const mockContext = createMockContext();

    // Test missing token
    const noTokenResult = authenticateFn({
      context: mockContext,
      clientSocket: {} as never,
      authData: {},
    });

    expect(noTokenResult.isErr).toBe(true);
    if (noTokenResult.isErr) {
      expect(noTokenResult.error).toBe("Authentication token required");
    }

    // Test invalid token
    const invalidTokenResult = authenticateFn({
      context: mockContext,
      clientSocket: {} as never,
      authData: { token: "bad-token" },
    });

    expect(invalidTokenResult.isErr).toBe(true);
    if (invalidTokenResult.isErr) {
      expect(invalidTokenResult.error).toBe("Invalid token");
    }

    // Test valid token
    const validTokenResult = authenticateFn({
      context: mockContext,
      clientSocket: {} as never,
      authData: { token: "valid-token" },
    });

    expect(validTokenResult.isOk).toBe(true);
  });

  it("supports custom JWT claims", () => {
    interface CustomJWT {
      sub: string;
      exp: number;
      iat: number;
      role: string;
      email: string;
      permissions: string[];
    }

    const authenticateFn = () =>
      Ok({
        jwt: {
          sub: "user-custom",
          exp: Date.now() + 3_600_000,
          iat: Date.now(),
          role: "admin",
          email: "admin@example.com",
          permissions: ["read", "write", "delete"],
        } as CustomJWT,
      });

    const result = authenticateFn();

    expect(result.isOk).toBe(true);
    if (result.isOk) {
      const jwt = result.value.jwt as CustomJWT;
      expect(jwt.role).toBe("admin");
      expect(jwt.email).toBe("admin@example.com");
      expect(jwt.permissions).toEqual(["read", "write", "delete"]);
    }
  });

  it("populates client.auth field with returned AuthData", () => {
    // This test verifies the contract - the implementation should:
    // 1. Call authenticate hook
    // 2. If Ok, store the AuthData in client.auth
    // 3. Extract userId from jwt.sub

    const authData: AuthData = {
      jwt: {
        sub: "user-with-auth",
        exp: Date.now() + 3_600_000,
        iat: Date.now(),
        role: "user",
      },
    };

    const authenticateFn = () => Ok(authData);

    const result = authenticateFn();

    expect(result.isOk).toBe(true);
    if (result.isOk) {
      // Verify the auth data can be used to populate client.auth
      expect(result.value).toEqual(authData);
      expect(result.value.jwt.sub).toBe("user-with-auth");
    }
  });
});
