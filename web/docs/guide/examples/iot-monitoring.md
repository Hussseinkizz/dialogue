---
title: IoT Monitoring
description: Real-time monitoring of IoT devices with sensor data
---

# IoT Device Monitoring

Real-time monitoring of IoT devices with sensor data.

## Backend Configuration

```typescript
// iot.config.ts
import { createDialogue, defineEvent } from "./dialogue";
import { z } from "zod";

export const SensorReading = defineEvent("sensor:reading", {
  schema: z.object({
    deviceId: z.string(),
    temperature: z.number(),
    humidity: z.number(),
    pressure: z.number(),
    battery: z.number().min(0).max(100),
    timestamp: z.number(),
  }),
});

export const DeviceStatus = defineEvent("device:status", {
  schema: z.object({
    deviceId: z.string(),
    status: z.enum(["online", "offline", "error", "maintenance"]),
    lastSeen: z.number(),
  }),
});

export const DeviceAlert = defineEvent("device:alert", {
  schema: z.object({
    deviceId: z.string(),
    alertType: z.enum(["temperature", "battery", "connectivity", "error"]),
    message: z.string(),
    value: z.number().optional(),
    threshold: z.number().optional(),
  }),
});

export const dialogue = createDialogue({
  port: 3000,
  rooms: {
    sensors: {
      name: "Sensor Data",
      description: "Real-time sensor readings",
      events: [SensorReading, DeviceStatus, DeviceAlert],
      defaultSubscriptions: ["sensor:reading", "device:status", "device:alert"],
    },
  },
});

// Process incoming sensor data (e.g., from MQTT bridge)
export function processSensorData(data: {
  deviceId: string;
  temperature: number;
  humidity: number;
  pressure: number;
  battery: number;
}): void {
  const reading = {
    ...data,
    timestamp: Date.now(),
  };

  // Broadcast to dashboard
  dialogue.trigger("sensors", SensorReading, reading, data.deviceId);

  // Check for alerts
  if (data.temperature > 40) {
    dialogue.trigger(
      "sensors",
      DeviceAlert,
      {
        deviceId: data.deviceId,
        alertType: "temperature",
        message: `High temperature detected: ${data.temperature}°C`,
        value: data.temperature,
        threshold: 40,
      },
      "system"
    );
  }

  if (data.battery < 20) {
    dialogue.trigger(
      "sensors",
      DeviceAlert,
      {
        deviceId: data.deviceId,
        alertType: "battery",
        message: `Low battery: ${data.battery}%`,
        value: data.battery,
        threshold: 20,
      },
      "system"
    );
  }
}
```

*This documentation reflects the current implementation and is subject to evolution. Contributions and feedback are welcome.*
