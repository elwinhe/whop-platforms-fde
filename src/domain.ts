import { createHash } from "node:crypto";

export const COMPANY_ID = /^biz_[A-Za-z0-9]+$/;
export const PAYMENT_ID = /^pay_[A-Za-z0-9]+$/;
export const CURRENCY = /^[a-z]{3}$/;
export const ORDER_ID = /^[A-Za-z0-9_-]{1,120}$/;

export function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function fingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function currencyMinorDigits(currency: string): number {
  try { return new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2; }
  catch { throw new Error(`Unsupported ISO currency: ${currency}`); }
}

export function majorToMinor(value: unknown, decimals = 2): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const text = String(value);
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 12 || !new RegExp(`^-?\\d+(?:\\.\\d{1,${Math.max(decimals, 1)}})?$`).test(text)) return null;
  const negative = text.startsWith("-");
  const [whole, fraction = ""] = (negative ? text.slice(1) : text).split(".");
  if (decimals === 0 && fraction) return null;
  const factor = 10 ** decimals;
  const minor = Number(whole) * factor + Number(fraction.padEnd(decimals, "0"));
  if (!Number.isSafeInteger(minor)) return null;
  return negative ? -minor : minor;
}

export function minorToMajor(value: number, decimals = 2): number {
  return Number((value / 10 ** decimals).toFixed(decimals));
}

export function applicationFeeMinor(amountMinor: number): number {
  return Math.floor((amountMinor * 8 + 50) / 100);
}

export function safeProviderError(data: unknown): unknown {
  if (!isObject(data)) return { message: "Unexpected provider response" };
  const error = isObject(data.error) ? data.error : data;
  return {
    type: typeof error.type === "string" ? error.type : undefined,
    code: typeof error.code === "string" ? error.code : undefined,
    param: typeof error.param === "string" ? error.param : undefined,
    message: typeof error.message === "string" ? error.message : "Whop request failed",
  };
}
