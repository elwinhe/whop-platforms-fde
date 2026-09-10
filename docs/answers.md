# Ledgerly assessment answers

## Duplicate connected-account creation

The seed helper can deliberately repeat the same create request with `--probe`. This is an observation, not the application's idempotency mechanism: `metadata.external_id` is searchable metadata and not a provider idempotency guarantee. Record the actual sandbox response/IDs here after the approved probe. The HTTP onboarding implementation therefore lists and matches first, persists an attempt before POST, and refuses unresolved concurrent or ambiguous retries.

## Nested connected-account attempt

Record the exact sandbox response here after the approved probe. The helper treats only the observed 422 as a candidate nesting rejection and still requires inspection of its error message; it does not infer the reason from status alone.

## Onboarding before and after

The recorded US after-state is approved individual verification, no required actions, and active card/bank payments, standard/crypto payouts, transfers, crypto/card deposits, and ads. The earlier company list did not expose equivalent before-state fields, so the before/after comparison remains incomplete rather than reconstructed.

## Money movement and refunds

For a $25 direct charge the application computes the 8% fee as 200 integer cents and submits $2.00. The seller and platform ledger effects—and whether/how the application fee reverses on refund—must be reported from the actual payment/refund financial activity, not assumed. In the transfer flow Ledgerly receives the buyer charge first and separately transfers the seller share; payment success and available balance must be checked before transfer.

## Debug response

The seller identifier is the envelope's `company_id`; consumers must not require `data.account_id`. `withdrawal.updated` and `payout.updated` are compatibility names for the same domain object, so normalize the type and deduplicate on the stable provider event ID plus resource ID—not the event name.

A two-day pending payout is not by itself proof Whop is broken. My first reply would acknowledge the seller impact, collect the payout/withdrawal ID (the pasted sample lacks one), destination rail, timestamps, account verification/required actions, status history, and any error/estimated-availability fields, then check provider status and escalate with those IDs. I would not retry or create another withdrawal while the first is unresolved.

## Three product or documentation improvements

1. Publish one versioned Platforms recipe whose payloads compile against the current SDK/OpenAPI. The assessment's nested-product checkout sample and current native schema/example have drifted.
2. Document the exact embedded-payout `scoped_actions` set beside the component example. The official example currently inherits key permissions when the field is omitted.
3. Put webhook envelope routing, alias compatibility, replay ID behavior, and amount units in one event-contract table. These are correctness-critical but currently require cross-referencing several pages.
