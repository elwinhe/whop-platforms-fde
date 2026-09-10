/**
 * Reproducible sandbox seller setup for Step 1 of the assessment.
 *
 * Preview mode (the default) prints the payloads and touches nothing. `--apply` lists the
 * platform's existing child companies, reuses any seller whose `metadata.external_id` matches,
 * and creates the rest. `--probe` additionally repeats the US creation and attempts to nest a
 * company beneath a connected account. Every applied run writes an evidence file.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { createWhopSandboxClient } from "../src/whop.js";

type Client = ReturnType<typeof createWhopSandboxClient>;

type Company = {
  id: string;
  metadata?: { external_id?: string };
};

type Seller = {
  title: string;
  email: string;
  parent_company_id: string;
  metadata: { external_id: string; country: string };
};

type NestedProbe = {
  title: string;
  email: string;
  metadata: { external_id: string };
};

const COUNTRIES = ["US", "DE", "BR"];
const COMPANIES_PATH = "companies";
const PAGE_SIZE = "100";
const EVIDENCE_DIR = "evidence/seed-sellers";
const PARENT_PLACEHOLDER = "<WHOP_PLATFORM_COMPANY_ID>";
const EMAIL_PLACEHOLDER = "<SEED_SELLER_EMAIL>";

const COMPANY_ID = /^biz_[A-Za-z0-9]+$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// RFC 2606 reserved names never receive mail; the sandbox rejected example.com with HTTP 400 (docs/evidence.md).
const RESERVED_DOMAIN = /(^|\.)example\.(com|net|org)$|(^|\.)(test|example|invalid|localhost)$/i;

const HELP = [
  "seed:sellers [--apply] [--probe]",
  "Default: preview only. --apply reuses/creates sellers; --probe also repeats US creation and attempts nesting."
    + " Set WHOP_API_KEY, WHOP_PLATFORM_COMPANY_ID, and SEED_SELLER_EMAIL (a mailbox you control;"
    + " optional per-account SEED_SELLER_EMAIL_US/DE/BR/NESTED overrides) for --apply.",
].join("\n");

/** Resolves one account's address: SEED_SELLER_EMAIL_<ACCOUNT>, else the shared SEED_SELLER_EMAIL. */
function receivingEmail(account: string): string {
  const override = process.env[`SEED_SELLER_EMAIL_${account}`]?.trim();
  const shared = process.env.SEED_SELLER_EMAIL?.trim();
  return override || shared || EMAIL_PLACEHOLDER;
}

/** Whop rejects addresses that cannot receive mail, so refuse unset and reserved-domain values locally. */
function assertReceivingEmail(account: string, email: string): void {
  if (email === EMAIL_PLACEHOLDER) {
    throw new Error(
      `Set SEED_SELLER_EMAIL or SEED_SELLER_EMAIL_${account} to a mailbox you control;`
        + " Whop rejects addresses that cannot receive mail",
    );
  }
  const domain = email.slice(email.lastIndexOf("@") + 1);
  if (!EMAIL.test(email) || RESERVED_DOMAIN.test(domain)) {
    throw new Error(`${account} email "${email}" is not a receiving address`);
  }
}

function buildSellers(parentCompanyId: string): Seller[] {
  return COUNTRIES.map(country => ({
    title: `Ledgerly ${country} seller`,
    email: receivingEmail(country),
    parent_company_id: parentCompanyId,
    metadata: {
      external_id: `ledgerly_seller_${country.toLowerCase()}`,
      country,
    },
  }));
}

function buildNestedProbe(): NestedProbe {
  return {
    title: "Ledgerly nested probe",
    email: receivingEmail("NESTED"),
    metadata: { external_id: "ledgerly-nested-probe" },
  };
}

/** Strips the configured key and any apik_ token before evidence or an error message escapes. */
function redactSecrets(text: string): string {
  const key = process.env.WHOP_API_KEY;
  const withoutKey = key ? text.replaceAll(key, "[REDACTED]") : text;
  return withoutKey.replace(/apik_[A-Za-z0-9_-]+/g, "[REDACTED]");
}

type Evidence = {
  platform: string;
  events: unknown[];
  error?: string;
  complete: boolean;
};

type EvidenceLog = ReturnType<typeof createEvidenceLog>;

/**
 * Owns the run's evidence file and the only path to the API. Every request is recorded and
 * flushed to disk immediately, so a crash or timeout still leaves what was already attempted.
 */
function createEvidenceLog(platform: string, client: Client) {
  const stamp = new Date().toISOString().replaceAll(":", "-");
  const file = `${EVIDENCE_DIR}/${stamp}-${randomUUID()}.json`;
  const evidence: Evidence = { platform, events: [], complete: false };

  const save = () => {
    const json = redactSecrets(JSON.stringify(evidence, null, 2));
    return writeFile(file, `${json}\n`, { mode: 0o600 });
  };

  const record = (event: Record<string, unknown>) => {
    evidence.events.push(event);
  };

  const request = async (label: string, path: string, body?: unknown) => {
    const init: RequestInit = body === undefined ? {} : {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    };

    const response = await client.request(path, init);
    const raw = await response.text();

    let data: any;
    try {
      data = JSON.parse(raw);
    } catch {
      data = {};
    }

    record({
      label,
      method: body === undefined ? "GET" : "POST",
      path,
      request: body,
      status: response.status,
      response: {
        id: data?.id,
        external_id: data?.metadata?.external_id,
        error: data?.error ? { type: data.error.type, message: data.error.message } : undefined,
      },
    });
    await save();

    return { response, data };
  };

  return { file, evidence, save, record, request };
}

