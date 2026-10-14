// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 traccar-ts contributors
//
// Main entry point with fetch, queue, scheduled handlers.

import type { D1Database, KVNamespace, Queue, R2Bucket, DurableObjectNamespace, ExecutionContext, MessageBatch, ScheduledController, ExportedHandler } from "@cloudflare/workers-types";
import { App } from "./app.ts";

export interface Env {
  DB: D1Database;
  KV: KVNamespace;
  NOTIFY_QUEUE: Queue;
  ARCHIVE_BUCKET: R2Bucket;
  DEVICE_DO: DurableObjectNamespace;
  TOKEN_SECRET: string;
  SHARE_TOKEN_PEPPER: string;
  INTERNAL_SIGNING_KEY: string;
  CONTRACT_VERSION: string;
  ENVIRONMENT: string;
}

let appInstance: App | null = null;

async function getApp(env: Env): Promise<App> {
  if (!appInstance) {
    appInstance = new App(env);
    await appInstance.init();
  }
  return appInstance;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const app = await getApp(env);
    return app.handleRequest(request, ctx);
  },

  async queue(batch: MessageBatch, env: Env, ctx: ExecutionContext): Promise<void> {
    const app = await getApp(env);
    await app.processQueue(batch, ctx);
  },

  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const app = await getApp(env);
    await app.runScheduled(controller, ctx);
  },
} satisfies ExportedHandler<Env>;