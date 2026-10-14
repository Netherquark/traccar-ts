// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 traccar-ts contributors
//
// Processing pipeline tests - ported from traccar-rs processing.rs tests.

import { describe, it, expect } from "vitest";
import { distanceMeters, calculateDistance, detectMotion, checkCircleGeofence, checkPolygonGeofence, alarmToEventType, processPosition } from "../src/processing.ts";

describe("processing", () => {
  describe("distanceMeters", () => {
    it("calculates distance between two points", () => {
      // San Francisco to Los Angeles ~ 559 km
      const dist = distanceMeters(37.7749, -122.4194, 34.0522, -118.2437);
      expect(dist).toBeCloseTo(559000, -3); // within 1km
    });

    it("returns 0 for same point", () => {
      const dist = distanceMeters(37.7749, -122.4194, 37.7749, -122.4194);
      expect(dist).toBe(0);
    });

    it("is symmetric", () => {
      const d1 = distanceMeters(37.7749, -122.4194, 34.0522, -118.2437);
      const d2 = distanceMeters(34.0522, -118.2437, 37.7749, -122.4194);
      expect(d1).toBe(d2);
    });
  });

  describe("calculateDistance", () => {
    it("sums distances between consecutive positions", () => {
      const positions = [
        { valid: true, latitude: 37.7749, longitude: -122.4194 } as any,
        { valid: true, latitude: 37.7849, longitude: -122.4094 } as any,
        { valid: true, latitude: 37.7949, longitude: -122.3994 } as any,
      ];
      const dist = calculateDistance(positions);
      expect(dist).toBeGreaterThan(0);
    });

    it("skips invalid positions", () => {
      const positions = [
        { valid: true, latitude: 37.7749, longitude: -122.4194 } as any,
        { valid: false, latitude: 37.7849, longitude: -122.4094 } as any,
        { valid: true, latitude: 37.7949, longitude: -122.3994 } as any,
      ];
      const dist = calculateDistance(positions);
      expect(dist).toBe(0); // No valid consecutive pairs
    });

    it("returns 0 for single position", () => {
      const positions = [
        { valid: true, latitude: 37.7749, longitude: -122.4194 } as any,
      ];
      const dist = calculateDistance(positions);
      expect(dist).toBe(0);
    });

    it("returns 0 for empty array", () => {
      const dist = calculateDistance([]);
      expect(dist).toBe(0);
    });
  });

  describe("detectMotion", () => {
    it("detects motion from explicit attribute", () => {
      const position = { valid: true, speed: 0, attributes: { motion: true } } as any;
      expect(detectMotion(position, null)).toBe(true);
    });

    it("detects motion from ignition attribute", () => {
      const position = { valid: true, speed: 0, attributes: { ignition: true } } as any;
      expect(detectMotion(position, null)).toBe(true);
    });

    it("detects motion from speed threshold", () => {
      const position = { valid: true, speed: 2, attributes: {} } as any; // 2 knots > 1 knot threshold
      expect(detectMotion(position, null)).toBe(true);
    });

    it("detects motion from distance moved", () => {
      const prev = { valid: true, latitude: 37.7749, longitude: -122.4194 } as any;
      const curr = { valid: true, latitude: 37.7849, longitude: -122.4094, speed: 0, attributes: {} } as any;
      // Distance ~1.5km > 50m threshold
      expect(detectMotion(curr, prev)).toBe(true);
    });

    it("returns false for stationary valid position", () => {
      const position = { valid: true, speed: 0, attributes: {} } as any;
      expect(detectMotion(position, null)).toBe(false);
    });

    it("returns false for invalid position", () => {
      const position = { valid: false, speed: 10, attributes: {} } as any;
      expect(detectMotion(position, null)).toBe(false);
    });
  });

  describe("geofence checks", () => {
    it("checkCircleGeofence returns true for point inside", () => {
      const position = { valid: true, latitude: 37.7749, longitude: -122.4194 } as any;
      expect(checkCircleGeofence(position, 37.7749, -122.4194, 1000)).toBe(true);
    });

    it("checkCircleGeofence returns false for point outside", () => {
      const position = { valid: true, latitude: 38.0, longitude: -122.0 } as any;
      expect(checkCircleGeofence(position, 37.7749, -122.4194, 1000)).toBe(false);
    });

    it("checkCircleGeofence returns false for invalid position", () => {
      const position = { valid: false, latitude: 37.7749, longitude: -122.4194 } as any;
      expect(checkCircleGeofence(position, 37.7749, -122.4194, 1000)).toBe(false);
    });

    it("checkPolygonGeofence returns true for point inside", () => {
      const position = { valid: true, latitude: 37.8, longitude: -122.4 } as any;
      const polygon = [
        { lat: 37.7, lon: -122.5 },
        { lat: 37.7, lon: -122.3 },
        { lat: 37.9, lon: -122.3 },
        { lat: 37.9, lon: -122.5 },
      ];
      expect(checkPolygonGeofence(position, polygon)).toBe(true);
    });

    it("checkPolygonGeofence returns false for point outside", () => {
      const position = { valid: true, latitude: 37.0, longitude: -122.0 } as any;
      const polygon = [
        { lat: 37.7, lon: -122.5 },
        { lat: 37.7, lon: -122.3 },
        { lat: 37.9, lon: -122.3 },
        { lat: 37.9, lon: -122.5 },
      ];
      expect(checkPolygonGeofence(position, polygon)).toBe(false);
    });
  });

  describe("alarmToEventType", () => {
    it("splits comma-separated alarms", () => {
      const events = alarmToEventType("sos,falldown,crash");
      expect(events).toEqual(["sos", "falldown", "crash"]);
    });

    it("trims whitespace", () => {
      const events = alarmToEventType(" sos ,  falldown , crash ");
      expect(events).toEqual(["sos", "falldown", "crash"]);
    });

    it("filters empty entries", () => {
      const events = alarmToEventType("sos,,crash");
      expect(events).toEqual(["sos", "crash"]);
    });

    it("returns empty array for empty string", () => {
      const events = alarmToEventType("");
      expect(events).toEqual([]);
    });
  });

  describe("processPosition", () => {
    it("calculates distance from previous position", async () => {
      const prev = { valid: true, latitude: 37.7749, longitude: -122.4194 } as any;
      const curr = { valid: true, latitude: 37.7849, longitude: -122.4094, attributes: {} } as any;

      const result = await processPosition(curr, prev, {}, []);

      expect(result.distance).toBeGreaterThan(0);
      expect(result.totalDistance).toBe(result.distance);
    });

    it("accumulates total distance", async () => {
      const prev = { valid: true, latitude: 37.7749, longitude: -122.4194 } as any;
      const curr = { valid: true, latitude: 37.7849, longitude: -122.4094, attributes: {} } as any;

      const result = await processPosition(curr, prev, { totalDistance: 1000 }, []);

      expect(result.totalDistance).toBeGreaterThan(1000);
    });

    it("detects motion", async () => {
      const prev = { valid: true, latitude: 37.7749, longitude: -122.4194 } as any;
      const curr = { valid: true, latitude: 37.7849, longitude: -122.4094, attributes: {} } as any;

      const result = await processPosition(curr, prev, {}, []);

      expect(result.motion).toBe(true);
    });

    it("detects circle geofence", async () => {
      const position = { valid: true, latitude: 37.7749, longitude: -122.4194, attributes: {} } as any;
      const geofences = [{ id: 1, area: "CIRCLE(37.7749 -122.4194, 1000)" }];

      const result = await processPosition(position, null, {}, geofences);

      expect(result.geofenceIds).toContain(1);
      expect(result.events).toContain("geofenceEnter:1");
    });

    it("detects polygon geofence", async () => {
      const position = { valid: true, latitude: 37.8, longitude: -122.4, attributes: {} } as any;
      const geofences = [{ id: 2, area: "POLYGON((-122.5 37.7, -122.3 37.7, -122.3 37.9, -122.5 37.9, -122.5 37.7))" }];

      const result = await processPosition(position, null, {}, geofences);

      expect(result.geofenceIds).toContain(2);
      expect(result.events).toContain("geofenceEnter:2");
    });

    it("generates alarm events", async () => {
      const position = { valid: true, latitude: 37.7749, longitude: -122.4194, attributes: { alarm: "sos,falldown" } } as any;

      const result = await processPosition(position, null, {}, []);

      expect(result.events).toContain("sos");
      expect(result.events).toContain("falldown");
    });

    it("preserves original position properties", async () => {
      const position = {
        id: 123,
        deviceId: 456,
        valid: true,
        latitude: 37.7749,
        longitude: -122.4194,
        speed: 10,
        course: 90,
        attributes: {},
      } as any;

      const result = await processPosition(position, null, {}, []);

      expect(result.id).toBe(123);
      expect(result.deviceId).toBe(456);
      expect(result.latitude).toBe(37.7749);
      expect(result.longitude).toBe(-122.4194);
      expect(result.speed).toBe(10);
      expect(result.course).toBe(90);
    });
  });
});