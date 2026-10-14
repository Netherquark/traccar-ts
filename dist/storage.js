// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 ASK / Riding Kompanion contributors
//
// Storage abstraction - ported from traccar-rs Store trait.
/** In-memory store implementation for testing. */
export class MemoryStore {
    data = new Map();
    counters = new Map();
    getMap(kind) {
        if (!this.data.has(kind)) {
            this.data.set(kind, new Map());
        }
        return this.data.get(kind);
    }
    nextId(kind) {
        const current = this.counters.get(kind) ?? 0;
        const next = current + 1;
        this.counters.set(kind, next);
        return next;
    }
    async get(kind, id) {
        return this.getMap(kind).get(id) ?? null;
    }
    async set(kind, id, data) {
        this.getMap(kind).set(id, data);
    }
    async delete(kind, id) {
        this.getMap(kind).delete(id);
    }
    async query(filter) {
        const map = this.getMap(filter.kind);
        let results = Array.from(map.values());
        for (const cond of filter.conditions) {
            results = results.filter((item) => {
                const value = this.getNestedValue(item, cond.field);
                switch (cond.operator) {
                    case "=": return value === cond.value;
                    case "!=": return value !== cond.value;
                    case ">": return value > cond.value;
                    case "<": return value < cond.value;
                    case ">=": return value >= cond.value;
                    case "<=": return value <= cond.value;
                    case "LIKE": return String(value).includes(String(cond.value));
                }
            });
        }
        if (filter.orderBy) {
            results.sort((a, b) => {
                const av = this.getNestedValue(a, filter.orderBy.field);
                const bv = this.getNestedValue(b, filter.orderBy.field);
                const dir = filter.orderBy.direction === "ASC" ? 1 : -1;
                return av > bv ? dir : av < bv ? -dir : 0;
            });
        }
        if (filter.offset)
            results = results.slice(filter.offset);
        if (filter.limit)
            results = results.slice(0, filter.limit);
        return results;
    }
    async count(kind, conditions) {
        if (!conditions || conditions.length === 0) {
            return this.getMap(kind).size;
        }
        const results = await this.query({ kind, conditions });
        return results.length;
    }
    async getDeviceByUniqueId(uniqueId) {
        const map = this.getMap("device");
        for (const device of map.values()) {
            if (device.uniqueId === uniqueId)
                return device;
        }
        return null;
    }
    async getUserByEmail(email) {
        const map = this.getMap("user");
        for (const user of map.values()) {
            if (user.email === email)
                return user;
        }
        return null;
    }
    async getPositionsByDevice(deviceId, from, to, limit) {
        const map = this.getMap("position");
        let results = Array.from(map.values());
        results = results.filter((p) => p.deviceId === deviceId);
        if (from)
            results = results.filter((p) => p.fixTime && p.fixTime >= from);
        if (to)
            results = results.filter((p) => p.fixTime && p.fixTime <= to);
        results.sort((a, b) => (a.fixTime ?? "").localeCompare(b.fixTime ?? ""));
        if (limit)
            results = results.slice(0, limit);
        return results;
    }
    async getEventsByDevice(deviceId, from, to, limit) {
        const map = this.getMap("event");
        let results = Array.from(map.values());
        results = results.filter((e) => e.deviceId === deviceId);
        if (from)
            results = results.filter((e) => e.eventTime >= from);
        if (to)
            results = results.filter((e) => e.eventTime <= to);
        results.sort((a, b) => a.eventTime.localeCompare(b.eventTime));
        if (limit)
            results = results.slice(0, limit);
        return results;
    }
    async getQueuedCommands(deviceId) {
        const map = this.getMap("queuedCommand");
        return Array.from(map.values())
            .filter((c) => c.deviceId === deviceId && c.status === "queued");
    }
    async markCommandSent(commandId) {
        const cmd = (await this.get("queuedCommand", commandId));
        if (cmd) {
            await this.set("queuedCommand", commandId, { ...cmd, status: "sent" });
        }
    }
    async getShareToken(token) {
        const map = this.getMap("shareToken");
        for (const st of map.values()) {
            if (st.token === token)
                return st;
        }
        return null;
    }
    async revokeShareToken(token) {
        const map = this.getMap("shareToken");
        for (const [id, st] of map.entries()) {
            if (st.token === token) {
                map.delete(id);
                break;
            }
        }
    }
    getNestedValue(obj, path) {
        return path.split(".").reduce((acc, key) => acc?.[key], obj);
    }
}
//# sourceMappingURL=storage.js.map