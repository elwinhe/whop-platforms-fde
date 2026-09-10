# Whop Platforms FDE assessment — written answers

## "Our consumer crashed because there's no account_id. We also get both withdrawal.updated and payout.updated for the same thing and double-post to our ledger. And the German seller says her withdrawal has been pending two days. Is Whop broken?"

The payload is missing `account_id` completely, instead, we are passing in `company_id`, we should be able to normalize the two without crashing, along with `withdrawal.updated / payout.updated so that our system recognizes those two aliases as the same thing so that it wouldn't double-post. The schema also lacks a unique event id for deduplication.

What I would say to the seller: "we're checking if your account exists in our system and confirm the expected arrival window for that withdrawal, please don't submit a second withdrawal request"

## Last thing

1. Account-link creation reports missing scopes individually. Documenting the complete permission set per use_case, and returning all missing scopes together, would shorten integration time
2. Slightly misleading docs on "Top Up" neither the sandbox dashboard nor connected seller portal shows  I couldn’t complete a top-up: Deposit returned “Unable to load deposit details”, which blocked refund testing because the seller’s funds remained pending. It'll be nicer to return an error code or a potential lead on what's wrong on the sandbox dashboard
3. Keep the platforms guide, sdk examples, and api schema aligned to an explicit api version. The checkout examples differ in account placement and included fields, making it difficult to identify the correct request. Consistent, validated examples would reduce integration trial and error
