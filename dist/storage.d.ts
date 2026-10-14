import type { Position, Device, User, Event, QueuedCommand, ShareToken } from "./models.ts";
export type EntityKind = "user" | "device" | "group" | "geofence" | "calendar" | "driver" | "maintenance" | "order" | "attribute" | "command" | "queuedCommand" | "notification" | "event" | "permission" | "position" | "server" | "revokedToken" | "audit";
export interface Filter {
    kind: EntityKind;
    conditions: Array<{
        field: string;
        operator: "=" | "!=" | ">" | "<" | ">=" | "<=" | "LIKE";
        value: unknown;
    }>;
    limit?: number;
    offset?: number;
    orderBy?: {
        field: string;
        direction: "ASC" | "DESC";
    };
}
export interface Store {
    get(kind: EntityKind, id: number): Promise<unknown | null>;
    set(kind: EntityKind, id: number, data: unknown): Promise<void>;
    delete(kind: EntityKind, id: number): Promise<void>;
    query(filter: Filter): Promise<unknown[]>;
    count(kind: EntityKind, conditions?: Filter["conditions"]): Promise<number>;
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
export declare class MemoryStore implements Store {
    private data;
    private counters;
    private getMap;
    private nextId;
    get(kind: EntityKind, id: number): Promise<unknown | null>;
    set(kind: EntityKind, id: number, data: unknown): Promise<void>;
    delete(kind: EntityKind, id: number): Promise<void>;
    query(filter: Filter): Promise<unknown[]>;
    count(kind: EntityKind, conditions?: Filter["conditions"]): Promise<number>;
    getDeviceByUniqueId(uniqueId: string): Promise<Device | null>;
    getUserByEmail(email: string): Promise<User | null>;
    getPositionsByDevice(deviceId: number, from?: string, to?: string, limit?: number): Promise<Position[]>;
    getEventsByDevice(deviceId: number, from?: string, to?: string, limit?: number): Promise<Event[]>;
    getQueuedCommands(deviceId: number): Promise<QueuedCommand[]>;
    markCommandSent(commandId: number): Promise<void>;
    getShareToken(token: string): Promise<ShareToken | null>;
    revokeShareToken(token: string): Promise<void>;
    private getNestedValue;
}
//# sourceMappingURL=storage.d.ts.map