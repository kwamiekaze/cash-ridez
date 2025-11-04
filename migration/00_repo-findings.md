# CashRidez Repository Scan Findings

Generated: ${new Date().toISOString()}

## 📦 Supabase Migrations

Found in: `supabase/migrations/`

**Status:** This project uses Lovable Cloud (managed Supabase). Migrations are auto-generated and managed by the platform. You don't have direct access to migration files, but the export script will capture the current schema state.

## 🔧 Database Functions

### Security Definer Functions (Critical for RLS)

These functions are used extensively in RLS policies and must be recreated first:

- `has_role(_user_id uuid, _role app_role)` - Checks user role without RLS recursion
- `is_verified_user(_user_id uuid)` - Checks if user is verified
- `is_verified_rider(_user_id uuid)` - Checks if user is verified rider
- `is_ride_participant(_user_id uuid, _profile_id uuid)` - Checks ride participation
- `can_view_contact_info(_viewer_id uuid, _profile_id uuid)` - Contact info access control
- `check_active_ride(_user_id uuid)` - Checks for active assigned rides

### Business Logic Functions

- `accept_ride_atomic()` - Atomically accepts a ride with proper locking
- `update_rider_rating()` - Trigger function to update rider ratings
- `update_driver_rating()` - Trigger function to update driver ratings
- `notify_*()` - Multiple notification trigger functions
- `handle_trip_cancellation()` - Cancellation tracking logic
- `track_cancellations()` - Cancellation stat updates
- `calculate_cancel_weight()` - Weighted cancellation calculation
- `is_cancel_chargeable()` - Determines if cancellation is chargeable
- `update_cancellation_stats()` - Updates user cancellation statistics
- `increment_completed_trips()` - Trip completion counter
- `decrement_free_uses()` - Free tier usage tracking
- `can_use_trip_features()` - Trip limit gating

### Notification Functions

- `create_notification()` - Creates in-app notifications
- `notify_verification_status()` - Verification status change notifications
- `notify_trip_accepted()` - Ride acceptance notifications
- `notify_trip_cancelled()` - Cancellation notifications
- `notify_trip_status_change()` - Trip status change notifications
- `notify_new_message()` - Chat message notifications
- `notify_new_offer()` - Counter offer notifications
- `notify_nearby_riders_of_driver()` - Driver availability notifications
- `notify_admins_new_user()` - Admin notification for new users
- `notify_admins_kyc_submission()` - Admin notification for KYC submissions
- `check_rating_reminders()` - Rating reminder logic

### Utility Functions

- `normalize_zip()` - ZIP code normalization
- `is_valid_zip()` - ZIP code validation
- `prevent_locked_field_edits()` - Prevents editing admin-locked profile fields
- `handle_new_user()` - Auto-creates profile on user signup
- `update_updated_at_column()` - Generic timestamp updater
- `get_safe_profile_for_open_ride()` - Limited profile data for open rides
- `upsert_user_public_stats()` - Maintains public user stats table
- `reject_pending_offers_on_completion()` - Cleanup offers on trip completion
- `reset_cancellations_on_completion()` - Reset cancellation streak on completion
- `recalculate_all_cancellation_stats()` - Bulk recalculation utility

## 🗃️ Custom Types (Enums)

- `app_role` - User roles: 'admin', 'moderator', 'user'
- `ride_status` - Ride states: 'open', 'assigned', 'completed', 'cancelled'
- `verification_status` - KYC states: 'pending', 'approved', 'rejected'
- `cancel_reason_code` - Cancellation reasons (various codes)

## 📊 Main Tables

### User & Auth Tables
- `profiles` - User profile data (ratings, verification, subscription)
- `user_roles` - Role assignments (admin, moderator)
- `user_public_stats` - Public-facing user statistics
- `kyc_submissions` - ID verification submissions

### Ride & Trip Tables
- `ride_requests` - Main ride request data
- `ride_locations` - Real-time location tracking during rides
- `ride_messages` - In-ride chat messages
- `counter_offers` - Driver counter offers on rides

### Cancellation Tracking
- `cancellations` - Cancellation event log
- `cancellation_stats` - Aggregated cancellation metrics per user
- `cancellation_feedback` - Post-cancellation feedback

### Other Tables
- `driver_status` - Driver availability and location
- `notifications` - In-app notification system
- `support_tickets` - User support requests
- `audit_logs` - Admin action audit trail
- `user_message_flags` - Content moderation flags
- `billing_logs` - Stripe webhook event logs

