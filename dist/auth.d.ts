export interface TokenPayload {
    i: number;
    u: number;
    e: number;
    s?: string;
}
export interface HashResult {
    hash: string;
    salt: Uint8Array;
}
/** Hash a password using PBKDF2-HMAC-SHA256. */
export declare function hashPassword(password: string): Promise<string>;
/** Verify a PBKDF2-HMAC-SHA256 password hash. */
export declare function verifyPassword(password: string, storedHash: string): Promise<boolean>;
/** Generate a secure random token secret. */
export declare function generateTokenSecret(): string;
/** Sign a token payload with HMAC-SHA256. */
export declare function signToken(payload: TokenPayload, secret: string): Promise<string>;
/** Verify and decode a signed token. */
export declare function verifyToken(token: string, secret: string): Promise<TokenPayload | null>;
//# sourceMappingURL=auth.d.ts.map