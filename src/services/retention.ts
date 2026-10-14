// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 traccar-ts contributors
//
// Retention service - cleans up old positions and events based on policy.

import type { Env } from "../types/env.ts";
import type { ExecutionContext } from "@cloudflare/workers-types";

export class RetentionService {
  constructor(private env: Env) {}

  async cleanup(ctx: ExecutionContext): Promise<void> {
    // Get retention policy from config (default: 30 days positions, 90 days events)
    const positionRetentionDays = 30;
    const eventRetentionDays = 90;

    const positionCutoff = new Date(Date.now() - positionRetentionDays * 24 * 60 * 60 * 1000).toISOString();
    const eventCutoff = new Date(Date.now() - eventRetentionDays * 24 * 60 * 60 * 1000).toISOString();

    // Archive old positions to R2 before deleting
    await this.archiveAndDeletePositions(positionCutoff);
    await this.deleteOldEvents(eventCutoff);

    console.log(`Retention cleanup completed: positions before ${positionCutoff}, events before ${eventCutoff}`);
  }

  private async archiveAndDeletePositions(cutoff: string): Promise<void> {
    // Export old positions to R2 in batches
    const batchSize = 1000;
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const positions = await this.env.DB.prepare(`
        SELECT * FROM positions WHERE fix_time < ? ORDER BY fix_time LIMIT ? OFFSET ?
      `).bind(cutoff, batchSize, offset).all();

      if (!positions.results || positions.results.length === 0) {
        hasMore = false;
        break;
      }

      // Archive to R2
      const key = `positions/archive/${new Date().toISOString().split("T")[0]}/${offset}.json`;
      await this.env.ARCHIVE_BUCKET.put(key, JSON.stringify(positions.results));

      // Delete from D1
      const ids = positions.results.map((p: any) => p.id).join(",");
      await this.env.DB.prepare(`DELETE FROM positions WHERE id IN (${ids})`).run();

      offset += batchSize;

      // Yield to avoid CPU timeout
      if (offset % 5000 === 0) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }
  }

  private async deleteOldEvents(cutoff: string): Promise<void> {
    await this.env.DB.prepare(`DELETE FROM events WHERE event_time < ?`).bind(cutoff).run();
  }
}