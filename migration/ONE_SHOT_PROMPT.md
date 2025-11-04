# One-Shot Migration Prompt

Copy the prompt below and paste it into Replit AI, Claude, or your AI assistant to automatically set up the migration toolkit:

---

## FOR REPLIT AI / CLAUDE / GPT

```
I need to migrate my Supabase project to a new instance. Set up a complete migration toolkit with these requirements:

ENVIRONMENT:
- I have these env vars: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_DB_URL
- Use Node.js + pg package (no external CLIs)
- Read-only queries against Postgres catalogs

TASK 1 - Install dependencies:
```bash
npm install pg dotenv
```

TASK 2 - Create /migration/export.js that connects to SUPABASE_DB_URL and exports:
1. Tables & columns → 01_tables_columns.sql
2. Constraints & indexes → 02_constraints_indexes.sql  
3. Enums → 03_enums.sql
4. Functions → 04_functions.sql
5. Triggers → 05_triggers.sql
6. Extensions → 06_extensions.sql
7. RLS table flags → 07_rls_table_flags.sql
8. RLS policies → 08_rls_policies.sql
9. Storage buckets → 09_storage_buckets.sql
10. Realtime publications → 10_realtime_publications.sql

Use these queries:

TABLES:
```sql
SELECT table_schema, table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema NOT IN ('pg_catalog','information_schema')
ORDER BY table_schema, table_name, ordinal_position;
```

CONSTRAINTS:
```sql
SELECT n.nspname AS schema, c.relname AS table, con.conname AS constraint_name, 
       con.contype, pg_get_constraintdef(con.oid, true) AS definition
FROM pg_constraint con
JOIN pg_class c ON c.oid = con.conrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname NOT IN ('pg_catalog','information_schema');
```

INDEXES:
```sql
SELECT n.nspname AS schema, c.relname AS table, i.relname AS index_name,
       pg_get_indexdef(ix.indexrelid) AS indexdef
FROM pg_index ix
JOIN pg_class c ON c.oid = ix.indrelid
JOIN pg_class i ON i.oid = ix.indexrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND NOT ix.indisprimary;
```

ENUMS:
```sql
SELECT n.nspname AS schema, t.typname AS enum_name, e.enumlabel AS label
FROM pg_type t
JOIN pg_enum e ON t.oid = e.enumtypid
JOIN pg_namespace n ON n.oid = t.typnamespace
ORDER BY schema, enum_name, e.enumsortorder;
```

FUNCTIONS:
```sql
SELECT n.nspname AS schema, p.proname AS name, pg_get_functiondef(p.oid) AS definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname NOT IN ('pg_catalog','information_schema');
```

TRIGGERS:
```sql
SELECT event_object_schema AS schema, event_object_table AS table_name,
       trigger_name, action_timing, event_manipulation, action_statement
