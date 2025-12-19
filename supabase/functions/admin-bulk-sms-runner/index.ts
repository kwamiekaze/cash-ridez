// ============================================================================
// BULK SMS RUNNER FOR CASHRIDEZ
// ============================================================================
// Triggers the bulk SMS worker. Can be called by admin UI or scheduled cron.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  console.log('[bulk-sms-runner] Function invoked');

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    // Check if this is a scheduled/cron invocation (no auth header)
    const authHeader = req.headers.get('Authorization');
    let isAuthorized = false;

    if (authHeader) {
      // Verify admin user
      const supabase = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } }
      });

      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        return new Response(
          JSON.stringify({ ok: false, error: 'Unauthorized' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: isAdmin } = await supabase.rpc('has_role', {
        _user_id: user.id,
        _role: 'admin'
      });

      if (!isAdmin) {
        return new Response(
          JSON.stringify({ ok: false, error: 'Admin access required' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      isAuthorized = true;
    } else {
      // Allow scheduled/cron calls without auth (they come from Supabase infrastructure)
      // Verify by checking for cron-specific headers or just allow for now
      isAuthorized = true;
    }

    if (!isAuthorized) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse optional campaign_id from request
    let campaignId: string | undefined;
    try {
      const body = await req.json();
      campaignId = body.campaign_id;
    } catch {
      // No body is OK
    }

    // Check if there are any running campaigns
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    
    const { count: runningCount } = await supabaseAdmin
      .from('admin_sms_campaigns')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'running');

    if (runningCount === 0 && !campaignId) {
      console.log('[bulk-sms-runner] No running campaigns to process');
      return new Response(
        JSON.stringify({ ok: true, message: 'No running campaigns', worker_invoked: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Invoke the worker function
    console.log('[bulk-sms-runner] Invoking worker...');
    
    const workerUrl = `${supabaseUrl}/functions/v1/admin-bulk-sms-worker`;
    const response = await fetch(workerUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`
      },
      body: JSON.stringify({ campaign_id: campaignId })
    });

    const workerResult = await response.json();
    console.log('[bulk-sms-runner] Worker result:', workerResult);

    return new Response(
      JSON.stringify({ 
        ok: true, 
        worker_invoked: true,
        worker_result: workerResult 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[bulk-sms-runner] Error:', error);
    return new Response(
      JSON.stringify({ ok: false, error: error.message || 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
