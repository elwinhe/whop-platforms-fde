import { serve } from "@hono/node-server";
import { Hono, type Context } from "hono";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Webhook } from "standardwebhooks";
import { accountsPage } from "./accounts-page.js";
import {
  authenticateAdmin,
  authenticateSeller,
  type SellerIdentity,
} from "./auth.js";
import {
  applicationFeeMinor,
  COMPANY_ID,
  CURRENCY,
  currencyMinorDigits,
  fingerprint,
  isObject,
  majorToMinor,
  minorToMajor,
  ORDER_ID,
  PAYMENT_ID,
  safeProviderError,
} from "./domain.js";
import { payoutsPage } from "./payouts-page.js";
import { LedgerStore } from "./store.js";
import {
  findCompanyPayment,
  loadCompanyTransactions,
} from "./transactions.js";
import { createWhopSandboxClient } from "./whop.js";

const app = new Hono();
const store = new LedgerStore();
const MAX_BODY_BYTES = 1_048_576;
const postJson = (data: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(data),
});
class InputError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 413 = 400,
  ) {
    super(message);
  }
}
type AccountLinkUseCase = "account_onboarding" | "payouts_portal";

function publicUrl(path: string): string {
  const base = process.env.LEDGERLY_PUBLIC_URL;
  if (!base)
    throw new Error("LEDGERLY_PUBLIC_URL is required for account links");
  const url = new URL(path, base.endsWith("/") ? base : `${base}/`);
  if (url.protocol !== "https:")
    throw new Error("LEDGERLY_PUBLIC_URL must use HTTPS");
  return url.toString();
}

async function requireJson(c: Context): Promise<Record<string, unknown>> {
  const length = Number(c.req.header("content-length") ?? 0);
  if (length > MAX_BODY_BYTES)
    throw new InputError("Request body exceeds 1 MiB", 413);
  let value: unknown;
  try {
    value = await c.req.json();
  } catch {
    throw new InputError("Expected valid JSON");
  }
  if (!isObject(value)) throw new InputError("Expected a JSON object");
  return value;
}

function sellerAuth(c: Context): SellerIdentity | Response {
  return authenticateSeller(c) ?? c.json({ error: "unauthorized" }, 401);
}

function adminAuth(c: Context): Response | null {
  const result = authenticateAdmin(c);
  if (result === "not_configured")
    return c.json({ error: "admin_not_configured" }, 503);
  return result === "authenticated"
    ? null
    : c.json({ error: "unauthorized" }, 401);
}

async function listPlatformChildren(): Promise<Record<string, unknown>[]> {
  const platform = process.env.WHOP_PLATFORM_COMPANY_ID;
  if (!platform || !COMPANY_ID.test(platform))
    throw new Error("WHOP_PLATFORM_COMPANY_ID is required");
  const client = createWhopSandboxClient();
  const companies: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  let after = "";
  do {
    const query = new URLSearchParams({
      parent_company_id: platform,
      first: "100",
    });
    if (after) query.set("after", after);
    const { response, data } = await client.json(`companies?${query}`);
    if (
      !response.ok ||
      !isObject(data) ||
      !Array.isArray(data.data) ||
      !isObject(data.page_info)
    )
      throw new Error(
        `Unable to list connected accounts (Whop HTTP ${response.status})`,
      );
    for (const item of data.data) if (isObject(item)) companies.push(item);
    const more = data.page_info.has_next_page === true;
    after =
      more && typeof data.page_info.end_cursor === "string"
        ? data.page_info.end_cursor
        : "";
    if (more && (!after || seen.has(after)))
      throw new Error("Whop company pagination did not advance");
    if (after) seen.add(after);
  } while (after);
  return companies;
}

async function listChildren(
  externalId: string,
): Promise<Record<string, unknown>[]> {
  return (await listPlatformChildren()).filter(
    (item) =>
      isObject(item.metadata) && item.metadata.external_id === externalId,
  );
}

