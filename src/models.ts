// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 traccar-ts contributors
//
// Traccar protocol types - wire format compatible with Traccar 6.16.0.

export interface Position {
  id: number;
  deviceId: number;
  protocol: string | null;
  deviceTime: string | null;
  fixTime: string | null;
  serverTime: string;
  valid: boolean;
  latitude: number;
  longitude: number;
  altitude: number;
  speed: number;
  course: number;
  address: string | null;
  accuracy: number;
  network: Network | null;
  geofenceIds: number[] | null;
  attributes: Record<string, unknown>;
}

export interface Network {
  cellTowers: CellTower[];
  wifiAccessPoints: WifiAccessPoint[];
}

export interface CellTower {
  mcc: number;
  mnc: number;
  lac: number;
  cid: number;
  signalStrength: number;
}

export interface WifiAccessPoint {
  macAddress: string;
  signalStrength: number;
}

export interface Device {
  id: number;
  name: string;
  uniqueId: string;
  status: "online" | "offline" | "unknown";
  disabled: boolean;
  groupId: number | null;
  lastUpdate: string | null;
  positionId: number | null;
  attributes: Record<string, unknown>;
}

export interface User {
  id: number;
  name: string;
  email: string;
  password: string;
  readonly: boolean;
  administrator: boolean;
  deviceLimit: number;
  userLimit: number;
  deviceReadonly: boolean;
  expirationTime: string | null;
  attributes: Record<string, unknown>;
}

export interface Event {
  id: number;
  deviceId: number;
  type: string;
  eventTime: string;
  attributes: Record<string, unknown>;
  geofenceId: number | null;
  maintenanceId: number | null;
  geofenceIds: number[] | null;
}

export interface Command {
  id: number;
  deviceId: number;
  type: string;
  textChannel: boolean;
  attributes: Record<string, unknown>;
}

export interface QueuedCommand extends Command {
  status: "queued" | "sent" | "delivered" | "failed";
}

export interface Notification {
  id: number;
  name: string;
  type: string;
  notificators: string[];
  always: boolean;
  attributes: Record<string, unknown>;
}

export interface ShareToken {
  token: string;
  userId: number;
  deviceIds: number[];
  groupIds: number[];
  expirationTime: string | null;
  readonly: boolean;
}

export interface Permission {
  userId: number;
  deviceId: number;
  groupId: number;
}

export interface Group {
  id: number;
  name: string;
  parentId: number | null;
}

export interface Geofence {
  id: number;
  name: string;
  area: string;
  attributes: Record<string, unknown>;
}