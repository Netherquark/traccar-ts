#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 traccar-ts contributors
//
// Integration parity test against a running Traccar Java server.
// Usage: node scripts/parity-test.js [--traccar-ts-url URL] [--traccar-java-url URL]
//
// Prerequisites:
//   - Traccar Java server running on port 8082
//   - traccar-ts dev server running on port 8787
//
// Example:
//   node scripts/parity-test.js --traccar-ts-url http://localhost:8787 --traccar-java-url http://localhost:8082

const http = require("http");
const https = require("https");

const args = process.argv.slice(2);
let TRACCAR_TS = "http://localhost:8787";
let TRACCAR_JAVA = "http://localhost:8082";

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--traccar-ts-url") TRACCAR_TS = args[++i];
  if (args[i] === "--traccar-java-url") TRACCAR_JAVA = args[++i];
}

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.log(`  ✗ ${message}`);
  }
}

function request(base, path, method = "GET", body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, base);
    const opts = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: { ...headers },
    };
    if (body) {
      if (typeof body === "string") {
        opts.headers["Content-Type"] = "application/x-www-form-urlencoded";
      } else {
        opts.headers["Content-Type"] = "application/json";
      }
      const bodyStr = typeof body === "string" ? body : JSON.stringify(body);
      opts.headers["Content-Length"] = Buffer.byteLength(bodyStr);
    }
    const client = url.protocol === "https:" ? https : http;
    const req = client.request(opts, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve({ status: res.statusCode, body: data, headers: res.headers }));
    });
    req.on("error", reject);
    if (body) {
      const bodyStr = typeof body === "string" ? body : JSON.stringify(body);
      req.write(bodyStr);
    }
    req.end();
  });
}

async function testHealth() {
  console.log("\n=== Health Check Parity ===");
  const tsResp = await request(TRACCAR_TS, "/healthz");
  const javaResp = await request(TRACCAR_JAVA, "/api/health");
  console.log(`traccar-ts: ${tsResp.status} - ${tsResp.body}`);
  console.log(`Traccar Java: ${javaResp.status} - ${javaResp.body.substring(0, 50)}`);
  assert(tsResp.status === 200, "traccar-ts health returns 200");
  assert(javaResp.status === 200, "Traccar Java health returns 200");
}

async function testOsmAndQuery() {
  console.log("\n=== OsmAnd Query Protocol Parity ===");
  const params = "id=test-device-1&lat=37.7749&lon=-122.4194&timestamp=1700000000000&speed=10&bearing=45&altitude=100&accuracy=5&batt=85&charge=true&hdop=1.5&driverUniqueId=driver-1";
  const tsResp = await request(TRACCAR_TS, `/osmand?${params}`);
  console.log(`traccar-ts: ${tsResp.status}`);
  assert(tsResp.status === 200, "traccar-ts accepts OsmAnd query request (200)");
}

async function testOsmAndJson() {
  console.log("\n=== OsmAnd JSON Protocol Parity ===");
  const jsonBody = {
    device_id: "test-device-2",
    location: {
      coords: { latitude: 40.7128, longitude: -74.006, speed: 5.5, heading: 90, accuracy: 10, altitude: 50 },
      timestamp: 1700000000000,
      is_moving: true,
      battery: { level: 90, is_charging: false },
      event: "test",
      odometer: 1000,
      activity: "driving",
      alarm: "sos",
      extras: { custom: "value" },
    },
  };
  const tsResp = await request(TRACCAR_TS, "/osmand", "POST", jsonBody);
  console.log(`traccar-ts: ${tsResp.status}`);
  assert(tsResp.status === 200, "traccar-ts accepts OsmAnd JSON request (200)");
}

async function testAuthSession() {
  console.log("\n=== Auth Session Parity ===");
  const loginBody = "email=nonexistent@test.com&password=wrong";
  const tsResp = await request(TRACCAR_TS, "/api/session", "POST", loginBody);
  const javaResp = await request(TRACCAR_JAVA, "/api/session", "POST", loginBody);
  console.log(`traccar-ts: ${tsResp.status}`);
  console.log(`Traccar Java: ${javaResp.status}`);
  assert(tsResp.status === 401, "traccar-ts rejects invalid credentials (401)");
  assert(javaResp.status === 401, "Traccar Java rejects invalid credentials (401)");
}

async function testDevicesEndpoint() {
  console.log("\n=== Devices Endpoint Parity ===");
  const tsResp = await request(TRACCAR_TS, "/api/devices");
  const javaResp = await request(TRACCAR_JAVA, "/api/devices");
  console.log(`traccar-ts: ${tsResp.status}`);
  console.log(`Traccar Java: ${javaResp.status}`);
  assert(tsResp.status === 401, "traccar-ts requires auth (401)");
  assert(javaResp.status === 401, "Traccar Java requires auth (401)");
}

async function testPositionsEndpoint() {
  console.log("\n=== Positions Endpoint Parity ===");
  const tsResp = await request(TRACCAR_TS, "/api/positions");
  const javaResp = await request(TRACCAR_JAVA, "/api/positions");
  console.log(`traccar-ts: ${tsResp.status}`);
  console.log(`Traccar Java: ${javaResp.status}`);
  assert(tsResp.status === 401, "traccar-ts requires auth (401)");
  assert(javaResp.status === 401, "Traccar Java requires auth (401)");
}

async function testServerEndpoint() {
  console.log("\n=== Server Endpoint Parity ===");
  const tsResp = await request(TRACCAR_TS, "/api/server");
  const javaResp = await request(TRACCAR_JAVA, "/api/server");
  console.log(`traccar-ts: ${tsResp.status}`);
  console.log(`Traccar Java: ${javaResp.status}`);
  assert(tsResp.status === 200, "traccar-ts server info available (200)");
  assert(javaResp.status === 200, "Traccar Java server info available (200)");
}

async function runTests() {
  console.log("=== Traccar Parity Integration Tests ===");
  console.log(`traccar-ts: ${TRACCAR_TS}`);
  console.log(`Traccar Java: ${TRACCAR_JAVA}`);

  try {
    await testHealth();
    await testOsmAndQuery();
    await testOsmAndJson();
    await testAuthSession();
    await testDevicesEndpoint();
    await testPositionsEndpoint();
    await testServerEndpoint();
  } catch (err) {
    console.error("Unexpected error:", err);
    process.exit(1);
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();