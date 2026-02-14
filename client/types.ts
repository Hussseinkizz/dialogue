/**
 * Client-side type definitions for Dialogue
 * These types mirror the backend types for consistent API
 */

/**
 * Configuration for DialogueClient
 */
export interface ClientConfig {
  /** WebSocket server URL (e.g., 'ws://localhost:3000' or 'wss://example.com') */
  url: string;
  /** Authentication data sent with connection */
  auth?: {
    /** User ID for identification */
    userId?: string;
    /** JWT or other auth token */
    token?: string;
    /** Additional auth data */
    [key: string]: unknown;
  };
  /** Auto-connect on instantiation (default: true) */
  autoConnect?: boolean;
  /** Reconnection options */
  reconnection?: boolean;
  /** Number of reconnection attempts */
  reconnectionAttempts?: number;
}

/**
 * Room info returned by listRooms
 */
export interface RoomInfo {
  id: string;
  name: string;
  description?: string;
  size: number;
  maxSize?: number;
  createdById?: string;
}

/**
 * Options for creating a room
 */
export interface CreateRoomOptions {
  /** Unique room identifier */
  id: string;
  /** Human-readable room name */
  name: string;
  /** Room description */
  description?: string;
  /** Maximum number of participants */
  maxSize?: number;
}

/**
 * Event message received from server
 * Matches EventMessage from backend
 */
export interface EventMessage<T = unknown> {
  event: string;
  roomId: string;
  data: T;
  from: string;
  timestamp: number;
}

/**
 * Error response from server
 */
export interface DialogueError {
  code: string;
  message: string;
}

/**
 * Connection result emitted on successful connect
 */
export interface ConnectionResult {
  clientId: string;
  userId: string;
}

/**
 * Room join result
 */
export interface JoinResult {
  roomId: string;
  roomName: string;
}

/**
 * History response from server (sent on join or via getHistory)
 */
export interface HistoryResponse {
  roomId: string;
  events: EventMessage[];
}

/**
 * Paginated history response from getHistory request
 */
export interface HistoryResponsePaginated {
  roomId: string;
  eventName: string | null;
  events: EventMessage[];
  start: number;
  end: number;
}

/**
 * Room context - represents a joined room with methods
 */
export interface RoomContext {
  /** Room ID */
  readonly roomId: string;
  /** Room name */
  readonly roomName: string;

  /**
   * Trigger an event in this room
   * @param eventName - Event name to trigger
   * @param data - Event payload data
   */
  trigger<T>(eventName: string, data: T): void;

  /**
   * Listen for a specific event
   * @param eventName - Event name to listen for
   * @param handler - Callback when event received
   * @returns Unsubscribe function
   */
  on<T>(eventName: string, handler: (msg: EventMessage<T>) => void): () => void;

  /**
   * Listen for all events in this room
   * @param handler - Callback for any event
   * @returns Unsubscribe function
   */
  onAny(
    handler: (eventName: string, msg: EventMessage<unknown>) => void
  ): () => void;

  /**
   * Subscribe to additional event type
   * @param eventName - Event name to subscribe to
   */
  subscribe(eventName: string): void;

  /**
   * Subscribe to all events in this room
   * Tells the server to send all events from this room to this client
   */
  subscribeAll(): void;

  /**
   * Unsubscribe from event type
   * @param eventName - Event name to unsubscribe from
   */
  unsubscribe(eventName: string): void;

  /**
   * Get historical events for this room (paginated, newest first)
   * @param eventName - Event type to get history for
   * @param start - Starting index (0 = most recent)
   * @param end - Ending index (exclusive)
   * @returns Promise resolving to array of events
   */
  getHistory<T = unknown>(
    eventName: string,
    start?: number,
    end?: number
  ): Promise<EventMessage<T>[]>;

  /**
   * Leave this room
   */
  leave(): void;
}

/**
 * Event handler type
 */
export type EventHandler<T = unknown> = (msg: EventMessage<T>) => void;

/**
 * Wildcard event handler type
 */
export type WildcardHandler = (
  eventName: string,
  msg: EventMessage<unknown>
) => void;

/**
 * Connection state
 */
export type ConnectionState = "disconnected" | "connecting" | "connected";
