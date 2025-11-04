# Manual Dashboard Configuration Checklist

These settings must be manually configured in the new Supabase project dashboard, as they're not fully exposed via SQL or API.

## 🔐 Step 1: API Keys & URLs

Go to: **Settings → API**

- [ ] Copy **Project URL** → Add to Replit Secrets as `VITE_SUPABASE_URL`
- [ ] Copy **anon/public key** → Add to Replit Secrets as `VITE_SUPABASE_PUBLISHABLE_KEY`
- [ ] Copy **service_role key** → Add to Replit Secrets as `SUPABASE_SERVICE_ROLE_KEY`
- [ ] Note **Project Ref** (from URL) → Add to Replit Secrets as `VITE_SUPABASE_PROJECT_ID`

## 🗄️ Step 2: Database Connection String

Go to: **Settings → Database → Connection string → URI**

- [ ] Copy connection string (format: `postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres`)
- [ ] Replace `[YOUR-PASSWORD]` with actual database password
- [ ] Add to Replit Secrets as `SUPABASE_DB_URL`

## 🔒 Step 3: Authentication Settings

### Email Templates

Go to: **Authentication → Email Templates**

Configure each template (copy from old project if customized):

- [ ] **Confirm signup** - Email sent when user signs up
  ```
  Subject: Confirm Your Email - CashRidez
  Body: Click to confirm: {{ .ConfirmationURL }}
  ```

- [ ] **Reset password** - Password reset email
  ```
  Subject: Reset Your Password - CashRidez
  Body: Reset your password: {{ .ConfirmationURL }}
  ```

- [ ] **Magic Link** - Passwordless login (if enabled)
  ```
  Subject: Sign In to CashRidez
  Body: Click to sign in: {{ .ConfirmationURL }}
  ```

- [ ] **Change Email Address** - Email change confirmation
  ```
  Subject: Confirm Email Change - CashRidez
  Body: Confirm your new email: {{ .ConfirmationURL }}
  ```

### SMTP Settings (if using custom email)

Go to: **Authentication → Email Templates → SMTP Settings**

- [ ] **SMTP Host** - e.g., `smtp.resend.com`
- [ ] **SMTP Port** - Usually `587` or `465`
- [ ] **SMTP Username** - Your SMTP username
- [ ] **SMTP Password** - Add to Vault, reference in settings
- [ ] **Sender Email** - e.g., `noreply@cashridez.com`
- [ ] **Sender Name** - e.g., `CashRidez`
- [ ] Test by sending yourself an email

### URL Configuration

Go to: **Authentication → URL Configuration**

- [ ] **Site URL** - Your production URL (e.g., `https://cashridez.replit.app`)
- [ ] **Redirect URLs** - Add all allowed redirect URLs:
  ```
  https://cashridez.replit.app/**
  http://localhost:5173/**
  http://localhost:8080/**
  ```

### General Auth Settings

Go to: **Authentication → Settings**

- [ ] **Enable Email Signups** - ✅ On
- [ ] **Enable Email Confirmations** - ⚠️ **TURN OFF for development** (auto-confirm)
  - For production: Turn ON
- [ ] **Minimum Password Length** - Default: 6 (adjust as needed)
- [ ] **Password Requirements** - Configure as needed

### OAuth Providers (if used)

Go to: **Authentication → Providers**

For each enabled provider:

- [ ] **Google OAuth**
  - Client ID: `_______________`
  - Client Secret: (add to Vault as `GOOGLE_CLIENT_SECRET`)
  - Redirect URI: Copy from Supabase dashboard

- [ ] **Apple OAuth** (if used)
  - Client ID: `_______________`
  - Client Secret: (add to Vault)
  - Redirect URI: Copy from Supabase dashboard

- [ ] **Other providers** - Configure as needed

## 🗂️ Step 4: Storage Settings

### Bucket Configuration

Go to: **Storage → Buckets**

Verify each bucket was created correctly:

- [ ] **profile-pictures**
  - Public: ✅ Yes
  - Size limit: 5 MB
  - Allowed MIME types: image/png, image/jpeg, image/jpg, image/webp

- [ ] **id-verifications**
  - Public: ❌ No
  - Size limit: 10 MB
  - Allowed MIME types: image/png, image/jpeg, image/jpg, application/pdf

