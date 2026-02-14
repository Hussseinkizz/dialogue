/**
 * Dialogue - A config-first, event-centric real-time communication library
 *
 * @example
 * import { createDialogue, defineEvent } from './dialogue'
 * import { z } from 'zod'
 *
 * const Message = defineEvent('message', {
 *   schema: z.object({ text: z.string() })
 * })
 *
 * export const dialogue = createDialogue({
 *   port: 3000,
 *   rooms: {
 *     chat: { name: 'Chat', events: [Message] }
 *   }
 * })
 */

// biome-ignore lint/performance/noBarrelFile: Intentional public API barrel export
export { createDialogue } from "./create-dialogue.ts";
export {
  defineEvent,
  getEventByName,
  isEventAllowed,
  validateEventData,
} from "./define-event.ts";
export type { HistoryManager, HistoryManagerConfig } from "./history.ts";
export { createHistoryManager } from "./history.ts";
export { createDefaultLogger, createSilentLogger } from "./logger.ts";
export type { RateLimiter, RateLimiterConfig } from "./rate-limiter.ts";
export { createRateLimiter } from "./rate-limiter.ts";
export type {
  AuthData,
  AuthenticateResult,
  ConnectedClient,
  CorsConfig,
  Dialogue,
  DialogueConfig,
  DialogueContext,
  EventDefinition,
  EventHistoryConfig,
  EventMessage,
  HooksConfig,
  JwtClaims,
  LogEntry,
  Logger,
  Room,
  RoomConfig,
  RoomManager,
} from "./types.ts";