function assertSellerMatch(
  candidate: Record<string, unknown>,
  identity: SellerIdentity,
): string {
  if (typeof candidate.id !== "string" || !COMPANY_ID.test(candidate.id))
    throw new Error("Connected account response has no valid ID");
  const metadata = isObject(candidate.metadata) ? candidate.metadata : {};
  if (
    metadata.external_id !== identity.externalId ||
    (typeof candidate.email === "string" &&
      candidate.email.toLowerCase() !== identity.email) ||
    (typeof metadata.country === "string" &&
      metadata.country !== identity.country)
  )
    throw new Error("Connected account identity mismatch");
  return candidate.id;
}

async function assertOwnedCompany(companyId: string): Promise<void> {
  if (
    !(await listPlatformChildren()).some(
      (candidate) => candidate.id === companyId,
    )
  )
    throw new Error(
      "Seller account is not a connected account of this platform",
    );
}

const EXTERNAL_ID = /^[a-z0-9][a-z0-9_-]{2,63}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type ResolveOutcome =
  | { ok: true; companyId: string; created: boolean }
  | { ok: false; status: 400 | 409 | 502; body: Record<string, unknown> };

async function resolveConnectedAccount(
  identity: SellerIdentity,
): Promise<ResolveOutcome> {
  const requestFingerprint = fingerprint(identity);
  const local = store.sellerByExternalId(identity.externalId);
  if (local && (local.email !== identity.email || local.country !== identity.country))
    return { ok: false, status: 409, body: { error: "seller_identity_mismatch" } };
  if (local) return { ok: true, companyId: local.company_id, created: false };
  const matches = await listChildren(identity.externalId);
  if (matches.length > 1)
    return {
      ok: false,
      status: 409,
      body: {
        error: "ambiguous_connected_accounts",
        message:
          "Multiple Whop accounts share this external ID; resolve manually.",
      },
    };
  if (matches.length === 1) {
    const companyId = assertSellerMatch(matches[0], identity);
    store.finishOnboarding(identity.externalId, {
      external_id: identity.externalId,
      email: identity.email,
      country: identity.country,
      company_id: companyId,
    });
    return { ok: true, companyId, created: false };
  }
  const attempt = store.onboardingAttempt(identity.externalId);
  if (attempt && attempt.fingerprint !== requestFingerprint)
    return { ok: false, status: 409, body: { error: "seller_identity_mismatch" } };
  if (attempt && attempt.status !== "complete")
    return {
      ok: false,
      status: 409,
      body: {
        error: "onboarding_attempt_unresolved",
        message:
          "A create may be in flight or ambiguous. Retry only after Whop listing reveals the account.",
      },
    };
  if (!store.beginOnboarding(identity.externalId, requestFingerprint))
    return { ok: false, status: 409, body: { error: "onboarding_in_progress" } };
  let result;
  try {
    result = await createWhopSandboxClient().json("companies", {
      ...postJson({
        title: `Ledgerly seller ${identity.externalId}`,
        email: identity.email,
        parent_company_id: process.env.WHOP_PLATFORM_COMPANY_ID,
        metadata: { external_id: identity.externalId, country: identity.country },
      }),
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": `ledgerly-onboarding-${requestFingerprint.slice(0, 32)}`,
      },
    });
  } catch (error) {
    store.markOnboardingAmbiguous(identity.externalId);
    throw error;
  }
  if (!result.response.ok || !isObject(result.data)) {
    if (
      result.response.status >= 400 &&
      result.response.status < 500 &&
      result.response.status !== 409
    )
      store.clearOnboardingAttempt(identity.externalId);
    else store.markOnboardingAmbiguous(identity.externalId);
    return {
      ok: false,
      status:
        result.response.status >= 400 && result.response.status < 500
          ? (result.response.status as 400)
          : 502,
      body: { error: "whop_error", provider: safeProviderError(result.data) },
    };
  }
  const companyId = assertSellerMatch(result.data, identity);
  store.finishOnboarding(identity.externalId, {
    external_id: identity.externalId,
    email: identity.email,
    country: identity.country,
    company_id: companyId,
  });
  return { ok: true, companyId, created: true };
}

function statusFrom(value: unknown): string | null {
  return isObject(value) && typeof value.status === "string"
    ? value.status
    : null;
}

function requiredActionLabel(value: unknown): string {
  if (typeof value === "string") return value;
  if (!isObject(value)) return "Unknown action";
  for (const key of [
    "title",
    "message",
    "description",
    "code",
    "type",
    "action",
  ]) {
    if (typeof value[key] === "string" && value[key].length) return value[key];
  }
  return "Unknown action";
}

