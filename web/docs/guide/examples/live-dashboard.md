---
title: Live Dashboard
description: A real-time dashboard showing live metrics and updates
---

# Live Dashboard

A real-time dashboard showing live metrics and updates.

## Backend Configuration

```typescript
// dashboard.config.ts
import { createDialogue, defineEvent } from "./dialogue";
import { z } from "zod";

export const MetricsUpdate = defineEvent("metrics:update", {
  schema: z.object({
    cpu: z.number().min(0).max(100),
    memory: z.number().min(0).max(100),
    requests: z.number(),
    errors: z.number(),
    latency: z.number(),
  }),
});

export const AlertTriggered = defineEvent("alert:triggered", {
  schema: z.object({
    alertId: z.string(),
    severity: z.enum(["low", "medium", "high", "critical"]),
    message: z.string(),
    timestamp: z.number(),
  }),
});

export const dialogue = createDialogue({
  port: 3000,
  rooms: {
    dashboard: {
      name: "Dashboard",
      description: "Real-time metrics dashboard",
      events: [MetricsUpdate, AlertTriggered],
      defaultSubscriptions: ["metrics:update", "alert:triggered"],
    },
  },
  hooks: {
    clients: {
      onConnected: (client) => {
        // Only admins can view dashboard
        if (client.meta.role === "admin") {
          client.join("dashboard");
        }
      },
    },
  },
});

// Broadcast metrics every second
setInterval(async () => {
  const metrics = await collectMetrics();

  dialogue.trigger("dashboard", MetricsUpdate, {
    cpu: metrics.cpuUsage,
    memory: metrics.memoryUsage,
    requests: metrics.requestsPerSecond,
    errors: metrics.errorsPerSecond,
    latency: metrics.avgLatency,
  });
}, 1000);

// Send alerts when thresholds exceeded
async function checkAlerts(): Promise<void> {
  const metrics = await collectMetrics();

  if (metrics.cpuUsage > 90) {
    dialogue.trigger("dashboard", AlertTriggered, {
      alertId: `cpu-${Date.now()}`,
      severity: "high",
      message: `CPU usage critical: ${metrics.cpuUsage}%`,
      timestamp: Date.now(),
    });
  }
}
```

*This documentation reflects the current implementation and is subject to evolution. Contributions and feedback are welcome.*
