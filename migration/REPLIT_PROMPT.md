# CashRidez Complete Migration Prompt for Replit AI

Copy and paste this entire prompt into Replit AI to set up the complete database schema and backend functionality:

---

## 🚀 CashRidez Supabase Migration Setup

I need you to help me migrate a ride-sharing application called CashRidez to a new Supabase instance. This app allows riders to post trip requests and drivers to accept them, with features like chat, ratings, cancellation tracking, and subscription management.

### Database Schema Overview

The app uses the following key features:
- **User Authentication**: Profiles with verification status (KYC)
- **Ride Requests**: Open/assigned/completed/cancelled status flow
- **Counter Offers**: Drivers can make custom price offers to riders
- **Real-time Chat**: Messages and attachments between ride participants
- **Ratings**: Bidirectional ratings (rider ↔ driver)
- **Cancellation Tracking**: Weighted cancellation system with badges
- **Subscriptions**: Stripe-based premium membership (3 free trips)
- **Notifications**: In-app notification system
- **Driver Availability**: Real-time driver status and location
- **Admin Panel**: User management, verification, audit logs

### Required Environment Variables

```bash
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
STRIPE_SECRET_KEY=your_stripe_key
RESEND_API_KEY=your_resend_key
```

### Storage Buckets Required

1. **profile-pictures** (PUBLIC)
   - User avatars
   - Max: 5MB
   - Types: image/png, image/jpeg, image/jpg, image/webp

2. **id-verifications** (PRIVATE)
   - KYC documents (ID front, back, selfie)
   - Max: 10MB
   - Types: image/png, image/jpeg, image/jpg, image/pdf

3. **ride-notes** (PRIVATE)
   - Ride-specific note images
   - Max: 5MB
   - Types: image/png, image/jpeg, image/jpg

4. **chat-attachments** (PRIVATE)
   - Chat file attachments between ride participants
   - Max: 10MB
   - Types: image/png, image/jpeg, image/jpg, application/pdf, text/plain

### Core Database Tables

**profiles** - Extended user information
- Links to auth.users via id (uuid)
- Fields: email, display_name, full_name, phone_number, photo_url, bio
- Role flags: is_rider, is_driver, active_role
- Verification: is_verified, verification_status, verification_notes
- Ratings: rider_rating_avg/count, driver_rating_avg/count
- Subscription: subscription_active, stripe_customer_id, stripe_subscription_id
- Admin controls: blocked, paused, warning_count, admin_locked_fields

**ride_requests** - Core trip system
- rider_id, assigned_driver_id
- Locations: pickup_lat/lng/address/zip, dropoff_lat/lng/address/zip
- Status: open → assigned → completed/cancelled
- Times: pickup_time, created_at, updated_at, cancelled_at
- Ratings: rider_rating, driver_rating (1-5 stars)
- Completion: rider_completed, driver_completed (both must be true)
- Notes: rider_note, rider_note_image_url
- Cancellation: cancelled_by, cancel_reason_code, cancel_reason_rider/driver

**user_roles** - Role-based access control
- user_id, role (enum: 'user', 'driver', 'admin')

**counter_offers** - Driver price proposals
- ride_request_id, by_user_id, amount, status, message
- Status: pending → accepted/rejected

**ride_messages** - Chat between participants
- ride_request_id, sender_id, text, attachment_url

**notifications** - In-app notifications
- user_id, type, title, message, link, read
- related_ride_id, related_user_id

**cancellations** - Cancellation event tracking
- trip_id, user_id, role, reason_code, is_chargeable, weight

**cancellation_stats** - Calculated cancellation metrics
- Per user: rider/driver stats (90-day and lifetime)
- Rates: rider_rate_90d, rider_rate_lifetime, driver_rate_90d, driver_rate_lifetime
- badge_tier: green/yellow/red based on cancellation rate

**driver_status** - Real-time driver availability
- user_id, state (available/unavailable), current_zip, approx_geo

**kyc_submissions** - Verification document tracking
- user_id, role, status, front/back/selfie URLs
- reviewed_at, reviewer_id, notes

**support_tickets** - Customer support
- user_id, subject, body, status

**audit_logs** - Admin action tracking
- actor_id, action, target_id, target_collection, payload

### Key Database Functions

