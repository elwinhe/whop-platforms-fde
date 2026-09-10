# Ledgerly assessment evidence

Do not record API keys, webhook secrets, card details, or other credentials here.

## Accounts and access

Run the [Step 1 seed workflow](../README.md#step-1-reproducible-seller-setup), then record the observed IDs, duplicate response, and nested error below. Local evidence exports are ignored. Mock tests are not live API evidence; these fields remain unverified until an applied run is inspected.

- Platform business ID:
- US / Germany / Brazil account IDs:
- Duplicate and nested-account probe evidence:
- Least-privilege platform/per-seller key scope (no secret values):
- Suspended-account evidence:

### Sandbox placeholder-email rejection — September 9, 2026 (PDT)

At 11:08 PM PDT, Whop rejected the [seed script's](../scripts/seed-sellers.ts) test email `ledgerly-seller-us@example.com` with HTTP `400` (`bad_request`):

> The email you provided does not accept incoming mail. Please use a different email address.

Whop requires an email that can receive mail, even in sandbox. Use an address you control when creating new sellers.

The script initially missed the existing sellers because its external IDs did not match. After correcting the IDs, it reused all three accounts without creating duplicates. The placeholder emails have since been replaced by configurable receiving addresses (`SEED_SELLER_EMAIL` plus per-account overrides) that the script validates before an applied run sends anything. No creation using a configured address has been recorded yet, so the successful rerun does not prove Whop accepts them.

## Onboarding and payouts

- Before/after account state:
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
