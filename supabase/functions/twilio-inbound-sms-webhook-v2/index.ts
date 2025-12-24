// ============================================================================
// TWILIO INBOUND SMS WEBHOOK V2 FOR CASHRIDEZ
// ============================================================================
//
// This v2 endpoint logs EVERY request to admin_sms_webhook_events for debugging
// and inserts inbound SMS into the conversation thread.
// Also creates admin notifications for admins with sms_inbound_enabled.
//
// CASH KEYWORD AUTO-REPLY:
// - Uses Twilio REST API (not TwiML) for reliable delivery with real Message SID
// - Enables status callback tracking for delivery confirmation
// - Rate limit: 1 CASH reply per phone number per 24 hours
//
// ENDPOINT:
//   POST /functions/v1/twilio-inbound-sms-webhook-v2
//   GET  /functions/v1/twilio-inbound-sms-webhook-v2?ping=1 → returns "pong"
//
// TWILIO WEBHOOK URL (configure in Twilio Console):
//   https://<project-ref>.supabase.co/functions/v1/twilio-inbound-sms-webhook-v2
//
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// TwiML empty response - always return 200 to prevent Twilio retries
const twimlEmptyResponse = `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;

// CASH keyword auto-reply message (~95 chars - fits in 1 SMS segment)
const CASH_AUTO_REPLY = "Welcome to CashRidez! Verify your ID at cashridez.com, then update your map pin to connect!💰🚗🎉";

// Rate limit: 1 CASH reply per phone number per 24 hours
const CASH_RATE_LIMIT_HOURS = 24;

// Helper to normalize phone number to E.164
function normalizeE164(phone: string): string {
  let cleaned = phone.trim();
  
  // Already in E.164 format
  if (/^\+[1-9]\d{1,14}$/.test(cleaned)) {
    return cleaned;
  }
  
  // Remove non-digits
  cleaned = cleaned.replace(/\D/g, '');
  
  // Add US country code if 10 digits
  if (cleaned.length === 10) {
    return '+1' + cleaned;
  }
  
  // Add + if 11 digits starting with 1
  if (cleaned.length === 11 && cleaned.startsWith('1')) {
    return '+' + cleaned;
  }
  
  // Just add + for other formats
  return '+' + cleaned;
}

// Send SMS via Twilio REST API (reliable delivery with SID tracking)
async function sendTwilioSms(
  to: string,
  body: string,
  from: string,
  statusCallbackUrl: string
): Promise<{ success: boolean; sid?: string; status?: string; error?: string; errorCode?: string }> {
  const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');
  
  if (!twilioAccountSid || !twilioAuthToken) {
    console.error('[v2] Missing Twilio credentials for REST API');
    return { success: false, error: 'Missing Twilio credentials' };
  }
  
  const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`;
  const authString = btoa(`${twilioAccountSid}:${twilioAuthToken}`);
  
  const formParams = new URLSearchParams();
  formParams.append('To', to);
  formParams.append('From', from);
  formParams.append('Body', body);
  formParams.append('StatusCallback', statusCallbackUrl);
  
  console.log('[v2] Sending SMS via REST API:', { to: to.slice(0, 4) + '***', from, bodyLength: body.length });
  
  try {
    const response = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${authString}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formParams.toString(),
    });
    
    const result = await response.json();
    
    if (!response.ok) {
      console.error('[v2] Twilio REST API error:', result);
      return {
        success: false,
        error: result.message || 'Twilio API error',
        errorCode: String(result.code || result.error_code || ''),
        status: 'failed'
      };
    }
    
    console.log('[v2] Twilio REST API success:', { sid: result.sid, status: result.status });
    return {
      success: true,
      sid: result.sid,
      status: result.status || 'queued'
    };
  } catch (err: any) {
    console.error('[v2] Twilio REST API fetch error:', err);
    return { success: false, error: err.message || 'Network error' };
  }
}