/** Walks every page of the platform's children, refusing a missing or repeated cursor. */
async function listChildCompanies(parent: string, log: EvidenceLog): Promise<Company[]> {
  const companies: Company[] = [];
  const seenCursors = new Set<string>();
  let cursor = "";

  do {
    const query = new URLSearchParams({ parent_company_id: parent, first: PAGE_SIZE });
    if (cursor) query.set("after", cursor);

    const { response, data } = await log.request("list children", `${COMPANIES_PATH}?${query}`);
    const usable = response.ok
      && Array.isArray(data?.data)
      && typeof data?.page_info?.has_next_page === "boolean";
    if (!usable) throw new Error(`Invalid child listing (HTTP ${response.status})`);

    companies.push(...data.data);
    cursor = data.page_info.has_next_page ? data.page_info.end_cursor : "";
    if (data.page_info.has_next_page && (!cursor || seenCursors.has(cursor))) {
      throw new Error("Invalid/repeated pagination cursor");
    }
    seenCursors.add(cursor);
  } while (cursor);

  return companies;
}

/** Two children sharing an external ID make reuse arbitrary, so stop before touching either. */
function assertUnambiguous(sellers: Seller[], companies: Company[]): void {
  for (const seller of sellers) {
    const matches = companies.filter(
      company => company.metadata?.external_id === seller.metadata.external_id,
    );
    if (matches.length > 1) throw new Error(`Ambiguous seller: ${seller.metadata.external_id}`);
  }
}

/** Reuses each seller found by external ID and creates the rest. Returns the US seller's ID. */
async function reuseOrCreateSellers(
  sellers: Seller[],
  companies: Company[],
  log: EvidenceLog,
): Promise<string> {
  let usId = "";

  for (const seller of sellers) {
    let company = companies.find(
      candidate => candidate.metadata?.external_id === seller.metadata.external_id,
    );

    if (company) {
      log.record({ label: "reused", id: company.id, external_id: seller.metadata.external_id });
    } else {
      const { response, data } = await log.request("create seller", COMPANIES_PATH, seller);
      if (!response.ok) {
        throw new Error(`Seller creation failed (HTTP ${response.status}); inspect evidence`);
      }
      company = data;
    }

    if (!company || typeof company.id !== "string" || !company.id.startsWith("biz_")) {
      throw new Error("Seller response has no valid ID");
    }
    if (seller.metadata.country === "US") usId = company.id;

    console.log(`${seller.metadata.country}: ${company.id}`);
    await log.save();
  }

  return usId;
}

/**
 * Repeats the US creation to observe whether Whop dedupes (this deliberately bypasses reuse and
 * can create an extra account), then attempts a company nested beneath a connected account.
 */
async function runProbes(
  usSeller: Seller,
  nestedProbe: NestedProbe,
  usId: string,
  log: EvidenceLog,
): Promise<void> {
  const duplicate = await log.request("duplicate US create", COMPANIES_PATH, usSeller);
  const outcome = !duplicate.response.ok
    ? "rejected"
    : duplicate.data?.id === usId
      ? "same ID"
      : "different ID; inspect response";
  log.record({ label: "duplicate outcome", original_id: usId, outcome });
  await log.save();

  const nested = await log.request("nested create", COMPANIES_PATH, {
    ...nestedProbe,
    parent_company_id: usId,
  });
  if (nested.response.ok) {
    throw new Error("Unexpected nested-account success; inspect evidence and created ID");
  }
  if (nested.response.status !== 422) {
    throw new Error(`Nested probe returned HTTP ${nested.response.status}; nesting constraint not confirmed`);
  }
}

export async function seedSellers(args = process.argv.slice(2), client?: Client) {
  if (args.includes("--help")) {
    console.log(HELP);
    return;
  }

  if (args.some(arg => arg !== "--apply" && arg !== "--probe")) {
    throw new Error("Unknown argument; use --help");
  }
  const apply = args.includes("--apply");
  const probe = args.includes("--probe");
  if (probe && !apply) throw new Error("--probe requires --apply");

  const parent = process.env.WHOP_PLATFORM_COMPANY_ID;
  const sellers = buildSellers(parent ?? PARENT_PLACEHOLDER);
  const nestedProbe = buildNestedProbe();

  if (!apply) {
    const preview = { mode: "preview", method: "POST", path: COMPANIES_PATH, sellers };
    console.log(JSON.stringify(preview, null, 2));
    return;
  }

  if (!parent || !COMPANY_ID.test(parent)) {
    throw new Error("Set WHOP_PLATFORM_COMPANY_ID to Ledgerly's biz_ ID");
  }

  // Validate every address this run may submit before the first request, so a missing or
  // undeliverable one cannot stop the run halfway with some sellers already created.
  for (const seller of sellers) assertReceivingEmail(seller.metadata.country, seller.email);
  if (probe) assertReceivingEmail("NESTED", nestedProbe.email);

  client ??= createWhopSandboxClient();
  await mkdir(EVIDENCE_DIR, { recursive: true });
  const log = createEvidenceLog(parent, client);

  try {
    await log.save();
    const companies = await listChildCompanies(parent, log);
    assertUnambiguous(sellers, companies);
    const usId = await reuseOrCreateSellers(sellers, companies, log);
    if (probe) await runProbes(sellers[0], nestedProbe, usId, log);
    log.evidence.complete = true;
  } catch (error) {
    const message = redactSecrets(error instanceof Error ? error.message : String(error));
    log.evidence.error = message;
    throw new Error(message);
  } finally {
    await log.save();
    console.log(`Evidence: ${log.file}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  seedSellers().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