**has_role(_user_id, _role)** - Check if user has specific role
**is_verified_user(_user_id)** - Check verification status
**can_view_contact_info(_viewer_id, _profile_id)** - PII access control
**accept_ride_atomic(...)** - Atomic ride acceptance with locking
**calculate_cancel_weight(...)** - Weighted cancellation scoring
**update_cancellation_stats(...)** - Recalculate user cancellation metrics

### Edge Functions Required

1. **accept-ride** - Atomic ride acceptance
2. **send-new-trip-notification** - Notify drivers of new trips
3. **send-ride-accepted-notification** - Notify rider when accepted
4. **send-offer-notification** - Notify rider of new counter offer
5. **send-verification-notification** - Email admin when KYC submitted
6. **send-cancellation-notification** - Email on trip cancellation
7. **send-rating-notification** - Notify user when rated
8. **send-status-notification** - Email on verification status change
9. **send-support-notification** - Email admins on support request
10. **create-checkout-session** - Stripe subscription checkout
11. **create-customer-portal-session** - Stripe billing portal
12. **check-subscription-status** - Sync Stripe subscription status
13. **stripe-webhook** - Handle Stripe events (verify_jwt = false)
14. **moderate-content** - Content moderation (optional AI)

### Critical RLS Security Rules

**Profiles:**
- Users can view/update own profile
- Admins can view/update all
- Verified users can view limited data for open ride posters
- Contact info (phone, email) only visible to: self, admins, active ride participants

**Ride Requests:**
- Verified users can create requests
- Verified users can view open requests
- Users can view their own requests (as rider or driver)
- Riders can update their open/assigned rides
- Drivers can update assigned rides
- Admins can view/update all

**Storage:**
- profile-pictures: Public read, authenticated users can upload/update/delete own
- id-verifications: Users upload/view own, admins view/delete all
- ride-notes: Riders upload for their trips, participants + admins can view
- chat-attachments: Participants upload/view, admins view all

### Database Triggers

- **handle_new_user** - Create profile on auth.users insert
- **notify_trip_accepted** - Create notification on assignment
- **notify_trip_cancelled** - Notify other participant
- **notify_new_offer** - Notify rider of counter offer
- **notify_new_message** - Notify recipient of chat message
- **notify_verification_status** - Notify user on approval/rejection
- **check_rating_reminders** - Create rating reminders
- **track_cancellations** - Increment cancellation counter
- **handle_trip_cancellation** - Log cancellation event
- **update_rider_rating** - Recalculate rider average
- **update_driver_rating** - Recalculate driver average
- **update_cancellation_stats** - Update stats table
- **notify_nearby_riders_of_driver** - Notify riders when driver becomes available
- **upsert_user_public_stats** - Sync public stats table

### App Functionality Flow

**User Onboarding:**
1. Sign up → create profile
2. Choose role (rider/driver/both)
3. Upload KYC (ID front/back + selfie)
4. Admin reviews → approve/reject
5. User gets notification and can now use app

**Ride Flow (Rider):**
1. Create ride request (pickup, dropoff, time, note)
2. Drivers see open request in their area
3. Driver accepts or makes counter offer
4. Rider accepts counter offer or waits for acceptance
5. Ride assigned → chat unlocked
6. Both mark completed → ratings exchange
7. Stats/ratings updated

**Ride Flow (Driver):**
1. Set availability (ZIP code + status)
2. Browse open requests or get notifications
3. Accept ride or make counter offer
4. Chat with rider
5. Complete ride
6. Rate rider

**Cancellation System:**
- Grace period: 2 min after acceptance
- Non-chargeable: weather, safety, system timeout, no offers/driver
- Weighted: 1.0 base, 1.5 if <60min to pickup, 2.0 for no-show
- Badge tiers: green (<5%), yellow (5-15%), red (>15%)

**Subscription:**
- Free: 3 completed trips
- Premium: Unlimited via Stripe subscription
- Managed via Stripe webhooks

### Authentication Settings

- Enable email/password authentication
- Auto-confirm emails (for development/testing)
- Site URL: your_app_domain
- Redirect URLs: your_app_domain/auth/callback

### Migration Steps

Please help me:
1. Create all necessary database tables with proper types and constraints
2. Set up all RLS policies for security
3. Create all database functions and triggers
4. Configure storage buckets with RLS
5. Provide the edge function templates
6. Set up realtime subscriptions for messages and notifications
7. Create initial admin user setup script

---

**After you generate the migration, I'll need:**
- SQL file to run in Supabase SQL Editor
- Edge function code for supabase/functions/
- Environment variable checklist
- Testing checklist to verify everything works
