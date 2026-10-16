// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 traccar-ts contributors
//
// API router - dispatches to resource handlers.

import type { Env } from "../types/env.ts";
import type { Principal } from "./auth.ts";
import type { ExecutionContext } from "@cloudflare/workers-types";
import { verifyPassword, signToken } from "../auth.ts";

type RouteHandler = (request: Request, principal: Principal, ctx: ExecutionContext, params?: Record<string, string>) => Promise<Response>;

export class Router {
  private handlers: Map<string, RouteHandler> = new Map();

  constructor(private env: Env) {
    this.registerRoutes();
  }

  private registerRoutes(): void {
    // Session
    this.add("POST", "/api/session", this.handleSessionCreate);
    this.add("GET", "/api/session", this.handleSessionCurrent);
    this.add("DELETE", "/api/session", this.handleSessionDelete);

    // Server
    this.add("GET", "/api/server", this.handleServerGet);
    this.add("PUT", "/api/server", this.handleServerPut);
    this.add("GET", "/api/server/geocode", this.handleGeocode);
    this.add("GET", "/api/server/timezones", this.handleTimezones);
    this.add("GET", "/api/statistics", this.handleStatistics);
    this.add("GET", "/api/audit", this.handleAudit);

    // Users
    this.add("GET", "/api/users", this.handleUsersList);
    this.add("POST", "/api/users", this.handleUsersCreate);
    this.add("GET", "/api/users/:id", this.handleUsersGet);
    this.add("PUT", "/api/users/:id", this.handleUsersUpdate);
    this.add("DELETE", "/api/users/:id", this.handleUsersDelete);

    // Devices
    this.add("GET", "/api/devices", this.handleDevicesList);
    this.add("POST", "/api/devices", this.handleDevicesCreate);
    this.add("GET", "/api/devices/:id", this.handleDevicesGet);
    this.add("PUT", "/api/devices/:id", this.handleDevicesUpdate);
    this.add("DELETE", "/api/devices/:id", this.handleDevicesDelete);

    // Groups
    this.add("GET", "/api/groups", this.handleGroupsList);
    this.add("POST", "/api/groups", this.handleGroupsCreate);

    // Geofences
    this.add("GET", "/api/geofences", this.handleGeofencesList);
    this.add("POST", "/api/geofences", this.handleGeofencesCreate);

    // Positions
    this.add("GET", "/api/positions", this.handlePositionsList);
    this.add("DELETE", "/api/positions", this.handlePositionsDelete);

    // Events
    this.add("GET", "/api/events/:id", this.handleEventGet);

    // Reports
    this.add("GET", "/api/reports/combined", this.handleReportCombined);
    this.add("GET", "/api/reports/route", this.handleReportRoute);
    this.add("GET", "/api/reports/summary", this.handleReportSummary);
    this.add("GET", "/api/reports/trips", this.handleReportTrips);
    this.add("GET", "/api/reports/stops", this.handleReportStops);

    // Share
    this.add("POST", "/api/share/device", this.handleShareDevice);
    this.add("POST", "/api/share/group", this.handleShareGroup);
    this.add("GET", "/api/share/:token", this.handleShareView);

    // Commands
    this.add("GET", "/api/commands", this.handleCommandsList);
    this.add("POST", "/api/commands", this.handleCommandsCreate);
    this.add("GET", "/api/commands/types", this.handleCommandTypes);

    // Notifications
    this.add("GET", "/api/notifications", this.handleNotificationsList);
    this.add("POST", "/api/notifications", this.handleNotificationsCreate);
    this.add("GET", "/api/notifications/types", this.handleNotificationTypes);

    // Permissions
    this.add("GET", "/api/permissions", this.handlePermissionsList);
    this.add("POST", "/api/permissions", this.handlePermissionsLink);
  }

  private add(method: string, path: string, handler: RouteHandler): void {
    this.handlers.set(`${method}:${path}`, handler.bind(this));
  }

  async handle(request: Request, principal: Principal, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // Find matching route
    for (const [key, handler] of this.handlers) {
      const [routeMethod, routePath] = key.split(":", 2);
      if (routeMethod !== method) continue;
      if (this.matchPath(routePath, path)) {
        return handler(request, principal, ctx, this.extractParams(routePath, path) ?? {});
      }
    }

    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }

  private matchPath(routePath: string, requestPath: string): boolean {
    const routeParts = routePath.split("/");
    const requestParts = requestPath.split("/");

    if (routeParts.length !== requestParts.length) return false;

    for (let i = 0; i < routeParts.length; i++) {
      if (routeParts[i].startsWith(":")) continue;
      if (routeParts[i] !== requestParts[i]) return false;
    }
    return true;
  }

