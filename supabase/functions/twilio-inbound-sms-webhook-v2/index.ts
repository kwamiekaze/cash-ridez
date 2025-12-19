// ============================================================================
// TWILIO INBOUND SMS WEBHOOK V2 FOR CASHRIDEZ
// ============================================================================
//
// This v2 endpoint logs EVERY request to admin_sms_webhook_events for debugging
// and inserts inbound SMS into the conversation thread.
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
const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;

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
    return new Response(twimlResponse, { 
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

        let conversationId: string | null = null;

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

  // Always return 200 to prevent Twilio retries
  return new Response(twimlResponse, { 
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/xml' }
  });
});
