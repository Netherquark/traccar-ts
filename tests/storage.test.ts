// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 traccar-ts contributors
//
// Storage tests - ported from traccar-rs storage tests.

import { describe, it, expect, beforeEach } from "vitest";
import { MemoryStore } from "../src/storage.ts";
import type { Device, User, Position, Event, QueuedCommand, ShareToken } from "../src/models.ts";

describe("MemoryStore", () => {
  let store: MemoryStore;

  beforeEach(() => {
    store = new MemoryStore();
  });

  describe("generic CRUD", () => {
    it("sets and gets data", async () => {
      await store.set("device", 1, { id: 1, name: "test", uniqueId: "unique-1" } as Device);
      const result = await store.get("device", 1);
      expect(result).toEqual({ id: 1, name: "test", uniqueId: "unique-1" });
    });

    it("returns null for missing id", async () => {
      const result = await store.get("device", 999);
      expect(result).toBeNull();
    });

    it("deletes data", async () => {
      await store.set("device", 1, { id: 1, name: "test", uniqueId: "unique-1" } as Device);
      await store.delete("device", 1);
      const result = await store.get("device", 1);
      expect(result).toBeNull();
    });

    it("queries with conditions", async () => {
      await store.set("device", 1, { id: 1, name: "test1", uniqueId: "unique-1", groupId: 10 } as Device);
      await store.set("device", 2, { id: 2, name: "test2", uniqueId: "unique-2", groupId: 20 } as Device);

      const results = await store.query({
        kind: "device",
        conditions: [{ field: "groupId", operator: "=", value: 10 }],
      });

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({ id: 1, name: "test1", uniqueId: "unique-1", groupId: 10 });
    });

    it("queries with multiple conditions", async () => {
      await store.set("device", 1, { id: 1, name: "test1", uniqueId: "unique-1", groupId: 10, disabled: false } as Device);
      await store.set("device", 2, { id: 2, name: "test2", uniqueId: "unique-2", groupId: 10, disabled: true } as Device);

      const results = await store.query({
        kind: "device",
        conditions: [
          { field: "groupId", operator: "=", value: 10 },
          { field: "disabled", operator: "=", value: false },
        ],
      });

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe(1);
    });

    it("respects limit and offset", async () => {
      for (let i = 1; i <= 10; i++) {
        await store.set("device", i, { id: i, name: `test${i}`, uniqueId: `unique-${i}` } as Device);
      }

      const results = await store.query({
        kind: "device",
        conditions: [],
        limit: 3,
        offset: 2,
      });

      expect(results).toHaveLength(3);
    });

    it("orders results", async () => {
      await store.set("device", 3, { id: 3, name: "test3", uniqueId: "unique-3" } as Device);
      await store.set("device", 1, { id: 1, name: "test1", uniqueId: "unique-1" } as Device);
      await store.set("device", 2, { id: 2, name: "test2", uniqueId: "unique-2" } as Device);

      const results = await store.query({
        kind: "device",
        conditions: [],
        orderBy: { field: "id", direction: "ASC" },
      });

      expect(results.map(r => (r as Device).id)).toEqual([1, 2, 3]);
    });

    it("counts all items", async () => {
      await store.set("device", 1, { id: 1, name: "test1", uniqueId: "unique-1" } as Device);
      await store.set("device", 2, { id: 2, name: "test2", uniqueId: "unique-2" } as Device);

      const count = await store.count("device");
      expect(count).toBe(2);
    });

    it("counts with conditions", async () => {
      await store.set("device", 1, { id: 1, name: "test1", uniqueId: "unique-1", groupId: 10 } as Device);
      await store.set("device", 2, { id: 2, name: "test2", uniqueId: "unique-2", groupId: 20 } as Device);

      const count = await store.count("device", [{ field: "groupId", operator: "=", value: 10 }]);
      expect(count).toBe(1);
    });
  });

  describe("specialized queries", () => {
    it("getDeviceByUniqueId finds device", async () => {
      await store.set("device", 1, { id: 1, name: "test", uniqueId: "unique-123" } as Device);
      const device = await store.getDeviceByUniqueId("unique-123");
      expect(device).not.toBeNull();
      expect(device?.uniqueId).toBe("unique-123");
    });

    it("getDeviceByUniqueId returns null for missing", async () => {
      const device = await store.getDeviceByUniqueId("nonexistent");
      expect(device).toBeNull();
    });

    it("getUserByEmail finds user", async () => {
      await store.set("user", 1, { id: 1, name: "Test User", email: "test@example.com", password: "hash" } as User);
      const user = await store.getUserByEmail("test@example.com");
      expect(user).not.toBeNull();
      expect(user?.email).toBe("test@example.com");
    });

    it("getPositionsByDevice filters by device", async () => {
      await store.set("position", 1, { id: 1, deviceId: 1, latitude: 37.7749, longitude: -122.4194, fixTime: "2023-01-01T00:00:00Z" } as Position);
      await store.set("position", 2, { id: 2, deviceId: 2, latitude: 37.7749, longitude: -122.4194, fixTime: "2023-01-01T00:00:00Z" } as Position);

      const positions = await store.getPositionsByDevice(1);
      expect(positions).toHaveLength(1);
      expect(positions[0].deviceId).toBe(1);
    });

    it("getPositionsByDevice filters by time range", async () => {
      await store.set("position", 1, { id: 1, deviceId: 1, latitude: 37.7749, longitude: -122.4194, fixTime: "2023-01-01T00:00:00Z" } as Position);
      await store.set("position", 2, { id: 2, deviceId: 1, latitude: 37.7749, longitude: -122.4194, fixTime: "2023-01-02T00:00:00Z" } as Position);

      const positions = await store.getPositionsByDevice(1, "2023-01-01T12:00:00Z", "2023-01-02T12:00:00Z");
      expect(positions).toHaveLength(1);
      expect(positions[0].fixTime).toBe("2023-01-02T00:00:00Z");
    });

    it("getEventsByDevice filters by device", async () => {
      await store.set("event", 1, { id: 1, deviceId: 1, type: "test", eventTime: "2023-01-01T00:00:00Z" } as Event);
      await store.set("event", 2, { id: 2, deviceId: 2, type: "test", eventTime: "2023-01-01T00:00:00Z" } as Event);

      const events = await store.getEventsByDevice(1);
      expect(events).toHaveLength(1);
      expect(events[0].deviceId).toBe(1);
    });

    it("getQueuedCommands returns only queued commands", async () => {
      await store.set("queuedCommand", 1, { id: 1, deviceId: 1, type: "test", status: "queued" } as QueuedCommand);
      await store.set("queuedCommand", 2, { id: 2, deviceId: 1, type: "test", status: "sent" } as QueuedCommand);

      const commands = await store.getQueuedCommands(1);
      expect(commands).toHaveLength(1);
      expect(commands[0].status).toBe("queued");
    });

    it("markCommandSent updates status", async () => {
      await store.set("queuedCommand", 1, { id: 1, deviceId: 1, type: "test", status: "queued" } as QueuedCommand);
      await store.markCommandSent(1);

      const commands = await store.getQueuedCommands(1);
      expect(commands).toHaveLength(0);

      const cmd = await store.get("queuedCommand", 1) as QueuedCommand;
      expect(cmd.status).toBe("sent");
    });

    it("getShareToken finds token", async () => {
      await store.set("shareToken", 1, { token: "secret-token", userId: 1, deviceIds: [1], groupIds: [] } as ShareToken);
      const token = await store.getShareToken("secret-token");
      expect(token).not.toBeNull();
      expect(token?.token).toBe("secret-token");
    });

    it("revokeShareToken removes token", async () => {
      await store.set("shareToken", 1, { token: "secret-token", userId: 1, deviceIds: [1], groupIds: [] } as ShareToken);
      await store.revokeShareToken("secret-token");

      const token = await store.getShareToken("secret-token");
      expect(token).toBeNull();
    });
  });
});