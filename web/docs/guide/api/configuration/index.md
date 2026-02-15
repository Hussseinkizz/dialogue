---
title: Configuration Guide
description: All configuration options for Dialogue, including event definitions, room configurations, and server settings
---

# Configuration Guide

This guide covers all configuration options for Dialogue, including event definitions, room configurations, and server settings.

## Overview

Dialogue uses a config-first approach where all rooms and events are defined upfront. This enables type safety, validation, and predictable behavior across your application.

## Topics

- **[Event Definitions](./events)** - Define events with schema validation using Zod
- **[Room Configuration](./rooms)** - Configure rooms, capacity limits, and default subscriptions
- **[Dialogue Configuration](./dialogue-config)** - Main server configuration, CORS, and options
- **[Lifecycle Hooks](./hooks)** - Client, room, socket, and event lifecycle hooks
- **[Authentication](./authentication)** - Client authentication and JWT setup
- **[TypeScript Types](./types)** - Type definitions and interfaces
