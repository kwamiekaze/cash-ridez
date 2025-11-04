# CashRidez Supabase Migration Guide

This folder contains tools to export your current Supabase project and recreate it in a new instance.

## 📋 Prerequisites

- Node.js installed
- `pg` package installed (`npm install pg` from project root)
- Access to both old and new Supabase projects
- Environment variables configured

## 🔧 Required Environment Variables

Set these in your Replit Secrets or `.env` file:

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SUPABASE_DB_URL=postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres
```

**Finding SUPABASE_DB_URL:**
1. Go to your Supabase project dashboard
2. Settings → Database → Connection string → URI
3. Copy the connection string and replace `[YOUR-PASSWORD]` with your database password

## 🚀 Migration Steps

### Step 1: Export from Old Project

1. **Set environment variables for OLD project:**
   ```bash
   SUPABASE_DB_URL=postgresql://postgres:[OLD-PASSWORD]@db.[OLD-PROJECT-REF].supabase.co:5432/postgres
   ```

2. **Run export script:**
   ```bash
   npm run mig:export
   ```

3. **Verify export:**
   Check that `/migration/export/` contains all SQL files:
   - `01_tables_columns.sql`
   - `02_constraints_indexes.sql`
   - `03_enums.sql`
   - `04_functions.sql`
   - `05_triggers.sql`
   - `06_extensions.sql`
   - `07_rls_table_flags.sql`
   - `08_rls_policies.sql`
   - `09_storage_buckets.sql`
   - `10_realtime_publications.sql`

4. **Commit the export:**
   ```bash
   git add migration/export/
   git commit -m "Export Supabase schema for migration"
   ```

### Step 2: Create New Supabase Project

1. Go to [supabase.com](https://supabase.com)
2. Create a new project
3. Wait for it to finish provisioning (~2 minutes)
4. Note down the new project's credentials

### Step 3: Recreate Schema in New Project

1. **Update environment variables for NEW project:**
   ```bash
   SUPABASE_URL=https://[NEW-PROJECT-REF].supabase.co
   SUPABASE_ANON_KEY=eyJ... (new project)
   SUPABASE_SERVICE_ROLE_KEY=eyJ... (new project)
   SUPABASE_DB_URL=postgresql://postgres:[NEW-PASSWORD]@db.[NEW-PROJECT-REF].supabase.co:5432/postgres
   ```

2. **Run SQL files in order via Supabase SQL Editor:**
   
   Open Supabase Dashboard → SQL Editor, then execute each file in this order:
   
   ```
   ✅ 01_enums.sql
   ✅ 02_tables.sql
   ✅ 03_extensions.sql
   ✅ 04_functions.sql
   ✅ 05_tables_indexes_constraints.sql
   ✅ 06_triggers.sql
   ✅ 07_rls_flags.sql
   ✅ 08_rls_policies.sql
   ✅ 09_storage_buckets.sql
   ✅ 10_realtime_publications.sql
   ✅ 11_reference_data.sql (optional)
   ```

   **Tips:**
   - Copy entire contents of each file
   - Paste into SQL Editor
   - Click "Run"
   - Verify no errors (check output panel)
   - If errors occur, note them and fix before continuing

3. **Verify schema recreation:**
   - Check Tables section - should match old project
   - Check Database → Functions - verify all functions exist
   - Check Authentication → Policies - verify RLS policies

### Step 4: Manual Dashboard Configuration

Complete the checklist in `99_dashboard_checklist.md`:

#### Authentication Settings
- [ ] Email templates (Confirm, Reset Password, Magic Link)
- [ ] SMTP settings (if using custom email)
- [ ] Redirect URLs / Site URL
- [ ] OAuth providers (Google, Apple, etc.) - add client IDs/secrets
- [ ] Password policy

#### Storage Settings
- [ ] Verify bucket RLS policies in Storage → Policies
- [ ] Check public vs private bucket settings
- [ ] Configure CDN if needed

#### Secrets & API Keys
- [ ] Add `STRIPE_SECRET_KEY` to Vault (if using Stripe)
- [ ] Add `RESEND_API_KEY` to Vault (if using Resend)
- [ ] Add `VITE_GOOGLE_MAPS_API_KEY` to Vault
- [ ] Any other third-party API keys

#### Edge Functions
- [ ] Deploy edge functions:
   ```bash
   supabase functions deploy send-new-trip-notification
   supabase functions deploy send-ride-accepted-notification
   supabase functions deploy accept-ride
   # ... deploy all functions in supabase/functions/
   ```

#### Webhooks
- [ ] Update Stripe webhook URL to new project URL
- [ ] Update webhook signing secrets
- [ ] Test webhook delivery

### Step 5: Update Application Configuration

1. **Update environment variables in your app:**
   ```bash
   VITE_SUPABASE_URL=https://[NEW-PROJECT-REF].supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=eyJ... (new anon key)
   VITE_SUPABASE_PROJECT_ID=[NEW-PROJECT-REF]
   ```

2. **Update Replit Secrets** (if deploying on Replit):
   - Go to Tools → Secrets
   - Update all `VITE_SUPABASE_*` values
   - Update `SUPABASE_SERVICE_ROLE_KEY`
   - Update `SUPABASE_DB_URL`

3. **Test locally:**
   ```bash
   npm run dev
   ```

4. **Verify core functionality:**
   - [ ] User signup/login
   - [ ] Create ride request
   - [ ] Accept ride request
   - [ ] Real-time updates
   - [ ] File uploads
   - [ ] Admin dashboard

### Step 6: Data Migration (Optional)

If you need to migrate user data:

1. **Export data from old project:**
   ```sql
   COPY (SELECT * FROM profiles) TO '/tmp/profiles.csv' CSV HEADER;
   COPY (SELECT * FROM ride_requests) TO '/tmp/ride_requests.csv' CSV HEADER;
   -- repeat for other tables
   ```

2. **Import into new project:**
   ```sql
   COPY profiles FROM '/path/to/profiles.csv' CSV HEADER;
   COPY ride_requests FROM '/path/to/ride_requests.csv' CSV HEADER;
   -- repeat for other tables
   ```

   **Note:** Be careful with foreign key constraints and sequences. May need to disable RLS temporarily.

## 📁 Folder Structure

```
migration/
├── export.js                    # Main export script
├── export/                      # Exported schema from old project
│   ├── 01_tables_columns.sql
│   ├── 02_constraints_indexes.sql
│   ├── 03_enums.sql
│   ├── 04_functions.sql
│   ├── 05_triggers.sql
│   ├── 06_extensions.sql
│   ├── 07_rls_table_flags.sql
│   ├── 08_rls_policies.sql
│   ├── 09_storage_buckets.sql
│   └── 10_realtime_publications.sql
├── recreate/                    # Clean SQL to run on new project
│   ├── 01_enums.sql
│   ├── 02_tables.sql
│   ├── 03_extensions.sql
│   ├── 04_functions.sql
│   ├── 05_tables_indexes_constraints.sql
│   ├── 06_triggers.sql
│   ├── 07_rls_flags.sql
│   ├── 08_rls_policies.sql
│   ├── 09_storage_buckets.sql
│   ├── 10_realtime_publications.sql
│   └── 11_reference_data.sql
├── 00_repo-findings.md          # What was found in repo scan
├── used-buckets.md              # Storage buckets used in code
├── 99_dashboard_checklist.md   # Manual steps for dashboard
└── README.md                    # This file
```

## 🐛 Troubleshooting

### "permission denied for schema storage"
- The export script doesn't have access to storage schema
- Storage buckets might not export - manually check in dashboard

### "relation does not exist"
- Run recreate scripts in order
- Check for dependencies (enums before tables, tables before constraints)

### "function already exists"
- Functions might have been auto-created by Supabase
- Add `DROP FUNCTION IF EXISTS` before `CREATE FUNCTION`

### RLS policies failing
- Verify all security definer functions exist first
- Check that referenced tables/columns exist
- Test policies with `SELECT * FROM table` as authenticated user

### Edge functions not working
- Verify secrets are set in new project
- Check function logs in Dashboard → Edge Functions → Logs
- Ensure `verify_jwt = true` in config.toml for protected functions

## 📞 Support

- Check [Supabase Documentation](https://supabase.com/docs)
- Join [Supabase Discord](https://discord.supabase.com)
- Review generated SQL files for any TODOs or warnings

## ✅ Post-Migration Checklist

- [ ] All tables exist
- [ ] All functions deployed
- [ ] All RLS policies active
- [ ] Storage buckets configured
- [ ] Auth settings configured
- [ ] Secrets added to Vault
- [ ] Edge functions deployed
- [ ] Webhooks updated
- [ ] App environment variables updated
- [ ] App tested end-to-end
- [ ] Data migrated (if needed)
- [ ] DNS/domain updated (if applicable)

Good luck with your migration! 🚀