function operatorAccount(
  company: Record<string, unknown>,
  account: Record<string, unknown>,
) {
  if (
    typeof company.id !== "string" ||
    !COMPANY_ID.test(company.id) ||
    account.id !== company.id
  )
    throw new Error("Whop returned an invalid connected account ID");
  const companyMetadata = isObject(company.metadata) ? company.metadata : {};
  const accountMetadata = isObject(account.metadata) ? account.metadata : {};
  const verification = isObject(account.verification)
    ? account.verification
    : {};
  const capabilities = isObject(account.capabilities)
    ? Object.entries(account.capabilities)
        .filter(
          (entry): entry is [string, string] => typeof entry[1] === "string",
        )
        .map(([name, status]) => ({ name, status }))
        .sort((left, right) => left.name.localeCompare(right.name))
    : null;
  const requiredActions = Array.isArray(account.required_actions)
    ? account.required_actions.map(requiredActionLabel)
    : null;
  const accountStatus =
    typeof account.status === "string" ? account.status : null;
  return {
    company_id: company.id,
    external_id:
      typeof companyMetadata.external_id === "string"
        ? companyMetadata.external_id
        : typeof accountMetadata.external_id === "string"
          ? accountMetadata.external_id
          : null,
    country_metadata:
      typeof companyMetadata.country === "string"
        ? companyMetadata.country
        : typeof accountMetadata.country === "string"
          ? accountMetadata.country
          : null,
    country: typeof account.country === "string" ? account.country : null,
    verification: {
      individual: statusFrom(verification.individual),
      business: statusFrom(verification.business),
    },
    capabilities,
    required_actions: requiredActions,
    suspension: {
      status: accountStatus,
      suspended: accountStatus === null ? null : accountStatus === "suspended",
      reason:
        typeof account.status_reason === "string"
          ? account.status_reason
          : null,
    },
  };
}

async function loadOperatorAccounts() {
  const companies = await listPlatformChildren();
  const accounts: ReturnType<typeof operatorAccount>[] = [];
  const client = createWhopSandboxClient();
  for (let index = 0; index < companies.length; index += 8) {
    const batch = await Promise.all(
      companies.slice(index, index + 8).map(async (company) => {
        if (typeof company.id !== "string" || !COMPANY_ID.test(company.id))
          throw new Error(
            "Whop returned a connected company without a valid ID",
          );
        const { response, data } = await client.json(`accounts/${company.id}`);
        if (!response.ok || !isObject(data))
          throw new Error(
            `Unable to retrieve connected account ${company.id} (Whop HTTP ${response.status})`,
          );
        return operatorAccount(company, data);
      }),
    );
    accounts.push(...batch);
  }
  return accounts.sort((left, right) =>
    (left.external_id ?? left.company_id).localeCompare(
      right.external_id ?? right.company_id,
    ),
  );
}

async function createOperatorAccountLink(
  c: Context,
  useCase: AccountLinkUseCase,
): Promise<Response> {
  const authError = adminAuth(c);
  if (authError) return authError;
  const companyId = c.req.param("companyId");
  if (typeof companyId !== "string" || !COMPANY_ID.test(companyId))
    return c.json({ error: "invalid_company_id" }, 400);
  try {
    const company = (await listPlatformChildren()).find(
      (candidate) => candidate.id === companyId,
    );
    if (!company)
      return c.json({ error: "account_not_connected_to_platform" }, 403);
    const returnPath =
      useCase === "account_onboarding"
        ? "accounts?status=onboarding-returned"
        : "accounts?status=payouts-returned";
    const result = await createWhopSandboxClient().json(
      "account_links",
      postJson({
        account_id: companyId,
        use_case: useCase,
        return_url: publicUrl(returnPath),
        refresh_url: publicUrl(returnPath),
      }),
    );
    if (
      !result.response.ok ||
      !isObject(result.data) ||
      typeof result.data.url !== "string"
    ) {
      return c.json(
        { error: "whop_error", provider: safeProviderError(result.data) },
        502,
      );
    }
    const url = new URL(result.data.url);
    if (url.protocol !== "https:")
      throw new Error("Whop returned an invalid account link");
    return c.json({ url: url.toString() });
  } catch (error) {
    return c.json(
      {
        error: "account_link_failed",
        message:
          error instanceof Error
            ? error.message
            : "Unable to create account link",
      },
      502,
    );
  }
}

