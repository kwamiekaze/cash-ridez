// ============================================================================
// TWILIO STATUS WEBHOOK FOR CASHRIDEZ
// ============================================================================
//
// This Supabase Edge Function handles Twilio call status updates.
// Twilio posts status changes here throughout the call lifecycle.
//
// WEBHOOK URL (configured automatically by call-start):
//   https://wnajjqsqmrpwyffbpgsj.supabase.co/functions/v1/call-status
//
// PARAMETERS:
//   - callId: The call record ID from our database
//   - CallStatus: Current Twilio call status (from POST body)
//   - CallDuration: Duration in seconds (when completed)
//
// STATUS MAPPING:
//   - queued/ringing → ringing
//   - in-progress → in_progress
//   - completed → completed
//   - busy/failed/no-answer/canceled → respective statuses
//
// AUTHENTICATION: No JWT required (verify_jwt = false) - Twilio webhook
//
// IMPORTANT:
//   - Updates call records in real-time
//   - Records start time, end time, and duration
//   - Always returns HTTP 200 to acknowledge receipt
//
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Map Twilio statuses to our system statuses
const statusMap: Record<string, string> = {
  'queued': 'ringing',
  'ringing': 'ringing',
  'in-progress': 'in_progress',
  'completed': 'completed',
  'busy': 'busy',
  'failed': 'failed',
  'no-answer': 'no_answer',
  'canceled': 'canceled'
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const callId = url.searchParams.get('callId');
    const leg = url.searchParams.get('leg');

    if (!callId) {
      throw new Error('Missing callId');
    }

    // Parse form data from Twilio
    const formData = await req.formData();
    const callStatus = formData.get('CallStatus')?.toString();
    const callSid = formData.get('CallSid')?.toString();
    const callDuration = formData.get('CallDuration')?.toString();
    const timestamp = formData.get('Timestamp')?.toString();

    if (!callStatus) {
      throw new Error('Missing CallStatus');
    }

    console.log(`[call-status] Call status update received - callId: ${callId}, status: ${callStatus}, leg: ${leg || 'main'}`);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Map Twilio status to our system status
    const mappedStatus = statusMap[callStatus] || 'failed';

    // Prepare update object
    const updateData: any = {
      status: mappedStatus,
      updated_at: new Date().toISOString()
    };

    // Update timestamps based on status
    if (mappedStatus === 'in_progress' && !updateData.started_at) {
      updateData.started_at = timestamp || new Date().toISOString();
    }

    if (['completed', 'failed', 'no_answer', 'canceled'].includes(mappedStatus)) {
      updateData.ended_at = timestamp || new Date().toISOString();
      
      if (callDuration) {
        updateData.duration_seconds = parseInt(callDuration, 10);
      }
    }

    // Update call record
    const { error: updateError } = await supabase
      .from('calls')
      .update(updateData)
      .eq('id', callId);

    if (updateError) {
      console.error('Failed to update call record:', updateError);
      throw updateError;
    }

    console.log(`[call-status] ✓ Call ${callId} updated to status: ${mappedStatus}`);

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[call-status] ✗ Error processing status update:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
