// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 traccar-ts contributors
//
// Protocol decoding parity contract tests.
// These tests verify that traccar-ts protocol decoding matches the
// behavior of the original Traccar Java server (port 8082) and
// traccar-rs. The contract is defined by the Traccar OpenAPI spec
// (v6.16.0) and the OsmAnd protocol decoder implementation.
//
// Integration parity tests against a live Traccar Java server are
// available in scripts/parity-test.sh. This unit test file verifies
// the decoding contract independently.

import { describe, it, expect } from "vitest";
import { decodeOsmAndQuery, decodeOsmAndJson, parseTimestamp } from "../src/protocol.ts";

describe("protocol decoding contract (Traccar Java parity)", () => {
  describe("OsmAnd query protocol contract", () => {
    it("accepts id or deviceid as device unique identifier", () => {
      // Traccar Java OsmAndProtocolDecoder uses 'id' (or deviceid)
      // Both should map to the Position uniqueId
      const paramsWithId = { id: "device-123", lat: 37.7749, lon: -122.4194 };
      const result = decodeOsmAndQuery(paramsWithId);
      expect(result.uniqueId).toBe("device-123");
    });

    it("parses epoch milliseconds timestamp correctly", () => {
      // Traccar Java: if timestamp < Integer.MAX_VALUE, multiply by 1000
      // traccar-ts: parseTimestamp handles both ms and seconds
      const params = {
        id: "d1",
        lat: 37.7749,
        lon: -122.4194,
        timestamp: 1700000000000,
      };
      const result = decodeOsmAndQuery(params);
      expect(result.position.deviceTime).toBe("2023-11-14T22:13:20.000Z");
    });

    it("parses epoch seconds timestamp correctly (legacy format)", () => {
      const params = {
        id: "d1",
        lat: 37.7749,
        lon: -122.4194,
        timestamp: 1700000000,
      };
      const result = decodeOsmAndQuery(params);
      expect(result.position.deviceTime).toBe("2023-11-14T22:13:20.000Z");
    });

    it("preserves speed as knots (no conversion on query path)", () => {
      // OsmAnd query: speed is already in knots
      const params = {
        id: "d1",
        lat: 37.7749,
        lon: -122.4194,
        speed: 19.4384, // knots
      };
      const result = decodeOsmAndQuery(params);
      expect(result.position.speed).toBe(19.4384);
    });

    it("maps bearing/heading to course", () => {
      const params = {
        id: "d1",
        lat: 37.7749,
        lon: -122.4194,
        bearing: 45.0,
      };
      const result = decodeOsmAndQuery(params);
      expect(result.position.course).toBe(45.0);
    });

    it("maps batt to batteryLevel attribute", () => {
      const params = {
        id: "d1",
        lat: 37.7749,
        lon: -122.4194,
        batt: 85,
      };
      const result = decodeOsmAndQuery(params);
      expect(result.position.attributes?.batteryLevel).toBe(85);
    });

    it("maps charge to charge attribute", () => {
      const params = {
        id: "d1",
        lat: 37.7749,
        lon: -122.4194,
        charge: true,
      };
      const result = decodeOsmAndQuery(params);
      expect(result.position.attributes?.charge).toBe(true);
    });

    it("maps hdop to hdop attribute", () => {
      const params = {
        id: "d1",
        lat: 37.7749,
        lon: -122.4194,
        hdop: 1.5,
      };
      const result = decodeOsmAndQuery(params);
      expect(result.position.attributes?.hdop).toBe(1.5);
    });

    it("maps driverUniqueId to notificationToken", () => {
      // Traccar Java: if driverUniqueId is present, it sets notification token
      const params = {
        id: "d1",
        lat: 37.7749,
        lon: -122.4194,
        driverUniqueId: "driver-1",
      };
      const result = decodeOsmAndQuery(params);
      expect(result.notificationToken).toBe("driver-1");
      expect(result.position.attributes?.driverUniqueId).toBe("driver-1");
    });

    it("preserves arbitrary extra keys as attributes", () => {
      // Traccar Java OsmAnd: unknown keys set as attributes
      const params = {
        id: "d1",
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

    it("sets valid=true when valid=true param is passed", () => {
      // Traccar Java sets valid based on 'valid' param (default true)
      const params = {
        id: "d1",
        lat: 37.7749,
        lon: -122.4194,
        valid: true,
      };
      const result = decodeOsmAndQuery(params);
      expect(result.position.valid).toBe(true);
    });
  });

  describe("OsmAnd JSON protocol contract (Traccar Client)", () => {
    it("converts speed from m/s to knots", () => {
      // Traccar Java OsmAnd: speed converted via UnitsConverter.mpsToKnots
      const data = {
        device_id: "device-1",
        location: {
          coords: {
            latitude: 37.7749,
            longitude: -122.4194,
            speed: 5.5, // m/s
          },
          timestamp: 1700000000000,
        },
      };
      const result = decodeOsmAndJson(data);
      expect(result.position.speed).toBeCloseTo(5.5 * 1.94384, 4);
    });

    it("maps bearing/heading to course", () => {
      const data = {
        device_id: "device-1",
        location: {
          coords: {
            latitude: 37.7749,
            longitude: -122.4194,
            heading: 90,
          },
          timestamp: 1700000000000,
        },
      };
      const result = decodeOsmAndJson(data);
      expect(result.position.course).toBe(90);
    });

    it("maps accuracy to accuracy field", () => {
      const data = {
        device_id: "device-1",
        location: {
          coords: {
            latitude: 37.7749,
            longitude: -122.4194,
            accuracy: 10,
          },
          timestamp: 1700000000000,
        },
      };
      const result = decodeOsmAndJson(data);
      expect(result.position.accuracy).toBe(10);
    });

    it("maps altitude to altitude field", () => {
      const data = {
        device_id: "device-1",
        location: {
          coords: {
            latitude: 37.7749,
            longitude: -122.4194,
            altitude: 50,
          },
          timestamp: 1700000000000,
        },
      };
      const result = decodeOsmAndJson(data);
      expect(result.position.altitude).toBe(50);
    });

    it("maps battery level to batteryLevel attribute", () => {
      // Traccar Java: battery level multiplied by 100
      const data = {
        device_id: "device-1",
        location: {
          coords: {
            latitude: 37.7749,
            longitude: -122.4194,
          },
          timestamp: 1700000000000,
          battery: {
            level: 0.9,
            is_charging: false,
          },
        },
      };
      const result = decodeOsmAndJson(data);
      expect(result.position.attributes?.batteryLevel).toBe(90);
    });

    it("maps is_charging to charge attribute", () => {
      const data = {
        device_id: "device-1",
        location: {
          coords: {
            latitude: 37.7749,
            longitude: -122.4194,
          },
          timestamp: 1700000000000,
          battery: {
            level: 0.9,
            is_charging: true,
          },
        },
      };
      const result = decodeOsmAndJson(data);
      expect(result.position.attributes?.charge).toBe(true);
    });

    it("maps is_moving to motion attribute", () => {
      const data = {
        device_id: "device-1",
        location: {
          coords: {
            latitude: 37.7749,
            longitude: -122.4194,
          },
          timestamp: 1700000000000,
          is_moving: true,
        },
      };
      const result = decodeOsmAndJson(data);
      expect(result.position.attributes?.motion).toBe(true);
    });

    it("maps event, alarm, activity, odometer to attributes", () => {
      const data = {
        device_id: "device-1",
        location: {
          coords: {
            latitude: 37.7749,
            longitude: -122.4194,
          },
          timestamp: 1700000000000,
          event: "test-event",
          alarm: "sos",
          activity: "driving",
          odometer: 1000,
        },
      };
      const result = decodeOsmAndJson(data);
      expect(result.position.attributes?.event).toBe("test-event");
      expect(result.position.attributes?.alarm).toBe("sos");
      expect(result.position.attributes?.activity).toBe("driving");
      expect(result.position.attributes?.odometer).toBe(1000);
    });

    it("maps extras object to extras attribute", () => {
      const data = {
        device_id: "device-1",
        location: {
          coords: {
            latitude: 37.7749,
            longitude: -122.4194,
          },
          timestamp: 1700000000000,
          extras: { custom: "value" },
        },
      };
      const result = decodeOsmAndJson(data);
      expect(result.position.attributes?.extras).toEqual({ custom: "value" });
    });

    it("sets valid=true by default", () => {
      const data = {
        device_id: "device-1",
        location: {
          coords: {
            latitude: 37.7749,
            longitude: -122.4194,
          },
          timestamp: 1700000000000,
        },
      };
      const result = decodeOsmAndJson(data);
      expect(result.position.valid).toBe(true);
    });
  });

  describe("timestamp parsing contract", () => {
    it("parses epoch milliseconds", () => {
      expect(parseTimestamp(1700000000000)).toBe("2023-11-14T22:13:20.000Z");
    });

    it("parses epoch seconds (auto-detect)", () => {
      expect(parseTimestamp(1700000000)).toBe("2023-11-14T22:13:20.000Z");
    });

    it("parses ISO-8601 string", () => {
      expect(parseTimestamp("2023-11-14T13:33:20.000Z")).toBe("2023-11-14T13:33:20.000Z");
    });

    it("returns null for invalid values", () => {
      expect(parseTimestamp(undefined)).toBeNull();
      expect(parseTimestamp("invalid")).toBeNull();
    });
  });
});