app.get("/health", (c) => c.json({ status: "ok" }));
app.get("/", (c) => c.html(payoutsPage));
app.get("/accounts", (c) => c.html(accountsPage));
app.get("/orders/:orderId/complete", (c) => c.redirect("/"));
for (const path of [
  "/onboarding/complete",
  "/onboarding/refresh",
  "/payouts/complete",
  "/payouts/refresh",
]) {
  app.get(path, (c) => c.redirect("/"));
}
app.get("/vendor/whop-elements/:file", async (c) => {
  const file = c.req.param("file");
  if (!/^(index|util|url)\.mjs$/.test(file)) return c.notFound();
  const body = await readFile(
    resolve("node_modules/@whop/embedded-components-vanilla-js/dist", file),
    "utf8",
  );
  return c.body(body, 200, {
    "Content-Type": "text/javascript; charset=utf-8",
    "Cache-Control": "public, max-age=3600",
  });
});

app.get("/api/accounts", async (c) => {
  const authError = adminAuth(c);
  if (authError) return authError;
  try {
    return c.json({ accounts: await loadOperatorAccounts() });
  } catch (error) {
    return c.json(
      {
        error: "accounts_failed",
        message:
          error instanceof Error
            ? error.message
            : "Unable to load connected accounts",
      },
      502,
    );
  }
});

app.post("/api/accounts", async (c) => {
  const authError = adminAuth(c);
  if (authError) return authError;
  try {
    const body = await requireJson(c);
    if (
      typeof body.external_id !== "string" ||
      !EXTERNAL_ID.test(body.external_id) ||
      typeof body.email !== "string" ||
      body.email.length > 254 ||
      !EMAIL.test(body.email) ||
      typeof body.country !== "string" ||
      !/^[A-Z]{2}$/.test(body.country)
    )
      return c.json(
        {
          error: "invalid_account",
          message:
            "external_id (lowercase slug, 3-64 chars), email, and a two-letter uppercase country are required",
        },
        400,
      );
    const resolved = await resolveConnectedAccount({
      externalId: body.external_id,
      email: body.email.toLowerCase(),
      country: body.country,
    });
    if (!resolved.ok) return c.json(resolved.body, resolved.status);
    return c.json(
      {
        company_id: resolved.companyId,
        external_id: body.external_id,
        created: resolved.created,
      },
      resolved.created ? 201 : 200,
    );
  } catch (error) {
    return c.json(
      {
        error:
          error instanceof InputError
            ? "invalid_account"
            : "account_create_failed",
        message:
          error instanceof Error
            ? error.message
            : "Unable to create the connected account",
      },
      error instanceof InputError ? error.status : 502,
    );
  }
});

app.post("/api/accounts/:companyId/suspend", async (c) => {
  const authError = adminAuth(c);
  if (authError) return authError;
  const companyId = c.req.param("companyId");
  if (typeof companyId !== "string" || !COMPANY_ID.test(companyId))
    return c.json({ error: "invalid_company_id" }, 400);
  try {
    if (
      !(await listPlatformChildren()).some(
        (candidate) => candidate.id === companyId,
      )
    )
      return c.json({ error: "account_not_connected_to_platform" }, 403);
    const result = await createWhopSandboxClient().json(
      `accounts/${companyId}/suspend`,
      {
        ...postJson({}),
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": `ledgerly-suspend-${companyId}`,
        },
      },
    );
    if (!result.response.ok || !isObject(result.data))
      return c.json(
        { error: "whop_error", provider: safeProviderError(result.data) },
        result.response.status >= 400 && result.response.status < 500
          ? (result.response.status as 400)
          : 502,
      );
    const status =
      typeof result.data.status === "string" ? result.data.status : null;
    return c.json({ company_id: companyId, status });
  } catch (error) {
    return c.json(
      {
        error: "suspend_failed",
        message:
          error instanceof Error
            ? error.message
            : "Unable to suspend the account",
      },
      502,
    );
  }
});