- [ ] **ride-notes**
  - Public: ❌ No
  - Size limit: 5 MB
  - Allowed MIME types: image/png, image/jpeg, image/jpg

- [ ] **chat-attachments**
  - Public: ❌ No
  - Size limit: 10 MB
  - Allowed MIME types: image/png, image/jpeg, image/jpg, application/pdf, text/plain

### Storage RLS Policies

Go to: **Storage → Policies**

- [ ] Verify policies exist for `storage.objects` table
- [ ] Test upload as regular user
- [ ] Test admin access to all buckets
- [ ] Verify users can't access other users' private files

### CDN Settings (Optional)

Go to: **Storage → Settings**

- [ ] Enable CDN if needed for better performance
- [ ] Configure custom domain if using one

## 🔑 Step 5: Secrets & Environment Variables

Go to: **Project Settings → Vault** (or equivalent secrets manager)

Add all required secrets:

### Stripe (Payment Processing)
- [ ] `STRIPE_SECRET_KEY` - Get from Stripe Dashboard → Developers → API Keys
  ```
  sk_live_... (production)
  sk_test_... (development)
  ```

### Resend (Email Service)
- [ ] `RESEND_API_KEY` - Get from Resend Dashboard → API Keys
  ```
  re_...
  ```

### Google Maps
- [ ] `VITE_GOOGLE_MAPS_API_KEY` - Get from Google Cloud Console
  ```
  AIza...
  ```

### Supabase (for Edge Functions)
- [ ] `SUPABASE_URL` - Same as Project URL
- [ ] `SUPABASE_ANON_KEY` - Same as anon key
- [ ] `SUPABASE_SERVICE_ROLE_KEY` - Same as service role key

### Other Services
- [ ] Add any other third-party API keys used in your edge functions

## ⚡ Step 6: Edge Functions Deployment

### Prerequisites
- [ ] Install Supabase CLI: `npm install -g supabase`
- [ ] Login: `supabase login`
- [ ] Link project: `supabase link --project-ref [NEW-PROJECT-REF]`

### Deploy Each Function

Go to project root and run:

```bash
# Deploy all functions at once
supabase functions deploy

# Or deploy individually:
supabase functions deploy accept-ride
supabase functions deploy moderate-content
supabase functions deploy send-verification-notification
supabase functions deploy send-support-notification
supabase functions deploy send-offer-notification
supabase functions deploy send-ride-accepted-notification
supabase functions deploy send-cancellation-notification
supabase functions deploy send-rating-notification
supabase functions deploy send-status-notification
supabase functions deploy create-checkout-session
supabase functions deploy create-customer-portal-session
supabase functions deploy check-subscription-status
supabase functions deploy send-driver-available-notification
supabase functions deploy send-new-trip-notification
supabase functions deploy stripe-webhook
```

Deployment checklist:
- [ ] All functions deployed successfully
- [ ] Check logs: `supabase functions logs [function-name]`
- [ ] Verify `verify_jwt` settings match `supabase/config.toml`

### Test Edge Functions

Test critical functions:

- [ ] Test `accept-ride` - Accept a test ride
- [ ] Test `create-checkout-session` - Start subscription flow
- [ ] Test `stripe-webhook` - Trigger test webhook from Stripe
- [ ] Test notification functions - Create test notifications

## 🔗 Step 7: Webhooks Configuration

### Stripe Webhooks

Go to: **Stripe Dashboard → Developers → Webhooks**

1. Click **Add endpoint**
2. **Endpoint URL:** 
   ```
   https://[NEW-PROJECT-REF].supabase.co/functions/v1/stripe-webhook
   ```
3. **Events to listen to:** Select all `customer.subscription.*` and `checkout.session.*`
4. **Webhook signing secret:** 
   - [ ] Copy signing secret (starts with `whsec_`)
   - [ ] Add to Vault as `STRIPE_WEBHOOK_SECRET`
   - [ ] Update edge function code if it references this secret

5. **Test webhook:**
   - [ ] Click "Send test webhook"
   - [ ] Verify it appears in Edge Functions logs

### Other Webhooks

If you have other webhook integrations:

- [ ] **Service:** _______________
  - Endpoint: `https://[NEW-PROJECT-REF].supabase.co/functions/v1/[function-name]`
  - Secret: _______________
  - Events: _______________

