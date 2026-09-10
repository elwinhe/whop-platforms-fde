import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { createWhopSandboxClient } from "../src/whop.js";

type Company = { id: string; metadata?: { external_id?: string } };
type Client = ReturnType<typeof createWhopSandboxClient>;

export async function seedSellers(args = process.argv.slice(2), client?: Client) {
  if (args.includes("--help")) {
    console.log("seed:sellers [--apply] [--probe]\nDefault: preview only. --apply reuses/creates sellers; --probe also repeats US creation and attempts nesting. Set WHOP_API_KEY and WHOP_PLATFORM_COMPANY_ID for --apply.");
    return;
  }
  if (args.some(arg => !["--apply", "--probe"].includes(arg))) throw new Error("Unknown argument; use --help");
  if (args.includes("--probe") && !args.includes("--apply")) throw new Error("--probe requires --apply");
  const parent = process.env.WHOP_PLATFORM_COMPANY_ID;
  const sellers = ["US", "DE", "BR"].map(country => ({
    title: `Ledgerly ${country} seller`, email: `ledgerly-seller-${country.toLowerCase()}@example.com`,
    parent_company_id: parent ?? "<WHOP_PLATFORM_COMPANY_ID>",
    metadata: { external_id: `ledgerly-seller-${country.toLowerCase()}`, country },
  }));
  if (!args.includes("--apply")) {
    console.log(JSON.stringify({ mode: "preview", method: "POST", path: "companies", sellers }, null, 2));
    return;
  }
  if (!parent || !/^biz_[A-Za-z0-9]+$/.test(parent)) throw new Error("Set WHOP_PLATFORM_COMPANY_ID to Ledgerly's biz_ ID");
  client ??= createWhopSandboxClient();
  await mkdir("evidence/seed-sellers", { recursive: true });
  const file = `evidence/seed-sellers/${new Date().toISOString().replaceAll(":", "-")}-${randomUUID()}.json`;
  const evidence: { platform: string; events: unknown[]; error?: string; complete: boolean } = { platform: parent, events: [], complete: false };
  const redact = (text: string) => {
    const key = process.env.WHOP_API_KEY;
    return (key ? text.replaceAll(key, "[REDACTED]") : text).replace(/apik_[A-Za-z0-9_-]+/g, "[REDACTED]");
  };
  const save = () => writeFile(file, redact(JSON.stringify(evidence, null, 2)) + "\n", { mode: 0o600 });
  const request = async (label: string, path: string, body?: unknown) => {
    const response = await client.request(path, body === undefined ? {} : {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const raw = await response.text();
    let data: any;
    try { data = JSON.parse(raw); } catch { data = {}; }
    evidence.events.push({ label, method: body === undefined ? "GET" : "POST", path, request: body,
      status: response.status, response: { id: data?.id,
        external_id: data?.metadata?.external_id,
        error: data?.error ? { type: data.error.type, message: data.error.message } : undefined,
      },
    });
    await save();
    return { response, data };
  };
  try {
    await save();
    const companies: Company[] = [];
    const cursors = new Set<string>();
    let cursor = "";
    do {
      const query = new URLSearchParams({ parent_company_id: parent, first: "100" });
      if (cursor) query.set("after", cursor);
      const { response, data } = await request("list children", `companies?${query}`);
      if (!response.ok || !Array.isArray(data?.data) || typeof data?.page_info?.has_next_page !== "boolean") throw new Error(`Invalid child listing (HTTP ${response.status})`);
      companies.push(...data.data);
      cursor = data.page_info.has_next_page ? data.page_info.end_cursor : "";
      if (data.page_info.has_next_page && (!cursor || cursors.has(cursor))) throw new Error("Invalid/repeated pagination cursor");
      cursors.add(cursor);
    } while (cursor);
    for (const seller of sellers) {
      if (companies.filter(company => company.metadata?.external_id === seller.metadata.external_id).length > 1) throw new Error(`Ambiguous seller: ${seller.metadata.external_id}`);
    }
    let usId = "";
    for (const seller of sellers) {
      let company = companies.find(company => company.metadata?.external_id === seller.metadata.external_id);
      if (company) evidence.events.push({ label: "reused", id: company.id, external_id: seller.metadata.external_id });
      else {
        const { response, data } = await request("create seller", "companies", seller);
        if (!response.ok) throw new Error(`Seller creation failed (HTTP ${response.status}); inspect evidence`);
        company = data;
      }
      if (!company || typeof company.id !== "string" || !company.id.startsWith("biz_")) throw new Error("Seller response has no valid ID");
      if (seller.metadata.country === "US") usId = company.id;
      console.log(`${seller.metadata.country}: ${company.id}`);
      await save();
    }
    if (args.includes("--probe")) {
      const duplicate = await request("duplicate US create", "companies", sellers[0]);
      evidence.events.push({ label: "duplicate outcome", original_id: usId,
        outcome: duplicate.response.ok ? (duplicate.data?.id === usId ? "same ID" : "different ID; inspect response") : "rejected" });
      await save();
      const nested = await request("nested create", "companies", {
        title: "Ledgerly nested probe", email: "ledgerly-nested-probe@example.com",
        parent_company_id: usId, metadata: { external_id: "ledgerly-nested-probe" },
      });
      if (nested.response.ok) throw new Error("Unexpected nested-account success; inspect evidence and created ID");
      if (nested.response.status !== 422) throw new Error(`Nested probe returned HTTP ${nested.response.status}; nesting constraint not confirmed`);
    }
    evidence.complete = true;
  } catch (error) {
    evidence.error = redact(error instanceof Error ? error.message : String(error));
    throw new Error(evidence.error);
  } finally {
    await save();
    console.log(`Evidence: ${file}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  seedSellers().catch(error => { console.error(error.message); process.exitCode = 1; });
}
