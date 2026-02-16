import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  defineEvent,
  getEventByName,
  isEventAllowed,
  validateEventData,
} from "../src/define-event.ts";

describe("defineEvent", () => {
  it("creates a simple event without schema", () => {
    const Typing = defineEvent("typing");

    expect(Typing.name).toBe("typing");
    expect(Typing.schema).toBeUndefined();
    expect(Typing.description).toBeUndefined();
  });

  it("creates an event with description", () => {
    const Ping = defineEvent("ping", {
      description: "Health check event",
    });

    expect(Ping.name).toBe("ping");
    expect(Ping.description).toBe("Health check event");
  });

  it("creates an event with Zod schema", () => {
    const Message = defineEvent("message", {
      schema: z.object({
        text: z.string(),
        senderId: z.string(),
      }),
    });

    expect(Message.name).toBe("message");
    expect(Message.schema).toBeDefined();
  });

  it("returns a frozen (immutable) object", () => {
    const Event = defineEvent("test");

    expect(Object.isFrozen(Event)).toBe(true);
    expect(() => {
      // @ts-expect-error - testing immutability
      Event.name = "modified";
    }).toThrow();
  });
});

describe("validateEventData", () => {
  it("passes data through when no schema exists", () => {
    const Event = defineEvent("test");
    const result = validateEventData(Event, { anything: true });

    expect(result.isOk).toBe(true);
    if (result.isOk) {
      expect(result.value).toEqual({ anything: true });
    }
  });

  it("validates data against schema successfully", () => {
    const Message = defineEvent("message", {
      schema: z.object({
        text: z.string(),
        count: z.number(),
      }),
    });

    const result = validateEventData(Message, { text: "hello", count: 5 });

    expect(result.isOk).toBe(true);
    if (result.isOk) {
      expect(result.value).toEqual({ text: "hello", count: 5 });
    }
  });

  it("returns error for invalid data", () => {
    const Message = defineEvent("message", {
      schema: z.object({
        text: z.string().min(1),
      }),
    });

    const result = validateEventData(Message, { text: "" });

    expect(result.isErr).toBe(true);
    if (result.isErr) {
      expect(result.error).toContain("message");
      expect(result.error).toContain("validation failed");
    }
  });

  it("returns error for missing required fields", () => {
    const Message = defineEvent("message", {
      schema: z.object({
        text: z.string(),
        senderId: z.string(),
      }),
    });

    const result = validateEventData(Message, { text: "hello" });

    expect(result.isErr).toBe(true);
    if (result.isErr) {
      expect(result.error).toContain("senderId");
    }
  });

  it("coerces and transforms data through schema", () => {
    const Event = defineEvent("transformed", {
      schema: z.object({
        value: z.coerce.number(),
      }),
    });

    const result = validateEventData(Event, { value: "42" });

    expect(result.isOk).toBe(true);
    if (result.isOk) {
      expect(result.value).toEqual({ value: 42 });
    }
  });
});

describe("isEventAllowed", () => {
  const Message = defineEvent("message");
  const Typing = defineEvent("typing");

  it("blocks all events when events array is empty", () => {
    expect(isEventAllowed("anything", [])).toBe(false);
    expect(isEventAllowed("random", [])).toBe(false);
  });

  it("allows events that are in the list", () => {
    const allowed = [Message, Typing];

    expect(isEventAllowed("message", allowed)).toBe(true);
    expect(isEventAllowed("typing", allowed)).toBe(true);
  });

  it("rejects events not in the list", () => {
    const allowed = [Message, Typing];

    expect(isEventAllowed("reaction", allowed)).toBe(false);
    expect(isEventAllowed("unknown", allowed)).toBe(false);
  });
});

describe("getEventByName", () => {
  const Message = defineEvent("message", { description: "A message event" });
  const Typing = defineEvent("typing");
  const events = [Message, Typing];

  it("finds event by name", () => {
    const found = getEventByName("message", events);

    expect(found).toBeDefined();
    expect(found?.name).toBe("message");
    expect(found?.description).toBe("A message event");
  });

  it("returns undefined for non-existent event", () => {
    const found = getEventByName("unknown", events);

    expect(found).toBeUndefined();
  });

  it("returns undefined for empty event list", () => {
    const found = getEventByName("message", []);

    expect(found).toBeUndefined();
  });
});
