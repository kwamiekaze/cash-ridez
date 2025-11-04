#!/usr/bin/env node
/**
 * CashRidez Supabase Migration Export Tool
 * 
 * Connects to the old Supabase database via SUPABASE_DB_URL and exports:
 * - Schema definitions (tables, columns, constraints, indexes)
 * - Database objects (enums, functions, triggers, extensions)
 * - RLS policies
 * - Storage buckets
 * - Realtime publications
 * 
 * Outputs to /migration/export/ and /migration/recreate/
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// Ensure required env vars
const DB_URL = process.env.SUPABASE_DB_URL;
if (!DB_URL) {
  console.error('❌ SUPABASE_DB_URL not set. Add it to your environment variables.');
  console.error('Format: postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres');
  process.exit(1);
}

// Create directories
const EXPORT_DIR = path.join(__dirname, 'export');
const RECREATE_DIR = path.join(__dirname, 'recreate');
[EXPORT_DIR, RECREATE_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

const client = new Client({ connectionString: DB_URL });

// Helper to write files
function writeFile(dir, filename, content) {
  const filepath = path.join(dir, filename);
  fs.writeFileSync(filepath, content, 'utf8');
  console.log(`✅ Written: ${filename}`);
}

// Helper to create SQL header
function sqlHeader(title) {
  return `-- =============================================
-- ${title}
-- Generated: ${new Date().toISOString()}
-- =============================================

`;
}

async function exportEnums() {
  console.log('\n📦 Exporting Enums...');
  const result = await client.query(`
    SELECT n.nspname AS schema, t.typname AS enum_name, e.enumlabel AS label
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
    ORDER BY schema, enum_name, e.enumsortorder;
  `);

  let exportSql = sqlHeader('ENUMS EXPORT');
  let recreateSql = sqlHeader('ENUMS RECREATION');

  const enumsBySchema = {};
  result.rows.forEach(row => {
    const key = `${row.schema}.${row.enum_name}`;
    if (!enumsBySchema[key]) {
      enumsBySchema[key] = [];
    }
    enumsBySchema[key].push(row.label);
  });

  Object.entries(enumsBySchema).forEach(([key, labels]) => {
    const [schema, enumName] = key.split('.');
    exportSql += `-- ${schema}.${enumName}: ${labels.join(', ')}\n`;
    
    recreateSql += `DROP TYPE IF EXISTS ${schema}.${enumName} CASCADE;\n`;
    recreateSql += `CREATE TYPE ${schema}.${enumName} AS ENUM (\n`;
    recreateSql += labels.map(l => `  '${l}'`).join(',\n');
    recreateSql += '\n);\n\n';
  });

  writeFile(EXPORT_DIR, '03_enums.sql', exportSql);
  writeFile(RECREATE_DIR, '01_enums.sql', recreateSql);
}

async function exportExtensions() {
  console.log('\n📦 Exporting Extensions...');
  const result = await client.query(`
    SELECT extname, extversion FROM pg_extension
    WHERE extname NOT IN ('plpgsql');
  `);

  let exportSql = sqlHeader('EXTENSIONS EXPORT');
  let recreateSql = sqlHeader('EXTENSIONS RECREATION');

  result.rows.forEach(row => {
    exportSql += `-- ${row.extname} (${row.extversion})\n`;
    recreateSql += `CREATE EXTENSION IF NOT EXISTS "${row.extname}" WITH SCHEMA public;\n`;
  });

  writeFile(EXPORT_DIR, '06_extensions.sql', exportSql);
  writeFile(RECREATE_DIR, '03_extensions.sql', recreateSql);
}

async function exportTablesAndColumns() {
  console.log('\n📦 Exporting Tables & Columns...');
  
  const tables = await client.query(`
    SELECT table_schema, table_name
    FROM information_schema.tables
    WHERE table_type='BASE TABLE' 
      AND table_schema NOT IN ('pg_catalog','information_schema', 'auth', 'storage', 'extensions', 'graphql_public', 'realtime', 'supabase_functions', 'vault')
    ORDER BY table_schema, table_name;
  `);

  const columns = await client.query(`
    SELECT table_schema, table_name, column_name, data_type, is_nullable, column_default,
           udt_name, character_maximum_length
    FROM information_schema.columns
    WHERE table_schema NOT IN ('pg_catalog','information_schema', 'auth', 'storage', 'extensions', 'graphql_public', 'realtime', 'supabase_functions', 'vault')
    ORDER BY table_schema, table_name, ordinal_position;
  `);

  let exportSql = sqlHeader('TABLES & COLUMNS EXPORT');
  let recreateSql = sqlHeader('TABLES RECREATION');

  const tableColumns = {};
  columns.rows.forEach(col => {
    const key = `${col.table_schema}.${col.table_name}`;
    if (!tableColumns[key]) {
      tableColumns[key] = [];
    }
    tableColumns[key].push(col);
  });

  tables.rows.forEach(table => {
    const key = `${table.table_schema}.${table.table_name}`;
    const cols = tableColumns[key] || [];
    
    exportSql += `\n-- ${key}\n`;
    cols.forEach(col => {
      exportSql += `--   ${col.column_name}: ${col.data_type} ${col.is_nullable === 'NO' ? 'NOT NULL' : 'NULL'}\n`;
    });

    recreateSql += `\n-- Table: ${key}\n`;
    recreateSql += `CREATE TABLE IF NOT EXISTS ${table.table_schema}.${table.table_name} (\n`;
    
    const colDefs = cols.map(col => {
      let def = `  ${col.column_name} ${col.udt_name}`;
      if (col.character_maximum_length) {
        def += `(${col.character_maximum_length})`;
      }
      if (col.is_nullable === 'NO') {
        def += ' NOT NULL';
      }
      if (col.column_default) {
        def += ` DEFAULT ${col.column_default}`;
      }
      return def;
    });
    
    recreateSql += colDefs.join(',\n');
    recreateSql += '\n);\n';
  });

  writeFile(EXPORT_DIR, '01_tables_columns.sql', exportSql);
  writeFile(RECREATE_DIR, '02_tables.sql', recreateSql);
}

async function exportConstraintsAndIndexes() {
  console.log('\n📦 Exporting Constraints & Indexes...');
  
  const constraints = await client.query(`
    SELECT
      n.nspname AS schema, c.relname AS table_name,
      con.conname AS constraint_name, con.contype,
      pg_get_constraintdef(con.oid, true) AS definition
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname NOT IN ('pg_catalog','information_schema', 'auth', 'storage', 'extensions', 'graphql_public', 'realtime', 'supabase_functions', 'vault')
    ORDER BY n.nspname, c.relname, con.conname;
  `);

  const indexes = await client.query(`
    SELECT
      n.nspname AS schema, c.relname AS table_name, i.relname AS index_name,
      pg_get_indexdef(ix.indexrelid) AS indexdef
    FROM pg_index ix
    JOIN pg_class c ON c.oid = ix.indrelid
    JOIN pg_class i ON i.oid = ix.indexrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname NOT IN ('pg_catalog','information_schema', 'auth', 'storage', 'extensions', 'graphql_public', 'realtime', 'supabase_functions', 'vault')
      AND NOT ix.indisprimary
    ORDER BY n.nspname, c.relname, i.relname;
  `);

  let exportSql = sqlHeader('CONSTRAINTS & INDEXES EXPORT');
  let recreateSql = sqlHeader('CONSTRAINTS & INDEXES RECREATION');

  exportSql += '\n-- CONSTRAINTS:\n';
  constraints.rows.forEach(row => {
    exportSql += `-- ${row.schema}.${row.table_name}.${row.constraint_name} (${row.contype})\n`;
    exportSql += `--   ${row.definition}\n\n`;
    
    recreateSql += `\n-- ${row.constraint_name} on ${row.schema}.${row.table_name}\n`;
    recreateSql += `ALTER TABLE ${row.schema}.${row.table_name}\n`;
    recreateSql += `  ADD CONSTRAINT ${row.constraint_name} ${row.definition};\n`;
  });

  exportSql += '\n-- INDEXES:\n';
  indexes.rows.forEach(row => {
    exportSql += `-- ${row.schema}.${row.table_name}.${row.index_name}\n`;
    exportSql += `--   ${row.indexdef}\n\n`;
    
    recreateSql += `\n-- ${row.index_name}\n`;
    recreateSql += `${row.indexdef};\n`;
  });

  writeFile(EXPORT_DIR, '02_constraints_indexes.sql', exportSql);
  writeFile(RECREATE_DIR, '05_tables_indexes_constraints.sql', recreateSql);
}

async function exportFunctions() {
  console.log('\n📦 Exporting Functions...');
  
  const result = await client.query(`
    SELECT n.nspname AS schema, p.proname AS name,
           pg_get_functiondef(p.oid) AS definition
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname NOT IN ('pg_catalog','information_schema', 'auth', 'storage', 'extensions', 'graphql_public', 'realtime', 'supabase_functions', 'vault')
    ORDER BY n.nspname, p.proname;
  `);

  let exportSql = sqlHeader('FUNCTIONS EXPORT');
  let recreateSql = sqlHeader('FUNCTIONS RECREATION');

  result.rows.forEach(row => {
    exportSql += `\n-- ${row.schema}.${row.name}\n`;
    exportSql += `${row.definition}\n\n---\n\n`;
    
    recreateSql += `\n-- Function: ${row.schema}.${row.name}\n`;
    recreateSql += `${row.definition};\n\n`;
  });

  writeFile(EXPORT_DIR, '04_functions.sql', exportSql);
  writeFile(RECREATE_DIR, '04_functions.sql', recreateSql);
}

async function exportTriggers() {
  console.log('\n📦 Exporting Triggers...');
  
  const result = await client.query(`
    SELECT event_object_schema AS schema, event_object_table AS table_name,
           trigger_name, action_timing, event_manipulation, action_statement
    FROM information_schema.triggers
    WHERE event_object_schema NOT IN ('pg_catalog','information_schema', 'auth', 'storage', 'extensions', 'graphql_public', 'realtime', 'supabase_functions', 'vault')
    ORDER BY schema, table_name, trigger_name;
  `);

  let exportSql = sqlHeader('TRIGGERS EXPORT');
  let recreateSql = sqlHeader('TRIGGERS RECREATION');

  result.rows.forEach(row => {
    exportSql += `\n-- ${row.schema}.${row.table_name}.${row.trigger_name}\n`;
    exportSql += `--   ${row.action_timing} ${row.event_manipulation}\n`;
    exportSql += `--   ${row.action_statement}\n\n`;
    
    recreateSql += `\n-- Trigger: ${row.trigger_name} on ${row.schema}.${row.table_name}\n`;
    recreateSql += `DROP TRIGGER IF EXISTS ${row.trigger_name} ON ${row.schema}.${row.table_name};\n`;
    recreateSql += `CREATE TRIGGER ${row.trigger_name}\n`;
    recreateSql += `  ${row.action_timing} ${row.event_manipulation}\n`;
    recreateSql += `  ON ${row.schema}.${row.table_name}\n`;
    recreateSql += `  FOR EACH ROW\n`;
    recreateSql += `  ${row.action_statement};\n\n`;
  });

  writeFile(EXPORT_DIR, '05_triggers.sql', exportSql);
  writeFile(RECREATE_DIR, '06_triggers.sql', recreateSql);
}

async function exportRLS() {
  console.log('\n📦 Exporting RLS Settings...');
  
  const tables = await client.query(`
    SELECT n.nspname AS schema, c.relname AS table_name, c.relrowsecurity AS rls_enabled
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind='r' 
      AND n.nspname NOT IN ('pg_catalog','information_schema', 'auth', 'extensions', 'graphql_public', 'realtime', 'supabase_functions', 'vault')
    ORDER BY n.nspname, c.relname;
  `);

  const policies = await client.query(`
    SELECT polname, schemaname, tablename, cmd, roles, qual, with_check
    FROM pg_policies
    WHERE schemaname NOT IN ('pg_catalog','information_schema', 'auth', 'extensions', 'graphql_public', 'realtime', 'supabase_functions', 'vault')
    ORDER BY schemaname, tablename, polname;
  `);

  let rlsFlagsSql = sqlHeader('RLS TABLE FLAGS');
  let rlsPoliciesSql = sqlHeader('RLS POLICIES EXPORT');
  let recreateFlagsSql = sqlHeader('RLS TABLE FLAGS RECREATION');
  let recreatePoliciesSql = sqlHeader('RLS POLICIES RECREATION');

  tables.rows.forEach(row => {
    rlsFlagsSql += `-- ${row.schema}.${row.table_name}: RLS ${row.rls_enabled ? 'ENABLED' : 'DISABLED'}\n`;
    
    if (row.rls_enabled) {
      recreateFlagsSql += `ALTER TABLE ${row.schema}.${row.table_name} ENABLE ROW LEVEL SECURITY;\n`;
    }
  });

  policies.rows.forEach(row => {
    const cmd = row.cmd === '*' ? 'ALL' : row.cmd;
    const roles = Array.isArray(row.roles) ? row.roles.join(', ') : row.roles;
    
    rlsPoliciesSql += `\n-- Policy: ${row.polname} on ${row.schemaname}.${row.tablename}\n`;
    rlsPoliciesSql += `--   Command: ${cmd}\n`;
    rlsPoliciesSql += `--   Roles: ${roles}\n`;
    if (row.qual) rlsPoliciesSql += `--   USING: ${row.qual}\n`;
    if (row.with_check) rlsPoliciesSql += `--   WITH CHECK: ${row.with_check}\n`;
    
    recreatePoliciesSql += `\n-- Policy: ${row.polname}\n`;
    recreatePoliciesSql += `DROP POLICY IF EXISTS "${row.polname}" ON ${row.schemaname}.${row.tablename};\n`;
    recreatePoliciesSql += `CREATE POLICY "${row.polname}"\n`;
    recreatePoliciesSql += `  ON ${row.schemaname}.${row.tablename}\n`;
    recreatePoliciesSql += `  FOR ${cmd}\n`;
    if (roles && roles !== 'public') {
      recreatePoliciesSql += `  TO ${roles}\n`;
    }
    if (row.qual) {
      recreatePoliciesSql += `  USING (${row.qual})`;
    }
    if (row.with_check) {
      recreatePoliciesSql += `\n  WITH CHECK (${row.with_check})`;
    }
    recreatePoliciesSql += ';\n';
  });

  writeFile(EXPORT_DIR, '07_rls_table_flags.sql', rlsFlagsSql);
  writeFile(EXPORT_DIR, '08_rls_policies.sql', rlsPoliciesSql);
  writeFile(RECREATE_DIR, '07_rls_flags.sql', recreateFlagsSql);
  writeFile(RECREATE_DIR, '08_rls_policies.sql', recreatePoliciesSql);
}

async function exportStorage() {
  console.log('\n📦 Exporting Storage Buckets...');
  
  try {
    const result = await client.query(`
      SELECT id, name, public, file_size_limit, allowed_mime_types
      FROM storage.buckets
      ORDER BY id;
    `);

    let exportSql = sqlHeader('STORAGE BUCKETS EXPORT');
    let recreateSql = sqlHeader('STORAGE BUCKETS RECREATION');

    result.rows.forEach(row => {
      exportSql += `\n-- Bucket: ${row.name}\n`;
      exportSql += `--   ID: ${row.id}\n`;
      exportSql += `--   Public: ${row.public}\n`;
      exportSql += `--   Size Limit: ${row.file_size_limit}\n`;
      exportSql += `--   MIME Types: ${row.allowed_mime_types}\n`;
      
      recreateSql += `\n-- Bucket: ${row.name}\n`;
      recreateSql += `INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)\n`;
      recreateSql += `VALUES (\n`;
      recreateSql += `  '${row.id}',\n`;
      recreateSql += `  '${row.name}',\n`;
      recreateSql += `  ${row.public},\n`;
      recreateSql += `  ${row.file_size_limit || 'NULL'},\n`;
      recreateSql += `  ${row.allowed_mime_types ? `'${JSON.stringify(row.allowed_mime_types)}'::text[]` : 'NULL'}\n`;
      recreateSql += `)\n`;
      recreateSql += `ON CONFLICT (id) DO NOTHING;\n`;
    });

    writeFile(EXPORT_DIR, '09_storage_buckets.sql', exportSql);
    writeFile(RECREATE_DIR, '09_storage_buckets.sql', recreateSql);
  } catch (err) {
    console.warn('⚠️  Could not export storage buckets:', err.message);
    writeFile(EXPORT_DIR, '09_storage_buckets.sql', sqlHeader('STORAGE BUCKETS EXPORT') + '-- No storage schema found or access denied\n');
    writeFile(RECREATE_DIR, '09_storage_buckets.sql', sqlHeader('STORAGE BUCKETS RECREATION') + '-- No storage buckets to recreate\n');
  }
}

async function exportRealtime() {
  console.log('\n📦 Exporting Realtime Publications...');
  
  const publications = await client.query(`
    SELECT pubname, puballtables, pubinsert, pubupdate, pubdelete, pubtruncate
    FROM pg_publication;
  `);

  const pubTables = await client.query(`
    SELECT p.pubname, n.nspname AS schema, c.relname AS table_name
    FROM pg_publication_rel pr
    JOIN pg_publication p ON p.oid = pr.prpubid
    JOIN pg_class c ON c.oid = pr.prrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    ORDER BY p.pubname, n.nspname, c.relname;
  `);

  let exportSql = sqlHeader('REALTIME PUBLICATIONS EXPORT');
  let recreateSql = sqlHeader('REALTIME PUBLICATIONS RECREATION');

  publications.rows.forEach(pub => {
    exportSql += `\n-- Publication: ${pub.pubname}\n`;
    exportSql += `--   All Tables: ${pub.puballtables}\n`;
    exportSql += `--   Operations: INSERT=${pub.pubinsert}, UPDATE=${pub.pubupdate}, DELETE=${pub.pubdelete}, TRUNCATE=${pub.pubtruncate}\n`;
    
    const tables = pubTables.rows.filter(t => t.pubname === pub.pubname);
    if (tables.length > 0) {
      exportSql += `--   Tables:\n`;
      tables.forEach(t => {
        exportSql += `--     - ${t.schema}.${t.table_name}\n`;
      });
    }

    if (pub.pubname === 'supabase_realtime') {
      recreateSql += `\n-- Publication: ${pub.pubname}\n`;
      tables.forEach(t => {
        recreateSql += `ALTER PUBLICATION supabase_realtime ADD TABLE ${t.schema}.${t.table_name};\n`;
      });
    }
  });

  writeFile(EXPORT_DIR, '10_realtime_publications.sql', exportSql);
  writeFile(RECREATE_DIR, '10_realtime_publications.sql', recreateSql);
}

async function exportReferenceData() {
  console.log('\n📦 Checking for Reference Data...');
  
  let recreateSql = sqlHeader('REFERENCE DATA (OPTIONAL)');
  recreateSql += '-- TODO: Add INSERT statements for small lookup/reference tables\n';
  recreateSql += '-- Examples: countries, statuses, roles, etc.\n';
  recreateSql += '-- Keep this minimal - avoid large tables\n\n';

  writeFile(RECREATE_DIR, '11_reference_data.sql', recreateSql);
}

async function main() {
  console.log('🚀 CashRidez Supabase Migration Export Tool\n');
  console.log(`📂 Export directory: ${EXPORT_DIR}`);
  console.log(`📂 Recreate directory: ${RECREATE_DIR}\n`);

  try {
    await client.connect();
    console.log('✅ Connected to database');

    await exportEnums();
    await exportExtensions();
    await exportTablesAndColumns();
    await exportConstraintsAndIndexes();
    await exportFunctions();
    await exportTriggers();
    await exportRLS();
    await exportStorage();
    await exportRealtime();
    await exportReferenceData();

    console.log('\n✅ Export complete!');
    console.log(`\n📁 Files written to:`);
    console.log(`   - ${EXPORT_DIR}/`);
    console.log(`   - ${RECREATE_DIR}/`);
    console.log('\n📖 Next steps: Review files and run recreate/*.sql on new project');
    
  } catch (error) {
    console.error('\n❌ Export failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
