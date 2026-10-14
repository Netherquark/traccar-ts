// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 traccar-ts contributors
//
// Main application class - handles HTTP requests, queue processing, scheduled tasks.

import type { Env } from "./types/env.ts";
import { Router } from "./api/router.ts";
import { IngestionHandler } from "./api/ingestion.ts";
import { AuthMiddleware, Principal } from "./api/auth.ts";
import { RetentionService } from "./services/retention.ts";
import { NotificationService } from "./services/notifications.ts";
import { initDatabase } from "./db/schema.ts";
import type { ExecutionContext, MessageBatch, ScheduledController } from "@cloudflare/workers-types";

export class App {
  private router: Router;
  private ingestion: IngestionHandler;
  private auth: AuthMiddleware;
  private retention: RetentionService;
  private notifications: NotificationService;
  private env: Env;

  constructor(env: Env) {
    this.env = env;
    this.router = new Router(env);
    this.ingestion = new IngestionHandler(env);
    this.auth = new AuthMiddleware(env);
    this.retention = new RetentionService(env);
    this.notifications = new NotificationService(env);
  }

  async init(): Promise<void> {
    await initDatabase(this.env.DB);
  }

  async handleRequest(request: Request, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === "OPTIONS") {
      return this.corsResponse();
    }

    // Health check - no auth required
    if (url.pathname === "/healthz" || url.pathname === "/health") {
      return new Response("OK", { status: 200, headers: this.corsHeaders() });
    }

    // Root endpoint
    if (url.pathname === "/" || url.pathname === "/api") {
      return Response.json({
        service: "traccar-ts",
        version: this.env.CONTRACT_VERSION ?? "v1",
        status: "running",
      }, { headers: this.corsHeaders() });
    }

    // OsmAnd/Traccar ingestion (no /api prefix, no auth required for device ingestion)
    if (url.pathname === "/osmand" || url.pathname === "/") {
      return this.ingestion.handle(request, ctx);
    }

    // API routes - require authentication
    try {
      const authResult = await this.auth.authenticate(request);
      if (!authResult.authenticated) {
        return authResult.response ?? new Response("Unauthorized", { status: 401 });
      }
      return this.router.handle(request, authResult.principal, ctx);
    } catch (error) {
      console.error("Request handler error:", error);
      return new Response(JSON.stringify({
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      }), {
        status: 500,
        headers: { ...this.corsHeaders(), "content-type": "application/json" },
      });
    }
  }

  async processQueue(batch: MessageBatch, ctx: ExecutionContext): Promise<void> {
    for (const message of batch.messages) {
      try {
        await this.notifications.processMessage(message.body as NotificationMessage, ctx);
      } catch (error) {
        console.error("Queue message processing failed:", error);
        message.retry();
      }
    }
  }

  async runScheduled(controller: ScheduledController, ctx: ExecutionContext): Promise<void> {
    // Run retention cleanup
    await this.retention.cleanup(ctx);
  }

  private corsHeaders(): Record<string, string> {
    return {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
      "Access-Control-Max-Age": "86400",
    };
  }

  private corsResponse(): Response {
    return new Response(null, { status: 204, headers: this.corsHeaders() });
  }
}