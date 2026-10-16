// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 traccar-ts contributors
//
// Translated from Traccar Java OsmAndProtocolDecoderTest.testDecodeJson
// (real test vectors from traccar source).

import { describe, it, expect } from "vitest";
import { decodeOsmAndJson } from "../src/protocol.ts";

describe("osmand json - traccar java test vectors", () => {
  it("case 1: basic location with extras empty", () => {
    const data = {
      location: {
        timestamp: "2025-06-15T13:45:12.862Z",
        coords: { latitude: 37.4219983, longitude: -122.084, accuracy: 5, speed: 0, heading: -1, altitude: 5 },
        is_moving: false, odometer: 0, event: "motionchange",
        battery: { level: 1, is_charging: false },
        activity: { type: "still", confidence: 100 },
        extras: {},
        _: "&id=48241179&lat=37.4219983&lon=-122.084&timestamp=2025-06-15T13:45:12.862Z&",
      },
      device_id: "48241179",
    };
    const r = decodeOsmAndJson(data as any);
    expect(r.uniqueId).toBe("48241179");
    expect(r.position.latitude).toBeCloseTo(37.4219983, 5);
    expect(r.position.longitude).toBeCloseTo(-122.084, 5);
    expect(r.position.altitude).toBe(5);
    expect(r.position.attributes?.event).toBe("motionchange");
    expect(r.position.attributes?.motion).toBe(false);
    expect(r.position.attributes?.odometer).toBe(0);
    expect(r.position.attributes?.batteryLevel).toBe(100);
    expect(r.position.attributes?.charge).toBe(false);
    expect(r.position.attributes?.activity).toBe("still");
    // speed 0 with invalid -1 heading => course 0, speed converted 0
    expect(r.position.speed).toBeCloseTo(0, 5);
    expect(r.position.course).toBe(0);
  });

  it("case 2: device extras promoted to attributes", () => {
    const data = {
      location: {
        timestamp: "2025-06-15T13:45:12.862Z",
        coords: { latitude: 37.4219983, longitude: -122.084, accuracy: 5, speed: 0, heading: -1, altitude: 5 },
        is_moving: false, odometer: 0, event: "motionchange",
        battery: { level: 1, is_charging: false },
        activity: { type: "still" },
        extras: {
          device_string_test: "long_device_id",
          device_bool_test: true,
          device_bool_false_test: false,
          device_integer_test: 1,
          device_integer_twelve_test: 12,
          device_double_test: 1.345,
          device_very_long_double_test: 1763636.3442,
        },
      },
      device_id: "48241179",
    };
    const r = decodeOsmAndJson(data as any);
    expect(r.position.attributes?.device_integer_twelve_test).toBe(12);
    expect(r.position.attributes?.device_bool_test).toBe(true);
    expect(r.position.attributes?.device_bool_false_test).toBe(false);
    expect(r.position.attributes?.device_double_test).toBe(1.345);
  });

  it("case 3: mock location, battery -1 skipped, extras empty", () => {
    const data = {
      location: {
        extras: {},
        mock: true,
        coords: {
          speed_accuracy: -1, speed: -1, longitude: -122.406417, ellipsoidal_altitude: 0, floor: null,
          heading_accuracy: -1, latitude: 37.785834, accuracy: 5, altitude_accuracy: -1, altitude: 0, heading: -1,
        },
        is_moving: false, age: 188, odometer: 0,
        uuid: "2FB04C65-99CF-42AB-8DD3-EBCB4B108BF8",
        event: "motionchange",
        battery: { level: -1, is_charging: false },
        activity: { type: "unknown", confidence: 100 },
        timestamp: "2025-05-09T04:11:30.579Z",
      },
      device_id: "658765",
    };
    const r = decodeOsmAndJson(data as any);
    expect(r.uniqueId).toBe("658765");
    expect(r.position.latitude).toBeCloseTo(37.785834, 5);
    expect(r.position.attributes?.mock).toBe(true);
    expect(r.position.attributes?.batteryLevel).toBeUndefined(); // level -1 skipped
    expect(r.position.attributes?.activity).toBe("unknown");
    // speed -1 skipped -> 0
    expect(r.position.speed).toBe(0);
    expect(r.position.course).toBe(0);
  });

  it("case 4: speed/accuracy extraction, battery fractional level", () => {
    const data = {
      location: {
        event: "motionchange", is_moving: false,
        uuid: "0e9a2473-a9a7-4c00-997b-fb97d2154e75",
        timestamp: "2021-07-21T08:06:34.444Z", odometer: 0,
        coords: { latitude: -6.1148096, longitude: 106.6837015, accuracy: 3.8, speed: 18.67, speed_accuracy: 0.26, heading: 63, heading_accuracy: 0.28, altitude: 35.7, altitude_accuracy: 3.8 },
        activity: { type: "still", confidence: 100 },
        battery: { is_charging: false, level: 0.79 },
        extras: {},
      },
      device_id: "8737767034",
    };
    const r = decodeOsmAndJson(data as any);
    expect(r.uniqueId).toBe("8737767034");
    expect(r.position.latitude).toBeCloseTo(-6.1148096, 5);
    expect(r.position.longitude).toBeCloseTo(106.6837015, 5);
    expect(r.position.altitude).toBe(35.7);
    // speed 18.67 m/s → knots
    expect(r.position.speed).toBeCloseTo(18.67 * 1.94384, 3);
    expect(r.position.course).toBe(63);
    expect(r.position.accuracy).toBe(0);
    expect(r.position.attributes?.batteryLevel).toBe(79);
  });
});

