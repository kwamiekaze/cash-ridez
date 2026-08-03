
# CashRidez — Phase 1 Architecture Audit (as-is, no changes)

This is a read-only architecture map of the current app. It will drive Phases 2–11. No code, schema, or config changes are included.

## 1. Canonical models

| Concern | Canonical location |
|---|---|
| Profile table | `public.profiles` (id = auth.users.id). 85 columns; includes identity, roles, verification, ratings, subscription, location, referral, tips flags. |
| Trip table | `public.ride_requests` (37 columns). Status enum `public.ride_status` = `open | assigned | completed | cancelled`. |
| Connection event | `ride_requests.status` transitioning from `open` → `assigned` (inside SECURITY DEFINER `public.accept_ride_atomic(...)`). Same transition on counter‑offer accept — the offer is marked `accepted` and the ride flips to `assigned`. |
| Connected-trip counter | Trigger `public.increment_connected_trips()` on `ride_requests` fires when NEW.status='assigned' AND OLD.status<>'assigned'. It increments `profiles.connected_trips_count` for both `rider_id` and `assigned_driver_id` — a single trip counts +1 for each participant (not split per role). |
| Subscription entitlement | Client: `src/hooks/useSubscription.ts` + edge fn `check-subscription-status`. Truth is `profiles.subscription_active` + `profiles.subscription_status` (set by `stripe-webhook`). Gate rule: `subscribed OR connected_trips_count < 3`. Backend helper: `supabase/functions/_shared/subscription.ts` `hasPremiumAccess()`. |
| User location | `profiles.current_lat / current_lng / location_updated_at / location_sharing_enabled / is_map_visible / profile_zip`. Stored as raw `numeric` lat/lng — **exact** coordinates, not geohashed/approximated. PostGIS is **not** installed. |
| Email delivery | Resend, called from edge functions via `supabase/functions/_shared/email-sender.ts`. Sender fallback `noreply@updates.cashridez.com` while `cashridez.com` verifies. Log table: `public.email_logs`. |
| Email queue/worker | `admin_email_campaigns` + `admin_email_campaign_recipients` + `admin_email_worker_runs`. Runner fn `admin-bulk-email-runner`, worker fn `admin-bulk-email-worker`, claim RPC `claim_email_recipient`. **No pg_cron job currently scheduled for email** (see §Cron below) — the SMS runner is cron‑driven; email runner is invoked manually from the Email Center UI. |
| Notifications | Table `public.notifications` + RPC `create_notification` + numerous `notify_*` triggers (trip accepted/cancelled/status, new offer, new message, KYC, direct/community/room messages, nearby drivers, page views). Realtime subscribed on the client. |
| Stripe | Product/price identified only by env `STRIPE_PRICE_ID` (edge secret; not stored in DB). Webhook: `stripe-webhook` (public, verify_jwt=false), dual secrets `STRIPE_WEBHOOK_SECRET_SNAPSHOT` + `_THIN`. Checkout: `create-checkout-session`. Portal: `create-customer-portal-session`. Status ping: `check-subscription-status`. Billing audit table: `public.billing_logs`. Profile columns: `stripe_customer_id`, `stripe_subscription_id`, `subscription_active`, `subscription_status`, `subscription_started_at`, `subscription_expires_at`, `subscription_current_period_end`. Current $ amount is defined only in the Stripe dashboard price (not in code); no `1.99` string in the codebase. |

## 2. Frontend architecture

