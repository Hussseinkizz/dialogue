import type { Hono } from "hono";
import type { Result } from "slang-ts";
import type { Server, Socket } from "socket.io";
import type { z } from "zod";

/**
 * Structured log entry for Dialogue logging.
 */
export interface LogEntry {
  /** The message describing what happened */
  message: string;
  /** The function or location where the log originated */
  atFunction: string;
  /** Additional data for context */
  data: unknown;
}

/**
 * Logger interface for Dialogue.
 * Implement this interface to provide custom logging behavior.
 * By default, Dialogue uses a console-based logger.
 */
export interface Logger {
  /** Log debug information (verbose, development only) */
  debug: (entry: LogEntry) => void;
  /** Log informational messages */
  info: (entry: LogEntry) => void;
  /** Log warning messages (non-critical issues) */
  warn: (entry: LogEntry) => void;
  /** Log error messages (critical issues) */
  error: (entry: LogEntry) => void;
}

/**
 * Event definition - defines a named event with optional schema validation.
 * Events are first-class citizens in Dialogue, not just message payloads.
 *
 * @template T - The data type this event carries
 */
export interface EventDefinition<T = unknown> {
  readonly name: string;
  readonly description?: string;
  readonly schema?: z.ZodType<T>;
  readonly history?: EventHistoryConfig;
}

/**
 * Configuration for event history storage.
 * When enabled, events of this type are stored in memory per room.
 */
export interface EventHistoryConfig {
  /** Whether to store this event type in history */
  enabled: boolean;
  /** Maximum number of events to keep in memory per room */
  limit: number;
}

/**
 * Room configuration - defines a room's properties and allowed events.
 * Used when creating rooms in DialogueConfig.
 */
export interface RoomConfig {
  name: string;
  description?: string;
  /** Max concurrent connections. Undefined means unlimited. */
  maxSize?: number;
  /** Events allowed in this room. Empty array means any event allowed. */
  events: EventDefinition<unknown>[];
  /** Event names to auto-subscribe clients to on join */
  defaultSubscriptions?: string[];
  /** User ID of room creator for ownership tracking */
  createdById?: string;
  /** Auto-send history on join. true = all history, number = limit per event type */
  syncHistoryOnJoin?: boolean | number;
}

/**
 * CORS configuration for Socket.IO server.
 * Set to true to allow all origins, or specify allowed origins.
 */
export interface CorsConfig {
  /** Allowed origins. Use "*" or true for all origins. */
  origin: string | string[] | boolean;
  /** Allowed HTTP methods */
  methods?: string[];
  /** Whether to allow credentials (cookies, auth headers) */
  credentials?: boolean;
}

/**
 * JWT claims structure for client authentication.
 * Standard JWT payload format with extensibility.
 */
export interface JwtClaims {
  /** Subject - typically the user ID */
  sub: string;
  /** Expiration timestamp (Unix time in seconds) */
  exp?: number;
  /** Issued at timestamp (Unix time in seconds) */
  iat?: number;
  /** Additional custom claims */
  [key: string]: unknown;
}

/**
 * Authentication data stored on each client after successful authentication.
 * Supports JWT-based auth with room for future authentication methods.
 */
export interface AuthData {
  /** JWT claims/payload */
  jwt: JwtClaims;
  /** Future authentication-related fields can be added here */
  [key: string]: unknown;
}

/**
 * Result of a successful authentication.
 * Provides the resolved user identity and metadata.
 */
export interface AuthenticateResult {
  /** Resolved application user ID */
  userId: string;
  /** Additional metadata (role, permissions, etc.) */
  meta: Record<string, unknown>;
}

/**
 * Global runtime context representing the current state of the Dialogue server.
 * Provides awareness of all connected clients, active rooms, and the Socket.IO server.
 * This context is passed to all hooks alongside case-specific data.
 */
export interface DialogueContext {
  /** The Socket.IO server instance */
  io: Server;
  /** Map of all connected clients, keyed by client ID */
  clients: Record<string, ConnectedClient>;
  /** Map of all active rooms, keyed by room ID */
  rooms: Record<string, Room>;
}

/**
 * Hooks configuration for lifecycle events.
 * Use hooks to respond to room, client, and event lifecycle events.
 *
 * Hooks prefixed with "before" run before the action and can block it (return Err to deny).
 * Hooks prefixed with "after" run after the action for side-effects (fire-and-forget).
 * Hooks prefixed with "on" are legacy notification hooks (fire-and-forget).
 *
 * All hooks receive a DialogueContext containing global runtime state (io, clients, rooms)
 * along with case-specific data relevant to that particular hook.
 */
