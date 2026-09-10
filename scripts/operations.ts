import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createWhopSandboxClient } from "../src/whop.js";
import { COMPANY_ID, isObject, safeProviderError } from "../src/domain.js";

const EVENTS = ["payment.succeeded","payment.failed","refund.created","dispute.created","transfer.completed","payout.created","payout.updated","account.updated"];
const help = `operations <group> <action> [arguments] [--apply]

Preview is the default. Writes require --apply.
  webhook create <https-url>
  webhook test <webhook-id> <event>
  webhook replay <webhook-id> <delivery-id>
  account suspend <seller-biz-id>
  key create <seller-biz-id>
  markup crypto <seller-biz-id> <percentage>`;
function id(value: string | undefined, prefix: string): string {
  if (!value || !new RegExp(`^${prefix}_[A-Za-z0-9]+$`).test(value)) throw new Error(`Expected a ${prefix}_ ID`);
  return value;
}
function opaqueId(value: string | undefined): string {
  if (!value || !/^[A-Za-z0-9_-]{1,200}$/.test(value)) throw new Error("Expected a delivery ID");
  return value;
}
function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (!isObject(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key,item]) => [key, /token|secret|key_value|raw/i.test(key) ? "[REDACTED]" : redact(item)]));
}
async function assertConnectedSeller(seller: string): Promise<void> {
  const platform = process.env.WHOP_PLATFORM_COMPANY_ID;
  if (!platform || !COMPANY_ID.test(platform)) throw new Error("Set WHOP_PLATFORM_COMPANY_ID");
  const client = createWhopSandboxClient(); let after = ""; const seen = new Set<string>();
  do {
    const query = new URLSearchParams({ parent_company_id: platform, first: "100" }); if (after) query.set("after", after);
    const { response, data } = await client.json(`companies?${query}`);
    if (!response.ok || !isObject(data) || !Array.isArray(data.data) || !isObject(data.page_info)) throw new Error(`Could not verify connected account (Whop HTTP ${response.status})`);
    if (data.data.some(item => isObject(item) && item.id === seller)) return;
    const more = data.page_info.has_next_page === true; after = more && typeof data.page_info.end_cursor === "string" ? data.page_info.end_cursor : "";
    if (more && (!after || seen.has(after))) throw new Error("Company pagination did not advance"); if (after) seen.add(after);
  } while (after);
  throw new Error(`${seller} is not a connected account of ${platform}`);
}
async function main() {
  const raw = process.argv.slice(2);
  if (raw.includes("--help") || raw.length === 0) return console.log(help);
  const apply = raw.includes("--apply"), args = raw.filter(arg => arg !== "--apply");
  const [group, action, one, two] = args;
  const platform = process.env.WHOP_PLATFORM_COMPANY_ID ?? "<WHOP_PLATFORM_COMPANY_ID>";
  let path = "", body: Record<string, unknown> | undefined;
  if (group === "webhook" && action === "create" && args.length === 3) {
    const url = new URL(one); if (url.protocol !== "https:") throw new Error("Webhook URL must use HTTPS");
    path = "webhooks"; body = { url: url.toString(), resource_id: platform, child_resource_events: true, enabled: true, events: EVENTS };
  } else if (group === "webhook" && action === "test" && args.length === 4) {
    path = `webhooks/${id(one,"hook")}/test`; if (!EVENTS.includes(two)) throw new Error("Test event must be configured"); body = { event: two };
  } else if (group === "webhook" && action === "replay" && args.length === 4) {
    path = `webhooks/${id(one,"hook")}/deliveries/${opaqueId(two)}/replay`; body = { regenerate_id: false };
  } else if (group === "account" && action === "suspend" && args.length === 3) {
    path = `accounts/${id(one,"biz")}/suspend`; body = {};
  } else if (group === "key" && action === "create" && args.length === 3) {
    const seller = id(one,"biz"); path = "api_keys";
    body = { resource_id: seller, resource_type: "account", name: `Ledgerly seller ${seller}`, permissions: { statements: [{ grant: true, resources: [seller], actions: ["company:basic:read","payment:basic:read","payout:withdrawal:read","company:balance:read"] }] } };
  } else if (group === "markup" && action === "crypto" && args.length === 4) {
    const seller = id(one,"biz"), percentage = Number(two);
    if (!Number.isFinite(percentage) || percentage < 0 || percentage > 25) throw new Error("Percentage must be between 0 and 25");
    path = "fee_markups"; body = { account_id: seller, fee_type: "crypto_withdrawal_markup", percentage_fee: percentage, fixed_fee_usd: 0, notes: "Ledgerly crypto withdrawal markup" };
  } else throw new Error(help);
  if (!apply) return console.log(JSON.stringify({ mode: "preview", method: "POST", path, body }, null, 2));
  if (!COMPANY_ID.test(platform)) throw new Error("Set WHOP_PLATFORM_COMPANY_ID");
  if ((group === "account" || group === "key" || group === "markup") && one) await assertConnectedSeller(one);
  const userToken = group === "key" ? process.env.WHOP_USER_TOKEN : undefined;
  if (group === "key" && !userToken) throw new Error("WHOP_USER_TOKEN is required: Whop does not allow API keys to create API keys");
  const { response, data } = await createWhopSandboxClient(userToken ? { bearerToken: userToken } : {}).json(path, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": `ledgerly-${group}-${action}-${one ?? "platform"}` }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`Whop HTTP ${response.status}: ${JSON.stringify(safeProviderError(data))}`);
  if (group === "key" && isObject(data) && typeof data.secret_key === "string") {
    const output = resolve("evidence/api-keys", `${one}.json`);
    await mkdir(dirname(output), { recursive: true, mode: 0o700 });
    await writeFile(output, JSON.stringify({ id: data.id, secret_key: data.secret_key }, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    console.log(`API key secret saved with mode 0600 under ignored evidence/api-keys/${one}.json`);
  }
  console.log(JSON.stringify(redact(data), null, 2));
  if (group === "key") console.log("API key created; its secret was intentionally not printed.");
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Operation failed"); process.exitCode = 1; });