- Stack: React 18 + Vite + TS, Tailwind, shadcn/ui, react-router v6 (future flags on), TanStack Query, next-themes forced `dark`.
- Entry: `src/main.tsx` → `src/App.tsx`. All pages are `React.lazy`.
- Auth context: `src/contexts/AuthContext.tsx`. Route guards: `src/components/ProtectedRoute.tsx`, `src/components/AdminRoute.tsx`, `src/components/RoleGuard.tsx`, `src/components/RoleRedirect.tsx`.
- Global side effects mounted in `App`: `PageViewTracker`, `AppUpdateBanner`, `NotificationSoundInitializer` (`useNotificationSound`), `VoicemailAudioSeeder` (`useVoicemailAudioSeed`), deferred `NotificationPermissionDialog`.
- Service worker: `public/sw.js` + `AppUpdateBanner` / `useAppUpdate` for update prompts. `public/manifest.json` present (PWA installable via `InstallApp` page and `usePWAInstall`).
- Mobile: `useIsMobile`, per-page responsive Tailwind; admin surfaces have dedicated mobile nav (e.g. `SmsCenterMobileNav`).

### Current routes (App.tsx)

Public:
- `/`, `/auth`, `/reset-password`, `/blocked`, `/terms`, `/privacy`, `/how-it-works`, `/community`, `/map`, `/live-map` (→ `/map`), `/install-app`, `/refer`

Protected (`ProtectedRoute`):
- `/onboarding`, `/verification-pending`, `/dashboard` (→ `RoleRedirect`), `/rider`, `/driver`, `/rider/create-request`, `/rider/tips`, `/driver/tips`, `/profile`, `/trips`, `/trip/:id`, `/chat/:id`, `/history`, `/billing/success`, `/billing/cancelled`, `/subscription`, `/updates`, `/referrals`

Admin (`AdminRoute`):
- `/admin`, `/admin/system-messages`, `/admin/sms`, `/admin/calls`, `/admin/downloads`, `/admin/email`

Catch-all: `*` → `NotFound`. **No `/:username` route reserved yet** — safe to add later; only reserved words to protect are the top-level segments above (`auth`, `reset-password`, `blocked`, `terms`, `privacy`, `how-it-works`, `community`, `map`, `live-map`, `install-app`, `refer`, `onboarding`, `verification-pending`, `dashboard`, `rider`, `driver`, `profile`, `trips`, `trip`, `chat`, `history`, `billing`, `subscription`, `updates`, `referrals`, `admin`).

## 3. Auth & roles

- Auth: Supabase email/password (`Auth.tsx`, `ResetPassword.tsx`). No social providers wired.
- Role enum: `app_role` = `user | driver | admin` (Cloud), plus code paths for `moderator` in some legacy comments — not in current enum.
- Roles stored in `public.user_roles` (separate table, `has_role(uuid, app_role)` SECURITY DEFINER used in policies).
- Rider vs driver is expressed on `profiles` via `is_rider`, `is_driver`, and `active_role` (`'rider'|'driver'`) with `role_set_at`. `Dashboard.tsx` picks the redirect target from `active_role`; if unset, it inspects `ride_requests` to infer and persists it.
- Admin detection: `AdminRoute` + `has_role(user, 'admin')`. Admin exemption from paywall confirmed in memory.

## 4. Trip / connection logic

- Create: `pages/CreateRideRequest.tsx` inserts into `ride_requests` (status `open`).
- Accept direct: edge fn `accept-ride` (verify_jwt=true) → RPC `accept_ride_atomic(ride_id, driver_id, eta, skip_active_check, accepted_offer_id)`.
- Counter offers: `public.counter_offers` (8 cols, 8 policies), auto-cleanup via `auto_delete_smaller_offers` + `reject_pending_offers_on_completion`. Accepting an offer routes through the same `accept_ride_atomic` (passes `accepted_offer_id`).
- Completion: dual‑sided `rider_completed` / `driver_completed`; triggers `reset_cancellations_on_completion`, `update_trip_savings_on_completion`, `increment_completed_trips`.
- Cancellation: `handle_trip_cancellation` + `track_cancellations` + `track_cancellations_with_count`, weighted via `calculate_cancel_weight`, aggregated into `cancellation_stats`, admin cancel via `AdminCancelRideDialog`.
- **Connection = status flip to `assigned`.** Confirmed both in RPC and trigger. Cancellations do NOT decrement `connected_trips_count`.