// Create admin notifications for inbound SMS
async function notifyAdminsOfInboundSms(
  supabase: any,
  conversationId: string,
  fromNumber: string,
  messageBody: string,
  messageSid: string
): Promise<void> {
  try {
    // Find all admins with sms_inbound_enabled
    const { data: adminSettings, error: settingsError } = await supabase
      .from('admin_notification_settings')
      .select('admin_id')
      .eq('sms_inbound_enabled', true);

    if (settingsError) {
      console.error('[v2] Failed to fetch admin settings:', settingsError);
      return;
    }

    if (!adminSettings || adminSettings.length === 0) {
      console.log('[v2] No admins with sms_inbound_enabled');
      return;
    }

    // Verify these are actually admins
    const adminIds = adminSettings.map((s: any) => s.admin_id);
    const { data: adminRoles } = await supabase
      .from('user_roles')
      .select('user_id')
      .in('user_id', adminIds)
      .eq('role', 'admin');

    const verifiedAdminIds = adminRoles?.map((r: any) => r.user_id) || [];
    
    if (verifiedAdminIds.length === 0) {
      console.log('[v2] No verified admins found');
      return;
    }

    // Create notifications for each admin
    const notifications = verifiedAdminIds.map((adminId: string) => ({
      user_id: adminId,
      type: 'sms_inbound',
      title: `New SMS from ${fromNumber}`,
      message: messageBody.slice(0, 120) + (messageBody.length > 120 ? '...' : ''),
      link: `/admin/sms?c=${conversationId}`,
      read: false,
      created_at: new Date().toISOString()
    }));

    const { error: insertError } = await supabase
      .from('notifications')
      .insert(notifications);

    if (insertError) {
      console.error('[v2] Failed to insert admin notifications:', insertError);
    } else {
      console.log(`[v2] Created ${notifications.length} admin notification(s) for inbound SMS`);
    }
  } catch (err: any) {
    console.error('[v2] notifyAdminsOfInboundSms error:', err);
  }
}

// Log CASH auto-reply attempt for diagnostics
async function logCashAutoReplyAttempt(
  supabase: any,
  data: {
    senderPhone: string;
    twilioNumber: string;
    conversationId: string | null;
    matched: boolean;
    rateLimited: boolean;
    sendAttempted: boolean;
    sendSuccess: boolean;
    twilioSid: string | null;
    twilioStatus: string | null;
    errorMessage: string | null;
    errorCode: string | null;
  }
): Promise<void> {
  try {
    await supabase.from('admin_sms_webhook_events').update({
      insert_error: data.rateLimited 
        ? 'CASH rate limited - already replied in last 24h' 
        : data.errorMessage 
          ? `CASH send error: ${data.errorMessage}` 
          : data.sendSuccess 
            ? `CASH auto-reply sent: ${data.twilioSid}` 
            : null
    }).eq('from_e164', data.senderPhone).order('received_at', { ascending: false }).limit(1);
  } catch (err) {
    // Non-critical, just log
    console.error('[v2] Failed to update webhook event with CASH status:', err);
  }
}

