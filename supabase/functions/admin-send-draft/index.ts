// ============================================================================
// ADMIN DRAFT SMS SENDER WITH GLOBAL 90-SECOND COOLDOWN
// ============================================================================
//
// Sends a single draft SMS with server-enforced global cooldown.
// Only one send allowed every 90 seconds across all admins.
//
// ENDPOINT:
//   POST /functions/v1/admin-send-draft
//
// REQUIRED HEADERS:
//   Authorization: Bearer <user_jwt>
//
// REQUEST BODY:
//   { draft_id: string }
//
// RESPONSE:
//   Success: { ok: true, sid, status, draft_id, cooldown_until }
//   Locked: { ok: false, code: 'COOLDOWN_ACTIVE', cooldown_remaining, cooldown_until }
//   Error: { ok: false, error, code }
//
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const COOLDOWN_SECONDS = 90;
const OPT_OUT_FOOTER = "\n\nReply STOP to opt out.";

function errorResponse(code: string, message: string, status: number = 400, extra: Record<string, any> = {}) {
  console.error(`[admin-send-draft] Error: ${code} - ${message}`);
  return new Response(
    JSON.stringify({ ok: false, error: message, code, status, ...extra }),
    { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

function isValidE164(phone: string): boolean {
  return /^\+[1-9]\d{1,14}$/.test(phone);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[admin-send-draft] Function invoked');
    
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
    let draftId: string;
    try {
      const body = await req.json();
      draftId = body.draft_id;
    } catch {
      return errorResponse('INVALID_REQUEST', 'Invalid request format.', 400);
    }

    if (!draftId) {
      return errorResponse('MISSING_DRAFT_ID', 'Draft ID is required.', 400);
    }

    // Check global cooldown
    const { data: lock } = await supabaseAdmin
      .from('admin_sms_send_lock')
      .select('*')
      .eq('id', 'global')
      .single();

    const now = new Date();
    if (lock?.locked_until) {
      const lockedUntil = new Date(lock.locked_until);
      if (lockedUntil > now) {
        const remainingMs = lockedUntil.getTime() - now.getTime();
        const remainingSeconds = Math.ceil(remainingMs / 1000);
        console.log(`[admin-send-draft] Cooldown active: ${remainingSeconds}s remaining`);
        return errorResponse('COOLDOWN_ACTIVE', `Cooldown active. Wait ${remainingSeconds} seconds.`, 429, {
          cooldown_remaining: remainingSeconds,
          cooldown_until: lockedUntil.toISOString()
        });
      }
    }

    // Fetch draft
    const { data: draft, error: draftError } = await supabaseAdmin
      .from('admin_sms_drafts')
      .select('*')
      .eq('id', draftId)
      .single();

    if (draftError || !draft) {
      return errorResponse('DRAFT_NOT_FOUND', 'Draft not found.', 404);
    }

    if (draft.status !== 'draft') {
      return errorResponse('INVALID_STATUS', `Draft is already ${draft.status}.`, 400);
    }

    const to = draft.recipient_phone;
    const body = draft.message_body_final;

    if (!isValidE164(to)) {
      // Mark as failed
      await supabaseAdmin
        .from('admin_sms_drafts')
        .update({ status: 'failed', error_message: 'Invalid phone format', last_attempt_at: now.toISOString() })
        .eq('id', draftId);
      return errorResponse('INVALID_PHONE', 'Phone number is invalid.', 400);
    }

    // Set cooldown BEFORE attempting to send (pessimistic lock)
    const cooldownUntil = new Date(now.getTime() + COOLDOWN_SECONDS * 1000);
    await supabaseAdmin
      .from('admin_sms_send_lock')
      .update({
        locked_until: cooldownUntil.toISOString(),
        last_sent_at: now.toISOString(),
        last_sent_by_admin_id: user.id,
        last_sent_draft_id: draftId,
        updated_at: now.toISOString()
      })
      .eq('id', 'global');

    // Mark draft as sending
    await supabaseAdmin
      .from('admin_sms_drafts')
      .update({ status: 'sending', last_attempt_at: now.toISOString() })
      .eq('id', draftId);

    // Get Twilio credentials
    const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const twilioPhoneNumber = Deno.env.get('TWILIO_PHONE_NUMBER');
    const twilioMessagingServiceSid = Deno.env.get('TWILIO_MESSAGING_SERVICE_SID');

    if (!twilioAccountSid || !twilioAuthToken) {
      await supabaseAdmin
        .from('admin_sms_drafts')
        .update({ status: 'failed', error_message: 'Server config error' })
        .eq('id', draftId);
      return errorResponse('SERVER_CONFIG_ERROR', 'Server configuration error.', 500);
    }

    const useMessagingService = !!twilioMessagingServiceSid;
    const effectiveFrom = twilioPhoneNumber;

    if (!useMessagingService && !effectiveFrom) {
      await supabaseAdmin
        .from('admin_sms_drafts')
        .update({ status: 'failed', error_message: 'No sender configured' })
        .eq('id', draftId);
      return errorResponse('SERVER_CONFIG_ERROR', 'No SMS sender configured.', 500);
    }

    // Send via Twilio
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`;
    const authString = btoa(`${twilioAccountSid}:${twilioAuthToken}`);

    const formParams = new URLSearchParams();
    formParams.append('To', to);
    formParams.append('Body', body);
    
    if (useMessagingService) {
      formParams.append('MessagingServiceSid', twilioMessagingServiceSid!);
    } else {
      formParams.append('From', effectiveFrom!);
    }

    // Status callback
    const statusCallbackUrl = `${supabaseUrl}/functions/v1/twilio-sms-status-webhook`;
    formParams.append('StatusCallback', statusCallbackUrl);

    console.log('[admin-send-draft] Sending SMS to:', to.slice(0, 4) + '***');

    let twilioResponse: any;
    let twilioError: string | null = null;
    let twilioStatus = 'pending';

    try {
      const response = await fetch(twilioUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${authString}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formParams.toString(),
      });

      twilioResponse = await response.json();

      if (!response.ok) {
        twilioError = twilioResponse.message || 'Unknown Twilio error';
        twilioStatus = 'failed';
      } else {
        twilioStatus = twilioResponse.status || 'queued';
        console.log('[admin-send-draft] SMS sent:', twilioResponse.sid);
      }
    } catch (fetchError: any) {
      twilioError = fetchError.message || 'Failed to contact Twilio';
      twilioStatus = 'failed';
    }

    // Update draft status
    if (twilioError) {
      await supabaseAdmin
        .from('admin_sms_drafts')
        .update({
          status: 'failed',
          error_message: twilioError,
          last_attempt_at: now.toISOString()
        })
        .eq('id', draftId);

      return new Response(
        JSON.stringify({
          ok: false,
          error: twilioError,
          code: 'TWILIO_ERROR',
          draft_id: draftId,
          cooldown_until: cooldownUntil.toISOString()
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const twilioFromNumber = twilioResponse?.from || effectiveFrom || 'unknown';

    // Update draft as sent
    await supabaseAdmin
      .from('admin_sms_drafts')
      .update({
        status: 'sent',
        sent_at: now.toISOString(),
        twilio_message_sid: twilioResponse.sid,
        last_attempt_at: now.toISOString()
      })
      .eq('id', draftId);

    // Create/update conversation and message for inbox
    const { data: conversation, error: convError } = await supabaseAdmin
      .from('admin_sms_conversations')
      .upsert({
        participant_e164: to,
        twilio_number_e164: twilioFromNumber,
        last_message_at: now.toISOString(),
        last_message_preview: body.slice(0, 100),
        updated_at: now.toISOString()
      }, {
        onConflict: 'participant_e164,twilio_number_e164'
      })
      .select('id')
      .single();

    let conversationId = conversation?.id;

    if (convError) {
      // Try to find existing
      const { data: existingConv } = await supabaseAdmin
        .from('admin_sms_conversations')
        .select('id')
        .eq('participant_e164', to)
        .eq('twilio_number_e164', twilioFromNumber)
        .single();
      conversationId = existingConv?.id;
    }

    if (conversationId) {
      // Insert message
      await supabaseAdmin
        .from('admin_sms_messages')
        .insert({
          conversation_id: conversationId,
          direction: 'outbound',
          from_e164: twilioFromNumber,
          to_e164: to,
          body: body,
          twilio_message_sid: twilioResponse.sid,
          status: twilioStatus,
          created_at: now.toISOString()
        });

      // Update draft with conversation link
      await supabaseAdmin
        .from('admin_sms_drafts')
        .update({ conversation_id: conversationId })
        .eq('id', draftId);
    }

    // Also log to admin_sms_logs for history
    await supabaseAdmin
      .from('admin_sms_logs')
      .insert({
        admin_user_id: user.id,
        to_number: to,
        from_number: useMessagingService ? null : effectiveFrom,
        messaging_service_sid: useMessagingService ? twilioMessagingServiceSid : null,
        body: body,
        twilio_message_sid: twilioResponse.sid,
        twilio_status: twilioStatus,
        segments_count: 1,
        include_opt_out: body.includes('STOP'),
        direction: 'outbound',
        status: twilioStatus
      });

    return new Response(
      JSON.stringify({
        ok: true,
        sid: twilioResponse.sid,
        status: twilioResponse.status,
        draft_id: draftId,
        cooldown_until: cooldownUntil.toISOString()
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[admin-send-draft] Unexpected error:', error);
    return errorResponse('INTERNAL_ERROR', 'An unexpected error occurred.', 500);
  }
});