export interface HooksConfig {
  socket?: {
    /**
     * Called during Socket.IO handshake before connection is accepted.
     * Return Ok(authData) with JWT claims to accept, Err("reason") to reject.
     * The authData will be stored in the client's auth field.
     */
    authenticate?: (params: {
      context: DialogueContext;
      clientSocket: Socket;
      authData: unknown;
    }) => Result<AuthData, string> | Promise<Result<AuthData, string>>;

    /**
     * Called when a client socket connects.
     * Receives the global context and the newly connected client socket.
     */
    onConnect?: (params: {
      context: DialogueContext;
      clientSocket: Socket;
    }) => void | Promise<void>;

    /**
     * Called when a client socket disconnects.
     * Receives the global context and the disconnecting client socket.
     */
    onDisconnect?: (params: {
      context: DialogueContext;
      clientSocket: Socket;
    }) => void | Promise<void>;
  };
  rooms?: {
    /** Called when a room is created */
    onCreated?: (room: Room) => void | Promise<void>;
    /** Called when a room is updated */
    onUpdated?: (room: Room) => void | Promise<void>;
    /** Called when a room is deleted */
    onDeleted?: (roomId: string) => void | Promise<void>;
  };
  clients?: {
    /**
     * Called synchronously before a client joins a room. Can deny room access.
     * Return Ok(undefined) to allow, Err("reason") to deny.
     * When denied, the client receives a dialogue:error with code JOIN_DENIED.
     * Must be synchronous to preserve real-time performance.
     */
    beforeJoin?: (params: {
      context: DialogueContext;
      client: ConnectedClient;
      roomId: string;
      room: Room;
    }) => Result<void, string>;
    /** Called when a client connects */
    onConnected?: (client: ConnectedClient) => void | Promise<void>;
    /** Called when a client disconnects */
    onDisconnected?: (client: ConnectedClient) => void | Promise<void>;
    /** Called when a client joins a room */
    onJoined?: (
      client: ConnectedClient,
      roomId: string
    ) => void | Promise<void>;
    /** Called when a client leaves a room */
    onLeft?: (client: ConnectedClient, roomId: string) => void | Promise<void>;
  };
  events?: {
    /**
     * Called synchronously before each event is broadcast. Can block or transform events.
     * Return Ok(message) with the (possibly modified) message to proceed.
     * Return Err("reason") to block the event from being broadcast.
     * Must be synchronous to preserve real-time performance.
     */
    beforeEach?: (params: {
      context: DialogueContext;
      roomId: string;
      message: EventMessage;
      from: string;
    }) => Result<EventMessage, string>;
    /**
     * Called synchronously after each event is broadcast. Fire-and-forget for side-effects.
     * Useful for logging, analytics, metrics, etc.
     * Must be synchronous to preserve real-time performance.
     */
    afterEach?: (params: {
      context: DialogueContext;
      roomId: string;
      message: EventMessage;
      recipientCount: number;
    }) => void;
    /** Called when an event is triggered */
    onTriggered?: (roomId: string, event: EventMessage) => void | Promise<void>;
    /** Called when events are evicted from in-memory history (oldest first) */
    onCleanup?: (
      roomId: string,
      eventName: string,
      events: EventMessage[]
    ) => void | Promise<void>;
    /** Called to load historical events beyond in-memory (for pagination) */
    onLoad?: (
      roomId: string,
      eventName: string,
      start: number,
      end: number
    ) => Promise<EventMessage[]>;
  };
}

/**
 * Main dialogue configuration - passed to createDialogue.
 * Defines all rooms and their events upfront for config-first approach.
 */
export interface DialogueConfig {
  /** Port to run server on. Optional if using existing app. */
  port?: number;
  /** Existing Hono app to attach to. Creates new one if not provided. */
  app?: Hono;
  /** Room configurations keyed by room ID */
  rooms: Record<string, RoomConfig>;
  /** Lifecycle hooks for rooms, clients, and events */
  hooks?: HooksConfig;
  /** Custom logger implementation. Uses default console logger if not provided. */
  logger?: Logger;
  /** CORS configuration. Defaults to allowing all origins in development. */
  cors?: CorsConfig | boolean;
}

/**
 * Message envelope - the shape of all messages sent between clients and server.
 * Same structure for both directions (incoming and outgoing).
 *
 * @template T - The data payload type
 */
export interface EventMessage<T = unknown> {
  event: string;
  roomId: string;
  data: T;
  /** User ID of sender */
  from: string;
  timestamp: number;
  /** Optional metadata for flexible additional context */
  meta?: Record<string, unknown>;
}

/**
 * Room instance - runtime representation of a room with methods.
 * Manages connections, subscriptions, and event broadcasting.
 */
export interface Room {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly maxSize?: number;
  readonly events: EventDefinition<unknown>[];
  readonly defaultSubscriptions: string[];
  readonly createdById?: string;

  /**
   * Trigger event to all subscribers in this room.
   * Validates data against schema if event has one.
   * @returns Result<void, string> - Ok if successful, Err with validation message if failed
   */
  trigger<T>(
    event: EventDefinition<T>,
    data: T,
    from?: string,
    meta?: Record<string, unknown>
  ): Result<void, string>;

  /**
   * Subscribe to events in this room with a callback.
   * For backend side-effects like logging, persistence, notifications.
   * @returns Unsubscribe function
   */
  on<T>(
    event: EventDefinition<T>,
    handler: (msg: EventMessage<T>) => void | Promise<void>
  ): () => void;

  /** Current connection count */
  size(): number;

  /** Check if room is at maxSize capacity */
  isFull(): boolean;