## 💾 Storage Buckets

Found references in code to these buckets:

1. **profile-pictures** (public)
   - User avatars
   - Referenced in: `Profile.tsx`, various user components

2. **id-verifications** (private)
   - KYC document uploads
   - Referenced in: `Onboarding.tsx`

3. **ride-notes** (private)
   - Ride-specific note attachments
   - Referenced in: `CreateRideRequest.tsx`

4. **chat-attachments** (private)
   - In-ride chat file attachments
   - Referenced in: `ChatPage.tsx`, `FloatingChat.tsx`

## 🔌 Edge Functions

Found in: `supabase/functions/`

### Authentication Required (`verify_jwt = true`)
- `accept-ride` - Accepts ride requests with atomic locking
- `moderate-content` - Content moderation (phone/email detection)
- `send-verification-notification` - Sends verification emails to admins
- `send-support-notification` - Sends support requests to admins
- `send-offer-notification` - Sends offer-related emails
- `send-ride-accepted-notification` - Notifies rider when ride accepted
- `send-cancellation-notification` - Sends cancellation emails
- `send-rating-notification` - Sends rating notifications
- `send-status-notification` - Sends verification status emails
- `create-checkout-session` - Creates Stripe checkout sessions
- `create-customer-portal-session` - Creates Stripe customer portal sessions
- `check-subscription-status` - Checks Stripe subscription status
- `send-driver-available-notification` - Notifies riders of nearby drivers
- `send-new-trip-notification` - Notifies drivers of new trip requests

### Public (`verify_jwt = false`)
- `stripe-webhook` - Handles Stripe webhook events

## 🔐 Required Secrets

Found in: `supabase/config.toml` and edge function code

Must be set in new project's Vault:

1. **STRIPE_SECRET_KEY** - Stripe API key
   - Used by: checkout, portal, webhook, subscription functions

2. **RESEND_API_KEY** - Email service API key
   - Used by: all notification functions

3. **SUPABASE_URL** - Supabase project URL
   - Used by: all edge functions

4. **SUPABASE_ANON_KEY** - Supabase anonymous key
   - Used by: client-side code

5. **SUPABASE_SERVICE_ROLE_KEY** - Supabase service role key
   - Used by: edge functions for admin operations

6. **SUPABASE_DB_URL** - Direct database connection
   - Used by: migration scripts

7. **VITE_GOOGLE_MAPS_API_KEY** - Google Maps API key
   - Used by: location features in frontend

## 🔄 Realtime Subscriptions

Tables with realtime enabled:

- `ride_requests` - For live ride updates
- `notifications` - For live notification updates
- `ride_messages` - For live chat
- `ride_locations` - For live location tracking
- `driver_status` - For live driver availability

Check `supabase_realtime` publication after export.

## ⚙️ Auth Configuration

Found in edge function configs and inferred from code:

- **Email auth** enabled
- **Auto-confirm email** should be enabled (non-production)
- **Redirect URLs** - Check dashboard for configured URLs
- **JWT expiry** - Default Supabase settings
- **Password policy** - Default (can be customized in dashboard)

## 📝 RLS Policies Summary

All tables use Row-Level Security extensively:

- **Admin access** - Most tables have "Admins can view/update all" policies
- **User ownership** - Users can view/edit own data (profiles, rides, notifications)
- **Ride participants** - Special access for rider + assigned driver
- **Verified users** - Open ride requests visible to verified users only
- **Security definer functions** - Used to avoid RLS recursion issues

## 🚨 Critical Notes for Migration

1. **Create enums FIRST** - They're dependencies for tables
2. **Deploy security definer functions BEFORE RLS policies** - Policies reference them
3. **Enable RLS on tables BEFORE creating policies**
4. **Storage buckets** - Create before uploading files
5. **Edge functions** - Deploy after secrets are set
6. **Realtime** - Enable on tables after creation
7. **Test RLS policies** - Use test users, not service role

## 📋 Next Steps

1. Run `npm run mig:export` to capture current schema
2. Review generated SQL files in `/migration/export/`
3. Follow migration steps in `README.md`
4. Complete manual checklist in `99_dashboard_checklist.md`
5. Test thoroughly before switching production traffic

---

**Auto-generated by migration scanner**
