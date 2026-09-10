import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { seedSellers } from "./seed-sellers.js";

test("preview, pagination, reuse, probes, failures and evidence without network", async () => {
  const cwd = process.cwd();
  const original = process.env.WHOP_PLATFORM_COMPANY_ID;
  const dir = await mkdtemp(resolve(cwd, "node_modules/.seed-test-"));
  process.chdir(dir);
  process.env.WHOP_PLATFORM_COMPANY_ID = "biz_test";
  const calls: { path: string; body: any }[] = [];
  const us = { id: "biz_us", metadata: { external_id: "ledgerly-seller-us" } };
  const client = { request: async (path: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ path, body });
    if (!body) return Response.json(path.includes("after=")
      ? { data: [us], page_info: { has_next_page: false } }
      : { data: [], page_info: { has_next_page: true, end_cursor: "next" } });
    if (body.parent_company_id === "biz_us") return Response.json({ error: { type: "unprocessable_entity", message: "A child company cannot be a parent of another company." } }, { status: 422 });
    return Response.json({ id: body.metadata.country === "US" ? "biz_duplicate" : `biz_${body.metadata.country}`, secret_key: "must-not-be-saved" });
  } };
  try {
    await seedSellers([], client);
    assert.equal(calls.length, 0);
    await assert.rejects(seedSellers(["--probe"], client), /requires --apply/);
    await seedSellers(["--apply", "--probe"], client);
    assert.equal(calls.length, 6);
    assert.deepEqual(calls.filter(call => call.body).map(call => call.body.metadata.external_id), ["ledgerly-seller-de", "ledgerly-seller-br", "ledgerly-seller-us", "ledgerly-nested-probe"]);
    assert.equal(calls[2].body.email, "ledgerly-seller-de@example.com");
    const files = await readdir("evidence/seed-sellers");
    const raw = await readFile(`evidence/seed-sellers/${files[0]}`, "utf8");
    assert.ok(!raw.includes("must-not-be-saved"));
    assert.equal(JSON.parse(raw).complete, true);
    assert.match(raw, /different ID/);
    assert.match(raw, /child company cannot/);
    await assert.rejects(seedSellers(["--apply"], { request: async () => Response.json({ data: [us, us], page_info: { has_next_page: false } }) }), /Ambiguous/);
    await assert.rejects(seedSellers(["--apply"], { request: async () => { throw new Error("network failure"); } }), /network failure/);
    assert.equal((await readdir("evidence/seed-sellers")).length, 3);
  } finally {
    process.chdir(cwd);
    if (original === undefined) delete process.env.WHOP_PLATFORM_COMPANY_ID;
    else process.env.WHOP_PLATFORM_COMPANY_ID = original;
  }
});
