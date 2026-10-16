// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 traccar-ts contributors
//
// Protocol decoders for Traccar/OsmAnd ingestion.
// Ported from traccar-rs osmand.rs and Traccar Java OsmAndProtocolDecoder.

import type { Position } from "./models";

export interface CellTower {
  mcc: number;
  mnc: number;
  lac: number;
  cid: number;
  signal?: number;
}

export interface WifiAccessPoint {
  mac: string;
  signal?: number;
}

export interface Network {
  cellTowers?: CellTower[];
  wifiAccessPoints?: WifiAccessPoint[];
}

export interface OsmAndQueryData {
  id: string;
  lat?: number;
  lon?: number;
  timestamp?: number | string;
  speed?: number;
  bearing?: number;
  heading?: number;
  altitude?: number;
  accuracy?: number;
  batt?: number;
  charge?: boolean;
  hdop?: number;
  driverUniqueId?: string;
  cell?: string | string[];
  wifi?: string | string[];
  location?: string;
  notificationToken?: string;
  valid?: boolean | string | number;
  deviceid?: string;
  [key: string]: any;
}

export interface OsmAndJsonData {
  device_id: string;
  location: {
    coords?: {
      latitude?: number;
      longitude?: number;
      speed?: number;
      heading?: number;
      accuracy?: number;
      altitude?: number;
      speed_accuracy?: number;
      heading_accuracy?: number;
      altitude_accuracy?: number;
      ellipsoidal_altitude?: number;
      floor?: number | null;
    } | null;
    timestamp: number | string;
    is_moving?: boolean;
    battery?: {
      level: number;
      is_charging: boolean;
    };
    event?: string;
    odometer?: number;
    activity?: { type?: string; confidence?: number } | string;
    alarm?: string;
    extras?: Record<string, unknown>;
    mock?: boolean;
    uuid?: string;
    age?: number;
    [key: string]: any;
  };
}

export interface DecodedPosition {
  uniqueId: string;
  position: Partial<Position>;
  notificationToken?: string;
  network?: Network;
}

/** Parse epoch milliseconds, seconds, or date string to ISO-8601 UTC. */
export function parseTimestamp(value: number | string | undefined): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") {
    // Handle ISO-8601 with T
    if (value.includes("T")) {
      const parsed = new Date(value);
      return isNaN(parsed.getTime()) ? null : parsed.toISOString();
    }
    // Handle "yyyy-MM-dd HH:mm:ss"
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})[ ](\d{2}):(\d{2}):(\d{2})$/);
    if (match) {
      const iso = `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}Z`;
      const parsed = new Date(iso);
      return isNaN(parsed.getTime()) ? null : parsed.toISOString();
    }
    // fallback
    const parsed = new Date(value);
    return isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  const ms = value < 1e12 ? value * 1000 : value;
  return new Date(ms).toISOString();
}

/** Convert m/s to knots. */
export function msToKnots(ms: number): number {
  return ms * 1.94384;
}

/** Traccar Java speed conversion (OsmAnd query speed is already knots). */
export function convertSpeedKnots(value: number): number {
  return value;
}

function collectNetwork(cell: string | string[] | undefined, wifi: string | string[] | undefined): Network | undefined {
  let network: Network | undefined;
  const cells = cell === undefined ? [] : Array.isArray(cell) ? cell : [cell];
  const wifis = wifi === undefined ? [] : Array.isArray(wifi) ? wifi : [wifi];
  for (const c of cells) {
    if (!c) continue;
    const parts = String(c).split(",");
    if (parts.length < 4) continue;
    const mcc = parseInt(parts[0]!, 10);
    const mnc = parseInt(parts[1]!, 10);
    const lac = parseInt(parts[2]!, 10);
    const cid = parseInt(parts[3]!, 10);
    const signal = parts.length > 4 ? parseInt(parts[4]!, 10) : undefined;
    if (!network) network = {};
    if (!network.cellTowers) network.cellTowers = [];
    network.cellTowers.push({ mcc, mnc, lac, cid, signal: isNaN(signal as any) ? undefined : signal });
  }
  for (const w of wifis) {
    if (!w) continue;
    const parts = String(w).split(",");
    const macRaw = parts[0] ?? "";
    const signal = parts.length > 1 ? parseInt(parts[1]!, 10) : undefined;
    const mac = macRaw.replace(/-/g, ":").toLowerCase();
    if (!network) network = {};
    if (!network.wifiAccessPoints) network.wifiAccessPoints = [];
    network.wifiAccessPoints.push({ mac, signal: isNaN(signal as any) ? undefined : signal });
  }
  return network;
}

