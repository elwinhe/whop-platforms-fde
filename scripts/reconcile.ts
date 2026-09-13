import { DatabaseSync } from "node:sqlite";
import { createWhopSandboxClient } from "../src/whop.js";
import { COMPANY_ID, currencyMinorDigits, isObject, majorToMinor, safeProviderError } from "../src/domain.js";

type RecordRow = { resource_type: "payment"|"transfer"; resource_id: string; amount_minor: number|null; currency: string|null; status: string };
const help = "reconcile --seller <biz_id> [--db <sqlite-path>]\nRead-only: fetches all seller payments/transfers, then compares them with the existing local ledger.";
async function pages(path: string): Promise<Record<string, unknown>[]> {
  const client = createWhopSandboxClient(), rows: Record<string, unknown>[] = [], seen = new Set<string>();
  let after = "";
  do {
    const separator = path.includes("?") ? "&" : "?";
    const { response, data } = await client.json(`${path}${separator}first=50${after ? `&after=${encodeURIComponent(after)}` : ""}`);
    if (!response.ok) throw new Error(`Whop HTTP ${response.status} while reading ${path}: ${JSON.stringify(safeProviderError(data))}`);
    if (!isObject(data) || !Array.isArray(data.data) || !isObject(data.page_info)) throw new Error(`Invalid Whop page while reading ${path}`);
    for (const item of data.data) if (isObject(item)) rows.push(item);
    const more = data.page_info.has_next_page === true;
    after = more && typeof data.page_info.end_cursor === "string" ? data.page_info.end_cursor : "";
    if (more && (!after || seen.has(after))) throw new Error(`Pagination did not advance for ${path}`);
    if (after) seen.add(after);
  } while (after);
  return rows;
}
function normalize(type: "payment"|"transfer", row: Record<string, unknown>): RecordRow | null {
  if (typeof row.id !== "string") return null;
  const money = isObject(row.total) ? row.total : null;
  const currency = typeof money?.currency === "string" ? money.currency.toLowerCase() : typeof row.currency === "string" ? row.currency.toLowerCase() : null;
  const decimals = typeof money?.decimals === "number" ? money.decimals : currency ? currencyMinorDigits(currency) : 2;
  const amount = money ? money.amount ?? row.amount : row.total ?? row.amount;
  return { resource_type: type, resource_id: row.id, amount_minor: majorToMinor(amount, decimals), currency, status: typeof row.status === "string" ? row.status : "unknown" };
}
async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help")) return console.log(help);
  const sellerIndex = args.indexOf("--seller"), dbIndex = args.indexOf("--db");
  if (sellerIndex < 0 || !COMPANY_ID.test(args[sellerIndex+1] ?? "") || args.some((arg,index) => !["--seller","--db"].includes(arg) && index !== sellerIndex+1 && index !== dbIndex+1)) throw new Error(help);
  const seller = args[sellerIndex+1], dbPath = dbIndex >= 0 ? args[dbIndex+1] : process.env.LEDGERLY_DB_PATH ?? "data/ledgerly.sqlite";
  if (!dbPath) throw new Error("--db requires a path");
  const db = new DatabaseSync(dbPath, { readOnly: true });
  let local: RecordRow[];
  try { local = db.prepare("SELECT resource_type,resource_id,amount_minor,currency,status FROM ledger_entries WHERE seller_company_id=? AND resource_type IN ('payment','transfer') ORDER BY resource_type,resource_id").all(seller) as RecordRow[]; }
  finally { db.close(); }
  const paymentRows = await pages(`payments?account_id=${encodeURIComponent(seller)}`);
  const sent = await pages(`transfers?origin_id=${encodeURIComponent(seller)}`), received = await pages(`transfers?destination_id=${encodeURIComponent(seller)}`);
  const remoteMap = new Map<string, RecordRow>();
  for (const row of paymentRows) { const item = normalize("payment",row); if (item) remoteMap.set(`payment:${item.resource_id}`,item); }
  for (const row of [...sent,...received]) { const item = normalize("transfer",row); if (item) remoteMap.set(`transfer:${item.resource_id}`,item); }
  const localMap = new Map(local.map(row => [`${row.resource_type}:${row.resource_id}`,row]));
  const missingLocal: RecordRow[] = [], missingRemote: RecordRow[] = [], mismatched: { local: RecordRow; remote: RecordRow; fields: string[] }[] = [];
  for (const [key,remote] of remoteMap) {
    const own = localMap.get(key); if (!own) missingLocal.push(remote);
    else {
      const fields = (["amount_minor", "currency", "status"] as const).filter(
        field => own[field] !== remote[field] ||
          (field === "amount_minor" && (own[field] === null || remote[field] === null)),
      );
      if (fields.length) mismatched.push({ local: own, remote, fields });
    }
  }
  for (const [key,own] of localMap) if (!remoteMap.has(key)) missingRemote.push(own);
  const sort = (a: RecordRow,b: RecordRow) => `${a.resource_type}:${a.resource_id}`.localeCompare(`${b.resource_type}:${b.resource_id}`);
  missingLocal.sort(sort); missingRemote.sort(sort); mismatched.sort((a,b) => sort(a.local,b.local));
  console.log(JSON.stringify({ seller_company_id: seller, units: "integer minor units", counts: { local: local.length, remote: remoteMap.size }, missing_local: missingLocal, missing_remote: missingRemote, mismatched },null,2));
  if (missingLocal.length || missingRemote.length || mismatched.length) process.exitCode = 2;
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Reconciliation failed"); process.exitCode = 1; });