app.post("/api/accounts/:companyId/onboarding", (c) =>
  createOperatorAccountLink(c, "account_onboarding"),
);
app.post("/api/accounts/:companyId/payouts-portal", (c) =>
  createOperatorAccountLink(c, "payouts_portal"),
);

app.get("/api/accounts/:companyId/transactions", async (c) => {
  const authError = adminAuth(c);
  if (authError) return authError;
  const companyId = c.req.param("companyId");
  if (typeof companyId !== "string" || !COMPANY_ID.test(companyId))
    return c.json({ error: "invalid_company_id" }, 400);
  try {
    if (
      !(await listPlatformChildren()).some(
        (candidate) => candidate.id === companyId,
      )
    )
      return c.json({ error: "account_not_connected_to_platform" }, 403);
    return c.json({
      company_id: companyId,
      transactions: await loadCompanyTransactions(store, companyId),
    });
  } catch (error) {
    return c.json(
      {
        error: "transactions_failed",
        message:
          error instanceof Error
            ? error.message
            : "Unable to load transactions",
      },
      502,
    );
  }
});

app.get("/api/transactions", async (c) => {
  const auth = sellerAuth(c);
  if (auth instanceof Response) return auth;
  const seller = store.sellerByExternalId(auth.externalId);
  if (!seller) return c.json({ error: "seller_not_onboarded" }, 409);
  try {
    return c.json({
      company_id: seller.company_id,
      transactions: await loadCompanyTransactions(store, seller.company_id),
    });
  } catch (error) {
    return c.json(
      {
        error: "transactions_failed",
        message:
          error instanceof Error
            ? error.message
            : "Unable to load transactions",
      },
      502,
    );
  }
});

async function refundCompanyPayment(
  c: Context,
  companyId: string,
): Promise<Response> {
  const paymentId = c.req.param("paymentId");
  if (typeof paymentId !== "string" || !PAYMENT_ID.test(paymentId))
    return c.json({ error: "invalid_payment_id" }, 400);
  try {
    const payment = await findCompanyPayment(companyId, paymentId);
    if (!payment) return c.json({ error: "payment_not_found" }, 404);
    if (payment.settlement === "refunded")
      return c.json(
        { error: "already_refunded", message: "This payment is already fully refunded." },
        409,
      );
    if (payment.status !== "paid")
      return c.json(
        {
          error: "payment_not_refundable",
          message: `Only paid payments can be refunded (status: ${payment.status}).`,
        },
        409,
      );
    const result = await createWhopSandboxClient().json(
      `payments/${paymentId}/refund`,
      {
        ...postJson({}),
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": `ledgerly-full-refund-${paymentId}`,
        },
      },
    );
    if (!result.response.ok || !isObject(result.data)) {
      const provider = safeProviderError(result.data);
      return c.json(
        {
          error: "whop_error",
          provider,
          message:
            isObject(provider) && typeof provider.message === "string"
              ? provider.message
              : "Whop rejected the refund",
        },
        result.response.status >= 400 && result.response.status < 500
          ? (result.response.status as 400)
          : 502,
      );
    }
    return c.json({
      company_id: companyId,
      payment_id: paymentId,
      status:
        typeof result.data.status === "string" ? result.data.status : null,
    });
  } catch (error) {
    return c.json(
      {
        error: "refund_failed",
        message:
          error instanceof Error
            ? error.message
            : "Unable to refund the payment",
      },
      502,
    );
  }
}

app.post(
  "/api/accounts/:companyId/transactions/:paymentId/refund",
  async (c) => {
    const authError = adminAuth(c);
    if (authError) return authError;
    const companyId = c.req.param("companyId");
    if (typeof companyId !== "string" || !COMPANY_ID.test(companyId))
      return c.json({ error: "invalid_company_id" }, 400);
    if (
      !(await listPlatformChildren().catch(() => [])).some(
        (candidate) => candidate.id === companyId,
      )
    )
      return c.json({ error: "account_not_connected_to_platform" }, 403);
    return refundCompanyPayment(c, companyId);
  },
);

app.post("/api/transactions/:paymentId/refund", async (c) => {
  const auth = sellerAuth(c);
  if (auth instanceof Response) return auth;
  const seller = store.sellerByExternalId(auth.externalId);
  if (!seller) return c.json({ error: "seller_not_onboarded" }, 409);
  return refundCompanyPayment(c, seller.company_id);
});

