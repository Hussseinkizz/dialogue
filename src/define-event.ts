import { Err, Ok, type Result } from "slang-ts";
import type { z } from "zod";
import type { EventDefinition, EventHistoryConfig } from "./types.ts";

/**
 * Options for defining an event
 */
interface DefineEventOptions<T> {
  /** Zod schema for validating event data */
  schema?: z.ZodType<T>;
  /** Human-readable description of the event */
  description?: string;
  /** History configuration - when enabled, events are stored in memory */
  history?: EventHistoryConfig;
}

/**
 * Creates a typed event definition for use in rooms.
 * Events are immutable once created.
 *
 * @param name - Unique event name (e.g., 'message', 'order:updated')
 * @param options - Optional schema and description
 * @returns Frozen event definition object
 *
 * @example
 * // Simple event without validation
 * const Typing = defineEvent('typing')
 *
 * @example
 * // Event with Zod schema validation
 * const Message = defineEvent('message', {
 *   schema: z.object({
 *     text: z.string().min(1).max(1000),
 *     senderId: z.string()
 *   }),
 *   description: 'Chat message sent by a user',
 *   history: { enabled: true, limit: 50 }
 * })
 *
 * @example
 * // Event with inferred type from schema
 * const OrderUpdated = defineEvent('order:updated', {
 *   schema: z.object({
 *     orderId: z.string(),
 *     status: z.enum(['pending', 'shipped', 'delivered'])
 *   })
 * })
 * // Type of data is inferred as { orderId: string, status: 'pending' | 'shipped' | 'delivered' }
 */
export function defineEvent<T = unknown>(
  name: string,
  options?: DefineEventOptions<T>
): EventDefinition<T> {
  const definition: EventDefinition<T> = {
    name,
    description: options?.description,
    schema: options?.schema,
    history: options?.history,
  };

  return Object.freeze(definition);
}

/**
 * Validates event data against its schema if one exists.
 * Returns a Result with either parsed data or error message.
 *
 * @param event - The event definition with optional schema
 * @param data - Data to validate
 * @returns Result<T, string> - Ok with data or Err with validation message
 */
export function validateEventData<T>(
  event: EventDefinition<T>,
  data: unknown
): Result<T, string> {
  if (!event.schema) {
    return Ok(data as T);
  }

  const result = event.schema.safeParse(data);

  if (result.success) {
    return Ok(result.data);
  }

  const errorMessages = result.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join(", ");

  return Err(`Event '${event.name}' validation failed: ${errorMessages}`);
}

/**
 * Checks if an event is allowed in a room based on the room's event list.
 * If the room has no events defined (empty array), all events are allowed.
 *
 * @param eventName - Name of the event to check
 * @param allowedEvents - List of allowed events for the room
 * @returns True if event is allowed
 */
export function isEventAllowed(
  eventName: string,
  allowedEvents: EventDefinition<unknown>[]
): boolean {
  if (allowedEvents.length === 0) {
    return true;
  }

  return allowedEvents.some((e) => e.name === eventName);
}

/**
 * Gets an event definition by name from a list of events.
 *
 * @param eventName - Name of the event to find
 * @param events - List of event definitions to search
 * @returns The event definition or undefined if not found
 */
export function getEventByName(
  eventName: string,
  events: EventDefinition<unknown>[]
): EventDefinition<unknown> | undefined {
  return events.find((e) => e.name === eventName);
}
