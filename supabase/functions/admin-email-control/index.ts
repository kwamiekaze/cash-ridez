// ============================================================================
// ADMIN EMAIL CAMPAIGN CONTROL FOR CASHRIDEZ
// ============================================================================
//
// Controls email campaign state (pause/resume/cancel), mirroring SMS control.
//
// ENDPOINT:
//   POST /functions/v1/admin-email-control
//
// REQUIRED HEADERS:
//   Authorization: Bearer <user_jwt>
//
// REQUEST BODY:
//   { campaign_id: string, action: 'pause' | 'resume' | 'cancel' }
//
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function errorResponse(code: string, message: string, status: number = 400) {
  console.error(`[admin-email-control] Error: ${code} - ${message}`);
  return new Response(
    JSON.stringify({ ok: false, error: message, code }),
    { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[admin-email-control] Function invoked');

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return errorResponse('UNAUTHORIZED', 'Authentication required.', 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return errorResponse('UNAUTHORIZED', 'Please log in.', 401);
    }

    // Verify admin
    const { data: isAdmin } = await supabase.rpc('has_role', {
      _user_id: user.id,
      _role: 'admin'
    });

    if (!isAdmin) {
      return errorResponse('FORBIDDEN', 'Admin access required.', 403);
    }

    // Parse request
    let campaignId: string;
    let action: string;

    try {
      const body = await req.json();
      campaignId = body.campaign_id;
      action = body.action;
    } catch {
      return errorResponse('INVALID_REQUEST', 'Invalid request format.', 400);
    }

    if (!campaignId || !action) {
      return errorResponse('MISSING_PARAMS', 'campaign_id and action are required.', 400);
    }

    if (!['pause', 'resume', 'cancel'].includes(action)) {
      return errorResponse('INVALID_ACTION', 'Action must be pause, resume, or cancel.', 400);
    }

    // Get current campaign status
    const { data: campaign, error: fetchError } = await supabaseAdmin
      .from('admin_email_campaigns')
      .select('*')
      .eq('id', campaignId)
      .single();

    if (fetchError || !campaign) {
      return errorResponse('NOT_FOUND', 'Campaign not found.', 404);
    }

    // Apply action
    let newStatus: string;
    let updateData: any = {};

    switch (action) {
      case 'pause':
        if (campaign.status !== 'running') {
          return errorResponse('INVALID_STATE', 'Can only pause running campaigns.', 400);
        }
        newStatus = 'paused';
        break;

      case 'resume':
        if (campaign.status !== 'paused') {
          return errorResponse('INVALID_STATE', 'Can only resume paused campaigns.', 400);
        }
        newStatus = 'running';
        break;

      case 'cancel':
        if (!['running', 'paused', 'draft'].includes(campaign.status)) {
          return errorResponse('INVALID_STATE', 'Cannot cancel this campaign.', 400);
        }
        newStatus = 'cancelled';
        updateData.finished_at = new Date().toISOString();
        break;

      default:
        return errorResponse('INVALID_ACTION', 'Unknown action.', 400);
    }

    updateData.status = newStatus;

    const { error: updateError } = await supabaseAdmin
      .from('admin_email_campaigns')
      .update(updateData)
      .eq('id', campaignId);

    if (updateError) {
      console.error('[admin-email-control] Update failed:', updateError);
      return errorResponse('UPDATE_FAILED', 'Failed to update campaign.', 500);
    }

    console.log(`[admin-email-control] Campaign ${campaignId} ${action}d -> ${newStatus}`);

    // If resuming, kick off the worker
    if (action === 'resume') {
      const workerUrl = `${supabaseUrl}/functions/v1/admin-bulk-email-runner`;
      fetch(workerUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`
        },
        body: JSON.stringify({ campaign_id: campaignId })
      }).catch(err => console.error('[admin-email-control] Failed to trigger worker:', err));
    }

    return new Response(
      JSON.stringify({ ok: true, status: newStatus }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[admin-email-control] Unexpected error:', error);
    return errorResponse('INTERNAL_ERROR', 'An unexpected error occurred.', 500);
  }
});
