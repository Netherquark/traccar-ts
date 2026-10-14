// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 traccar-ts contributors
//
// Processing pipeline - ported from traccar-rs processing.rs

import type { Position } from "./models";

const EARTH_RADIUS_METERS = 6371000;
const MOTION_SPEED_THRESHOLD_KNOTS = 1;

/** Haversine great-circle distance in meters. */
export function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_METERS * c;
}

/** Calculate total distance from position array. */
export function calculateDistance(positions: Position[]): number {
  let total = 0;
  for (let i = 1; i < positions.length; i++) {
    const prev = positions[i - 1];
    const curr = positions[i];
    if (prev !== undefined && curr !== undefined && prev.valid && curr.valid) {
      total += distanceMeters(prev.latitude, prev.longitude, curr.latitude, curr.longitude);
    }
  }
  return total;
}

/** Motion detection: explicit motion attr > ignition attr > speed threshold. */
export function detectMotion(position: Position, prevPosition: Position | null): boolean {
  if (!position.valid) return false;
  if (position.attributes?.motion === true) return true;
  if (position.attributes?.ignition === true) return true;
  if (position.speed >= MOTION_SPEED_THRESHOLD_KNOTS) return true;
  if (prevPosition && prevPosition.valid) {
    const dist = distanceMeters(
      prevPosition.latitude,
      prevPosition.longitude,
      position.latitude,
      position.longitude,
    );
    if (dist > 50) return true; // moved more than 50m
  }
  return false;
}

/** Geofence check for circle. */
export function checkCircleGeofence(position: Position, lat: number, lon: number, radius: number): boolean {
  if (!position.valid) return false;
  return pointInCircle(position.latitude, position.longitude, { lat, lon, radius });
}

/** Geofence check for polygon. */
export function checkPolygonGeofence(position: Position, polygon: { lat: number; lon: number }[]): boolean {
  if (!position.valid) return false;
  return pointInPolygon(position.latitude, position.longitude, polygon);
}

function pointInCircle(lat: number, lon: number, circle: { lat: number; lon: number; radius: number }): boolean {
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

function pointInPolygon(lat: number, lon: number, polygon: { lat: number; lon: number }[]): boolean {
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

/** Alarm to event type mapping. */
export function alarmToEventType(alarm: string): string[] {
  return alarm.split(",").map((a) => a.trim().toLowerCase()).filter((a) => a.length > 0);
}

/** Process a new position and generate events. */
export interface ProcessedPosition {
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
  network: Position["network"];
  geofenceIds: number[] | null;
  attributes: Record<string, unknown>;
  distance?: number;
  totalDistance?: number;
  motion?: boolean;
  events?: string[];
}

export async function processPosition(
  position: Position,
  previousPosition: Position | null,
  deviceAttributes: Record<string, unknown>,
  geofences: Array<{ id: number; area: string }>,
): Promise<ProcessedPosition> {
  const processed: ProcessedPosition = { ...position };

  // Distance
  if (previousPosition && previousPosition.valid && position.valid) {
    processed.distance = distanceMeters(
      previousPosition.latitude,
      previousPosition.longitude,
      position.latitude,
      position.longitude,
    );
  }

  // Total distance accumulation
  const prevTotal = (deviceAttributes.totalDistance as number) ?? 0;
  processed.totalDistance = prevTotal + (processed.distance ?? 0);

  // Motion detection
  processed.motion = detectMotion(position, previousPosition);

  // Geofence events
  const geofenceEvents: string[] = [];
  for (const gf of geofences) {
    if (gf.area.startsWith("CIRCLE")) {
      const circle = parseWktCircle(gf.area);
      if (circle && checkCircleGeofence(position, circle.lat, circle.lon, circle.radius)) {
        geofenceEvents.push(`geofenceEnter:${gf.id}`);
      }
    } else if (gf.area.startsWith("POLYGON")) {
      const polygon = parseWktPolygon(gf.area);
      if (polygon && checkPolygonGeofence(position, polygon)) {
        geofenceEvents.push(`geofenceEnter:${gf.id}`);
      }
    }
  }
  if (geofenceEvents.length > 0) {
    processed.geofenceIds = geofences
      .filter((_, i) => geofenceEvents.some((e) => {
        const gf = geofences[i];
        return gf !== undefined && e.includes(`:${gf.id}`);
      }))
      .map((g) => g.id);
    processed.events = geofenceEvents;
  }

  // Alarm events
  if (position.attributes?.alarm) {
    const alarms = alarmToEventType(String(position.attributes.alarm));
    processed.events = [...(processed.events ?? []), ...alarms];
  }

  return processed;
}

function parseWktCircle(wkt: string): { lat: number; lon: number; radius: number } | null {
  const match = wkt.match(/CIRCLE\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*,\s*([-\d.]+)\s*\)/i);
  if (!match || !match[1] || !match[2] || !match[3]) return null;
  return { lat: parseFloat(match[1]), lon: parseFloat(match[2]), radius: parseFloat(match[3]) };
}

function parseWktPolygon(wkt: string): { lat: number; lon: number }[] | null {
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