## 🔍 Step 8: Database Verification

Go to: **Database → Tables**

Verify schema is correct:

- [ ] All tables exist
- [ ] All columns present with correct types
- [ ] Primary keys configured
- [ ] Foreign keys configured
- [ ] Indexes created

Go to: **Database → Functions**

- [ ] All functions exist (especially security definer functions)
- [ ] Test critical functions in SQL editor

Go to: **Authentication → Policies**

- [ ] RLS enabled on all tables
- [ ] All policies created
- [ ] Test policies with test user (create test account, try operations)

## 🧪 Step 9: Testing Checklist

### User Authentication
- [ ] Sign up new user
- [ ] Receive confirmation email (if confirmations enabled)
- [ ] Sign in with email/password
- [ ] Password reset flow
- [ ] Sign out

### User Roles & Permissions
- [ ] Create test admin user
- [ ] Add admin role via SQL: `INSERT INTO user_roles (user_id, role) VALUES ('[user-id]', 'admin')`
- [ ] Verify admin can access admin dashboard
- [ ] Verify regular user cannot access admin features

### Ride Functionality
- [ ] Create ride request as rider
- [ ] View open rides as driver
- [ ] Accept ride as driver
- [ ] Send message in ride chat
- [ ] Upload attachment in chat
- [ ] Complete ride
- [ ] Rate rider/driver

### Storage
- [ ] Upload profile picture
- [ ] Upload ID verification documents
- [ ] Upload ride note image
- [ ] Upload chat attachment
- [ ] Verify files accessible to correct users
- [ ] Verify files NOT accessible to unauthorized users

### Subscriptions (if using Stripe)
- [ ] Start subscription flow
- [ ] Complete test payment (use Stripe test card)
- [ ] Verify subscription status updates
- [ ] Access customer portal
- [ ] Cancel subscription

### Notifications
- [ ] Receive in-app notification
- [ ] Browser push notification (if implemented)
- [ ] Email notification

### Admin Features
- [ ] View user list
- [ ] Approve/reject KYC submission
- [ ] View ride history
- [ ] View audit logs

## 📊 Step 10: Monitoring Setup

Go to: **Project Settings → Monitoring**

- [ ] Set up error alerts
- [ ] Configure database usage alerts
- [ ] Set up storage usage alerts
- [ ] Enable API request monitoring

Go to: **Database → Logs**

- [ ] Verify logs are being captured
- [ ] Check for any errors

Go to: **Edge Functions → [function name] → Logs**

- [ ] Verify function execution logs
- [ ] Check for any errors

## 🚀 Step 11: Production Readiness

### Security Review
- [ ] All RLS policies tested
- [ ] No service role key exposed in client code
- [ ] All secrets stored in Vault (not hardcoded)
- [ ] CORS configured correctly for edge functions
- [ ] Rate limiting configured (if needed)

### Performance
- [ ] Database indexes created for frequent queries
- [ ] Connection pooling configured
- [ ] CDN enabled for storage (if needed)

### Backups
- [ ] Daily backups enabled (check in Project Settings → Backups)
- [ ] Verify backup retention policy

### Documentation
- [ ] Update README with new project URLs
- [ ] Update environment variable documentation
- [ ] Document any custom configurations

## ✅ Final Verification

Before switching production traffic:

- [ ] All tests passing
- [ ] No errors in logs
- [ ] Performance acceptable
- [ ] All integrations working (Stripe, email, etc.)
- [ ] SSL certificate valid
- [ ] DNS configured (if using custom domain)
- [ ] Team members have access to new project
- [ ] Old project URLs redirected (if applicable)

## 📞 Support Resources

- [Supabase Documentation](https://supabase.com/docs)
- [Supabase Discord](https://discord.supabase.com)
- [Edge Functions Guide](https://supabase.com/docs/guides/functions)
- [Storage Guide](https://supabase.com/docs/guides/storage)
- [RLS Guide](https://supabase.com/docs/guides/auth/row-level-security)

---

**Migration Date:** _______________
**Completed By:** _______________
**New Project Ref:** _______________
**Production URL:** _______________

**Notes:**
_______________________________________________
_______________________________________________
_______________________________________________
