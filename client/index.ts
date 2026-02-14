/**
 * Dialogue Client SDK
 *
 * Frontend client for connecting to Dialogue real-time servers.
 *
 * @example
 * import { createDialogueClient } from 'dialogue-ts/client'
 *
 * const client = createDialogueClient({
 *   url: 'ws://localhost:3000',
 *   auth: { userId: 'user-123' }
 * })
 *
 * await client.connect()
 * const chat = await client.join('chat')
 *
 * chat.on('message', (msg) => {
 *   console.log(`${msg.from}: ${msg.data.text}`)
 * })
 *
 * chat.trigger('message', { text: 'Hello!' })
 */

// biome-ignore lint/performance/noBarrelFile: Intentional public API barrel export
export {
  createDialogueClient,
  type DialogueClientInstance,
} from "./dialogue-client.ts";
export { createRoomContext } from "./room-context.ts";

export type {
  ClientConfig,
  ConnectionResult,
  ConnectionState,
  CreateRoomOptions,
  DialogueError,
  EventHandler,
  EventMessage,
  JoinResult,
  RoomContext,
  RoomInfo,
  WildcardHandler,
} from "./types.ts";
