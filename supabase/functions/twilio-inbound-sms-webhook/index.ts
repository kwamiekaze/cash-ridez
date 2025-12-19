// ============================================================================
// TWILIO INBOUND SMS WEBHOOK FOR CASHRIDEZ
// ============================================================================
//
// Receives inbound SMS from Twilio and stores in conversation threads.
//
// ENDPOINT:
//   POST /functions/v1/twilio-inbound-sms-webhook
//   GET  /functions/v1/twilio-inbound-sms-webhook?ping=1 → returns "pong"
//
// TWILIO WEBHOOK URL (configure in Twilio Console → Messaging → Services → Integration):
//   https://wnajjqsqmrpwyffbpgsj.supabase.co/functions/v1/twilio-inbound-sms-webhook
//
// Expected form data from Twilio:
//   - From: sender phone number (E.164)
//   - To: Twilio number that received message (E.164)
//   - Body: message text
//   - MessageSid or SmsSid: Twilio message SID
//   - MessagingServiceSid: optional
//   - NumMedia: number of media attachments
//
// Response: Always returns HTTP 200 with TwiML to prevent Twilio retries.
//
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

// Helper to insert message into admin_sms_messages (idempotent - uses upsert)
async function insertMessage(
  supabase: any,
  conversationId: string,
  data: {
    from: string;
    to: string;
    body: string;
    messageSid: string | undefined;
    direction: 'inbound' | 'outbound';
  }
): Promise<{ success: boolean; error?: string; duplicate?: boolean }> {
  // If we have a messageSid, check for duplicates first (idempotency)
  if (data.messageSid) {
    const { data: existing } = await supabase
      .from('admin_sms_messages')
      .select('id')
      .eq('twilio_message_sid', data.messageSid)
      .maybeSingle();
    
    if (existing) {
      console.log('[twilio-inbound-sms] Duplicate message detected, skipping:', data.messageSid);
      return { success: true, duplicate: true };
    }
  }

  const { error } = await supabase
    .from('admin_sms_messages')
    .insert({
      conversation_id: conversationId,
      direction: data.direction,
      from_e164: data.from,
      to_e164: data.to,
      body: data.body,
      twilio_message_sid: data.messageSid || null,
      status: data.direction === 'inbound' ? 'received' : 'queued',
      created_at: new Date().toISOString()
    });

  if (error) {
    // Handle unique constraint violation gracefully (race condition duplicate)
    if (error.code === '23505') {
      console.log('[twilio-inbound-sms] Duplicate message (constraint):', data.messageSid);
      return { success: true, duplicate: true };
    }
    console.error('[twilio-inbound-sms] Failed to insert message:', error);
    return { success: false, error: error.message };
  }
  return { success: true };
}

// Helper to also log to admin_sms_logs for backward compat & diagnostics (idempotent)
async function insertIntoLogs(
  supabase: any,
  data: {
    from: string;
    to: string;
    body: string;
    messageSid: string | undefined;
    messagingServiceSid: string | undefined;
  }
): Promise<void> {
  try {
    // Check for duplicate first (idempotency)
    if (data.messageSid) {
      const { data: existing } = await supabase
        .from('admin_sms_logs')
        .select('id')
        .eq('message_sid', data.messageSid)
        .maybeSingle();
      
      if (existing) {
        console.log('[twilio-inbound-sms] Duplicate log entry, skipping');
        return;
      }
    }

    await supabase.from('admin_sms_logs').insert({
      admin_user_id: '00000000-0000-0000-0000-000000000000', // System user placeholder
      to_number: data.to,
      from_number: data.from,
      body: data.body,
      twilio_message_sid: data.messageSid || null,
      messaging_service_sid: data.messagingServiceSid || null,
      twilio_status: 'received',
      direction: 'inbound',
      status: 'received',
      message_sid: data.messageSid || null,
      include_opt_out: false,
      segments_count: 1
    });
    console.log('[twilio-inbound-sms] Also logged to admin_sms_logs');
  } catch (err: unknown) {
    // Handle unique constraint violation gracefully
    const errObj = err as { code?: string };
    if (errObj.code === '23505') {
      console.log('[twilio-inbound-sms] Duplicate log (constraint), skipping');
      return;
    }
    console.warn('[twilio-inbound-sms] Could not log to admin_sms_logs:', err);
  }
}

