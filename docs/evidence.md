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
- Durable idempotency and reconciliation run:

## Submission

- Repository URL and visibility decision:
- Written answers:
- Loom URL:
