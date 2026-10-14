// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 traccar-ts contributors
//
// Auth utilities ported from traccar-rs:
// - PBKDF2-HMAC-SHA256 password hashing (200k iterations)
// - HMAC-SHA256 token signing
// - Constant-time comparison

const PBKDF2_ITERATIONS = 200_000;
const PBKDF2_HASH_LENGTH = 32; // 256 bits
const SALT_LENGTH = 24;
const TOKEN_SECRET_LENGTH = 32;

export interface TokenPayload {
  i: number;      // tokenId
  u: number;      // userId
  e: number;      // expMs
  s?: string;     // scope
}

export interface HashResult {
  hash: string;       // PBKDF2WithHmacSHA256$iter$base64url(salt+hash)
  salt: Uint8Array;
}

/** Hash a password using PBKDF2-HMAC-SHA256. */
export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );
  const hash = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    PBKDF2_HASH_LENGTH * 8,
  );
  const hashBytes = new Uint8Array(hash);
  const combined = new Uint8Array(salt.length + hashBytes.length);
  combined.set(salt);
  combined.set(hashBytes, salt.length);
  return `PBKDF2WithHmacSHA256$${PBKDF2_ITERATIONS}$${bufferToBase64Url(combined)}`;
}

/** Verify a PBKDF2-HMAC-SHA256 password hash. */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  if (!storedHash.startsWith("PBKDF2WithHmacSHA256$")) {
    return false;
  }
  const parts = storedHash.split("$");
  if (parts.length !== 3) return false;
  const iterations = parseInt(parts[1], 10);
  const combined = base64UrlToBuffer(parts[2]);
  if (combined.length < SALT_LENGTH + PBKDF2_HASH_LENGTH) return false;
  const salt = combined.slice(0, SALT_LENGTH);
  const hash = combined.slice(SALT_LENGTH);
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );
  const derived = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    keyMaterial,
    PBKDF2_HASH_LENGTH * 8,
  );
  const derivedBytes = new Uint8Array(derived);
  return constantTimeEqual(hash, derivedBytes);
}

/** Generate a secure random token secret. */
export function generateTokenSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(TOKEN_SECRET_LENGTH));
  return bufferToBase64Url(bytes);
}

/** Sign a token payload with HMAC-SHA256. */
export async function signToken(payload: TokenPayload, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const payloadJson = JSON.stringify(payload);
  const payloadB64 = bufferToBase64Url(encoder.encode(payloadJson));
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payloadB64));
  const sigBytes = new Uint8Array(signature);
  return `${payloadB64}.${bufferToBase64Url(sigBytes)}`;
}

/** Verify and decode a signed token. */
export async function verifyToken(token: string, secret: string): Promise<TokenPayload | null> {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, sigB64] = parts;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  let signature: Uint8Array;
  try {
    signature = base64UrlToBuffer(sigB64);
  } catch {
    return null;
  }
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    signature,
    encoder.encode(payloadB64),
  );
  if (!valid) return null;
  try {
    const payloadBytes = base64UrlToBuffer(payloadB64);
    const decoder = new TextDecoder();
    return JSON.parse(decoder.decode(payloadBytes)) as TokenPayload;
  } catch {
    return null;
  }
}

/** Constant-time comparison of two buffers. */
function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

function bufferToBase64Url(buf: Uint8Array): string {
  let str = "";
  for (const byte of buf) {
    str += String.fromCharCode(byte);
  }
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function base64UrlToBuffer(str: string): Uint8Array {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  const pad = str.length % 4;
  if (pad) str += "=".repeat(4 - pad);
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}