FROM information_schema.triggers
ORDER BY schema, table_name, trigger_name;
```

EXTENSIONS:
```sql
SELECT extname, extversion FROM pg_extension;
```

RLS FLAGS:
```sql
SELECT n.nspname AS schema, c.relname AS table_name, c.relrowsecurity AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind='r' AND n.nspname NOT IN ('pg_catalog','information_schema');
```

RLS POLICIES:
```sql
SELECT polname, schemaname, tablename, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname NOT IN ('pg_catalog','information_schema')
ORDER BY schemaname, tablename, polname;
```

STORAGE:
```sql
SELECT id, name, public, file_size_limit, allowed_mime_types FROM storage.buckets;
```

PUBLICATIONS:
```sql
SELECT pubname, puballtables, pubinsert, pubupdate, pubdelete FROM pg_publication;
SELECT pubname, n.nspname AS schema, c.relname AS table_name
FROM pg_publication_rel pr
JOIN pg_class c ON c.oid = pr.prrelid
JOIN pg_namespace n ON n.oid = c.relnamespace;
```

TASK 3 - Generate idempotent SQL in /migration/recreate/:
- 01_enums.sql (CREATE TYPE IF NOT EXISTS)
- 02_extensions.sql (CREATE EXTENSION IF NOT EXISTS)
- 03_tables.sql (CREATE TABLE IF NOT EXISTS with all columns)
- 04_constraints_indexes.sql (ALTER TABLE ADD CONSTRAINT, CREATE INDEX)
- 05_functions.sql (CREATE OR REPLACE FUNCTION)
- 06_triggers.sql (DROP TRIGGER IF EXISTS; CREATE TRIGGER)
- 07_rls_flags.sql (ALTER TABLE ENABLE ROW LEVEL SECURITY)
- 08_rls_policies.sql (DROP POLICY IF EXISTS; CREATE POLICY)
- 09_storage_buckets.sql (INSERT INTO storage.buckets ON CONFLICT DO NOTHING)
- 10_realtime.sql (CREATE PUBLICATION, ALTER PUBLICATION ADD TABLE)

TASK 4 - Create /migration/README.md with:
1. Set SUPABASE_DB_URL to OLD project
2. Run: node migration/export.js
3. Review /migration/export/*.sql files
4. Set SUPABASE_DB_URL to NEW project
5. Execute each /migration/recreate/*.sql in order via Supabase SQL Editor
6. Update app env vars (SUPABASE_URL, ANON_KEY, SERVICE_ROLE_KEY)
7. Redeploy edge functions: supabase functions deploy
8. Complete manual checklist in 99_dashboard_checklist.md

TASK 5 - Scan this repo for:
- /supabase/migrations/* files
- /supabase/functions/* edge functions
- storage.from("bucket") calls in code
- Create /migration/00_repo-findings.md with summary
- Create /migration/used-buckets.md with all bucket names found

TASK 6 - Create /migration/99_dashboard_checklist.md with manual steps:
- Copy API keys & URLs from old → new project
- Configure Auth settings (email templates, SMTP, redirect URLs, providers)
- Verify Storage bucket settings (public/private, size limits, MIME types)
- Deploy edge functions
- Set up webhooks (Stripe, etc.)
- Test RLS policies

TASK 7 - Add to package.json:
```json
{
  "scripts": {
    "mig:export": "node migration/export.js",
    "mig:info": "cat migration/README.md"
  }
}
```

Make it resilient:
- Create directories if they don't exist (fs.mkdirSync recursive)
- Handle missing metadata gracefully (log TODOs)
- Keep SQL readable with comments
- Ensure idempotency (IF NOT EXISTS, DROP ... IF EXISTS)

Execute this now and show me what files were created.
```

---

## USAGE

1. **In Replit**: Paste the above prompt into Replit AI
2. **Locally**: Paste into Claude/GPT and run the generated commands
3. **After generation**: Run `node migration/export.js` to export your old project
4. Follow `/migration/README.md` to complete the migration

---

## QUICK START

```bash
# 1. Install dependencies
npm install pg dotenv

# 2. Set OLD project credentials
export SUPABASE_DB_URL="postgresql://postgres:[OLD_PASSWORD]@db.[OLD_REF].supabase.co:5432/postgres"

# 3. Export schema
node migration/export.js

# 4. Review exported files
ls -la migration/export/

# 5. Switch to NEW project
export SUPABASE_DB_URL="postgresql://postgres:[NEW_PASSWORD]@db.[NEW_REF].supabase.co:5432/postgres"

# 6. Run recreate scripts in Supabase SQL Editor (new project)
# Execute each file in /migration/recreate/ in order

# 7. Update app env vars in Replit Secrets
VITE_SUPABASE_URL=[new project URL]
VITE_SUPABASE_ANON_KEY=[new anon key]
SUPABASE_SERVICE_ROLE_KEY=[new service role key]

# 8. Deploy edge functions
supabase functions deploy

# 9. Complete manual checklist
cat migration/99_dashboard_checklist.md
```
