// ============================================================================
// AUTO TEXT CONTROL FOR CASHRIDEZ
// ============================================================================
// Admin controls for bulk SMS campaigns: pause, resume, cancel.
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

  console.log('[autotext-control] Function invoked');

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    // Verify admin user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Authorization required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

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

    // Parse request
    const body = await req.json();
    const { campaign_id, action } = body;

    if (!campaign_id || !action) {
      return new Response(
        JSON.stringify({ ok: false, error: 'campaign_id and action are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!['pause', 'resume', 'cancel'].includes(action)) {
      return new Response(
        JSON.stringify({ ok: false, error: 'action must be pause, resume, or cancel' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Get current campaign
    const { data: campaign, error: fetchError } = await supabaseAdmin
      .from('admin_sms_campaigns')
      .select('*')
      .eq('id', campaign_id)
      .single();

    if (fetchError || !campaign) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Campaign not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let newStatus: string;
    let additionalUpdates: any = {};

    switch (action) {
      case 'pause':
        if (!['running', 'queued'].includes(campaign.status)) {
          return new Response(
            JSON.stringify({ ok: false, error: 'Campaign is not running' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        newStatus = 'paused';
        break;

      case 'resume':
        if (campaign.status !== 'paused') {
          return new Response(
            JSON.stringify({ ok: false, error: 'Campaign is not paused' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        newStatus = 'running';
        // Set next_send_at to now so it picks up on next cron tick
        additionalUpdates.next_send_at = new Date().toISOString();
        break;

      case 'cancel':
        if (['completed', 'cancelled'].includes(campaign.status)) {
          return new Response(
            JSON.stringify({ ok: false, error: 'Campaign is already finished' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        newStatus = 'cancelled';
        additionalUpdates.finished_at = new Date().toISOString();

        // Mark all remaining queued recipients as skipped
        await supabaseAdmin
          .from('admin_sms_campaign_recipients')
          .update({ status: 'skipped', error: 'Campaign cancelled' })
          .eq('campaign_id', campaign_id)
          .eq('status', 'queued');

        // Update counts
        const { data: counts } = await supabaseAdmin
          .from('admin_sms_campaign_recipients')
          .select('status')
          .eq('campaign_id', campaign_id);

        if (counts) {
          const statusCounts = counts.reduce((acc: any, r: any) => {
            acc[r.status] = (acc[r.status] || 0) + 1;
            return acc;
          }, {});

          additionalUpdates.queued_count = statusCounts.queued || 0;
          additionalUpdates.sent_count = statusCounts.sent || 0;
          additionalUpdates.failed_count = statusCounts.failed || 0;
          additionalUpdates.skipped_count = statusCounts.skipped || 0;
        }
        break;

      default:
        return new Response(
          JSON.stringify({ ok: false, error: 'Invalid action' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    // Update campaign status
    const { error: updateError } = await supabaseAdmin
      .from('admin_sms_campaigns')
      .update({ status: newStatus, ...additionalUpdates })
      .eq('id', campaign_id);

    if (updateError) {
      console.error('[autotext-control] Update error:', updateError);
      return new Response(
        JSON.stringify({ ok: false, error: 'Failed to update campaign' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[autotext-control] Campaign ${campaign_id} action: ${action} -> ${newStatus}`);

    return new Response(
      JSON.stringify({ ok: true, campaign_id, action, new_status: newStatus }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[autotext-control] Error:', error);
    return new Response(
      JSON.stringify({ ok: false, error: error.message || 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
