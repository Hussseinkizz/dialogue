# Dialogue Chat Example

A simple real-time chat application demonstrating the dialogue-ts library.

## Features

- Real-time messaging between multiple users
- User join/leave notifications
- Zod schema validation for message payloads
- Clean, minimal UI

## Prerequisites

- [Bun](https://bun.sh/) - For running the server
- [pnpm](https://pnpm.io/) - For installing dependencies

## Setup

```bash
# Install all dependencies (server + client)
pnpm install:all
```

## Running

Start the server and client in separate terminals:

```bash
# Terminal 1: Start the server (port 3000)
pnpm dev:server

# Terminal 2: Start the client (port 5173)
pnpm dev:client
```

Open http://localhost:5173 in multiple browser tabs to test the chat.

## Project Structure

```
example/
├── package.json          # Root scripts
├── server/
│   ├── package.json      # Server dependencies
│   └── index.js          # Dialogue server with Message, UserJoined, UserLeft events
└── client/
    ├── package.json      # Client dependencies (Vite)
    ├── vite.config.js    # Vite configuration
    ├── index.html        # Chat UI
    └── src/
        ├── main.js       # Client logic using createDialogueClient
        └── style.css     # Chat styling
```

## How It Works

### Server (`server/index.js`)

Defines three events with Zod schemas:
- `message` - Chat messages with `text` and `username`
- `user-joined` - Notifies when a user joins
- `user-left` - Notifies when a user disconnects

### Client (`client/src/main.js`)

Uses `createDialogueClient` to:
1. Connect to the server with a username
2. Join the "general" room
3. Listen for incoming messages and system events
4. Send messages via `room.trigger()`

## Notes

- The server uses CORS enabled by default, allowing direct connections from `localhost:5173`
- Messages are broadcast to all connected clients in the room
- The client imports from `dialogue-ts/client` (the published package entry point)
