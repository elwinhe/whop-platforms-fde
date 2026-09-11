import {
  currencyMinorDigits,
  isObject,
  majorToMinor,
  safeProviderError,
} from "./domain.js";
import type { LedgerRow, LedgerStore } from "./store.js";
import { createWhopSandboxClient } from "./whop.js";

export type TransactionRow = {
  source: "payment" | "transfer_in" | "transfer_out" | "ledger_only";
  resource_id: string;
  occurred_at: string | null;
  description: string;
  order_id: string | null;
  currency: string | null;
  currency_decimals: number;
  gross_minor: number | null;
  fee_minor: number | null;
  net_minor: number | null;
  status: string;
  settlement: "pending" | "refunded" | "partially_refunded" | null;
  ledger_recorded: boolean;
};

async function listPages(path: string): Promise<Record<string, unknown>[]> {
  const client = createWhopSandboxClient();
  const rows: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  let after = "";
  do {
    const separator = path.includes("?") ? "&" : "?";
    const { response, data } = await client.json(
      `${path}${separator}first=50${after ? `&after=${encodeURIComponent(after)}` : ""}`,
    );
    if (!response.ok)
      throw new Error(
        `Whop HTTP ${response.status} while reading ${path}: ${JSON.stringify(safeProviderError(data))}`,
      );
    if (
      !isObject(data) ||
      !Array.isArray(data.data) ||
      !isObject(data.page_info)
    )
      throw new Error(`Invalid Whop page while reading ${path}`);
    for (const item of data.data) if (isObject(item)) rows.push(item);
    const more = data.page_info.has_next_page === true;
    after =
      more && typeof data.page_info.end_cursor === "string"
        ? data.page_info.end_cursor
        : "";
    if (more && (!after || seen.has(after)))
      throw new Error(`Pagination did not advance for ${path}`);
    if (after) seen.add(after);
  } while (after);
  return rows;
}

function isoDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

function safeDecimals(currency: string | null): number {
  if (!currency) return 2;
  try {
    return currencyMinorDigits(currency);
  } catch {
    return 2;
  }
}

function paymentTransaction(
  row: Record<string, unknown>,
  ledger: ReadonlySet<string>,
): TransactionRow | null {
  if (typeof row.id !== "string") return null;
  const currency =
    typeof row.currency === "string" ? row.currency.toLowerCase() : null;
  const decimals = safeDecimals(currency);
  const fee = isObject(row.application_fee) ? row.application_fee : null;
  const product = isObject(row.product) ? row.product : null;
  const metadata = isObject(row.metadata) ? row.metadata : null;
  const status = typeof row.status === "string" ? row.status : "unknown";
  const grossMinor = majorToMinor(row.total, decimals);
  const refundedMinor = majorToMinor(row.refunded_amount, decimals) ?? 0;
  return {
    source: "payment",
    resource_id: row.id,
    occurred_at: isoDate(row.paid_at) ?? isoDate(row.created_at),
    description:
      typeof product?.title === "string" && product.title
        ? product.title
        : "Sale",
    order_id:
      typeof metadata?.order_id === "string" ? metadata.order_id : null,
    currency,
    currency_decimals: decimals,
    gross_minor: grossMinor,
    fee_minor: majorToMinor(fee?.amount, decimals),
    net_minor: majorToMinor(row.amount_after_fees, decimals),
    status,
    settlement:
      refundedMinor > 0
        ? grossMinor !== null && refundedMinor >= grossMinor
          ? "refunded"
          : "partially_refunded"
        : status === "paid"
          ? "pending"
          : null,
    ledger_recorded: ledger.has(`payment:${row.id}`),
  };
}