## 5. Subscription & Stripe

- Products/prices: single recurring price defined in Stripe, referenced only via env var `STRIPE_PRICE_ID`. Not present in DB; no admin UI to change it. Current price amount is not stored anywhere in the repo — it lives in the Stripe dashboard.
- Webhook (`stripe-webhook`, verify_jwt=false, always returns 200) handles: `checkout.session.completed`, `customer.created`, `invoice.payment_succeeded`, `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted`. Writes to `profiles.subscription_active`, `subscription_status`, `stripe_customer_id`, `stripe_subscription_id`, `subscription_current_period_end`; audit rows in `billing_logs`.
- Frontend gate: `useSubscription` computes `canUseFeatures = subscribed || connected_trips < 3`. Wording in `TripLimitGate`, `SubscriptionPanel`, `Subscription.tsx`, `TripCounter` — memory confirms wording already migrated to "connected trips" (grep for "completed trip" only hits legacy stats strings in TripHistory/TripDetails/DriverDashboard/RiderDashboard/TripRequestsList — these are lifetime completed-trip *stat* labels, not paywall copy; must be re-audited for the new $1.99 flow to make sure no paywall copy regressed).
- Backend enforcement of the 3-trip cap: currently only in the client hook + `check-subscription-status` return payload. **`accept-ride` does not itself enforce the cap** — worth confirming before Phase for hardening.

## 6. Messaging / realtime

