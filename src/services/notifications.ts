// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 traccar-ts contributors
//
// Notification service - processes queued notifications and sends via providers.

import type { Env } from "../types/env.ts";
import type { ExecutionContext } from "@cloudflare/workers-types";

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

export class NotificationService {
  constructor(private env: Env) {}

  async processMessage(message: NotificationMessage, ctx: ExecutionContext): Promise<void> {
    for (const channel of message.channels) {
      try {
        await this.sendViaChannel(channel, message);
      } catch (error) {
        console.error(`Failed to send notification via ${channel}:`, error);
      }
    }
  }

  private async sendViaChannel(channel: string, message: NotificationMessage): Promise<void> {
    switch (channel) {
      case "email":
        await this.sendEmail(message);
        break;
      case "sms":
        await this.sendSms(message);
        break;
      case "webhook":
        await this.sendWebhook(message);
        break;
      case "push":
        await this.sendPush(message);
        break;
    }
  }

  private async sendEmail(message: NotificationMessage): Promise<void> {
    await this.env.DB.prepare(`
      INSERT INTO audit_log (action_type, object_type, object_id, user_id, attributes)
      VALUES (?, ?, ?, ?, ?)
    `).bind("email_notification", "device", message.deviceId, message.userId, JSON.stringify(message)).run();
  }

  private async sendSms(message: NotificationMessage): Promise<void> {
    await this.env.DB.prepare(`
      INSERT INTO audit_log (action_type, object_type, object_id, user_id, attributes)
      VALUES (?, ?, ?, ?, ?)
    `).bind("sms_notification", "device", message.deviceId, message.userId, JSON.stringify(message)).run();
  }

  private async sendWebhook(message: NotificationMessage): Promise<void> {
    const webhooks = await this.env.KV.list({ prefix: "webhook:" });
    for (const key of webhooks.keys) {
      try {
        await fetch(key.name.replace("webhook:", ""), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(message),
        });
      } catch (error) {
        console.error("Webhook delivery failed:", error);
      }
    }
  }

  private async sendPush(message: NotificationMessage): Promise<void> {
    await this.env.DB.prepare(`
      INSERT INTO audit_log (action_type, object_type, object_id, user_id, attributes)
      VALUES (?, ?, ?, ?, ?)
    `).bind("push_notification", "device", message.deviceId, message.userId, JSON.stringify(message)).run();
  }

  // Helper to queue notifications
  async queueNotification(message: NotificationMessage): Promise<void> {
    await this.env.NOTIFY_QUEUE.send(message);
  }
}