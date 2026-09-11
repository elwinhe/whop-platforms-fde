import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { createWhopSandboxClient } from "../src/whop.js";
import type { ActivityQuery, Operations } from "./money-contracts.js";
import { runOperation } from "./money-operation.js";
import { safeProviderError } from "../src/domain.js";

function requireEnvId(name: string): string {
  const value = (process.env[name] ?? "").trim();
  if (!/^biz_[A-Za-z0-9]+$/.test(value)) {
    throw new Error(`${name} must be set to a biz_ ID in .env`);
  }
  return value;
}

const PLATFORM = requireEnvId("WHOP_PLATFORM_COMPANY_ID");
const US_SELLER = requireEnvId("LEDGERLY_US_SELLER_ID");
const help = `Step 3 — amounts in USD; accounts come from WHOP_ENV + .env IDs

npm run money -- checkout direct ORDER [--apply]
npm run money -- checkout platform ORDER [--apply]
npm run money -- inspect ACCOUNT_ID [PAYMENT_OR_TRANSFER_ID]
npm run money -- refund PAYMENT_ID [--apply]
npm run money -- transfer BRAZIL_ACCOUNT_ID ORDER [--apply]

Checkout: $25 item; direct checkout includes Ledgerly's $2 fee.
Transfer: $23 from Ledgerly to the supplied connected account.
Writes preview by default. Reuse ORDER when retrying the same operation.
Use a new ORDER only for a genuinely new purchase/transfer.
Inspect saves all ledger pages and optionally the payment/transfer details.
Top up Ledgerly in the sandbox dashboard if available funds are insufficient.`;

const safeFields = new Set([
  "data",
  "page_info",
  "end_cursor",
  "has_next_page",
  "has_previous_page",
  "start_cursor",
  "id",
  "object",
  "account_id",
  "origin_id",
  "destination_id",
  "status",
  "amount",
  "value",
  "currency",
  "code",
  "precision",
  "decimals",
  "formatted",
  "total",
  "subtotal",
  "amount_after_fees",
  "refunded_amount",
  "net_amount",
  "gross_amount",
  "fee_amount",
  "application_fee",
  "amount_captured",
  "amount_refunded",
  "settlement_amount",
  "settlement_currency",
  "tax_amount",
  "type",
  "line_type",
  "category",
  "resource",
  "source",
  "origin",
  "destination",
  "origin_ledger_account_id",
  "destination_ledger_account_id",
  "account",
  "verification",
  "individual",
  "business",
  "required_actions",
  "capabilities",
  "balance",
  "balances",
  "available",
  "pending",
  "reserve",
  "negative",
  "symbol",
  "value_usd",
  "breakdown",
  "pending_settlements",
  "accept_card_payments",
  "transfer",
  "standard_payout",
  "crypto_payout",
]);

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => safeFields.has(key))
      .map(([key, item]) => [key, redact(item)]),
  );
}

function requireId(value: string | undefined, prefix: string): string {
  if (!value || !new RegExp(`^${prefix}_[A-Za-z0-9]+$`).test(value)) {
    throw new Error(`Expected a ${prefix}_ ID`);
  }
  return value;
}

