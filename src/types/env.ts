// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 traccar-ts contributors
//
// Cloudflare runtime bindings for traccar-ts Worker.

import type { D1Database, DurableObjectNamespace, Queue, R2Bucket, KVNamespace } from "@cloudflare/workers-types";

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

export interface NotificationMessage {
  type: "geofence" | "speed" | "maintenance" | "device_offline" | "custom";
  deviceId: number;
  userId: number;
  title: string;
  message: string;
  priority: "low" | "normal" | "high" | "critical";
  channels: ("email" | "sms" | "webhook" | "push")[];
  metadata?: Record<string, unknown>;
}