app.post("/api/onboarding", async (c) => {
  const auth = sellerAuth(c);
  if (auth instanceof Response) return auth;
  try {
    const resolved = await resolveConnectedAccount(auth);
    if (!resolved.ok) return c.json(resolved.body, resolved.status);
    const companyId = resolved.companyId;
    const link = await createWhopSandboxClient().json(
      "account_links",
      postJson({
        account_id: companyId,
        use_case: "account_onboarding",
        return_url: publicUrl("onboarding/complete"),
        refresh_url: publicUrl("onboarding/refresh"),
      }),
    );
    if (!link.response.ok)
      return c.json(
        { error: "whop_error", provider: safeProviderError(link.data) },
        502,
      );
    return c.json({
      company_id: companyId,
      external_id: auth.externalId,
      country_metadata: auth.country,
      account_onboarding: link.data,
    });
  } catch (error) {
    return c.json(
      {
        error: "onboarding_failed",
        message: error instanceof Error ? error.message : "Onboarding failed",
      },
      502,
    );
  }
});

app.post("/api/checkout", async (c) => {
  const auth = sellerAuth(c);
  if (auth instanceof Response) return auth;
  try {
    const seller = store.sellerByExternalId(auth.externalId);
    if (!seller) return c.json({ error: "seller_not_onboarded" }, 409);
    const body = await requireJson(c);
    if (
      typeof body.order_id !== "string" ||
      !ORDER_ID.test(body.order_id) ||
      !Number.isSafeInteger(body.amount_minor) ||
      (body.amount_minor as number) < 50 ||
      typeof body.currency !== "string" ||
      !CURRENCY.test(body.currency) ||
      typeof body.title !== "string" ||
      body.title.trim().length < 1 ||
      body.title.length > 120
    )
      return c.json(
        {
          error: "invalid_checkout",
          message:
            "order_id, positive integer amount_minor, lowercase ISO currency, and title are required",
        },
        400,
      );
    const amountMinor = body.amount_minor as number;
    const currencyDecimals = currencyMinorDigits(body.currency as string);
    const feeMinor = applicationFeeMinor(amountMinor);
    if (feeMinor <= 0 || feeMinor >= amountMinor)
      return c.json({ error: "invalid_application_fee" }, 400);
    await assertOwnedCompany(seller.company_id);
    const request = {
      mode: "payment",
      redirect_url: publicUrl(`orders/${body.order_id}/complete`),
      metadata: { order_id: body.order_id },
      plan: {
        company_id: seller.company_id,
        product: {
          external_identifier: `ledgerly-${body.order_id}`,
          title: body.title.trim(),
        },
        currency: body.currency,
        initial_price: minorToMajor(amountMinor, currencyDecimals),
        plan_type: "one_time",
        visibility: "hidden",
        release_method: "buy_now",
        application_fee_amount: minorToMajor(feeMinor, currencyDecimals),
      },
    };
    const requestFingerprint = fingerprint(request);
    const attempt = store.checkoutAttempt(body.order_id);
    if (attempt) {
      if (attempt.fingerprint !== requestFingerprint)
        return c.json({ error: "order_conflict" }, 409);
      if (!attempt.resource_id)
        return c.json(
          {
            error: "checkout_attempt_unresolved",
            message: "Reconcile the idempotency key in Whop before retrying.",
          },
          409,
        );
      const existing = await createWhopSandboxClient().json(
        `checkout_configurations/${attempt.resource_id}`,
      );
      if (!existing.response.ok)
        return c.json(
          { error: "whop_error", provider: safeProviderError(existing.data) },
          502,
        );
      return c.json({
        reused: true,
        amount_minor: amountMinor,
        fee_minor: feeMinor,
        checkout: existing.data,
      });
    }
    if (!store.beginCheckout(body.order_id, requestFingerprint))
      return c.json({ error: "checkout_in_progress" }, 409);
    let result;
    try {
      result = await createWhopSandboxClient().json("checkout_configurations", {
        ...postJson(request),
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": `ledgerly-checkout-${body.order_id}`,
        },
      });
    } catch (error) {
      store.markCheckoutAmbiguous(body.order_id);
      throw error;
    }
    if (
      !result.response.ok ||
      !isObject(result.data) ||
      typeof result.data.id !== "string"
    ) {
      if (
        result.response.status >= 400 &&
        result.response.status < 500 &&
        result.response.status !== 409
      )
        store.clearCheckoutAttempt(body.order_id);
      else store.markCheckoutAmbiguous(body.order_id);
      return c.json(
        { error: "whop_error", provider: safeProviderError(result.data) },
        result.response.status >= 400 && result.response.status < 500
          ? (result.response.status as 400)
          : 502,
      );
    }
    store.finishCheckout(body.order_id, result.data.id);
    return c.json({
      reused: false,
      amount_minor: amountMinor,
      fee_minor: feeMinor,
      checkout: result.data,
    });
  } catch (error) {
    return c.json(
      {
        error:
          error instanceof InputError ? "invalid_checkout" : "checkout_failed",
        message: error instanceof Error ? error.message : "Checkout failed",
      },
      error instanceof InputError ? error.status : 502,
    );
  }
});

