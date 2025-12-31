// ============================================================================
// ADMIN BULK EMAIL RUNNER FOR CASHRIDEZ
// ============================================================================
//
// Orchestrates the bulk email worker, similar to SMS runner.
// Can be called directly or via scheduler.
//
// ENDPOINT:
//   POST /functions/v1/admin-bulk-email-runner
//
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

  console.log('[admin-bulk-email-runner] Starting runner');

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request
    let targetCampaignId: string | null = null;
    try {
      const body = await req.json();
      targetCampaignId = body.campaign_id || null;
    } catch {
      // No body is fine
    }

    // Check if there are any running campaigns
    let campaignsQuery = supabase
      .from('admin_email_campaigns')
      .select('id, status')
      .eq('status', 'running');

    if (targetCampaignId) {
      campaignsQuery = campaignsQuery.eq('id', targetCampaignId);
    }

    const { data: campaigns } = await campaignsQuery;

    if (!campaigns || campaigns.length === 0) {
      console.log('[admin-bulk-email-runner] No running campaigns found');
      return new Response(
        JSON.stringify({ ok: true, message: 'No running campaigns' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[admin-bulk-email-runner] Found ${campaigns.length} running campaign(s)`);

    // Call the worker function
    const workerUrl = `${supabaseUrl}/functions/v1/admin-bulk-email-worker`;
    
    const workerResponse = await fetch(workerUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`
      },
      body: JSON.stringify({ campaign_id: targetCampaignId })
    });

    const workerResult = await workerResponse.json();

    console.log('[admin-bulk-email-runner] Worker completed:', workerResult);

    return new Response(
      JSON.stringify({
        ok: true,
        worker_result: workerResult
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[admin-bulk-email-runner] Error:', error);
    return new Response(
      JSON.stringify({ ok: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
