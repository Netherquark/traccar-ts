// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 traccar-ts contributors
//
// Database schema initialization for D1.

export async function initDatabase(db: D1Database): Promise<void> {
  const statements = [
    // Users table
    `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT,
      administrator INTEGER DEFAULT 0,
      readonly INTEGER DEFAULT 0,
      device_limit INTEGER DEFAULT 0,
      user_limit INTEGER DEFAULT 0,
      device_readonly INTEGER DEFAULT 0,
      expiration_time TEXT,
      attributes TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`,

    // Devices table
    `CREATE TABLE IF NOT EXISTS devices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      unique_id TEXT UNIQUE NOT NULL,
      status TEXT DEFAULT 'offline',
      disabled INTEGER DEFAULT 0,
      group_id INTEGER,
      last_update TEXT,
      position_id INTEGER,
      attributes TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`,

    // Groups table
    `CREATE TABLE IF NOT EXISTS groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      parent_id INTEGER,
      attributes TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`,

    // Positions table (main tracking data)
    `CREATE TABLE IF NOT EXISTS positions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id INTEGER NOT NULL,
      protocol TEXT,
      device_time TEXT,
      fix_time TEXT,
      server_time TEXT DEFAULT (datetime('now')),
      valid INTEGER DEFAULT 1,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      altitude REAL DEFAULT 0,
      speed REAL DEFAULT 0,
      course REAL DEFAULT 0,
      address TEXT,
      accuracy REAL DEFAULT 0,
      network TEXT,
      geofence_ids TEXT,
      attributes TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now'))
    )`,

    // Events table
    `CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      event_time TEXT NOT NULL,
      attributes TEXT DEFAULT '{}',
      geofence_id INTEGER,
      maintenance_id INTEGER,
      geofence_ids TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`,

    // Geofences
    `CREATE TABLE IF NOT EXISTS geofences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      area TEXT NOT NULL,
      attributes TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`,

    // Notifications
    `CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      notificators TEXT DEFAULT '[]',
      always INTEGER DEFAULT 0,
      attributes TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`,

    // Share tokens
    `CREATE TABLE IF NOT EXISTS share_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT UNIQUE NOT NULL,
      user_id INTEGER NOT NULL,
      device_ids TEXT DEFAULT '[]',
      group_ids TEXT DEFAULT '[]',
      expiration_time TEXT,
      readonly INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    )`,

    // Permissions
    `CREATE TABLE IF NOT EXISTS permissions (
      user_id INTEGER NOT NULL,
      device_id INTEGER,
      group_id INTEGER,
      PRIMARY KEY (user_id, device_id, group_id)
    )`,

    // Commands
    `CREATE TABLE IF NOT EXISTS commands (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      text_channel INTEGER DEFAULT 1,
      attributes TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now'))
    )`,

    // Queued commands
    `CREATE TABLE IF NOT EXISTS queued_commands (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      text_channel INTEGER DEFAULT 1,
      attributes TEXT DEFAULT '{}',
      status TEXT DEFAULT 'queued',
      created_at TEXT DEFAULT (datetime('now'))
    )`,

    // Audit log
    `CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action_time TEXT DEFAULT (datetime('now')),
      user_id INTEGER,
      user_email TEXT,
      action_type TEXT,
      object_type TEXT,
      object_id INTEGER,
      address TEXT,
      attributes TEXT DEFAULT '{}'
    )`,

    // Indexes
    `CREATE INDEX IF NOT EXISTS idx_devices_unique_id ON devices(unique_id)`,
    `CREATE INDEX IF NOT EXISTS idx_devices_group_id ON devices(group_id)`,
    `CREATE INDEX IF NOT EXISTS idx_positions_device_time ON positions(device_id, fix_time)`,
    `CREATE INDEX IF NOT EXISTS idx_positions_server_time ON positions(server_time)`,
    `CREATE INDEX IF NOT EXISTS idx_events_device_time ON events(device_id, event_time)`,
    `CREATE INDEX IF NOT EXISTS idx_queued_commands_device ON queued_commands(device_id)`,
    `CREATE INDEX IF NOT EXISTS idx_audit_log_time ON audit_log(action_time)`,
  ];

  for (const sql of statements) {
    await db.prepare(sql).run();
  }
}