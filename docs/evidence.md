# Ledgerly assessment evidence

Do not record API keys, webhook secrets, card details, or other credentials here.

## Accounts and access

Setup: [Step 1 seed workflow](../README.md#step-1-reproducible-seller-setup). Blank fields are pending evidence.

- Platform business ID:
- US / Germany / Brazil account IDs:
- Duplicate and nested-account probe evidence:
- Least-privilege platform/per-seller key scope (no secret values):
- Suspended Germany seller `biz_PCXEasqVqvNB0w`; read-back confirms `status: "suspended"`. US and Brazil were retained for the payment flows.
- Per-seller API key: pending authenticated user access. The account API key cannot create API keys; `WHOP_USER_TOKEN` is not configured.

### Sandbox setup notes

Whop rejected an `example.com` address with HTTP `400`: "The email you provided does not accept incoming mail. Please use a different email address." The seed script now accepts configurable receiving addresses and reused the three existing sellers by external ID.

## Onboarding and payouts

### Step 2: seller onboarding

US seller: `biz_q5tPMk6MCfoLOm` (`ledgerly_seller_us`).

- Created an onboarding link with `POST /account_links`, seller `company_id`, and `use_case: "account_onboarding"` (HTTP `200`). Completed the hosted form and returned with `status=submitted`.
- After: `GET /accounts/biz_q5tPMk6MCfoLOm` returned HTTP `200`: `verification.individual.status: "approved"`, `verification.business: null`, and `required_actions: []`.
- Capabilities: card/bank payments, standard/crypto payouts, transfers, crypto/card deposits, and ads are `active`; BNPL, instant payouts, bank deposits, and card issuing are `inactive`.
- Comparison limitation: the earlier `/companies` read returned `verified: false` but omitted these account fields. The approved after-state is confirmed; their before-state was not captured.

- Embedded payouts: seller confirmed the balance ledger and email render successfully.
- Hosted payouts portal: link created successfully; opening the hosted page remains to be demonstrated.
- US seller crypto-withdrawal markup: `lafm_Q8eAID0vxoDHb`, `percentage_fee: 2.5`, `fixed_fee_usd: 0`; confirmed by read-back.

## Payments and operations

- Aligned the checkout helper with the server payload (`plan.company_id`, inline product external identifier, and payment mode). The US $25 checkout with a $2 application fee returned HTTP `403`: `forbidden`, "You are not authorized". The same key read both platform and US accounts with HTTP `200`; checkout authorization remains unresolved. No checkout URL or payment was created by this attempt.
- Direct payment ID / refund ID / transfer ID:
- Ledger screenshots or redacted exports:
- Platform webhook `hook_KzHrEyfb8NxqA`: enabled with `child_resource_events: true` and all eight required events. Creation required `Api-Version-Date: 2026-09-09`.
- Whop `payment.succeeded` test reached the signature-verifying endpoint with HTTP `202`; replay of an `account.updated` delivery succeeded, and another replay returned HTTP `200`, `duplicate: true`. Both were recorded as `unknown_seller` without ledger effects: the synthetic payment did not match a local seller, and Germany was not registered in the local seller table. This confirms delivery, signature verification, and deduplication, not transaction reconciliation.
- Reconciliation: `npm run reconcile -- --seller biz_q5tPMk6MCfoLOm` exited `0`. Payments, sent transfers, and received transfers returned HTTP `200` after the permission update. Local and remote counts were both `0`, with no differences. This used a newly initialized empty local ledger; it confirms access and the empty-state comparison, not reconciliation of completed transactions.

### Dashboard validation

- Tabler 1.5.1 styles the seller dashboard; Whop supplies the embedded payout controls.
- Typecheck and build pass. Desktop and mobile layouts fit without horizontal overflow; invalid sessions show an error and restore the load button. Seller endpoints reject unauthenticated requests with HTTP `401`.
- Authenticated embedded payouts are configured with seller sessions and the HTTPS tunnel; seller confirmed live payout controls render.
- Local validation with synthetic signed events: invalid signatures returned `401`; a platform-to-Brazil transfer reached the recipient's ledger; replay after a server restart left exactly one entry. Malformed authenticated checkout returned `400`, and hosted onboarding/payout return routes redirect to the dashboard. No financial API writes were used for validation.

## Submission

- Loom URL: https://www.loom.com/share/4fbae36c7b1448d182a47a9ef31ccf8e

## Pre-demo verification (2026-09-11, code-driven)

A 14-point end-to-end suite ran against the live server and sandbox: 10 passed; all 4 failures share one root cause (API-key scopes, below).

Verified working end to end: admin account listing; idempotent seller onboarding (existing `biz_q5tPMk6MCfoLOm` returned, KYC link minted); checkout creation and idempotent reuse (`reused: true`, 8% fee = 200 minor units, purchase URL present); scoped payout-token mint; hosted payouts-portal link; seller and operator transactions views (4 rows, $2.00 fee split visible); reconciliation; auth boundaries (seller tokens rejected from admin endpoints, bad tokens 401 everywhere).

### Key-scope regressions after the permission rework

- `POST /companies` now returns HTTP `403` "You are not authorized" — `company:create_child` is no longer granted, so connected-account creation (seed script, admin create) is blocked until the scope is re-added.
- `POST /accounts/{id}/suspend` returns HTTP `403` "Business account API key is not authorized for the company:suspend_child scope."
- Error-quality inconsistency worth noting: the suspend error names the missing scope; the companies error does not.

### Money-movement state

- Balances remain settlement-locked: platform `$31.37` pending / `$0.00` available; US seller `$85.48` pending / `$0.00` available. Refund and transfer stay blocked in sandbox on funds availability.
- The platform account itself is unverified (`verification: null`) and its `transfer` and `standard_payout` capabilities are `inactive` — a second, independent transfer blocker. `POST /account_links` with the platform's own `account_id` and `use_case: "account_onboarding"` returns HTTP `200`, so platform KYC is completable through the hosted flow.
- `POST /deposits` (`destination` = platform, `amount: 50`) returns a raw HTTP `500` from Whop — the sandbox deposit path fails at the API as well as in the dashboard.

### Operator account management

`POST /api/accounts` (create) and `POST /api/accounts/:companyId/suspend` were added to the operator surface, reusing the same idempotent create-or-fetch flow as seller onboarding. Structural checks pass: identity-mismatch 409, non-child suspension 403, admin-only auth. Live create/suspend proof is pending the two key scopes above.
