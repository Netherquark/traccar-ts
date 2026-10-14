// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 traccar-ts contributors
//
// Device Durable Object - manages real-time device state and WebSocket connections.

import type { DurableObjectState, Env } from "@cloudflare/workers-types";

export interface DeviceState {
  deviceId: number;
  position: Position | null;
  status: "online" | "offline" | "unknown";
  lastUpdate: number;
  subscribers: Set<WebSocket>;
}

export interface Position {
  latitude: number;
  longitude: number;
  altitude: number;
  speed: number;
  course: number;
  accuracy: number;
  timestamp: number;
}

export class DeviceDO {
  private state: DeviceState;
  private env: Env;
  private ctx: DurableObjectState;

  constructor(ctx: DurableObjectState, env: Env) {
    this.ctx = ctx;
    this.env = env;
    this.state = {
      deviceId: 0,
      position: null,
      status: "offline",
      lastUpdate: 0,
      subscribers: new Set(),
    };
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // WebSocket upgrade
    if (request.headers.get("Upgrade") === "websocket") {
      return this.handleWebSocket(request);
    }

    // REST API
    if (url.pathname === "/position" && request.method === "POST") {
      return this.updatePosition(request);
    }

    if (url.pathname === "/status" && request.method === "GET") {
      return Response.json({
        deviceId: this.state.deviceId,
        status: this.state.status,
        lastUpdate: this.state.lastUpdate,
        subscriberCount: this.state.subscribers.size,
      });
    }

    return new Response("Not Found", { status: 404 });
  }

  private handleWebSocket(request: Request): Response {
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];

    server.accept();
    this.state.subscribers.add(server);

    server.addEventListener("message", (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data as string);
        if (msg.type === "subscribe" && msg.deviceId) {
          this.state.deviceId = msg.deviceId;
        }
      } catch {
        // Ignore invalid messages
      }
    });

    server.addEventListener("close", () => {
      this.state.subscribers.delete(server);
    });

    return new Response(null, { status: 101, webSocket: client });
  }

  private async updatePosition(request: Request): Promise<Response> {
    try {
      const body = await request.json() as Partial<Position> & { deviceId: number };

      this.state.deviceId = body.deviceId;
      this.state.position = {
        latitude: body.latitude ?? 0,
        longitude: body.longitude ?? 0,
        altitude: body.altitude ?? 0,
        speed: body.speed ?? 0,
        course: body.course ?? 0,
        accuracy: body.accuracy ?? 0,
        timestamp: body.timestamp ?? Date.now(),
      };
      this.state.status = "online";
      this.state.lastUpdate = Date.now();

      // Broadcast to subscribers
      const message = JSON.stringify({ type: "position", data: this.state.position });
      for (const ws of this.state.subscribers) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(message);
        }
      }

      // Persist to D1
      await this.env.DB.prepare(`
        INSERT INTO positions (device_id, latitude, longitude, altitude, speed, course, accuracy, fix_time, server_time, valid)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), 1)
      `).bind(
        body.deviceId,
        body.latitude,
        body.longitude,
        body.altitude ?? 0,
        body.speed ?? 0,
        body.course ?? 0,
        body.accuracy ?? 0,
        new Date(body.timestamp ?? Date.now()).toISOString()
      ).run();

      return Response.json({ success: true });
    } catch {
      return new Response("Invalid position data", { status: 400 });
    }
  }
}

interface Position {
  latitude: number;
  longitude: number;
  altitude: number;
  speed: number;
  course: number;
  accuracy: number;
  timestamp: number;
}

interface Env {
  DB: any;
  KV: any;
  NOTIFY_QUEUE: any;
  ARCHIVE_BUCKET: any;
  DEVICE_DO: any;
  TOKEN_SECRET: string;
  SHARE_TOKEN_PEPPER: string;
  INTERNAL_SIGNING_KEY: string;
  CONTRACT_VERSION: string;
  ENVIRONMENT: string;
}