// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 traccar-ts contributors
//
// Protocol decoders for Traccar/OsmAnd ingestion.
// Ported from traccar-rs osmand.rs

import type { Position } from "./models";

export interface OsmAndQueryData {
  id: string;
  lat: number;
  lon: number;
  timestamp?: number;
  speed?: number;
  bearing?: number;
  altitude?: number;
  accuracy?: number;
  batt?: number;
  charge?: boolean;
  hdop?: number;
  driverUniqueId?: string;
  cell?: string;
  wifi?: string;
  location?: string;
}

export interface OsmAndJsonData {
  device_id: string;
  location: {
    coords: {
      latitude: number;
      longitude: number;
      speed?: number;
      heading?: number;
      accuracy?: number;
      altitude?: number;
    };
    timestamp: number;
    is_moving?: boolean;
    battery?: {
      level: number;
      is_charging: boolean;
    };
    event?: string;
    odometer?: number;
    activity?: string;
    alarm?: string;
    extras?: Record<string, unknown>;
  };
}

export interface DecodedPosition {
  uniqueId: string;
  position: Partial<Position>;
  notificationToken?: string;
}

/** Parse epoch milliseconds, seconds, or ISO string to ISO-8601 UTC. */
export function parseTimestamp(value: number | string | undefined): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") {
    const parsed = new Date(value);
    return isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  // Heuristic: if value < 1e12, treat as seconds; else milliseconds
  const ms = value < 1e12 ? value * 1000 : value;
  return new Date(ms).toISOString();
}

/** Decode OsmAnd query-string parameters. */
export function decodeOsmAndQuery(params: OsmAndQueryData): DecodedPosition {
  const position: Partial<Position> = {
    latitude: params.lat,
    longitude: params.lon,
    valid: true,
    speed: params.speed ?? 0,
    course: params.bearing ?? 0,
    altitude: params.altitude ?? 0,
    accuracy: params.accuracy ?? 0,
    attributes: {},
  };

  if (params.timestamp !== undefined) {
    position.fixTime = parseTimestamp(params.timestamp);
    position.deviceTime = position.fixTime;
  }
  position.serverTime = new Date().toISOString();

  if (params.batt !== undefined) {
    (position.attributes ??= {}).batteryLevel = params.batt;
  }
  if (params.charge !== undefined) {
    (position.attributes ??= {}).charge = params.charge;
  }
  if (params.hdop !== undefined) {
    (position.attributes ??= {}).hdop = params.hdop;
  }
  if (params.driverUniqueId) {
    (position.attributes ??= {}).driverUniqueId = params.driverUniqueId;
  }
  if (params.cell) {
    (position.attributes ??= {}).cell = params.cell;
  }
  if (params.wifi) {
    (position.attributes ??= {}).wifi = params.wifi;
  }
  if (params.location) {
    (position.attributes ??= {}).location = params.location;
  }

  return {
    uniqueId: params.id,
    position,
    notificationToken: params.driverUniqueId, // Traccar uses this for notification token
  };
}

/** Decode OsmAnd/Traccar Client JSON payload. */
export function decodeOsmAndJson(data: OsmAndJsonData): DecodedPosition {
  const coords = data.location.coords;
  const position: Partial<Position> = {
    latitude: coords.latitude,
    longitude: coords.longitude,
    valid: true,
    speed: coords.speed !== undefined ? coords.speed * 1.94384 : 0, // m/s to knots
    course: coords.heading ?? 0,
    altitude: coords.altitude ?? 0,
    accuracy: coords.accuracy ?? 0,
    attributes: {},
  };

  position.fixTime = parseTimestamp(data.location.timestamp);
  position.deviceTime = position.fixTime;
  position.serverTime = new Date().toISOString();

  if (data.location.is_moving !== undefined) {
    (position.attributes ??= {}).motion = data.location.is_moving;
  }
  if (data.location.battery) {
    (position.attributes ??= {}).batteryLevel = data.location.battery.level;
    (position.attributes ??= {}).charge = data.location.battery.is_charging;
  }
  if (data.location.event) {
    (position.attributes ??= {}).event = data.location.event;
  }
  if (data.location.odometer !== undefined) {
    (position.attributes ??= {}).odometer = data.location.odometer;
  }
  if (data.location.activity) {
    (position.attributes ??= {}).activity = data.location.activity;
  }
  if (data.location.alarm) {
    (position.attributes ??= {}).alarm = data.location.alarm;
  }
  if (data.location.extras) {
    (position.attributes ??= {}).extras = data.location.extras;
  }

  return {
    uniqueId: data.device_id,
    position,
  };
}

/** Convert m/s to knots. */
export function msToKnots(ms: number): number {
  return ms * 1.94384;
}

/** Parse WKT circle: CIRCLE(lat lon, radius) -> {lat, lon, radius}. */
export function parseWktCircle(wkt: string): { lat: number; lon: number; radius: number } | null {
  const match = wkt.match(/CIRCLE\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*,\s*([-\d.]+)\s*\)/i);
  if (!match || !match[1] || !match[2] || !match[3]) return null;
  return {
    lat: parseFloat(match[1]),
    lon: parseFloat(match[2]),
    radius: parseFloat(match[3]),
  };
}

/** Parse WKT polygon: POLYGON((lon lat, ...)) -> [{lat, lon}, ...]. */
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

/** Check if point is inside circle. */
export function pointInCircle(lat: number, lon: number, circle: { lat: number; lon: number; radius: number }): boolean {
  const R = 6371000; // Earth radius in meters
  const dLat = ((circle.lat - lat) * Math.PI) / 180;
  const dLon = ((circle.lon - lon) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat * Math.PI) / 180) * Math.cos((circle.lat * Math.PI) / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c <= circle.radius;
}

/** Check if point is inside polygon (ray casting). */
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