/** Decode OsmAnd query-string parameters. */
export function decodeOsmAndQuery(params: OsmAndQueryData): DecodedPosition {
  const id = (params.deviceid ?? params.id) as string;

  const position: Partial<Position> & { [k: string]: any } = {
    latitude: 0,
    longitude: 0,
    valid: params.valid === undefined ? true : (params.valid === true || params.valid === "true" || params.valid === 1 || params.valid === "1"),
    speed: params.speed ?? 0,
    course: (params.bearing ?? params.heading) ?? 0,
    altitude: params.altitude ?? 0,
    accuracy: params.accuracy ?? 0,
    attributes: {},
  };

  const attrs = position.attributes as Record<string, any>;

  if (params.timestamp !== undefined) {
    position.fixTime = parseTimestamp(params.timestamp as any);
    position.deviceTime = position.fixTime;
  }
  position.serverTime = new Date().toISOString();

  // location "lat,lon"
  let latitude: number | null = params.lat ?? null;
  let longitude: number | null = params.lon ?? null;
  if (params.location && (latitude === null || longitude === null)) {
    const parts = String(params.location).split(",");
    if (parts.length >= 2) {
      latitude = parseFloat(parts[0]!);
      longitude = parseFloat(parts[1]!);
    }
  }
  if (latitude !== null) position.latitude = latitude;
  if (longitude !== null) position.longitude = longitude;

  if (params.batt !== undefined) attrs.batteryLevel = params.batt;
  if (params.charge !== undefined) attrs.charge = Boolean(params.charge);
  if (params.hdop !== undefined) attrs.hdop = params.hdop;
  if (params.driverUniqueId) {
    attrs.driverUniqueId = params.driverUniqueId;
  }
  if (params.cell !== undefined) {
    attrs.cell = params.cell;
  }
  if (params.wifi !== undefined) {
    attrs.wifi = params.wifi;
  }
  if (params.location !== undefined) {
    attrs.location = params.location;
  }

  // collect network if possible (traccar stores parsed; keep raw too)
  const network = collectNetwork(params.cell as any, params.wifi as any);

  // notification token
  let notificationToken: string | undefined = params.notificationToken;
  if (params.driverUniqueId) notificationToken = params.driverUniqueId;

  // default unknown keys
  for (const [k, v] of Object.entries(params)) {
    if (["id", "deviceid", "lat", "lon", "location", "cell", "wifi", "batt", "charge", "hdop", "driverUniqueId",
      "timestamp", "speed", "bearing", "heading", "altitude", "accuracy", "valid", "notificationToken"].includes(k)) continue;
    if (v === undefined || v === null) continue;
    try {
      attrs[k] = typeof v === "string" ? (isNaN(Number(v)) ? (v === "true" ? true : v === "false" ? false : v) : Number(v)) : v;
    } catch {
      attrs[k] = v;
    }
  }

  const result: DecodedPosition = {
    uniqueId: id,
    position,
    notificationToken,
  };
  if (network) result.network = network;
  return result;
}