  private extractParams(routePath: string, requestPath: string): Record<string, string> {
    const params: Record<string, string> = {};
    const routeParts = routePath.split("/");
    const requestParts = requestPath.split("/");

    for (let i = 0; i < routeParts.length; i++) {
      if (routeParts[i].startsWith(":")) {
        const paramName = routeParts[i].slice(1);
        params[paramName] = requestParts[i];
      }
    }
    return params;
  }

  // Route handlers
  private async handleSessionCreate(request: Request, principal: Principal, ctx: ExecutionContext): Promise<Response> {
    // Read credentials from form body or JSON body
    let email = "";
    let password = "";
    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.includes("application/json")) {
      try {
        const body = await request.json();
        email = body.email ?? "";
        password = body.password ?? "";
      } catch {
        return new Response(JSON.stringify({ error: "Invalid JSON" }), {
          status: 400,
          headers: { "content-type": "application/json" },
        });
      }
    } else {
      try {
        const formData = await request.formData();
        email = formData.get("email") ?? "";
        password = formData.get("password") ?? "";
      } catch {
        return new Response(JSON.stringify({ error: "Invalid form data" }), {
          status: 400,
          headers: { "content-type": "application/json" },
        });
      }
    }

    if (!email || !password) {
      return new Response(JSON.stringify({ error: "Missing credentials" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    // Look up user by email
    const user = await this.env.DB.prepare(
      "SELECT * FROM users WHERE email = ?"
    ).bind(email).first<{ id: number; email: string; name: string | null; administrator: number; readonly: number; device_limit: number; device_readonly: number; password_hash: string }>();

    if (!user || !(await verifyPassword(password, user.password_hash))) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }

    // Create token
    const token = await signToken({
      i: Date.now(),
      u: user.id,
      e: Date.now() + 30 * 24 * 60 * 60 * 1000,
    }, this.env.TOKEN_SECRET);

    return Response.json({
      id: user.id,
      email: user.email,
      name: user.name,
      administrator: Boolean(user.administrator),
      token,
    });
  }

  private async handleSessionCurrent(request: Request, principal: Principal, ctx: ExecutionContext): Promise<Response> {
    return Response.json({ user: principal.user });
  }

  private async handleSessionDelete(request: Request, principal: Principal, ctx: ExecutionContext): Promise<Response> {
    return Response.json({ message: "Session deleted" });
  }

  private async handleServerGet(request: Request, principal: Principal, ctx: ExecutionContext): Promise<Response> {
    return Response.json({ version: "traccar-ts-1.0", features: ["gps", "geofence", "reports"] });
  }

  private async handleServerPut(request: Request, principal: Principal, ctx: ExecutionContext): Promise<Response> {
    return Response.json({ message: "Server updated" });
  }

  private async handleGeocode(request: Request, principal: Principal, ctx: ExecutionContext): Promise<Response> {
    return Response.json([]);
  }

  private async handleTimezones(request: Request, principal: Principal, ctx: ExecutionContext): Promise<Response> {
    return Response.json(["UTC", "America/New_York", "Europe/London"]);
  }

  private async handleStatistics(request: Request, principal: Principal, ctx: ExecutionContext): Promise<Response> {
    return Response.json({ devices: 0, users: 0, positions: 0 });
  }

  private async handleAudit(request: Request, principal: Principal, ctx: ExecutionContext): Promise<Response> {
    return Response.json([]);
  }

  private async handleUsersList(request: Request, principal: Principal, ctx: ExecutionContext): Promise<Response> {
    return Response.json([]);
  }

  private async handleUsersCreate(request: Request, principal: Principal, ctx: ExecutionContext): Promise<Response> {
    return Response.json({ id: 1 }, { status: 201 });
  }

  private async handleUsersGet(request: Request, principal: Principal, ctx: ExecutionContext, params: Record<string, string>): Promise<Response> {
    return Response.json({ id: parseInt(params.id) });
  }

  private async handleUsersUpdate(request: Request, principal: Principal, ctx: ExecutionContext, params: Record<string, string>): Promise<Response> {
    return Response.json({ id: parseInt(params.id), updated: true });
  }

  private async handleUsersDelete(request: Request, principal: Principal, ctx: ExecutionContext, params: Record<string, string>): Promise<Response> {
    return new Response(null, { status: 204 });
  }

  private async handleDevicesList(request: Request, principal: Principal, ctx: ExecutionContext): Promise<Response> {
    return Response.json([]);
  }

  private async handleDevicesCreate(request: Request, principal: Principal, ctx: ExecutionContext): Promise<Response> {
    return Response.json({ id: 1, uniqueId: "demo-device" }, { status: 201 });
  }

  private async handleDevicesGet(request: Request, principal: Principal, ctx: ExecutionContext, params: Record<string, string>): Promise<Response> {
    return Response.json({ id: parseInt(params.id) });
  }

  private async handleDevicesUpdate(request: Request, principal: Principal, ctx: ExecutionContext, params: Record<string, string>): Promise<Response> {
    return Response.json({ id: parseInt(params.id), updated: true });
  }

  private async handleDevicesDelete(request: Request, principal: Principal, ctx: ExecutionContext, params: Record<string, string>): Promise<Response> {
    return new Response(null, { status: 204 });
  }

  private async handleGroupsList(request: Request, principal: Principal, ctx: ExecutionContext): Promise<Response> {
    return Response.json([]);
  }

  private async handleGroupsCreate(request: Request, principal: Principal, ctx: ExecutionContext): Promise<Response> {
    return Response.json({ id: 1 }, { status: 201 });
  }

  private async handleGeofencesList(request: Request, principal: Principal, ctx: ExecutionContext): Promise<Response> {
    return Response.json([]);
  }

  private async handleGeofencesCreate(request: Request, principal: Principal, ctx: ExecutionContext): Promise<Response> {
    return Response.json({ id: 1 }, { status: 201 });
  }

  private async handlePositionsList(request: Request, principal: Principal, ctx: ExecutionContext): Promise<Response> {
    return Response.json([]);
  }

  private async handlePositionsDelete(request: Request, principal: Principal, ctx: ExecutionContext): Promise<Response> {
    return new Response(null, { status: 204 });
  }

  private async handleEventGet(request: Request, principal: Principal, ctx: ExecutionContext, params: Record<string, string>): Promise<Response> {
    return Response.json({ id: parseInt(params.id) });
  }

  private async handleReportCombined(request: Request, principal: Principal, ctx: ExecutionContext): Promise<Response> {
    return Response.json({});
  }

  private async handleReportRoute(request: Request, principal: Principal, ctx: ExecutionContext): Promise<Response> {
    return Response.json({});
  }

  private async handleReportSummary(request: Request, principal: Principal, ctx: ExecutionContext): Promise<Response> {
    return Response.json({});
  }

  private async handleReportTrips(request: Request, principal: Principal, ctx: ExecutionContext): Promise<Response> {
    return Response.json({});
  }

  private async handleReportStops(request: Request, principal: Principal, ctx: ExecutionContext): Promise<Response> {
    return Response.json({});
  }

  private async handleShareDevice(request: Request, principal: Principal, ctx: ExecutionContext): Promise<Response> {
    return Response.json({ token: "share-token" });
  }

  private async handleShareGroup(request: Request, principal: Principal, ctx: ExecutionContext): Promise<Response> {
    return Response.json({ token: "share-token" });
  }

  private async handleShareView(request: Request, principal: Principal, ctx: ExecutionContext, params: Record<string, string>): Promise<Response> {
    return Response.json({ token: params.token });
  }

  private async handleCommandsList(request: Request, principal: Principal, ctx: ExecutionContext): Promise<Response> {
    return Response.json([]);
  }

  private async handleCommandsCreate(request: Request, principal: Principal, ctx: ExecutionContext): Promise<Response> {
    return Response.json({ id: 1 }, { status: 201 });
  }

  private async handleCommandTypes(request: Request, principal: Principal, ctx: ExecutionContext): Promise<Response> {
    return Response.json(["custom", "positionPeriodic", "engineStop"]);
  }

  private async handleNotificationsList(request: Request, principal: Principal, ctx: ExecutionContext): Promise<Response> {
    return Response.json([]);
  }

  private async handleNotificationsCreate(request: Request, principal: Principal, ctx: ExecutionContext): Promise<Response> {
    return Response.json({ id: 1 }, { status: 201 });
  }

  private async handleNotificationTypes(request: Request, principal: Principal, ctx: ExecutionContext): Promise<Response> {
    return Response.json(["email", "sms", "webhook"]);
  }

  private async handlePermissionsList(request: Request, principal: Principal, ctx: ExecutionContext): Promise<Response> {
    return Response.json([]);
  }

  private async handlePermissionsLink(request: Request, principal: Principal, ctx: ExecutionContext): Promise<Response> {
    return Response.json({ linked: true });
  }
}

type RouteHandler = (request: Request, principal: Principal, ctx: ExecutionContext, params: Record<string, string>) => Promise<Response>;