app.get("/api/payout-context", (c) => {
  const auth = authenticateSeller(c);
  if (!auth) return c.json({ error: "unauthorized" }, 401);
  const seller = store.sellerByExternalId(auth.externalId);
  return seller
    ? c.json({ company_id: seller.company_id })
    : c.json({ error: "seller_not_onboarded" }, 409);
});

app.post("/api/payout-token", async (c) => {
  const auth = sellerAuth(c);
  if (auth instanceof Response) return auth;
  const seller = store.sellerByExternalId(auth.externalId);
  if (!seller) return c.json({ error: "seller_not_onboarded" }, 409);
  try {
    await assertOwnedCompany(seller.company_id);
  } catch (error) {
    return c.json(
      {
        error: "account_ownership_failed",
        message:
          error instanceof Error ? error.message : "Ownership check failed",
      },
      403,
    );
  }
  const result = await createWhopSandboxClient().json(
    "access_tokens",
    postJson({
      account_id: seller.company_id,
      expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
      scoped_actions: [
        "company:balance:read",
        "payout:withdraw_funds",
        "payout:withdrawal:read",
        "payout:destination:read",
        "payout:create_destination",
      ],
    }),
  );
  if (
    !result.response.ok ||
    !isObject(result.data) ||
    typeof result.data.token !== "string"
  )
    return c.json(
      { error: "whop_error", provider: safeProviderError(result.data) },
      502,
    );
  return c.json({
    token: result.data.token,
    expires_at: result.data.expires_at,
  });
});

app.post("/api/payout-portal", async (c) => {
  const auth = sellerAuth(c);
  if (auth instanceof Response) return auth;
  const seller = store.sellerByExternalId(auth.externalId);
  if (!seller) return c.json({ error: "seller_not_onboarded" }, 409);
  try {
    await assertOwnedCompany(seller.company_id);
  } catch (error) {
    return c.json(
      {
        error: "account_ownership_failed",
        message:
          error instanceof Error ? error.message : "Ownership check failed",
      },
      403,
    );
  }
  const result = await createWhopSandboxClient().json(
    "account_links",
    postJson({
      account_id: seller.company_id,
      use_case: "payouts_portal",
      return_url: publicUrl("payouts/complete"),
      refresh_url: publicUrl("payouts/refresh"),
    }),
  );
  if (!result.response.ok || !isObject(result.data))
    return c.json(
      { error: "whop_error", provider: safeProviderError(result.data) },
      502,
    );
  return c.json(result.data);
});

const canonicalEvent = (type: string) =>
  type.replaceAll("_", ".").replace(/^withdrawal\./, "payout.");
const eventRank = (type: string, status: string) =>
  /reversed|refunded/.test(status) || /reversed/.test(type)
    ? 40
    : /succeeded|completed|paid|approved/.test(status) ||
        /succeeded|completed/.test(type)
      ? 30
      : /failed|canceled|void|uncollectible/.test(status) ||
          /failed|canceled/.test(type)
        ? 20
        : 10;