/** Decode OsmAnd/Traccar Client JSON payload. */
export function decodeOsmAndJson(data: OsmAndJsonData): DecodedPosition {
  const coords = data.location.coords ?? null;
  const position: Partial<Position> & { [k: string]: any } = {
    valid: true,
    speed: 0,
    course: 0,
    altitude: 0,
    accuracy: 0,
    attributes: {},
  };
  const attrs = position.attributes as Record<string, any>;

  if (coords) {
    position.latitude = coords.latitude;
    position.longitude = coords.longitude;
    const speed = coords.speed;
    if (speed !== undefined && speed !== null && speed >= 0) {
      position.speed = speed * 1.94384; // m/s to knots
    }
    const heading = coords.heading;
    if (heading !== undefined && heading !== null && heading >= 0) {
      position.course = heading;
    }
    const accuracy = coords.accuracy;
    // Traccar Java: accuracy applied only if >= osmand.minAccuracy (default 10.0)
    if (accuracy !== undefined && accuracy !== null && accuracy >= 10) {
      position.accuracy = accuracy;
    }
    if (coords.altitude !== undefined && coords.altitude !== null) {
      position.altitude = coords.altitude;
    }
  } else {
    // getLastLocation not implementable offline; leave 0
  }

  position.fixTime = parseTimestamp(data.location.timestamp as any);
  position.deviceTime = position.fixTime;
  position.serverTime = new Date().toISOString();

  if (data.location.event) attrs.event = data.location.event;
  if (data.location.is_moving !== undefined) attrs.motion = data.location.is_moving;
  if (data.location.odometer !== undefined) attrs.odometer = data.location.odometer;
  if (data.location.mock !== undefined) attrs.mock = data.location.mock;
  if (data.location.activity) {
    const act = data.location.activity;
    attrs.activity = typeof act === "string" ? act : act?.type;
  }
  if (data.location.battery) {
    const level = data.location.battery.level;
    if (level !== undefined && level !== null && level >= 0) {
      attrs.batteryLevel = Math.trunc(level * 100);
    }
    attrs.charge = Boolean(data.location.battery.is_charging);
  }
  if (data.location.alarm) {
    attrs.alarm = data.location.alarm;
  }
  if (data.location.extras) {
    attrs.extras = data.location.extras;
    for (const [k, v] of Object.entries(data.location.extras)) {
      if (k === "alarm" && data.location.alarm) continue;
      attrs[k] = v;
    }
  }

  return {
    uniqueId: data.device_id,
    position,
  };
}

// ---- WKT / geo helpers (unchanged) ----
export function parseWktCircle(wkt: string): { lat: number; lon: number; radius: number } | null {
  const match = wkt.match(/CIRCLE\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*,\s*([-\d.]+)\s*\)/i);
  if (!match || !match[1] || !match[2] || !match[3]) return null;
  return { lat: parseFloat(match[1]), lon: parseFloat(match[2]), radius: parseFloat(match[3]) };
}

export function parseWktPolygon(wkt: string): { lat: number; lon: number }[] | null {
  const match = wkt.match(/POLYGON\s*\(\s*\((.*)\)\s*\)/i);
  if (!match || !match[1]) return null;
  const coords = match[1].split(",").map((c) => c.trim());
  const points: { lat: number; lon: number }[] = [];
  for (const coord of coords) {
    const parts = coord.split(/\s+/);
    if (parts.length >= 2 && parts[0] !== undefined && parts[1] !== undefined) {
      points.push({ lon: parseFloat(parts[0]), lat: parseFloat(parts[1]) });
    }
  }
  return points.length > 0 ? points : null;
}

export function pointInCircle(lat: number, lon: number, circle: { lat: number; lon: number; radius: number }): boolean {
  const R = 6371000;
  const dLat = ((circle.lat - lat) * Math.PI) / 180;
  const dLon = ((circle.lon - lon) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat * Math.PI) / 180) * Math.cos((circle.lat * Math.PI) / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c <= circle.radius;
}

export function pointInPolygon(lat: number, lon: number, polygon: { lat: number; lon: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const pi = polygon[i];
    const pj = polygon[j];
    if (pi === undefined || pj === undefined) continue;
    const xi = pi.lon, yi = pi.lat;
    const xj = pj.lon, yj = pj.lat;
    const intersect = ((yi > lat) !== (yj > lat)) && (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}