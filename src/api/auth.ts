// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 traccar-ts contributors
//
// Authentication middleware - supports Basic, Bearer token, and session cookie.

import type { Env } from "../types/env.ts";
import { hashPassword, verifyPassword, signToken, verifyToken, generateTokenSecret } from "../../auth.ts";

export interface Principal {
  user: User;
  kind: "basic" | "token" | "session";
  expiration?: number;
}

export interface User {
  id: number;
  email: string;
  name: string | null;
  administrator: boolean;
  readonly: boolean;
  deviceLimit: number;
  deviceReadonly: boolean;
}

export interface AuthResult {
  authenticated: boolean;
  principal?: Principal;
  response?: Response;
}

export class AuthMiddleware {
  constructor(private env: Env) {}

  async authenticate(request: Request): Promise<AuthResult> {
    // Check Basic Auth
    const basicAuth = this.getBasicAuth(request);
    if (basicAuth) {
      const result = await this.authenticateBasic(basicAuth.email, basicAuth.password);
      if (result) return { authenticated: true, principal: result };
      return { authenticated: false, response: this.unauthorized() };
    }

    // Check Bearer token
    const bearer = this.getBearerToken(request);
    if (bearer) {
      const result = await this.authenticateToken(bearer);
      if (result) return { authenticated: true, principal: result };
      return { authenticated: false, response: this.unauthorized() };
    }

    // Check session cookie
    const cookie = this.getSessionCookie(request);
    if (cookie) {
      const result = await this.authenticateToken(cookie);
      if (result) return { authenticated: true, principal: { ...result, kind: "session" } };
    }

    return { authenticated: false, response: this.unauthorized() };
  }

  private getBasicAuth(request: Request): { email: string; password: string } | null {
    const auth = request.headers.get("Authorization");
    if (!auth?.startsWith("Basic ")) return null;
    try {
      const decoded = atob(auth.slice(6));
      const [email, password] = decoded.split(":", 2);
      if (email && password) return { email, password };
    } catch {
      // Ignore decode errors
    }
    return null;
  }

  private getBearerToken(request: Request): string | null {
    const auth = request.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return null;
    return auth.slice(7);
  }

  private getSessionCookie(request: Request): string | null {
    const cookie = request.headers.get("Cookie");
    if (!cookie) return null;
    const match = cookie.match(/JSESSIONID=([^;]+)/);
    return match?.[1] ?? null;
  }

  private async authenticateBasic(email: string, password: string): Promise<Principal | null> {
    const user = await this.env.DB.prepare(
      "SELECT * FROM users WHERE email = ? AND disabled = 0"
    ).bind(email).first<User & { password_hash: string }>();

    if (!user || !(await verifyPassword(password, user.password_hash))) {
      return null;
    }

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        administrator: Boolean(user.administrator),
        readonly: Boolean(user.readonly),
        deviceLimit: user.device_limit,
        deviceReadonly: Boolean(user.device_readonly),
      },
      kind: "basic",
    };
  }

  private async authenticateToken(token: string): Promise<Principal | null> {
    const payload = await verifyToken(token, this.env.TOKEN_SECRET);
    if (!payload) return null;

    const user = await this.env.DB.prepare(
      "SELECT * FROM users WHERE id = ? AND disabled = 0"
    ).bind(payload.u).first<User & { password_hash: string }>();

    if (!user) return null;

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        administrator: Boolean(user.administrator),
        readonly: Boolean(user.readonly),
        deviceLimit: user.device_limit,
        deviceReadonly: Boolean(user.device_readonly),
      },
      kind: "token",
      expiration: payload.e,
    };
  }

  // Token management
  async createToken(userId: number, scope?: string): Promise<string> {
    const payload = {
      i: Date.now(),
      u: userId,
      e: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days
      s: scope,
    };
    return signToken(payload, this.env.TOKEN_SECRET);
  }

  async revokeToken(token: string): Promise<void> {
    const payload = await verifyToken(token, this.env.TOKEN_SECRET);
    if (payload) {
      await this.env.DB.prepare(`
        INSERT INTO audit_log (action_type, object_type, object_id, action_time)
        VALUES (?, ?, ?, datetime('now'))
      `).bind("token_revoke", "token", payload.i).run();
    }
  }

  private unauthorized(): Response {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json", "WWW-Authenticate": 'Bearer realm="traccar-ts"' },
    });
  }
}

interface User {
  id: number;
  email: string;
  name: string | null;
  administrator: boolean;
  readonly: boolean;
  deviceLimit: number;
  deviceReadonly: boolean;
  password_hash: string;
  disabled: number;
}