app.post("/api/webhook", async (c) => {
  const declared = Number(c.req.header("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES)
    return c.json({ error: "payload_too_large" }, 413);
  const raw = await c.req.text();
  if (Buffer.byteLength(raw) > MAX_BODY_BYTES)
    return c.json({ error: "payload_too_large" }, 413);
  const secret = process.env.WHOP_WEBHOOK_SECRET;
  if (!secret) return c.json({ error: "webhook_not_configured" }, 503);
  const headers = {
    "webhook-id": c.req.header("webhook-id") ?? "",
    "webhook-timestamp": c.req.header("webhook-timestamp") ?? "",
    "webhook-signature": c.req.header("webhook-signature") ?? "",
  };
  try {
    new Webhook(
      secret,
      secret.startsWith("ws_") ? { format: "raw" } : undefined,
    ).verify(raw, headers);
  } catch {
    return c.json({ error: "invalid_signature" }, 401);
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  if (!isObject(value) || typeof value.type !== "string")
    return c.json({ error: "invalid_event" }, 400);
  const bodyEventId = typeof value.id === "string" ? value.id : "";
  if (
    bodyEventId &&
    headers["webhook-id"] &&
    bodyEventId !== headers["webhook-id"]
  )
    return c.json({ error: "event_id_mismatch" }, 400);
  const eventId = headers["webhook-id"] || bodyEventId;
  if (!eventId) return c.json({ error: "missing_event_id" }, 400);
  const type = canonicalEvent(value.type),
    data = isObject(value.data) ? value.data : {};
  const transferParties = type.startsWith("transfer.")
    ? [
        isObject(data.destination) ? data.destination.id : null,
        isObject(data.origin) ? data.origin.id : null,
      ]
    : [];
  const accountIds = [
    ...transferParties,
    value.account_id,
    value.company_id,
    data.company_id,
    data.account_id,
  ].filter((id): id is string => typeof id === "string");
  const companyId =
    accountIds.find((id) => store.sellerByCompanyId(id)) ??
    accountIds[0] ??
    null;
  const seller = companyId ? store.sellerByCompanyId(companyId) : undefined;
  const resourceId =
    typeof data.id === "string"
      ? data.id
      : typeof data.resource_id === "string"
        ? data.resource_id
        : null;
  const resourceType = type.split(".")[0],
    status =
      typeof data.status === "string"
        ? data.status
        : (type.split(".")[1] ?? "updated");
  const money = isObject(data.total)
    ? data.total
    : isObject(data.amount)
      ? data.amount
      : null;
  const currency =
    typeof money?.currency === "string"
      ? money.currency.toLowerCase()
      : typeof data.currency === "string"
        ? data.currency.toLowerCase()
        : null;
  const decimals =
    typeof money?.decimals === "number"
      ? money.decimals
      : currency
        ? currencyMinorDigits(currency)
        : 2;
  const amountMinor = majorToMinor(money?.amount ?? data.amount, decimals);
  const relevant = /^(payment|refund|dispute|transfer|payout|account)\./.test(
    type,
  );
  const processingStatus = !seller
    ? "unknown_seller"
    : !relevant || !resourceId
      ? "recorded_no_ledger_effect"
      : "applied";
  try {
    const outcome = store.persistWebhook({
      id: eventId,
      type,
      companyId,
      payload: raw,
      status: processingStatus,
      ...(seller && relevant && resourceId
        ? {
            ledger: {
              resource_type: resourceType,
              resource_id: resourceId,
              seller_company_id: seller.company_id,
              amount_minor: amountMinor,
              currency,
              status,
              status_rank: eventRank(type, status),
              event_type: type,
            },
          }
        : {}),
    });
    return c.json(
      {
        received: true,
        duplicate: outcome === "duplicate",
        processing_status:
          outcome === "duplicate" ? "duplicate" : processingStatus,
      },
      outcome === "duplicate" ? 200 : 202,
    );
  } catch {
    return c.json({ error: "persistence_failed" }, 503);
  }
});

const port = Number(process.env.PORT ?? 3000),
  hostname = process.env.HOST ?? "127.0.0.1";
if (!Number.isInteger(port) || port < 1 || port > 65_535)
  throw new Error("PORT must be an integer between 1 and 65535");
serve({ fetch: app.fetch, port, hostname }, (info) =>
  console.log(`Ledgerly listening on http://${hostname}:${info.port}`),
);
