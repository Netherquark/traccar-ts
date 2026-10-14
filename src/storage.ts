// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 traccar-ts contributors
//
// Storage abstraction - ported from traccar-rs Store trait.

import type { Position, Device, User, Event, Command, QueuedCommand, Notification, ShareToken, Group, Geofence } from "./models";

export type EntityKind =
  | "user"
  | "device"
  | "group"
  | "geofence"
  | "calendar"
  | "driver"
  | "maintenance"
  | "order"
  | "attribute"
  | "command"
  | "queuedCommand"
  | "notification"
  | "event"
  | "permission"
  | "position"
  | "server"
  | "revokedToken"
  | "audit"
  | "shareToken";

export interface Filter {
  kind: EntityKind;
  conditions: Array<{ field: string; operator: "=" | "!=" | ">" | "<" | ">=" | "<=" | "LIKE"; value: unknown }>;
  limit?: number;
  offset?: number;
  orderBy?: { field: string; direction: "ASC" | "DESC" };
}

export interface Store {
  // Generic CRUD
  get(kind: EntityKind, id: number): Promise<unknown | null>;
  set(kind: EntityKind, id: number, data: unknown): Promise<void>;
  delete(kind: EntityKind, id: number): Promise<void>;
  query(filter: Filter): Promise<unknown[]>;
  count(kind: EntityKind, conditions?: Filter["conditions"]): Promise<number>;

  // Specialized queries
  getDeviceByUniqueId(uniqueId: string): Promise<Device | null>;
  getUserByEmail(email: string): Promise<User | null>;
  getPositionsByDevice(deviceId: number, from?: string, to?: string, limit?: number): Promise<Position[]>;
  getEventsByDevice(deviceId: number, from?: string, to?: string, limit?: number): Promise<Event[]>;
  getQueuedCommands(deviceId: number): Promise<QueuedCommand[]>;
  markCommandSent(commandId: number): Promise<void>;
  getShareToken(token: string): Promise<ShareToken | null>;
  revokeShareToken(token: string): Promise<void>;
}

/** In-memory store implementation for testing. */
export class MemoryStore implements Store {
  private data = new Map<string, Map<number, unknown>>();
  private counters = new Map<string, number>();

  private getMap(kind: EntityKind): Map<number, unknown> {
    if (!this.data.has(kind)) {
      this.data.set(kind, new Map());
    }
    return this.data.get(kind)!;
  }

  private nextId(kind: EntityKind): number {
    const current = this.counters.get(kind) ?? 0;
    const next = current + 1;
    this.counters.set(kind, next);
    return next;
  }

  async get(kind: EntityKind, id: number): Promise<unknown | null> {
    return this.getMap(kind).get(id) ?? null;
  }

  async set(kind: EntityKind, id: number, data: unknown): Promise<void> {
    this.getMap(kind).set(id, data);
  }

  async delete(kind: EntityKind, id: number): Promise<void> {
    this.getMap(kind).delete(id);
  }

  async query(filter: Filter): Promise<unknown[]> {
    const map = this.getMap(filter.kind);
    let results = Array.from(map.values());
    for (const cond of filter.conditions) {
      results = results.filter((item: unknown) => {
        const value = this.getNestedValue(item, cond.field);
        switch (cond.operator) {
          case "=": return value === cond.value;
          case "!=": return value !== cond.value;
          case ">": return (value as number) > (cond.value as number);
          case "<": return (value as number) < (cond.value as number);
          case ">=": return (value as number) >= (cond.value as number);
          case "<=": return (value as number) <= (cond.value as number);
          case "LIKE": return String(value).includes(String(cond.value));
        }
      });
    }
    if (filter.orderBy) {
      results.sort((a: unknown, b: unknown) => {
        const av = this.getNestedValue(a, filter.orderBy!.field);
        const bv = this.getNestedValue(b, filter.orderBy!.field);
        const dir = filter.orderBy!.direction === "ASC" ? 1 : -1;
        if (av == null && bv == null) return 0;
        if (av == null) return -dir;
        if (bv == null) return dir;
        if (av > bv) return dir;
        if (av < bv) return -dir;
        return 0;
      });
    }
    if (filter.offset) results = results.slice(filter.offset);
    if (filter.limit) results = results.slice(0, filter.limit);
    return results;
  }

  async count(kind: EntityKind, conditions?: Filter["conditions"]): Promise<number> {
    if (!conditions || conditions.length === 0) {
      return this.getMap(kind).size;
    }
    const results = await this.query({ kind, conditions });
    return results.length;
  }

  async getDeviceByUniqueId(uniqueId: string): Promise<Device | null> {
    const map = this.getMap("device");
    for (const device of map.values()) {
      if ((device as Device).uniqueId === uniqueId) return device as Device;
    }
    return null;
  }

  async getUserByEmail(email: string): Promise<User | null> {
    const map = this.getMap("user");
    for (const user of map.values()) {
      if ((user as User).email === email) return user as User;
    }
    return null;
  }

  async getPositionsByDevice(deviceId: number, from?: string, to?: string, limit?: number): Promise<Position[]> {
    const map = this.getMap("position");
    let results = Array.from(map.values()) as Position[];
    results = results.filter((p) => p.deviceId === deviceId);
    if (from) results = results.filter((p) => p.fixTime && p.fixTime >= from);
    if (to) results = results.filter((p) => p.fixTime && p.fixTime <= to);
    results.sort((a, b) => (a.fixTime ?? "").localeCompare(b.fixTime ?? ""));
    if (limit) results = results.slice(0, limit);
    return results;
  }

  async getEventsByDevice(deviceId: number, from?: string, to?: string, limit?: number): Promise<Event[]> {
    const map = this.getMap("event");
    let results = Array.from(map.values()) as Event[];
    results = results.filter((e) => e.deviceId === deviceId);
    if (from) results = results.filter((e) => e.eventTime >= from);
    if (to) results = results.filter((e) => e.eventTime <= to);
    results.sort((a, b) => a.eventTime.localeCompare(b.eventTime));
    if (limit) results = results.slice(0, limit);
    return results;
  }

  async getQueuedCommands(deviceId: number): Promise<QueuedCommand[]> {
    const map = this.getMap("queuedCommand");
    return Array.from(map.values())
      .filter((c) => (c as QueuedCommand).deviceId === deviceId && (c as QueuedCommand).status === "queued") as QueuedCommand[];
  }

  async markCommandSent(commandId: number): Promise<void> {
    const cmd = (await this.get("queuedCommand", commandId)) as QueuedCommand | null;
    if (cmd) {
      await this.set("queuedCommand", commandId, { ...cmd, status: "sent" });
    }
  }

  async getShareToken(token: string): Promise<ShareToken | null> {
    const map = this.getMap("shareToken");
    for (const st of map.values()) {
      if ((st as ShareToken).token === token) return st as ShareToken;
    }
    return null;
  }

  async revokeShareToken(token: string): Promise<void> {
    const map = this.getMap("shareToken");
    for (const [id, st] of map.entries()) {
      if ((st as ShareToken).token === token) {
        map.delete(id);
        break;
      }
    }
  }

  private getNestedValue(obj: unknown, path: string): unknown {
    return path.split(".").reduce((acc: unknown, key: string) => (acc as Record<string, unknown>)?.[key], obj);
  }
}