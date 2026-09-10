# Send verification approval emails automatically

## What's happening today

When an admin approves someone's ID, the app adds a "You're Verified" email to a waiting list and also tries to send it right away — but only if that person happens to have the app open at that exact moment. Nothing ever works through the waiting list.

Result: **392 approval emails are sitting unsent** (newest from yesterday). Only 15 have ever gone out, the last one in December.

## The fix

Have the server check the waiting list every few minutes and send anything new, so every future approval gets its email within minutes whether or not the person is online.

The 392 older entries stay untouched — they get marked as skipped so they never fire late to people verified months ago.

## Technical detail

- Mark all current `pending` rows in `verification_email_queue` as skipped (a terminal status, e.g. `skipped_backlog`) so the new worker only picks up approvals from this point forward.
- Schedule `send-verification-welcome-email` via pg_cron + pg_net, running every 5 minutes (288 runs/day; keeps the database warm even when idle, but gives a worst-case 5-minute delay on the congratulations email). Each run processes a bounded batch and marks rows `sent`/`failed` as it goes, so re-runs never duplicate.
- Confirm the function's queue-processing path handles being called with no request body (cron sends `{}`) and caps rows per run; adjust only if needed.
- Leave the existing instant client-side trigger in place — it stays a fast path, and the cron catches everyone else.

## Verification

- Approve a test profile, confirm a row appears and flips to `sent` on the next cron run.
- Confirm no backlog rows are sent.