describe("osmand query - traccar java test vectors (subset)", () => {
  it("cell + wifi network parsing", () => {
    // From Java test: ?id=...&cell=257,02,16,2224&cell=257,02,16,2223,-90&wifi=00-14-22-01-23-45,-80...
    const params = {
      id: "123456",
      cell: ["257,02,16,2224", "257,02,16,2223,-90"],
      wifi: ["00-14-22-01-23-45,-80", "00-1C-B3-09-85-15,-70"],
    } as any;
    // Our decoder stores raw cell/wifi; network parsing collected
    const r = (require("../src/protocol.ts") as any).decodeOsmAndQuery(params);
    expect(r.uniqueId).toBe("123456");
    expect(r.network?.cellTowers?.length).toBe(2);
    expect(r.network.cellTowers[0].mcc).toBe(257);
    expect(r.network.cellTowers[1].signalStrength).toBe(-90);
    expect(r.network.wifiAccessPoints[0].macAddress).toBe("00:14:22:01:23:45");
    expect(r.network.wifiAccessPoints[0].signalStrength).toBe(-80);
  });

  it("location string lat,lon", () => {
    const params = { id: "123456", location: "60.0,30.0", timestamp: 1377177267 } as any;
    const r = (require("../src/protocol.ts") as any).decodeOsmAndQuery(params);
    expect(r.position.latitude).toBe(60.0);
    expect(r.position.longitude).toBe(30.0);
  });

  it("deviceid alias", () => {
    const params = { deviceid: "123456", lat: 60.0, lon: 30.0 } as any;
    const r = (require("../src/protocol.ts") as any).decodeOsmAndQuery(params);
    expect(r.uniqueId).toBe("123456");
  });

  it("hdop/altitude/speed attributes", () => {
    const params = { id: "902064", lat: 42.06288, lon: -88.23412, timestamp: "2016-01-27T18:55:47Z", hdop: 6.0, altitude: 224.0, speed: 0.0 } as any;
    const r = (require("../src/protocol.ts") as any).decodeOsmAndQuery(params);
    expect(r.position.latitude).toBeCloseTo(42.06288, 5);
    expect(r.position.altitude).toBe(224.0);
    expect(r.position.attributes?.hdop).toBe(6.0);
    expect(r.position.fixTime).toBe("2016-01-27T18:55:47.000Z");
  });

  it("date with space format", () => {
    const params = { id: "x", lat: 49.60688, lon: 6.15788, timestamp: "2014-06-04 09:10:11", altitude: 384.7 } as any;
    const r = (require("../src/protocol.ts") as any).decodeOsmAndQuery(params);
    expect(r.position.fixTime).toBe("2014-06-04T09:10:11.000Z");
  });

  it("batt attribute", () => {
    const params = { id: "861001000719969", lat: 41.666667, lon: -0.883333, altitude: 350.059479, speed: 0, batt: 87 } as any;
    const r = (require("../src/protocol.ts") as any).decodeOsmAndQuery(params);
    expect(r.position.attributes?.batteryLevel).toBe(87);
  });
});