// TwiML empty response
const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Health check / ping route
  const url = new URL(req.url);
  if (url.searchParams.get('ping') === '1' || req.method === 'GET') {
    console.log('[twilio-inbound-sms] Ping received');
    return new Response('pong', { 
      status: 200, 
      headers: { ...corsHeaders, 'Content-Type': 'text/plain' } 
    });
  }

  try {
    console.log('[twilio-inbound-sms] Webhook received');
    console.log('[twilio-inbound-sms] Content-Type:', req.headers.get('content-type'));

    // Parse body - handle both form-encoded and JSON
    let from: string | undefined;
    let to: string | undefined;
    let body: string = '';
    let messageSid: string | undefined;
    let messagingServiceSid: string | undefined;

    const contentType = req.headers.get('content-type') || '';

    if (contentType.includes('application/x-www-form-urlencoded')) {
      try {
        const formData = await req.formData();
        from = formData.get('From')?.toString();
        to = formData.get('To')?.toString();
        body = formData.get('Body')?.toString() || '';
        messageSid = formData.get('MessageSid')?.toString() || formData.get('SmsSid')?.toString();
        messagingServiceSid = formData.get('MessagingServiceSid')?.toString();
        
        console.log('[twilio-inbound-sms] Parsed form data:', {
          contentType: 'form-urlencoded',
          hasFrom: !!from,
          hasTo: !!to,
          bodyLength: body.length,
          messageSid: messageSid?.slice(0, 10) || 'none',
          messagingServiceSid: messagingServiceSid?.slice(0, 10) || 'none'
        });
      } catch (formErr) {
        console.error('[twilio-inbound-sms] Form parse error:', formErr);
      }
    } else if (contentType.includes('application/json')) {
      try {
        const jsonBody = await req.json();
        from = jsonBody.From || jsonBody.from;
        to = jsonBody.To || jsonBody.to;
        body = jsonBody.Body || jsonBody.body || '';
        messageSid = jsonBody.MessageSid || jsonBody.SmsSid || jsonBody.messageSid;
        messagingServiceSid = jsonBody.MessagingServiceSid || jsonBody.messagingServiceSid;
        
        console.log('[twilio-inbound-sms] Parsed JSON:', {
          contentType: 'json',
          hasFrom: !!from,
          hasTo: !!to,
          bodyLength: body.length,
          messageSid: messageSid?.slice(0, 10) || 'none'
        });
      } catch (jsonErr) {
        console.error('[twilio-inbound-sms] JSON parse error:', jsonErr);
      }
    } else {
      // Try form data as fallback
      try {
        const formData = await req.formData();
        from = formData.get('From')?.toString();
        to = formData.get('To')?.toString();
        body = formData.get('Body')?.toString() || '';
        messageSid = formData.get('MessageSid')?.toString() || formData.get('SmsSid')?.toString();
        messagingServiceSid = formData.get('MessagingServiceSid')?.toString();
        console.log('[twilio-inbound-sms] Fallback form parse succeeded');
      } catch (fallbackErr) {
        console.error('[twilio-inbound-sms] Fallback parse failed:', fallbackErr);
      }
    }

    // Log structured diagnostic info
    console.log('[twilio-inbound-sms] Extracted fields:', JSON.stringify({
      from: from ? from.slice(0, 6) + '***' : null,
      to: to ? to.slice(0, 6) + '***' : null,
      bodyLength: body.length,
      messageSid,
      messagingServiceSid
    }));

    // Validate required fields
    if (!from || !to) {
      console.error('[twilio-inbound-sms] Missing From or To - returning 200 anyway');
      return new Response(twimlResponse, { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/xml' } 
      });
    }

    // Create service role client
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('[twilio-inbound-sms] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
      return new Response(twimlResponse, { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/xml' } 
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Normalize phone numbers to E.164
    const participantE164 = normalizeE164(from);
    const twilioNumberE164 = normalizeE164(to);

    console.log('[twilio-inbound-sms] Normalized phones:', {
      participant: participantE164.slice(0, 6) + '***',
      twilioNumber: twilioNumberE164.slice(0, 6) + '***'
    });

    // Upsert conversation - create if doesn't exist
    let conversationId: string | null = null;
    
    const { data: existingConv, error: fetchError } = await supabase
      .from('admin_sms_conversations')
      .select('id, unread_count')
      .eq('participant_e164', participantE164)
      .eq('twilio_number_e164', twilioNumberE164)
      .maybeSingle();

    if (fetchError) {
      console.error('[twilio-inbound-sms] Error fetching conversation:', fetchError);
    }

    if (existingConv) {
      conversationId = existingConv.id;
      
      // Update conversation
      const { error: updateError } = await supabase
        .from('admin_sms_conversations')
        .update({
          last_message_at: new Date().toISOString(),
          last_message_preview: body.slice(0, 100),
          unread_count: (existingConv.unread_count || 0) + 1,
          updated_at: new Date().toISOString()
        })
        .eq('id', conversationId);

      if (updateError) {
        console.error('[twilio-inbound-sms] Failed to update conversation:', updateError);
      } else {
        console.log('[twilio-inbound-sms] Updated existing conversation:', conversationId);
      }
    } else {
      // Create new conversation
      const { data: newConv, error: insertError } = await supabase
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

      if (insertError) {
        console.error('[twilio-inbound-sms] Failed to create conversation:', insertError);
      } else if (newConv) {
        conversationId = newConv.id;
        console.log('[twilio-inbound-sms] Created new conversation:', conversationId);
      }
    }

    // Insert message if we have a conversation
    if (conversationId) {
      const insertResult = await insertMessage(supabase, conversationId, {
        from: participantE164,
        to: twilioNumberE164,
        body,
        messageSid,
        direction: 'inbound'
      });

      if (insertResult.success) {
        console.log('[twilio-inbound-sms] Message inserted successfully');
      } else {
        console.error('[twilio-inbound-sms] Message insert failed:', insertResult.error);
      }
    } else {
      console.error('[twilio-inbound-sms] No conversation ID - cannot insert message');
    }

    // Also log to admin_sms_logs for diagnostics
    await insertIntoLogs(supabase, {
      from: participantE164,
      to: twilioNumberE164,
      body,
      messageSid,
      messagingServiceSid
    });

    console.log('[twilio-inbound-sms] Webhook completed successfully');

    // Return TwiML with empty response (no auto-reply)
    return new Response(twimlResponse, { 
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/xml' }
    });

  } catch (error: unknown) {
    console.error('[twilio-inbound-sms] Unhandled error:', error);
    // Always return 200 to prevent Twilio retries
    return new Response(twimlResponse, { 
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/xml' }
    });
  }
});