  /** Get all participants in this room */
  participants(): ConnectedClient[];

  /**
   * Get historical events for this room (paginated, newest first).
   * @param eventName - Event type to get history for
   * @param start - Starting index (0 = most recent)
   * @param end - Ending index (exclusive)
   * @returns Events from start to end, empty array if event has no history
   */
  history(
    eventName: string,
    start: number,
    end: number
  ): Promise<EventMessage[]>;
}

/**
 * Connected client - represents a connected socket with user context.
 * Provides methods for room management and event subscriptions.
 */
export interface ConnectedClient {
  /** Unique client/session ID */
  readonly id: string;
  /** Application user ID from auth */
  readonly userId: string;
  /** Underlying Socket.IO socket */
  readonly socket: Socket;
  /** Additional user metadata (role, permissions, etc.) */
  readonly meta: Record<string, unknown>;
  /** Authentication data (JWT claims and related info) */
  readonly auth?: AuthData;

  /** Join a room by ID */
  join(roomId: string): void;

  /** Leave a room by ID */
  leave(roomId: string): void;

  /** Subscribe to specific event in a room */
  subscribe(roomId: string, eventName: string): void;

  /** Subscribe to all events in a room (wildcard) */
  subscribeAll(roomId: string): void;

  /** Unsubscribe from event in a room */
  unsubscribe(roomId: string, eventName: string): void;

  /** Get list of room IDs this client is in */
  rooms(): string[];

  /** Get subscribed event names for a room */
  subscriptions(roomId: string): string[];

  /** Send data directly to this client only */
  send<T>(event: string, data: T): void;

  /** Disconnect this client */
  disconnect(): void;
}

/**
 * Represents a user's rooms with helper methods.
 * Returned by dialogue.getClientRooms() for managing user room membership.
 */
export interface ClientRooms {
  /** Array of room IDs the user is currently in */
  readonly ids: string[];

  /**
   * Execute a callback for each room the user is in.
   * Does not modify room membership - use for broadcasting, logging, etc.
   * @param callback - Function called for each room
   */
  forAll(callback: (roomId: string) => void): void;

  /**
   * Remove the user from all rooms.
   * Optionally execute a callback for each room before leaving.
   * @param callback - Optional function called for each room before leaving
   */
  leaveAll(callback?: (roomId: string) => void): void;
}

/**
 * Main Dialogue instance - the core API returned by createDialogue.
 * Use this to trigger events, subscribe to events, and manage rooms.
 */
export interface Dialogue {
  /** The Hono app instance (provided or created) */
  readonly app: Hono;
  /** The Socket.IO server instance */
  readonly io: Server;

  /**
   * Trigger event to all subscribers in a room.
   * Call this from anywhere in your backend (API routes, jobs, webhooks).
   * @returns Result<void, string> - Ok if successful, Err with validation message if failed
   */
  trigger<T>(
    roomId: string,
    event: EventDefinition<T>,
    data: T,
    from?: string,
    meta?: Record<string, unknown>
  ): Result<void, string>;

  /**
   * Subscribe with callback for backend side-effects.
   * Useful for logging, persistence, triggering other events.
   * @returns Unsubscribe function
   */
  on<T>(
    roomId: string,
    event: EventDefinition<T>,
    handler: (msg: EventMessage<T>) => void | Promise<void>
  ): () => void;

  /** Get room by ID */
  room(id: string): Room | null;

  /** Get all rooms */
  rooms(): Room[];

  /**
   * Create a new room at runtime
   * @param id - Unique room identifier
   * @param config - Room configuration
   * @returns The created Room instance, or null if room already exists
   */
  createRoom(id: string, config: RoomConfig): Room | null;

  /**
   * Delete a room at runtime
   * @param id - Room ID to delete
   * @returns true if room was deleted, false if it didn't exist
   */
  deleteRoom(id: string): boolean;

  /**
   * Get a connected client by user ID.
   * Returns array since a user may have multiple connections (tabs/devices).
   * @param userId - The user ID to look up
   * @returns Array of connected clients for this user
   */
  getClients(userId: string): ConnectedClient[];

  /**
   * Get all connected clients
   * @returns Array of all connected clients
   */
  getAllClients(): ConnectedClient[];

  /**
   * Get rooms that a user is currently in with helper methods.
   * Aggregates rooms across all connections for this user.
   * @param userId - The user ID to look up
   * @returns ClientRooms object with room IDs and utility methods
   */
  getClientRooms(userId: string): ClientRooms;

  /**
   * Check if a user is in a specific room
   * @param userId - The user ID to check
   * @param roomId - The room ID to check
   * @returns true if the user is in the room
   */
  isInRoom(userId: string, roomId: string): boolean;

  /** Start the server */
  start(): Promise<void>;

  /** Stop the server */
  stop(): Promise<void>;
}

/**
 * Internal room manager interface - used internally to coordinate rooms.
 */
export interface RoomManager {
  get(id: string): Room | null;
  all(): Room[];
  addParticipant(roomId: string, client: ConnectedClient): boolean;
  removeParticipant(roomId: string, clientId: string): void;
}
