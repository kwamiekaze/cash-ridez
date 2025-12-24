// ============================================================================
// TWILIO INBOUND SMS WEBHOOK V2 FOR CASHRIDEZ
// ============================================================================
//
// This v2 endpoint logs EVERY request to admin_sms_webhook_events for debugging
// and inserts inbound SMS into the conversation thread.
// Also creates admin notifications for admins with sms_inbound_enabled.
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

// TwiML response for CASH keyword auto-reply (fits in 1 SMS segment - ~95 chars)
const CASH_AUTO_REPLY = "Welcome to CashRidez! Verify your ID at cashridez.com, then update your map pin to connect!💰🚗🎉";

// Rate limit: 1 CASH reply per phone number per 24 hours
const CASH_RATE_LIMIT_HOURS = 24;

function buildTwimlReply(message: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${message}</Message></Response>`;
}

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
      // Clone request to read body twice
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
  console.log(`[v2] Completed in ${elapsed}ms, insertOk=${insertOk}, error=${insertError}`);

  // Check for CASH keyword - case insensitive, trimmed
  const normalizedBody = body.trim().toUpperCase();
  if (normalizedBody === 'CASH' && fromE164 && toE164) {
    console.log(`[v2] CASH keyword detected from ${fromE164}`);
    
    // Check rate limit: has this number received a CASH reply in the last 24 hours?
    try {
      const cutoffTime = new Date(Date.now() - CASH_RATE_LIMIT_HOURS * 60 * 60 * 1000).toISOString();
      
      // Look for outbound messages to this number containing the CASH auto-reply in the last 24h
      const { data: recentReplies, error: rateLimitError } = await supabase
        .from('admin_sms_messages')
        .select('id, created_at')
        .eq('direction', 'outbound')
        .eq('to_e164', fromE164)
        .like('body', '%Welcome to CashRidez%')
        .gte('created_at', cutoffTime)
        .limit(1);
      
      if (rateLimitError) {
        console.error('[v2] Rate limit check error:', rateLimitError);
        // On error, still send reply to avoid blocking legitimate users
      } else if (recentReplies && recentReplies.length > 0) {
        console.log(`[v2] CASH rate limit hit for ${fromE164} - already replied at ${recentReplies[0].created_at}`);
        // Return empty TwiML - no duplicate reply
        return new Response(twimlEmptyResponse, { 
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/xml' }
        });
      }
      
      // No recent reply found - send the auto-reply
      console.log(`[v2] Sending CASH auto-reply to ${fromE164}`);
      
      // Log the outbound auto-reply to admin_sms_messages for tracking
      if (conversationId) {
        const { error: logError } = await supabase
          .from('admin_sms_messages')
          .insert({
            conversation_id: conversationId,
            direction: 'outbound',
            from_e164: toE164,
            to_e164: fromE164,
            body: CASH_AUTO_REPLY,
            twilio_message_sid: `auto-cash-${Date.now()}`,
            status: 'sent',
            created_at: new Date().toISOString()
          });
        
        if (logError) {
          console.error('[v2] Failed to log CASH auto-reply:', logError);
        } else {
          console.log('[v2] CASH auto-reply logged to messages');
        }
      }
      
      return new Response(buildTwimlReply(CASH_AUTO_REPLY), { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/xml' }
      });
    } catch (err: any) {
      console.error('[v2] CASH handling error:', err);
      // On error, send reply anyway
      return new Response(buildTwimlReply(CASH_AUTO_REPLY), { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/xml' }
      });
    }
  }

  // Always return 200 to prevent Twilio retries
  return new Response(twimlEmptyResponse, { 
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/xml' }
  });
});
