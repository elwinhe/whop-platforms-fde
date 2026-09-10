import type { Context } from "hono";
import { createHash, timingSafeEqual } from "node:crypto";

export type SellerIdentity = { externalId: string; email: string; country: string };

function equalSecret(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function equalSecretConstantTime(left: string, right: string): boolean {
  const a = createHash("sha256").update(left).digest();
  const b = createHash("sha256").update(right).digest();
  return timingSafeEqual(a, b);
}

function configuredSessions(): Map<string, SellerIdentity> {
  const raw = process.env.LEDGERLY_SELLER_SESSIONS;
  if (!raw) return new Map();
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error("LEDGERLY_SELLER_SESSIONS must be valid JSON"); }
  if (!Array.isArray(parsed)) throw new Error("LEDGERLY_SELLER_SESSIONS must be a JSON array");
  const sessions = new Map<string, SellerIdentity>();
  for (const value of parsed) {
    if (!value || typeof value !== "object") throw new Error("Invalid seller session entry");
    const row = value as Record<string, unknown>;
    if (typeof row.token !== "string" || row.token.length < 24 || typeof row.external_id !== "string" || typeof row.email !== "string" || typeof row.country !== "string" || !/^[A-Z]{2}$/.test(row.country)) {
      throw new Error("Each seller session needs a 24+ character token, external_id, email, and ISO country");
    }
    sessions.set(row.token, { externalId: row.external_id, email: row.email.toLowerCase(), country: row.country });
  }
  return sessions;
}

export function authenticateSeller(c: Context): SellerIdentity | null {
  const auth = c.req.header("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const supplied = auth.slice(7);
  for (const [token, identity] of configuredSessions()) if (equalSecret(supplied, token)) return identity;
  return null;
}

export type AdminAuthResult = "authenticated" | "unauthorized" | "not_configured";

export function authenticateAdmin(c: Context): AdminAuthResult {
  const configured = process.env.LEDGERLY_ADMIN_TOKEN;
  if (!configured || configured.length < 24) return "not_configured";
  if ([...configuredSessions().keys()].some(token => equalSecretConstantTime(token, configured))) return "not_configured";
  const auth = c.req.header("authorization");
  const supplied = auth?.startsWith("Bearer ") ? auth.slice(7) : "";
  return equalSecretConstantTime(supplied, configured) ? "authenticated" : "unauthorized";
}