- Tables: `ride_messages` (in-trip), `direct_messages` + `direct_chats`, `community_messages`, `chat_rooms` + `chat_room_messages` + `chat_room_invites`, `chat_typing_indicators`, `message_read_receipts`, `admin_sms_messages`/`admin_sms_conversations` (SMS Center).
- Hooks: `useReadReceipts`, `useTypingIndicator`, `useBrowserNotifications`, `useNotificationSound`. Realtime subscriptions via `supabase.channel(...)` in `ChatPage`, `FloatingChat`, `CommunityChat`, `AdminChatRooms`, `NotificationBell`.
- Moderation: `moderate-content` edge fn (phone/email regex, memory notes it's bypassable).

## 7. Email Center

- Provider: **Resend** via `_shared/email-sender.ts` (retry + dedup). Sender: `noreply@updates.cashridez.com` (Resend-verified fallback); logic to switch back once `cashridez.com` verifies (per memory).
- Campaign flow: UI at `/admin/email` → `admin_email_campaigns` (parent) + `admin_email_campaign_recipients` (per user). Runner `admin-bulk-email-runner` claims via `claim_email_recipient` RPC and dispatches through `admin-bulk-email-worker`. `admin_email_worker_runs` records batches.
- Individual sends: `admin-send-email` (compose), `admin-send-draft`, `send-verification-*`, `send-*-notification` fns.
- Logs: `public.email_logs`. There is NO `email_send_log`/`suppressed_emails`/`email_unsubscribe_tokens` from the standard Lovable email infra — the project uses its own tables.
- **No pg_cron entry for the email runner** — runs are invoked from the admin UI, not on a schedule. This is a reliability gap for scheduled/large sends (mirrors the SMS runner which IS on cron).

## 8. SMS Center & Call Center (Twilio)

- SMS tables: `admin_sms_campaigns`, `admin_sms_campaign_recipients`, `admin_sms_drafts`, `admin_sms_logs`, `admin_sms_messages`, `admin_sms_conversations`, `admin_sms_opt_outs`, `admin_sms_rate_limits`, `admin_sms_send_lock`, `admin_sms_webhook_events`, `admin_sms_worker_runs`.
- SMS fns: `admin-send-sms`, `admin-bulk-sms-runner` (cron: `bulk-sms-runner-every-minute` = `* * * * *`), `admin-bulk-sms-worker`, `twilio-inbound-sms-webhook`, `twilio-inbound-sms-webhook-v2`, `twilio-sms-status-webhook`, `admin-autotext-control`.
- User opt-in: `profiles.sms_opt_in` + `SmsConsentCheckbox` (A2P 10DLC).
- Call Center tables: `calls`, `call_events`, `admin_call_campaigns`, `admin_call_campaign_recipients`, `admin_call_logs`, `call_center_messages`, `call_center_recordings`.
- Call fns: `call-center-initiate`, `-outbound-start`, `-twiml`, `-status`, `-end`, `-amd`, `-ai`, `-gather-complete`, `-voicemail`, `-voicemail-audio`, `-recording`, `-seed-audio`, `-tick` (cron: `call-center-tick-every-minute`), `call-inbound-voice`, `call-inbound-voicemail`, `call-start`, `call-status`, `call-voice`.

## 9. Map & location

- Tables/columns: `profiles.current_lat/lng/location_updated_at/location_sharing_enabled/is_map_visible/map_history_hidden_from_public/map_history_cleared_at`, `driver_status` (5 cols), `ride_locations` (per-trip breadcrumb).
- PostGIS: **NOT enabled** (only `pg_cron`, `pg_net`). No spatial index; all radius math is JS on client (`src/lib/zipDistance.ts`, ZIP centroids in `public/data/zip_centroids.json` and inlined in `send-new-trip-notification`).
- Public map: `PublicLiveMapView` + `mapPresenceUtils`, `mapPermissions`. Recently relabeled Online→"Active Recently" with density thinning for the public view (per memory).
- Live map exact coords are exposed to authenticated verified users and (with density limits) publicly. Privacy risk noted in security memory.

## 10. Verification (KYC)

- `kyc_submissions` table, buckets `id-verifications` (private), `profile-pictures` (public), `ride-notes` (private), `chat-attachments` (private).
- Flow: `Onboarding.tsx` upload → admin review in AdminDashboard → `notify_verification_status` + `send-status-notification` / `send-verification-welcome-email`. Welcome email is queued via `queue_verification_welcome_email` trigger into `verification_email_queue` (9 cols) — public verify_jwt=false function was flagged in security memory.

## 11. Public vs authenticated profile views

- No public `/user/:id` or `/:username` page today. `UserProfileModal` / `UserDetailDialog` render inside authenticated admin/community surfaces.
- `profiles` has 10 RLS policies; safe public view helper: RPC `get_safe_profile_for_open_ride`. Aggregate: `user_public_stats` (populated via `upsert_user_public_stats`).
- No `username` / handle column exists on `profiles`. Reserving `/:username` will require adding a unique, indexed, validated column (Phase 2+).

## 12. Admin dashboard & analytics

- Pages: `AdminDashboard`, `AdminAnalytics`, `AdminSystemMessages`, `AdminSmsCenter`, `AdminCallCenter`, `AdminDownloads`, `AdminEmailCenter`.
- Components: `UserManagementTable`, `AdminUserFilters`, `AdminUserNotes`, `AdminBanUserDialog`, `AdminBlockUserDialog`, `AdminInviteUserDialog`, `AdminCancelRideDialog`, `AdminMapUserInfoPanel`, `AdminRidesManagement`, `AdminTripMessages`, `AdminReferralsTab`, `AdminChatRooms`, `AdminVisitAlertToggle`, admin sub-components in `components/admin/*`.
- Analytics: `page_views` (14 cols), `analytics_events` (7 cols), `usePageViewTracking`, `useAnalyticsEvents`, `PageViewsAnalytics`, `VisitorActivityLog`, `ActiveVisitorsCard`.

## 13. Background jobs / cron / queues

Active `cron.job` entries (queried live):
- `auto-rate-trips-hourly` — `0 * * * *` → `auto-rate-trips` fn
- `bulk-sms-runner-every-minute` — `* * * * *` → `admin-bulk-sms-runner`
- `call-center-tick-every-minute` — `* * * * *` → `call-center-tick`

Not on cron:
- `admin-bulk-email-runner` (email campaigns rely on manual admin trigger)
- No cron for driver-availability radius alerts, no cron for stale-lock cleanup on SMS/Call (some functions have RPC fallbacks e.g. `release_stale_sms_locks`).
- No pgmq. Standard Lovable email queue infra (`process-email-queue`, `pg_cron` wake trigger) is NOT installed.

## 14. Browser-only timers doing "background" work

- `useSubscription` runs `checkStatus` every 60s per client (fine, but not authoritative).
- `useNotificationSound`, `useReadReceipts`, `useTypingIndicator`, `useDriverAvailabilitySync` all use client intervals. Nothing critical (billing, campaign send) is running purely in the browser.

## 15. Privacy & security controls

- RLS enabled on every listed public table (policy counts shown in tables map).
- SECURITY DEFINER pattern used consistently (`has_role`, `is_verified_user`, `accept_ride_atomic`, `has_role`-based policies).
- Admin actions logged in `admin_actions`, `audit_logs`, `admin_user_notes`.
- Chat moderation flags: `user_message_flags`, `moderate-content` fn.

Concerns (carry into Phase 11 hardening — from security memory and this scan):
- `cancellation_stats` policy allows public reads.
- `public_map_presence` view / exact lat-lng exposure to authenticated verified users; PostGIS-less radius work is done client-side.
- `auto-rate-trips` and `send-verification-welcome-email` are `verify_jwt=false` and publicly hittable — abuse risk.
- Auth leaked-password protection disabled.
- `counter_offers` missing DELETE policies; `moderate-content` regex bypassable.
- Stripe/service-role keys are **only** in edge function env — no evidence of leakage to the client. `client.ts` uses anon key only. `.env` referenced but not committed with secrets.

## 16. Wording audit — "completed" vs "connected" trips

- Paywall wording: already migrated to "3 connected trips" per implementation memory; `useSubscription` computes `trips_remaining` off `connected_trips_count`.
- Remaining "completed trip" strings live in **stats** copy on `TripRequestsList.tsx`, `TripHistory.tsx`, `TripDetails.tsx`, `DriverDashboard.tsx`, `RiderDashboard.tsx` — these are legitimately about completed trips (history/earnings) and should NOT be blanket-renamed. Any paywall/limit copy discovered on those pages during Phase 5 must be re-checked case-by-case.

## 17. Tables at risk of unbounded growth (needs retention in Phase 11)

`page_views`, `analytics_events`, `notifications`, `ride_messages`, `direct_messages`, `community_messages`, `chat_room_messages`, `call_events`, `admin_call_logs`, `admin_sms_logs`, `admin_sms_webhook_events`, `admin_sms_messages`, `email_logs`, `ride_locations`, `billing_logs`, `admin_email_worker_runs`, `admin_sms_worker_runs`, `verification_email_queue`. None currently have a retention/archival job.

## 18. Gaps to resolve before Phases 2–11

1. Add a `username`/handle column on `profiles` (unique, case-insensitive, validated, reserved-word list from §Routes) — required for `/:username` public profiles and shareable trip URLs.
2. Decide the canonical shareable trip URL format (`/trip/:id` already exists as an authenticated route; a public share would need a separate `/t/:slug` or public token).
3. Choose PostGIS vs ZIP-centroid distance for radius alerts (currently ZIP-only; PostGIS not enabled).
4. Move `admin-bulk-email-runner` onto pg_cron and confirm the runner is idempotent (matches the SMS pattern).
5. Confirm/lock the Stripe price ID for the $1.99/month product and decide where its display amount lives (env only vs an `app_settings` row) — `app_settings` (5 cols, 4 policies) already exists.
6. Enforce the 3-connected-trip cap server-side in `accept-ride` in addition to the client hook.
7. Address the security-memory items above before opening public profiles / shareable trip URLs (they widen the read surface).

---

**Deliverable:** the report above. No files were modified. Awaiting approval to proceed to Phase 2.
