// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 traccar-ts contributors
//
// Protocol decoder tests - ported from traccar-rs osmand.rs tests.

import { describe, it, expect } from "vitest";
import { decodeOsmAndQuery, decodeOsmAndJson, parseTimestamp, msToKnots, parseWktCircle, parseWktPolygon, pointInCircle, pointInPolygon } from "../src/protocol.ts";

describe("protocol decoders", () => {
  describe("parseTimestamp", () => {
    it("parses epoch milliseconds", () => {
      const result = parseTimestamp(1700000000000);
      // 1700000000000 ms = 2023-11-14T22:13:20.000Z (in UTC)
      expect(result).toBe("2023-11-14T22:13:20.000Z");
    });

    it("parses epoch seconds", () => {
      const result = parseTimestamp(1700000000);
      // 1700000000 s = 2023-11-14T22:13:20.000Z (in UTC)
      expect(result).toBe("2023-11-14T22:13:20.000Z");
    });

    it("parses ISO string", () => {
      const result = parseTimestamp("2023-11-14T13:33:20.000Z");
      expect(result).toBe("2023-11-14T13:33:20.000Z");
    });

    it("returns null for undefined", () => {
      const result = parseTimestamp(undefined);
      expect(result).toBeNull();
    });

    it("returns null for invalid string", () => {
      const result = parseTimestamp("invalid");
      expect(result).toBeNull();
    });
  });

  describe("msToKnots", () => {
    it("converts m/s to knots", () => {
      expect(msToKnots(1)).toBeCloseTo(1.94384, 4);
      expect(msToKnots(10)).toBeCloseTo(19.4384, 4);
      expect(msToKnots(0)).toBe(0);
    });
  });

  describe("decodeOsmAndQuery", () => {
    it("decodes basic position", () => {
      const params = {
        id: "device-123",
        lat: 37.7749,
        lon: -122.4194,
        timestamp: 1700000000000,
        speed: 10,
        bearing: 45,
        altitude: 100,
        accuracy: 5,
        batt: 85,
        charge: true,
        hdop: 1.5,
        driverUniqueId: "driver-1",
      };

      const result = decodeOsmAndQuery(params);

      expect(result.uniqueId).toBe("device-123");
      expect(result.position.latitude).toBe(37.7749);
      expect(result.position.longitude).toBe(-122.4194);
      expect(result.position.speed).toBe(10);
      expect(result.position.course).toBe(45);
      expect(result.position.altitude).toBe(100);
      expect(result.position.accuracy).toBe(5);
      expect(result.position.valid).toBe(true);
      expect(result.position.attributes?.batteryLevel).toBe(85);
      expect(result.position.attributes?.charge).toBe(true);
      expect(result.position.attributes?.hdop).toBe(1.5);
      expect(result.position.attributes?.driverUniqueId).toBe("driver-1");
      expect(result.notificationToken).toBe("driver-1");
    });

    it("handles optional fields", () => {
      const params = {
        id: "device-123",
        lat: 37.7749,
        lon: -122.4194,
      };

      const result = decodeOsmAndQuery(params);

      expect(result.uniqueId).toBe("device-123");
      expect(result.position.latitude).toBe(37.7749);
      expect(result.position.longitude).toBe(-122.4194);
      expect(result.position.speed).toBe(0);
      expect(result.position.attributes).toEqual({});
      expect(result.notificationToken).toBeUndefined();
    });

    it("includes network info in attributes", () => {
      const params = {
        id: "device-123",
        lat: 37.7749,
        lon: -122.4194,
        cell: "cell-data",
        wifi: "wifi-data",
        location: "location-data",
      };

      const result = decodeOsmAndQuery(params);

      expect(result.position.attributes?.cell).toBe("cell-data");
      expect(result.position.attributes?.wifi).toBe("wifi-data");
      expect(result.position.attributes?.location).toBe("location-data");
    });
  });

  describe("decodeOsmAndJson", () => {
    it("decodes Traccar client JSON payload", () => {
      const data = {
        device_id: "device-456",
        location: {
          coords: {
            latitude: 40.7128,
            longitude: -74.0060,
            speed: 5.5, // m/s
            heading: 90,
            accuracy: 10,
            altitude: 50,
          },
          timestamp: 1700000000000,
          is_moving: true,
          battery: {
            level: 90,
            is_charging: false,
          },
          event: "test",
          odometer: 1000,
          activity: "driving",
          alarm: "sos",
          extras: { custom: "value" },
        },
      };

      const result = decodeOsmAndJson(data);

      expect(result.uniqueId).toBe("device-456");
      expect(result.position.latitude).toBe(40.7128);
      expect(result.position.longitude).toBe(-74.0060);
      expect(result.position.speed).toBeCloseTo(5.5 * 1.94384, 4); // m/s to knots
      expect(result.position.course).toBe(90);
      expect(result.position.accuracy).toBe(10);
      expect(result.position.altitude).toBe(50);
      expect(result.position.valid).toBe(true);
      expect(result.position.attributes?.motion).toBe(true);
      expect(result.position.attributes?.batteryLevel).toBe(90);
      expect(result.position.attributes?.charge).toBe(false);
      expect(result.position.attributes?.event).toBe("test");
      expect(result.position.attributes?.odometer).toBe(1000);
      expect(result.position.attributes?.activity).toBe("driving");
      expect(result.position.attributes?.alarm).toBe("sos");
      expect(result.position.attributes?.extras).toEqual({ custom: "value" });
    });

    it("handles minimal payload", () => {
      const data = {
        device_id: "device-456",
        location: {
          coords: {
            latitude: 40.7128,
            longitude: -74.0060,
          },
          timestamp: 1700000000000,
        },
      };

      const result = decodeOsmAndJson(data);

      expect(result.uniqueId).toBe("device-456");
      expect(result.position.latitude).toBe(40.7128);
      expect(result.position.longitude).toBe(-74.0060);
      expect(result.position.speed).toBe(0);
      expect(result.position.attributes).toEqual({});
    });
  });

  describe("WKT parsing", () => {
    it("parses CIRCLE WKT", () => {
      const result = parseWktCircle("CIRCLE(37.7749 -122.4194, 1000)");
      expect(result).toEqual({ lat: 37.7749, lon: -122.4194, radius: 1000 });
    });

    it("parses CIRCLE with spaces", () => {
      const result = parseWktCircle("CIRCLE ( 37.7749  -122.4194 , 1000 )");
      expect(result).toEqual({ lat: 37.7749, lon: -122.4194, radius: 1000 });
    });

    it("returns null for invalid CIRCLE", () => {
      expect(parseWktCircle("POLYGON((0 0, 1 1))")).toBeNull();
      expect(parseWktCircle("invalid")).toBeNull();
    });

    it("parses POLYGON WKT", () => {
      const result = parseWktPolygon("POLYGON((-122.5 37.7, -122.3 37.7, -122.3 37.9, -122.5 37.9, -122.5 37.7))");
      expect(result).toHaveLength(5);
      expect(result?.[0]).toEqual({ lon: -122.5, lat: 37.7 });
      expect(result?.[4]).toEqual({ lon: -122.5, lat: 37.7 });
    });

    it("returns null for invalid POLYGON", () => {
      expect(parseWktPolygon("CIRCLE(0 0, 1000)")).toBeNull();
      expect(parseWktPolygon("invalid")).toBeNull();
    });
  });

  describe("pointInCircle", () => {
    it("returns true for point inside circle", () => {
      const circle = { lat: 37.7749, lon: -122.4194, radius: 1000 };
      expect(pointInCircle(37.7749, -122.4194, circle)).toBe(true); // center
      expect(pointInCircle(37.78, -122.42, circle)).toBe(true); // nearby
    });

    it("returns false for point outside circle", () => {
      const circle = { lat: 37.7749, lon: -122.4194, radius: 1000 };
      expect(pointInCircle(38.0, -122.0, circle)).toBe(false); // far away
    });
  });

  describe("pointInPolygon", () => {
    it("returns true for point inside polygon", () => {
      const polygon = [
        { lat: 37.7, lon: -122.5 },
        { lat: 37.7, lon: -122.3 },
        { lat: 37.9, lon: -122.3 },
        { lat: 37.9, lon: -122.5 },
      ];
      expect(pointInPolygon(37.8, -122.4, polygon)).toBe(true);
    });

    it("returns false for point outside polygon", () => {
      const polygon = [
        { lat: 37.7, lon: -122.5 },
        { lat: 37.7, lon: -122.3 },
        { lat: 37.9, lon: -122.3 },
        { lat: 37.9, lon: -122.5 },
      ];
      expect(pointInPolygon(37.0, -122.0, polygon)).toBe(false);
    });

    it("handles edge cases", () => {
      const triangle = [
        { lat: 0, lon: 0 },
        { lat: 0, lon: 10 },
        { lat: 10, lon: 0 },
      ];
      expect(pointInPolygon(1, 1, triangle)).toBe(true);
      expect(pointInPolygon(2, 2, triangle)).toBe(true);
      expect(pointInPolygon(8, 8, triangle)).toBe(false);
    });
  });
});