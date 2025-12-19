// ============================================================================
// ADMIN SMS SENDER FOR CASHRIDEZ
// ============================================================================
//
// Secure edge function for admin-only SMS sending via Twilio.
// All Twilio credentials are server-side only.
//
// ENDPOINT:
//   POST /functions/v1/admin-send-sms
//
// REQUIRED HEADERS:
//   Authorization: Bearer <user_jwt>
//
// REQUEST BODY:
//   {
//     to: string (E.164 format, e.g. +15551234567),
//     body: string (message content),
//     includeOptOut?: boolean (default true, appends "Reply STOP to opt out."),
//     fromNumber?: string (optional, use specific number instead of messaging service)
//   }
//
// RESPONSE:
//   Success: { ok: true, sid, status, to, from?, messagingServiceSid? }
//   Error: { ok: false, error, code, status }
//
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Rate limit: max sends per minute per admin
const RATE_LIMIT_SENDS_PER_MINUTE = 30;
const MAX_MESSAGE_LENGTH = 1500;
const OPT_OUT_FOOTER = "\n\nReply STOP to opt out.";

// Helper to create error response
function errorResponse(code: string, message: string, status: number = 400) {
  console.error(`[admin-send-sms] Error: ${code} - ${message}`);
  return new Response(
    JSON.stringify({ ok: false, error: message, code, status }),
    { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

// Validate E.164 phone format
function isValidE164(phone: string): boolean {
  return /^\+[1-9]\d{1,14}$/.test(phone);
}

// Calculate SMS segment count (GSM-7: 160 chars per segment, Unicode: 70)
function calculateSegments(message: string): number {
  // Check if message contains non-GSM-7 characters
  const gsm7Regex = /^[@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ ÆæßÉ!"#¤%&'()*+,\-.\/:;<=>?¡ÄÖÑÜ§¿äöñüà0-9A-Za-z]*$/;
  const isGsm7 = gsm7Regex.test(message);
  const charsPerSegment = isGsm7 ? 160 : 70;
  const multiPartLimit = isGsm7 ? 153 : 67; // Multi-part messages have header overhead
  
  if (message.length <= charsPerSegment) return 1;
  return Math.ceil(message.length / multiPartLimit);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[admin-send-sms] Function invoked');
    
    // Check authorization
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return errorResponse('UNAUTHORIZED', 'Authentication required.', 401);
    }

    // Create Supabase client with user's auth
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    // Service role client for writing logs
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user is authenticated
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return errorResponse('UNAUTHORIZED', 'Please log in.', 401);
    }

    console.log('[admin-send-sms] User authenticated:', user.id);

    // Verify user is admin
    const { data: isAdmin } = await supabase.rpc('has_role', {
      _user_id: user.id,
      _role: 'admin'
    });

    if (!isAdmin) {
      console.error('[admin-send-sms] Non-admin access attempt by:', user.id);
      return errorResponse('FORBIDDEN', 'Admin access required.', 403);
    }

    console.log('[admin-send-sms] Admin verified');

    // Parse request body
    let to: string;
    let body: string;
    let includeOptOut: boolean = true;
    let fromNumber: string | null = null;

    try {
      const requestBody = await req.json();
      to = requestBody.to?.trim();
      body = requestBody.body?.trim();
      includeOptOut = requestBody.includeOptOut !== false;
      fromNumber = requestBody.fromNumber?.trim() || null;
    } catch {
      return errorResponse('INVALID_REQUEST', 'Invalid request format.', 400);
    }

    // Validate inputs
    if (!to) {
      return errorResponse('MISSING_RECIPIENT', 'Recipient phone number is required.', 400);
    }

    if (!isValidE164(to)) {
      return errorResponse('INVALID_PHONE', 'Phone number must be in E.164 format (e.g., +15551234567).', 400);
    }

    if (!body) {
      return errorResponse('MISSING_BODY', 'Message body is required.', 400);
    }

    // Add opt-out footer if enabled
    const finalBody = includeOptOut ? body + OPT_OUT_FOOTER : body;

    if (finalBody.length > MAX_MESSAGE_LENGTH) {
      return errorResponse('MESSAGE_TOO_LONG', `Message exceeds ${MAX_MESSAGE_LENGTH} characters.`, 400);
    }

    // Rate limiting check
    const oneMinuteAgo = new Date(Date.now() - 60000).toISOString();
    const { count: recentSendCount } = await supabaseAdmin
      .from('admin_sms_logs')
      .select('id', { count: 'exact', head: true })
      .eq('admin_user_id', user.id)
      .gte('created_at', oneMinuteAgo);

    if ((recentSendCount || 0) >= RATE_LIMIT_SENDS_PER_MINUTE) {
      return errorResponse('RATE_LIMITED', `Rate limit exceeded. Max ${RATE_LIMIT_SENDS_PER_MINUTE} sends per minute.`, 429);
    }

    // Get Twilio credentials
    const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const twilioPhoneNumber = Deno.env.get('TWILIO_PHONE_NUMBER');
    const twilioMessagingServiceSid = Deno.env.get('TWILIO_MESSAGING_SERVICE_SID');

    if (!twilioAccountSid || !twilioAuthToken) {
      console.error('[admin-send-sms] Missing Twilio credentials');
      return errorResponse('SERVER_CONFIG_ERROR', 'Server configuration error.', 500);
    }

    // Determine sender: use messaging service if available, otherwise phone number
    const useMessagingService = !fromNumber && twilioMessagingServiceSid;
    const effectiveFrom = fromNumber || twilioPhoneNumber;

    if (!useMessagingService && !effectiveFrom) {
      console.error('[admin-send-sms] No sender configured');
      return errorResponse('SERVER_CONFIG_ERROR', 'No SMS sender configured.', 500);
    }

    // Calculate segments
    const segmentsCount = calculateSegments(finalBody);

    console.log('[admin-send-sms] Sending SMS:', {
      to: to.slice(0, 4) + '***',
      bodyLength: finalBody.length,
      segments: segmentsCount,
      useMessagingService,
      includeOptOut
    });

    // Send via Twilio REST API
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`;
    const authString = btoa(`${twilioAccountSid}:${twilioAuthToken}`);

    // Build form data
    const formParams = new URLSearchParams();
    formParams.append('To', to);
    formParams.append('Body', finalBody);
    
    if (useMessagingService) {
      formParams.append('MessagingServiceSid', twilioMessagingServiceSid!);
    } else {
      formParams.append('From', effectiveFrom!);
    }

    // Add status callback for delivery tracking
    const statusCallbackUrl = `${supabaseUrl}/functions/v1/twilio-sms-status-webhook`;
    formParams.append('StatusCallback', statusCallbackUrl);

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
        console.error('[admin-send-sms] Twilio error:', twilioResponse);
        twilioError = twilioResponse.message || 'Unknown Twilio error';
        twilioStatus = 'failed';
      } else {
        twilioStatus = twilioResponse.status || 'queued';
        console.log('[admin-send-sms] SMS sent successfully:', twilioResponse.sid);
      }
    } catch (fetchError: any) {
      console.error('[admin-send-sms] Twilio fetch error:', fetchError);
      twilioError = fetchError.message || 'Failed to contact Twilio';
      twilioStatus = 'failed';
    }

    // Log the SMS send attempt (existing audit log)
    const { error: logError } = await supabaseAdmin
      .from('admin_sms_logs')
      .insert({
        admin_user_id: user.id,
        to_number: to,
        from_number: useMessagingService ? null : effectiveFrom,
        messaging_service_sid: useMessagingService ? twilioMessagingServiceSid : null,
        body: body, // Store original body without opt-out
        twilio_message_sid: twilioResponse?.sid || null,
        twilio_status: twilioStatus,
        error_message: twilioError,
        segments_count: segmentsCount,
        include_opt_out: includeOptOut,
        metadata: {
          body_length: finalBody.length,
          twilio_response: twilioError ? twilioResponse : undefined
        }
      });

    if (logError) {
      console.error('[admin-send-sms] Failed to log SMS:', logError);
    }

    // Also record in conversation thread (for two-way messaging UI)
    if (!twilioError) {
      const twilioFromNumber = twilioResponse?.from || effectiveFrom || 'unknown';
      
      // Upsert conversation
      const { data: conversation, error: convError } = await supabaseAdmin
        .from('admin_sms_conversations')
        .upsert({
          participant_e164: to,
          twilio_number_e164: twilioFromNumber,
          last_message_at: new Date().toISOString(),
          last_message_preview: body.slice(0, 100),
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'participant_e164,twilio_number_e164'
        })
        .select('id')
        .single();

      if (convError) {
        console.error('[admin-send-sms] Failed to upsert conversation:', convError);
        // Try to find existing conversation
        const { data: existingConv } = await supabaseAdmin
          .from('admin_sms_conversations')
          .select('id')
          .eq('participant_e164', to)
          .eq('twilio_number_e164', twilioFromNumber)
          .single();
        
        if (existingConv) {
          // Insert message with existing conversation
          await supabaseAdmin
            .from('admin_sms_messages')
            .insert({
              conversation_id: existingConv.id,
              direction: 'outbound',
              from_e164: twilioFromNumber,
              to_e164: to,
              body: body,
              twilio_message_sid: twilioResponse?.sid || null,
              status: twilioStatus,
              created_at: new Date().toISOString()
            });
        }
      } else if (conversation) {
        // Insert outbound message
        const { error: msgError } = await supabaseAdmin
          .from('admin_sms_messages')
          .insert({
            conversation_id: conversation.id,
            direction: 'outbound',
            from_e164: twilioFromNumber,
            to_e164: to,
            body: body,
            twilio_message_sid: twilioResponse?.sid || null,
            status: twilioStatus,
            created_at: new Date().toISOString()
          });

        if (msgError) {
          console.error('[admin-send-sms] Failed to insert message:', msgError);
        }
      }
    }

    // Return result
    if (twilioError) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: twilioError,
          code: twilioResponse?.code || 'TWILIO_ERROR',
          status: twilioResponse?.status || 500
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        ok: true,
        sid: twilioResponse.sid,
        status: twilioResponse.status,
        to: twilioResponse.to,
        from: twilioResponse.from,
        messagingServiceSid: twilioResponse.messaging_service_sid || undefined,
        segments: segmentsCount
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[admin-send-sms] Unexpected error:', error);
    return errorResponse('INTERNAL_ERROR', 'An unexpected error occurred.', 500);
  }
});
