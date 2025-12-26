import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Outbound Campaign Start Handler
 * Starts a campaign runner that processes recipients
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Verify admin
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check admin role
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .single();

    if (!roleData) {
      return new Response(JSON.stringify({ error: 'Not authorized' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { campaignId, action } = await req.json();

    if (!campaignId) {
      return new Response(JSON.stringify({ error: 'Campaign ID required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get campaign
    const { data: campaign, error: campaignError } = await supabase
      .from('admin_call_campaigns')
      .select('*')
      .eq('id', campaignId)
      .single();

    if (campaignError || !campaign) {
      return new Response(JSON.stringify({ error: 'Campaign not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let newStatus = campaign.status;
    
    switch (action) {
      case 'start':
        if (campaign.status === 'draft' || campaign.status === 'paused') {
          newStatus = 'running';
        }
        break;
      case 'pause':
        if (campaign.status === 'running') {
          newStatus = 'paused';
        }
        break;
      case 'resume':
        if (campaign.status === 'paused') {
          newStatus = 'running';
        }
        break;
      case 'stop':
        newStatus = 'cancelled';
        break;
    }

    // Update campaign status
    await supabase
      .from('admin_call_campaigns')
      .update({
        status: newStatus,
        started_at: action === 'start' && !campaign.started_at ? new Date().toISOString() : campaign.started_at,
        finished_at: action === 'stop' ? new Date().toISOString() : null,
      })
      .eq('id', campaignId);

    // If starting, immediately trigger first tick
    if (newStatus === 'running') {
      const APP_BASE_URL = Deno.env.get('SUPABASE_URL') || 'https://wnajjqsqmrpwyffbpgsj.supabase.co';
      
      // Trigger tick in background
      fetch(`${APP_BASE_URL}/functions/v1/call-center-tick`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      }).catch(err => console.error('Failed to trigger tick:', err));
    }

    return new Response(JSON.stringify({
      success: true,
      status: newStatus,
      message: `Campaign ${action} successful`,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Campaign start error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
