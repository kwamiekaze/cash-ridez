import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type ExportType = 
  | 'all_names' 
  | 'all_names_emails' 
  | 'all_names_phones' 
  | 'verified_names' 
  | 'unverified_names' 
  | 'unverified_names_emails';

function normalizePhoneToE164(phone: string | null): string | null {
  if (!phone) return null;
  
  // Remove all non-digit characters
  let digits = phone.replace(/\D/g, '');
  
  // If starts with 1 and has 11 digits, it's already US format
  if (digits.length === 11 && digits.startsWith('1')) {
    return '+' + digits;
  }
  
  // If 10 digits, assume US and add +1
  if (digits.length === 10) {
    return '+1' + digits;
  }
  
  // If already has + prefix, return cleaned version
  if (phone.startsWith('+')) {
    return '+' + digits;
  }
  
  // Return as-is with + prefix if reasonable length
  if (digits.length >= 10 && digits.length <= 15) {
    return '+' + digits;
  }
  
  return null;
}

function getFilename(exportType: ExportType): string {
  const date = new Date().toISOString().split('T')[0];
  const typeMap: Record<ExportType, string> = {
    'all_names': `cashridez_all_users_full_names_${date}.txt`,
    'all_names_emails': `cashridez_all_users_names_emails_${date}.txt`,
    'all_names_phones': `cashridez_all_users_names_phones_${date}.txt`,
    'verified_names': `cashridez_verified_users_full_names_${date}.txt`,
    'unverified_names': `cashridez_unverified_users_full_names_${date}.txt`,
    'unverified_names_emails': `cashridez_unverified_users_names_emails_${date}.txt`,
  };
  return typeMap[exportType];
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client with user's auth
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: { headers: { Authorization: authHeader } },
      }
    );

    // Get authenticated user
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      console.error('Auth error:', userError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check admin role using service role client for security
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: isAdmin, error: roleError } = await supabaseAdmin.rpc('has_role', {
      _user_id: user.id,
      _role: 'admin'
    });

    if (roleError || !isAdmin) {
      console.error('Admin check failed:', roleError);
      return new Response(
        JSON.stringify({ error: 'Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const { export_type } = await req.json() as { export_type: ExportType };
    
    if (!export_type) {
      return new Response(
        JSON.stringify({ error: 'export_type is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Admin ${user.id} requesting export: ${export_type}`);

    // Build query based on export type
    let query = supabaseAdmin.from('profiles').select('full_name, email, phone_number, verification_status');

    // Apply filters based on export type
    if (export_type.startsWith('verified_')) {
      query = query.eq('verification_status', 'approved');
    } else if (export_type.startsWith('unverified_')) {
      query = query.neq('verification_status', 'approved');
    }

    // Order by name for consistent output
    query = query.order('full_name', { ascending: true, nullsFirst: false });

    const { data: users, error: queryError } = await query;

    if (queryError) {
      console.error('Query error:', queryError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch users' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate content based on export type
    let lines: string[] = [];
    let recordCount = 0;

    if (users && users.length > 0) {
      for (const user of users) {
        const fullName = user.full_name?.trim() || '';
        if (!fullName) continue; // Skip users without names

        if (export_type === 'all_names' || export_type === 'verified_names' || export_type === 'unverified_names') {
          // Format: FirstName LastName
          lines.push(fullName);
          recordCount++;
        } else if (export_type === 'all_names_emails' || export_type === 'unverified_names_emails') {
          // Format: FirstName LastName email@example.com
          const email = user.email?.trim() || '';
          if (email) {
            lines.push(`${fullName} ${email}`);
            recordCount++;
          }
        } else if (export_type === 'all_names_phones') {
          // Format: +1XXXXXXXXXX FirstName LastName
          const normalizedPhone = normalizePhoneToE164(user.phone_number);
          if (normalizedPhone) {
            lines.push(`${normalizedPhone} ${fullName}`);
            recordCount++;
          }
        }
      }
    }

    // If no records, add placeholder
    const content = lines.length > 0 ? lines.join('\n') : 'No records found.';
    const filename = getFilename(export_type);

    // Log export for audit
    await supabaseAdmin.from('admin_actions').insert({
      admin_id: user.id,
      target_user_id: user.id, // Self-reference for export actions
      action_type: 'user_export',
      metadata: {
        export_type,
        record_count: recordCount,
        filename,
      },
    });

    console.log(`Export complete: ${export_type}, ${recordCount} records`);

    return new Response(
      JSON.stringify({
        content,
        filename,
        record_count: recordCount,
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error: unknown) {
    console.error('Export error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