async function main() {
  const raw = process.argv.slice(2);
  if (!raw.length || raw.includes("--help")) return console.log(help);
  const apply = raw.includes("--apply");
  const args = raw.filter((arg) => arg !== "--apply");
  const [command, target, order] = args;
  if (
    raw.filter((arg) => arg === "--apply").length > 1 ||
    args.some((arg) => arg.startsWith("--"))
  ) {
    throw new Error(help);
  }
  let path: string;
  let operation:
    | { kind: "checkout"; body: Operations["checkout"]["request"] }
    | { kind: "refund"; body: Operations["refund"]["request"] }
    | { kind: "transfer"; body: Operations["transfer"]["request"] }
    | undefined;
  let key: string | undefined;

  if (
    command === "checkout" &&
    args.length === 3 &&
    ["direct", "platform"].includes(target)
  ) {
    path = "checkout_configurations";
    operation = {
      kind: "checkout",
      body: {
        mode: "payment",
        account_id: target === "direct" ? US_SELLER : PLATFORM,
        plan: {
          product: {
            title: "Acme Preset Pack",
            external_identifier: `ledgerly-${order}`,
          },
          visibility: "hidden",
          release_method: "buy_now",
          plan_type: "one_time",
          initial_price: 25,
          currency: "usd",
          ...(target === "direct" ? { application_fee_amount: 2 } : {}),
        },
        metadata: { order_id: order },
        redirect_url: "https://example.com/return",
      },
    };
    key = `ledgerly-checkout-${target}-${order}`;
  } else if (command === "refund" && args.length === 2) {
    path = `payments/${requireId(target, "pay")}/refund`;
    operation = { kind: "refund", body: {} };
    key = `ledgerly-full-refund-${target}`;
  } else if (command === "transfer" && args.length === 3) {
    requireId(target, "biz");
    if (target === PLATFORM || target === US_SELLER)
      throw new Error("Supply the Brazilian seller ID");
    path = "transfers";
    key = `ledgerly-transfer-${target}-${order}`;
    operation = {
      kind: "transfer",
      body: {
        origin_id: PLATFORM,
        destination_id: target,
        amount: 23,
        currency: "usd",
        idempotence_key: key,
        metadata: { order_id: order },
      },
    };
  } else if (
    command === "inspect" &&
    (args.length === 2 || args.length === 3) &&
    !apply
  ) {
    path = `accounts/${requireId(target, "biz")}`;
    if (order && !/^(pay|tr)_[A-Za-z0-9]+$/.test(order))
      throw new Error("Expected a pay_ or tr_ ID");
  } else {
    throw new Error(help);
  }
  if (key && (!/^[A-Za-z0-9_-]+$/.test(key) || key.length > 200)) {
    throw new Error(
      "Use a short order reference containing letters, numbers, underscores or hyphens",
    );
  }
  if (operation && !apply)
    return console.log(
      JSON.stringify(
        { method: "POST", path, body: operation.body, idempotency_key: key },
        null,
        2,
      ),
    );

  const client = createWhopSandboxClient();
  const file = resolve(
    "evidence/money-flows",
    `${command}-${randomUUID()}.json`,
  );
  const evidence: unknown[] = [];
  await mkdir(resolve("evidence/money-flows"), { recursive: true });
  console.log(`Evidence: ${file}`);

  async function request<K extends keyof Operations>(
    kind: K,
    endpoint: string,
    payload?: Operations[K]["request"],
  ): Promise<Operations[K]["response"]> {
    const response = await client.request(endpoint, {
      method: payload ? "POST" : "GET",
      headers: {
        "Content-Type": "application/json",
        ...(key ? { "Idempotency-Key": key } : {}),
      },
      ...(payload ? { body: JSON.stringify(payload) } : {}),
    });
    const data: unknown = await response.json();
    evidence.push({
      path: endpoint,
      http_status: response.status,
      request: payload,
      idempotency_key: key,
      response: response.ok ? redact(data) : safeProviderError(data),
    });
    await writeFile(file, JSON.stringify(evidence, null, 2) + "\n", {
      mode: 0o600,
    });
    if (!response.ok)
      throw new Error(
        `Whop HTTP ${response.status}; check key scopes and sandbox dashboard. No automatic retry.`,
      );
    if (!data || typeof data !== "object")
      throw new Error(`Unexpected ${kind} response`);
    if (
      kind !== "activity" &&
      (!("id" in data) || typeof data.id !== "string")
    ) {
      throw new Error(`Missing ${kind} response ID`);
    }
    return data as Operations[K]["response"];
  }

  async function write<K extends "checkout" | "transfer" | "refund">(
    kind: K,
    payload: Operations[K]["request"],
  ): Promise<Operations[K]["response"]> {
    const orderKey =
      kind === "checkout"
        ? `checkout-${target}-${order}`
        : kind === "transfer"
          ? `transfer-${order}`
          : `refund-${target}`;
    return runOperation({
      orderKey,
      fingerprint: JSON.stringify({ path, payload, key }),
      create: () => request(kind, path, payload),
      retrieve: (id) => {
        const prefix =
          kind === "checkout" ? "ch" : kind === "transfer" ? "tr" : "pay";
        requireId(id, prefix);
        const resource =
          kind === "checkout"
            ? "checkout_configurations"
            : kind === "transfer"
              ? "transfers"
              : "payments";
        return request(kind, `${resource}/${id}`);
      },
    });
  }

  if (operation?.kind === "checkout") {
    const result = await write("checkout", operation.body);
    console.log(JSON.stringify(redact(result), null, 2));
    if (!result.purchase_url)
      throw new Error(
        "No purchase_url returned; inspect the checkout in the sandbox dashboard",
      );
    console.log(`Pay with a sandbox card: ${result.purchase_url}`);
  } else if (operation) {
    const result =
      operation.kind === "transfer"
        ? await write("transfer", operation.body)
        : await write("refund", operation.body);
    console.log(JSON.stringify(redact(result), null, 2));
  }

  if (command === "inspect") {
    const account = await request("account", path);
    console.log(JSON.stringify(redact(account), null, 2));
    if (order) {
      const detail = order.startsWith("pay_")
        ? await request("payment", `payments/${order}`)
        : await request("transfer", `transfers/${order}`);
      console.log(JSON.stringify(redact(detail), null, 2));
    }
    let cursor = "";
    const seen = new Set<string>();
    do {
      const params: ActivityQuery = { account_id: target, limit: "100" };
      const query = new URLSearchParams({ ...params });
      if (cursor) query.set("cursor", cursor);
      const page = await request("activity", `financial-activity?${query}`);
      if (!Array.isArray(page.data) || !page.page_info)
        throw new Error("Unexpected ledger pagination shape");
      console.log(JSON.stringify(redact(page.data), null, 2));
      cursor = page.page_info.has_next_page
        ? (page.page_info.end_cursor ?? "")
        : "";
      if (page.page_info.has_next_page && (!cursor || seen.has(cursor)))
        throw new Error("Ledger pagination did not advance");
      if (cursor) seen.add(cursor);
    } while (cursor);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Request failed");
  process.exitCode = 1;
});