function transferTransaction(
  row: Record<string, unknown>,
  direction: "transfer_in" | "transfer_out",
  ledger: ReadonlySet<string>,
): TransactionRow | null {
  if (typeof row.id !== "string") return null;
  const money = isObject(row.total) ? row.total : null;
  const currency =
    typeof money?.currency === "string"
      ? money.currency.toLowerCase()
      : typeof row.currency === "string"
        ? row.currency.toLowerCase()
        : null;
  const decimals =
    typeof money?.decimals === "number" ? money.decimals : safeDecimals(currency);
  const amountMinor = majorToMinor(money?.amount ?? row.amount, decimals);
  const counterparty =
    direction === "transfer_out"
      ? isObject(row.destination) && typeof row.destination.id === "string"
        ? row.destination.id
        : null
      : isObject(row.origin) && typeof row.origin.id === "string"
        ? row.origin.id
        : null;
  return {
    source: direction,
    resource_id: row.id,
    occurred_at: isoDate(row.created_at),
    description:
      direction === "transfer_in"
        ? `Transfer from ${counterparty ?? "platform"}`
        : `Transfer to ${counterparty ?? "platform"}`,
    order_id: null,
    currency,
    currency_decimals: decimals,
    gross_minor: amountMinor,
    fee_minor: null,
    net_minor:
      amountMinor === null
        ? null
        : direction === "transfer_out"
          ? -amountMinor
          : amountMinor,
    status: typeof row.status === "string" ? row.status : "unknown",
    settlement: null,
    ledger_recorded: ledger.has(`transfer:${row.id}`),
  };
}

function ledgerOnlyTransaction(row: LedgerRow): TransactionRow {
  return {
    source: "ledger_only",
    resource_id: row.resource_id,
    occurred_at: null,
    description: `${row.resource_type} recorded by webhook only`,
    order_id: null,
    currency: row.currency,
    currency_decimals: safeDecimals(row.currency),
    gross_minor: row.amount_minor,
    fee_minor: null,
    net_minor: null,
    status: row.status,
    settlement: null,
    ledger_recorded: true,
  };
}

export async function findCompanyPayment(
  companyId: string,
  paymentId: string,
): Promise<TransactionRow | null> {
  const rows = await listPages(
    `payments?account_id=${encodeURIComponent(companyId)}`,
  );
  const match = rows.find((row) => row.id === paymentId);
  return match ? paymentTransaction(match, new Set()) : null;
}

export async function loadCompanyTransactions(
  store: LedgerStore,
  companyId: string,
): Promise<TransactionRow[]> {
  const account = encodeURIComponent(companyId);
  const [payments, sent, received] = await Promise.all([
    listPages(`payments?account_id=${account}`),
    listPages(`transfers?origin_id=${account}`),
    listPages(`transfers?destination_id=${account}`),
  ]);
  const ledgerRows = store.ledgerForSeller(companyId);
  const ledger = new Set(
    ledgerRows.map((row) => `${row.resource_type}:${row.resource_id}`),
  );
  const transactions: TransactionRow[] = [];
  const seen = new Set<string>();
  for (const row of payments) {
    const item = paymentTransaction(row, ledger);
    if (item && !seen.has(`payment:${item.resource_id}`)) {
      transactions.push(item);
      seen.add(`payment:${item.resource_id}`);
    }
  }
  for (const [rows, direction] of [
    [sent, "transfer_out"],
    [received, "transfer_in"],
  ] as const) {
    for (const row of rows) {
      const item = transferTransaction(row, direction, ledger);
      if (item && !seen.has(`transfer:${item.resource_id}`)) {
        transactions.push(item);
        seen.add(`transfer:${item.resource_id}`);
      }
    }
  }
  for (const row of ledgerRows) {
    if (
      (row.resource_type === "payment" || row.resource_type === "transfer") &&
      !seen.has(`${row.resource_type}:${row.resource_id}`)
    )
      transactions.push(ledgerOnlyTransaction(row));
  }
  return transactions.sort((left, right) =>
    (right.occurred_at ?? "").localeCompare(left.occurred_at ?? ""),
  );
}
