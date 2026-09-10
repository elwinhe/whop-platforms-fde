# Ledgerly assessment evidence

Do not record API keys, webhook secrets, card details, or other credentials here.

## Accounts and access

Setup: [Step 1 seed workflow](../README.md#step-1-reproducible-seller-setup). Blank fields are pending evidence.

- Platform business ID:
- US / Germany / Brazil account IDs:
- Duplicate and nested-account probe evidence:
- Least-privilege platform/per-seller key scope (no secret values):
- Suspended-account evidence:

### Sandbox setup notes

Whop rejected an `example.com` address with HTTP `400`: "The email you provided does not accept incoming mail. Please use a different email address." The seed script now accepts configurable receiving addresses and reused the three existing sellers by external ID.

## Onboarding and payouts

### Step 2: seller onboarding

US seller: `biz_q5tPMk6MCfoLOm` (`ledgerly_seller_us`).

- Created an onboarding link with `POST /account_links`, seller `company_id`, and `use_case: "account_onboarding"` (HTTP `200`). Completed the hosted form and returned with `status=submitted`.
- After: `GET /accounts/biz_q5tPMk6MCfoLOm` returned HTTP `200`: `verification.individual.status: "approved"`, `verification.business: null`, and `required_actions: []`.
- Capabilities: card/bank payments, standard/crypto payouts, transfers, crypto/card deposits, and ads are `active`; BNPL, instant payouts, bank deposits, and card issuing are `inactive`.
- Comparison limitation: the earlier `/companies` read returned `verified: false` but omitted these account fields. The approved after-state is confirmed; their before-state was not captured.

- Embedded payouts recording:
- Hosted payouts portal and fee-markup evidence:

## Payments and operations

- Direct payment ID / refund ID / transfer ID:
- Ledger screenshots or redacted exports:
- Webhook ID, child events, required event payloads, and replay:
- Reconciliation: `npm run reconcile -- --seller biz_q5tPMk6MCfoLOm` exited `0`. Payments, sent transfers, and received transfers returned HTTP `200` after the permission update. Local and remote counts were both `0`, with no differences. This used a newly initialized empty local ledger; it confirms access and the empty-state comparison, not reconciliation of completed transactions.

### Dashboard validation

- Tabler 1.5.1 styles the seller dashboard; Whop supplies the embedded payout controls.
- Typecheck and build pass. Desktop and mobile layouts fit without horizontal overflow; invalid sessions show an error and restore the load button. Seller endpoints reject unauthenticated requests with HTTP `401`.
- Authenticated embedded payouts still require `LEDGERLY_SELLER_SESSIONS` and a public HTTPS return URL in local configuration. Rendering live payout controls was not verified in this checkout.
- Local validation with synthetic signed events: invalid signatures returned `401`; a platform-to-Brazil transfer reached the recipient's ledger; replay after a server restart left exactly one entry. Malformed authenticated checkout returned `400`, and hosted onboarding/payout return routes redirect to the dashboard. No financial API writes were used for validation.

## Submission

- Repository URL and visibility decision:
- Written answers:
- Loom URL:
