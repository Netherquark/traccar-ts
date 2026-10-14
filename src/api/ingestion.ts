// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 traccar-ts contributors
//
// OsmAnd/Traccar ingestion handler - accepts device positions without auth.

import type { Env } from "../types/env.ts";
import { decodeOsmAndQuery, decodeOsmAndJson, type OsmAndQueryData, type OsmAndJsonData } from "../../protocol.ts";
import type { Position } from "../../models.ts";
import type { ExecutionContext } from "@cloudflare/workers-types";

export class IngestionHandler {
  constructor(private env: Env) {}

  async handle(request: Request, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Handle both GET and POST for OsmAnd query string
    if (request.method === "GET" || request.method === "POST") {
      if (url.pathname === "/osmand" || url.pathname === "/") {
        return this.handleOsmAndQuery(request);
      }
    }

    // Handle JSON ingestion (Traccar Client format)
    if (request.method === "POST" && request.headers.get("content-type")?.includes("application/json")) {
      return this.handleOsmAndJson(request);
    }

    return new Response("Not Found", { status: 404 });
  }

  private async handleOsmAndQuery(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const params = Object.fromEntries(url.searchParams.entries());

    // Convert numeric parameters
    const data: OsmAndQueryData = {
      id: params.id ?? "",
      lat: parseFloat(params.lat),
      lon: parseFloat(params.lon),
      timestamp: params.timestamp ? parseInt(params.timestamp) : undefined,
      speed: params.speed ? parseFloat(params.speed) : undefined,
      bearing: params.bearing ? parseFloat(params.bearing) : undefined,
      altitude: params.altitude ? parseFloat(params.altitude) : undefined,
      accuracy: params.accuracy ? parseFloat(params.accuracy) : undefined,
      batt: params.batt ? parseInt(params.batt) : undefined,
      charge: params.charge ? params.charge === "true" : undefined,
      hdop: params.hdop ? parseFloat(params.hdop) : undefined,
      driverUniqueId: params.driverUniqueId,
      cell: params.cell,
      wifi: params.wifi,
      location: params.location,
    };

    if (!data.id || isNaN(data.lat) || isNaN(data.lon)) {
      return new Response("Missing required parameters: id, lat, lon", { status: 400 });
    }

    const decoded = decodeOsmAndQuery(data);
    await this.storePosition(decoded.uniqueId, decoded.position);

    return new Response("", { status: 200 });
  }

  private async handleOsmAndJson(request: Request): Promise<Response> {
    try {
      const body = await request.json() as OsmAndJsonData;

      if (!body.device_id || !body.location?.coords) {
        return new Response("Invalid JSON payload", { status: 400 });
      }

      const decoded = decodeOsmAndJson(body);
      await this.storePosition(decoded.uniqueId, decoded.position);

      return new Response("", { status: 200 });
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }
  }

  private async storePosition(uniqueId: string, position: Partial<Position>): Promise<void> {
    // Get or create device
    const device = await this.getOrCreateDevice(uniqueId);

    // Store position in D1
    await this.env.DB.prepare(`
      INSERT INTO positions (device_id, protocol, device_time, fix_time, server_time, valid, latitude, longitude, altitude, speed, course, accuracy, attributes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      device.id,
      "osmand",
      position.deviceTime ?? null,
      position.fixTime ?? null,
      new Date().toISOString(),
      position.valid ? 1 : 0,
      position.latitude ?? 0,
      position.longitude ?? 0,
      position.altitude ?? 0,
      position.speed ?? 0,
      position.course ?? 0,
      position.accuracy ?? 0,
      JSON.stringify(position.attributes ?? {})
    ).run();

    // Update device last seen
    await this.env.DB.prepare(`
      UPDATE devices SET last_update = ?, updated_at = datetime('now') WHERE id = ?
    `).bind(new Date().toISOString(), device.id).run();
  }

  private async getOrCreateDevice(uniqueId: string): Promise<{ id: number }> {
    const existing = await this.env.DB.prepare(
      "SELECT id FROM devices WHERE unique_id = ?"
    ).bind(uniqueId).first<{ id: number }>();

    if (existing) return existing;

    const result = await this.env.DB.prepare(`
      INSERT INTO devices (unique_id, name, created_at, updated_at)
      VALUES (?, ?, datetime('now'), datetime('now'))
    `).bind(uniqueId, `Device ${uniqueId}`).run();

    return { id: result.meta.last_row_id ?? 0 };
  }
}

interface OsmAndQueryData {
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

interface OsmAndJsonData {
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

interface Position {
  latitude: number;
  longitude: number;
  altitude: number;
  speed: number;
  course: number;
  accuracy: number;
  deviceTime?: string;
  fixTime?: string;
  serverTime: string;
  valid: boolean;
  attributes?: Record<string, unknown>;
}