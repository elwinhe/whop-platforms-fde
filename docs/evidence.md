# Ledgerly assessment evidence

Do not record API keys, webhook secrets, card details, or other credentials here.

## Environment

| Environment | Platform | US seller | Notes |
| --- | --- | --- | --- |
| Sandbox | `biz_BC8sRG36RkIpHk` | `biz_q5tPMk6MCfoLOm` | Initial build-out; Germany `biz_PCXEasqVqvNB0w` suspended, Brazil retained |
| Production | `biz_IZ9OQ6myPsj2eJ` | `biz_ueaMn4Gey9kg6b` | Money flows completed here; all sellers confirmed parent-linked via `GET /companies?parent_company_id=...` |

Loom: https://www.loom.com/share/4fbae36c7b1448d182a47a9ef31ccf8e

## Seller setup and onboarding

- Seeding is idempotent by `metadata.external_id`: reruns return the existing account instead of creating a duplicate. Whop rejects non-receiving addresses (HTTP 400: "The email you provided does not accept incoming mail"), so placeholder `example.com` emails cannot be used.
- Nested-account probe: creating an account under a connected account is rejected — only the platform can create children.
- Hosted onboarding (`POST /account_links`, `use_case: "account_onboarding"`): completed for the US seller. After-state: `verification.individual.status: "approved"`, `required_actions: []`; card/bank payments, standard/crypto payouts, transfers active (BNPL, instant payouts, bank deposits, card issuing inactive). The pre-onboarding `/companies` read exposes only `verified: false`, so no field-level before-state was captured.

## Payouts surfaces

- Embedded payouts render on the seller dashboard with a scoped, short-expiry access token (balance ledger and email confirmed live).
- Hosted alternative: `payouts_portal` account link mints successfully.
- Withdrawal markup on the US seller's crypto rail: `lafm_Q8eAID0vxoDHb`, `percentage_fee: 2.5`, confirmed by read-back.

## Webhooks and operations

- Platform webhook `hook_KzHrEyfb8NxqA`: `child_resource_events: true`, all eight required events; creation requires `Api-Version-Date: 2026-09-09`.
- Test delivery passed signature verification (HTTP 202). Replay was accepted once, then deduplicated (`duplicate: true`). Events for unmatched sellers are recorded as `unknown_seller` with no ledger effect.
- Local consumer validation with synthetic signed events: invalid signatures 401; replay after a server restart left exactly one ledger entry; malformed authenticated checkout 400.
- Germany seller suspended; read-back confirms `status: "suspended"`. Operator create/suspend endpoints reuse the idempotent onboarding flow (identity-mismatch 409, non-child suspend 403, admin-only auth).
- Per-seller API key: blocked — the account API key cannot create API keys, and no authenticated user token is configured.

## Money flows (production)

- **Checkout attribution drift**: production ignores `plan.company_id` and attributes the dynamic plan to the API key's own company, so application-fee validation fails ("can only be set for connected accounts"). Fix: pass top-level `account_id`, the documented shape. Verified live: `ch_AjToR3sy6bPNsos` on the US seller with the 8% fee. Sandbox accepted the nested shape, masking the drift.
- **Fee split** on the $25.00 sale: $2.00 platform fee (8%) + $1.25 Whop processing → seller net $21.75. Cross-checked by a no-fee probe charge on the platform netting $23.75. Production payment payloads omit `application_fee` entirely, so the transactions view re-derives the fee from the checkout policy, bounded by the observed gross−net deduction.
- **Transfer**: $25.00 platform → US seller (`ctt_TpCjAkNjPEo0cj`) funded the refund. Sale proceeds stay pending until settlement, so a seller cannot self-fund a refund of an unsettled sale.
- **Refund**: full $25.00 on `pay_yRILVDwzGPjc5k` via the operator endpoint; `refunded_amount: $25.00`, transactions view shows `settlement: refunded`.
- **Fee reversal**: $2.00 platform → US seller (`ctt_lkqCY3fAp0zUuM`); platform available dropped exactly the fee. Whop does not claw back the application fee on refund — making the seller whole is an explicit transfer, and Whop's own $1.25 processing fee is not recoverable.
- **Settled ledger**: the refund consumed exactly the $25.00 funding transfer, leaving the seller's available at $2.00 (the fee reversal). A transient −$25.00 available reading during refund processing resolved on its own. The refunded sale's $21.75 still lists as a pending settlement; expect it to net out on settlement day.
- Seller transactions view shows the complete story in three rows: the refunded sale ($25.00 gross / $2.00 fee / $21.75 net) and both incoming transfers.

## Sandbox-only blockers

- **Funding**: balances were settlement-locked (platform and sellers at $0.00 available) and `POST /deposits` returns a raw HTTP 500 — the dashboard deposit flow fails the same way. Refund and transfer could not be demonstrated in sandbox; both completed on production instead.
- **Platform verification**: the sandbox platform account is unverified (`verification: null`) with `transfer` and `standard_payout` inactive; platform KYC is completable through the hosted `account_links` flow.
- **Key scopes**: missing permissions surface one at a time per attempt (checkout, payment reads, and link mints each 403'd until their scope was granted), which materially slows integration. Error quality is inconsistent — the suspend error names the missing `company:suspend_child` scope; the `POST /companies` error does not name `company:create_child`.

## Verification

- 14-point end-to-end suite against the live server: 10 passed; all 4 failures shared the key-scope root cause above.
- Verified working: admin account listing; idempotent onboarding (existing seller returned, KYC link minted); checkout creation with idempotent reuse (`reused: true`, 8% fee = 200 minor units, purchase URL present); scoped payout-token mint; hosted portal link; seller and operator transactions views with the fee split visible; reconciliation (`npm run reconcile` exit 0, local and remote counts match); auth boundaries (seller tokens rejected from admin endpoints, bad tokens 401 everywhere).
- Dashboard: Tabler 1.5.1 with Whop's embedded payout controls; typecheck and build pass; desktop and mobile layouts fit without horizontal overflow; invalid sessions surface an error and restore the load button.
