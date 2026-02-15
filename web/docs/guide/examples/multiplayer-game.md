---
title: Multiplayer Game
description: A simple multiplayer game with player positions and game state
---

# Multiplayer Game

A simple multiplayer game with player positions and game state.

## Backend Configuration

```typescript
// game.config.ts
import { createDialogue, defineEvent } from "./dialogue";
import { z } from "zod";

export const PlayerMove = defineEvent("player:move", {
  schema: z.object({
    playerId: z.string(),
    x: z.number(),
    y: z.number(),
    direction: z.enum(["up", "down", "left", "right"]),
  }),
});

export const GameState = defineEvent("game:state", {
  schema: z.object({
    players: z.array(
      z.object({
        id: z.string(),
        x: z.number(),
        y: z.number(),
        health: z.number(),
        score: z.number(),
      })
    ),
    gameTime: z.number(),
    status: z.enum(["waiting", "playing", "ended"]),
  }),
});

export const PlayerAction = defineEvent("player:action", {
  schema: z.object({
    playerId: z.string(),
    action: z.enum(["attack", "defend", "heal", "special"]),
    targetId: z.string().optional(),
  }),
});

export const dialogue = createDialogue({
  port: 3000,
  rooms: {
    "game:lobby": {
      name: "Game Lobby",
      events: [GameState],
      maxSize: 8,
      defaultSubscriptions: ["game:state"],
    },
    "game:match-1": {
      name: "Match 1",
      events: [PlayerMove, GameState, PlayerAction],
      maxSize: 4,
      defaultSubscriptions: ["player:move", "game:state", "player:action"],
    },
  },
  hooks: {
    clients: {
      onConnected: (client) => {
        client.join("game:lobby");
      },
    },
  },
});

// Game loop - broadcast state 30 times per second
const TICK_RATE = 1000 / 30;

setInterval(() => {
  const gameState = computeGameState();

  dialogue.trigger("game:match-1", GameState, {
    players: gameState.players,
    gameTime: gameState.time,
    status: gameState.status,
  });
}, TICK_RATE);

// Handle player moves
dialogue.on("game:match-1", PlayerMove, (msg) => {
  updatePlayerPosition(msg.data.playerId, msg.data.x, msg.data.y);
});

// Handle player actions
dialogue.on("game:match-1", PlayerAction, (msg) => {
  processPlayerAction(msg.data.playerId, msg.data.action, msg.data.targetId);
});
```

*This documentation reflects the current implementation and is subject to evolution. Contributions and feedback are welcome.*