Deno.serve(async (req) => {
  const startTime = Date.now();
  
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Health check / ping route
  const url = new URL(req.url);
  if (url.searchParams.get('ping') === '1' || (req.method === 'GET' && !url.searchParams.has('test'))) {
    console.log('[v2] Ping received');
    return new Response('pong', { 
      status: 200, 
      headers: { ...corsHeaders, 'Content-Type': 'text/plain' } 
    });
  }

  // Capture headers for logging
  const headersObj: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    headersObj[key] = value;
  });
  
  console.log('[v2] Webhook received');
  console.log('[v2] Method:', req.method);
  console.log('[v2] Headers:', JSON.stringify(headersObj, null, 2));

  // Initialize Supabase client
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('[v2] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    return new Response(twimlEmptyResponse, { 
      status: 200, 
      headers: { ...corsHeaders, 'Content-Type': 'application/xml' } 
    });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Parse request body
  let rawBody = '';
  let from: string | undefined;
  let to: string | undefined;
  let body: string = '';
  let smsSid: string | undefined;
  let messagingServiceSid: string | undefined;
  let numMedia: number = 0;

  try {
    const contentType = req.headers.get('content-type') || '';
    console.log('[v2] Content-Type:', contentType);

    if (contentType.includes('application/x-www-form-urlencoded')) {
      rawBody = await req.text();
      console.log('[v2] Raw body:', rawBody);
      
      const params = new URLSearchParams(rawBody);
      from = params.get('From') || undefined;
      to = params.get('To') || undefined;
      body = params.get('Body') || '';
      smsSid = params.get('MessageSid') || params.get('SmsSid') || undefined;
      messagingServiceSid = params.get('MessagingServiceSid') || undefined;
      numMedia = parseInt(params.get('NumMedia') || '0', 10);
      
      console.log('[v2] Parsed form data:', { from, to, bodyLength: body.length, smsSid, numMedia });
    } else if (contentType.includes('application/json')) {
      rawBody = await req.text();
      console.log('[v2] Raw JSON body:', rawBody);
      
      const jsonBody = JSON.parse(rawBody);
      from = jsonBody.From || jsonBody.from;
      to = jsonBody.To || jsonBody.to;
      body = jsonBody.Body || jsonBody.body || '';
      smsSid = jsonBody.MessageSid || jsonBody.SmsSid || jsonBody.messageSid || jsonBody.smsSid;
      messagingServiceSid = jsonBody.MessagingServiceSid || jsonBody.messagingServiceSid;
      numMedia = parseInt(jsonBody.NumMedia || '0', 10);
      
      console.log('[v2] Parsed JSON:', { from, to, bodyLength: body.length, smsSid, numMedia });
    } else {
      // Fallback: try form data
      try {
        rawBody = await req.text();
        console.log('[v2] Fallback raw body:', rawBody);
        
        const params = new URLSearchParams(rawBody);
        from = params.get('From') || undefined;
        to = params.get('To') || undefined;
        body = params.get('Body') || '';
        smsSid = params.get('MessageSid') || params.get('SmsSid') || undefined;
        messagingServiceSid = params.get('MessagingServiceSid') || undefined;
        numMedia = parseInt(params.get('NumMedia') || '0', 10);
      } catch (e) {
        console.error('[v2] Fallback parse failed:', e);
      }
    }
  } catch (parseError) {
    console.error('[v2] Parse error:', parseError);
  }

  // Normalize phone numbers
  const fromE164 = from ? normalizeE164(from) : null;
  const toE164 = to ? normalizeE164(to) : null;

  // Variables for logging
  let insertOk = false;
  let insertError: string | null = null;
  let conversationId: string | null = null;

  // Insert into messages table if we have required fields
  if (fromE164 && toE164 && smsSid) {
    try {
      // Idempotency check - skip if message already exists
      const { data: existing } = await supabase
        .from('admin_sms_messages')
        .select('id')
        .eq('twilio_message_sid', smsSid)
        .maybeSingle();

      if (existing) {
        console.log('[v2] Duplicate message, skipping:', smsSid);
        insertOk = true;
      } else {
        // Find or create conversation
        // For inbound: participant = sender (from), twilio number = recipient (to)
        const participantE164 = fromE164;
        const twilioNumberE164 = toE164;

        const { data: existingConv } = await supabase
          .from('admin_sms_conversations')
          .select('id, unread_count')
          .eq('participant_e164', participantE164)
          .eq('twilio_number_e164', twilioNumberE164)
          .maybeSingle();

        if (existingConv) {
          conversationId = existingConv.id;
          
          // Update conversation
          await supabase
            .from('admin_sms_conversations')
            .update({
              last_message_at: new Date().toISOString(),
              last_message_preview: body.slice(0, 100),
              unread_count: (existingConv.unread_count || 0) + 1,
              updated_at: new Date().toISOString()
            })
            .eq('id', conversationId);
          
          console.log('[v2] Updated existing conversation:', conversationId);
        } else {
          // Create new conversation
          const { data: newConv, error: convError } = await supabase
            .from('admin_sms_conversations')
            .insert({
              participant_e164: participantE164,
              twilio_number_e164: twilioNumberE164,
              last_message_at: new Date().toISOString(),
              last_message_preview: body.slice(0, 100),
              unread_count: 1
            })
            .select('id')
            .single();

          if (convError) {
            console.error('[v2] Failed to create conversation:', convError);
            insertError = `Conversation create failed: ${convError.message}`;
          } else if (newConv) {
            conversationId = newConv.id;
            console.log('[v2] Created new conversation:', conversationId);
          }
        }

        // Insert message
        if (conversationId) {
          const { error: msgError } = await supabase
            .from('admin_sms_messages')
            .insert({
              conversation_id: conversationId,
              direction: 'inbound',
              from_e164: fromE164,
              to_e164: toE164,
              body: body,
              twilio_message_sid: smsSid,
              status: 'received',
              created_at: new Date().toISOString()
            });

          if (msgError) {
            // Handle unique constraint violation
            if (msgError.code === '23505') {
              console.log('[v2] Duplicate message (constraint):', smsSid);
              insertOk = true;
            } else {
              console.error('[v2] Failed to insert message:', msgError);
              insertError = `Message insert failed: ${msgError.message}`;
            }
          } else {
            console.log('[v2] Message inserted successfully');
            insertOk = true;
            
            // Create admin notifications for inbound SMS (only for new messages)
            await notifyAdminsOfInboundSms(
              supabase,
              conversationId,
              fromE164,
              body,
              smsSid
            );
          }
        }
      }
    } catch (dbError: any) {
      console.error('[v2] DB error:', dbError);
      insertError = `DB error: ${dbError.message}`;
    }
  } else {
    insertError = `Missing required fields: from=${!!fromE164}, to=${!!toE164}, smsSid=${!!smsSid}`;
    console.warn('[v2]', insertError);
  }

  // Log to webhook events table (always, for debugging)
  try {
    const { error: eventError } = await supabase
      .from('admin_sms_webhook_events')
      .insert({
        received_at: new Date().toISOString(),
        headers: headersObj,
        raw_body: rawBody,
        from_e164: fromE164,
        to_e164: toE164,
        body: body,
        sms_sid: smsSid || null,
        messaging_service_sid: messagingServiceSid || null,
        num_media: numMedia,
        insert_ok: insertOk,
        insert_error: insertError
      });

    if (eventError) {
      // Handle duplicate
      if (eventError.code === '23505') {
        console.log('[v2] Duplicate webhook event, skipping');
      } else {
        console.error('[v2] Failed to log webhook event:', eventError);
      }
    } else {
      console.log('[v2] Webhook event logged');
    }
  } catch (logError) {
    console.error('[v2] Event log error:', logError);
  }

  const elapsed = Date.now() - startTime;
  console.log(`[v2] Completed inbound processing in ${elapsed}ms, insertOk=${insertOk}, error=${insertError}`);

  // =========================================================================
  // CASH KEYWORD AUTO-REPLY - Using Twilio REST API for reliable delivery
  // =========================================================================
  const normalizedBody = body.trim().toUpperCase();
  
  if (normalizedBody === 'CASH' && fromE164 && toE164) {
    console.log(`[v2] CASH keyword detected from ${fromE164}`);
    
    try {
      // Rate limit check: has this number received a CASH reply in the last 24 hours?
      const cutoffTime = new Date(Date.now() - CASH_RATE_LIMIT_HOURS * 60 * 60 * 1000).toISOString();
      
      // Look for outbound messages to this number containing the CASH auto-reply in the last 24h
      // Check for messages with real Twilio SIDs (not fake auto-cash-* ones) OR recent ones
      const { data: recentReplies, error: rateLimitError } = await supabase
        .from('admin_sms_messages')
        .select('id, created_at, twilio_message_sid, status')
        .eq('direction', 'outbound')
        .eq('to_e164', fromE164)
        .like('body', '%Welcome to CashRidez%')
        .gte('created_at', cutoffTime)
        .limit(1);
      
      if (rateLimitError) {
        console.error('[v2] Rate limit check error:', rateLimitError);
        // On error, don't block - try to send
      } else if (recentReplies && recentReplies.length > 0) {
        console.log(`[v2] CASH rate limit hit for ${fromE164} - already replied at ${recentReplies[0].created_at}, SID: ${recentReplies[0].twilio_message_sid}`);
        
        // Log the rate limit decision
        await logCashAutoReplyAttempt(supabase, {
          senderPhone: fromE164,
          twilioNumber: toE164,
          conversationId,
          matched: true,
          rateLimited: true,
          sendAttempted: false,
          sendSuccess: false,
          twilioSid: null,
          twilioStatus: null,
          errorMessage: 'Rate limited - already sent in last 24h',
          errorCode: null
        });
        
        // Return empty TwiML - no duplicate reply
        return new Response(twimlEmptyResponse, { 
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/xml' }
        });
      }
      
      // =====================================================================
      // SEND CASH AUTO-REPLY VIA TWILIO REST API
      // This provides: real SID, status callback tracking, delivery confirmation
      // =====================================================================
      console.log(`[v2] Sending CASH auto-reply to ${fromE164} via REST API`);
      
      // Get our Twilio phone number (the "To" number in the inbound message)
      const twilioFromNumber = Deno.env.get('TWILIO_PHONE_NUMBER') || toE164;
      const statusCallbackUrl = `${supabaseUrl}/functions/v1/twilio-sms-status-webhook`;
      
      const sendResult = await sendTwilioSms(
        fromE164,           // To: the person who texted CASH
        CASH_AUTO_REPLY,    // Message body
        twilioFromNumber,   // From: our Twilio number
        statusCallbackUrl   // Status callback for delivery tracking
      );
      
      // Log the outbound auto-reply to admin_sms_messages
      if (conversationId) {
        const { error: logError } = await supabase
          .from('admin_sms_messages')
          .insert({
            conversation_id: conversationId,
            direction: 'outbound',
            from_e164: twilioFromNumber,
            to_e164: fromE164,
            body: CASH_AUTO_REPLY,
            twilio_message_sid: sendResult.sid || null,
            status: sendResult.success ? (sendResult.status || 'queued') : 'failed',
            error_code: sendResult.errorCode || null,
            error_message: sendResult.error || null,
            created_at: new Date().toISOString()
          });
        
        if (logError) {
          console.error('[v2] Failed to log CASH auto-reply message:', logError);
        } else {
          console.log('[v2] CASH auto-reply logged to messages with SID:', sendResult.sid);
        }
      }
      
      // Log diagnostic info
      await logCashAutoReplyAttempt(supabase, {
        senderPhone: fromE164,
        twilioNumber: twilioFromNumber,
        conversationId,
        matched: true,
        rateLimited: false,
        sendAttempted: true,
        sendSuccess: sendResult.success,
        twilioSid: sendResult.sid || null,
        twilioStatus: sendResult.status || null,
        errorMessage: sendResult.error || null,
        errorCode: sendResult.errorCode || null
      });
      
      if (sendResult.success) {
        console.log(`[v2] CASH auto-reply sent successfully! SID: ${sendResult.sid}, Status: ${sendResult.status}`);
      } else {
        console.error(`[v2] CASH auto-reply FAILED: ${sendResult.error}`);
      }
      
    } catch (err: any) {
      console.error('[v2] CASH handling error:', err);
    }
  }

  // Always return empty TwiML 200 to prevent Twilio retries
  // (We're using REST API for replies, not TwiML)
  return new Response(twimlEmptyResponse, { 
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/xml' }
  });
});
