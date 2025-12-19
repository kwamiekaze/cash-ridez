// ============================================================================
// TWILIO INBOUND SMS WEBHOOK FOR CASHRIDEZ
// ============================================================================
//
// Receives inbound SMS from Twilio and stores in conversation threads.
//
// ENDPOINT:
//   POST /functions/v1/twilio-inbound-sms-webhook
//
// Expected form data from Twilio:
//   - From: sender phone number (E.164)
//   - To: Twilio number that received message (E.164)
//   - Body: message text
//   - MessageSid: Twilio message SID
//   - NumMedia: number of media attachments
//
// Security: Validates Twilio request signature when TWILIO_AUTH_TOKEN is set.
//
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

// Validate Twilio signature using Web Crypto API
async function validateTwilioSignature(
  req: Request,
  formData: FormData,
  authToken: string | undefined
): Promise<boolean> {
  if (!authToken) {
    console.log('[twilio-inbound-sms] No auth token, skipping signature validation');
    return true; // Skip validation if no auth token
  }

  const twilioSignature = req.headers.get('x-twilio-signature');
  if (!twilioSignature) {
    console.warn('[twilio-inbound-sms] Missing Twilio signature header');
    return false;
  }

  // Build the URL from the request
  const url = new URL(req.url);
  const fullUrl = `${url.protocol}//${url.host}${url.pathname}`;

  // Sort form params alphabetically and concatenate
  const params = Array.from(formData.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}${value}`)
    .join('');

  const dataToSign = fullUrl + params;
  
  // Compute HMAC-SHA1 signature using Web Crypto API
  const encoder = new TextEncoder();
  const keyData = encoder.encode(authToken);
  const data = encoder.encode(dataToSign);
  
  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', key, data);
  const computedSignature = btoa(String.fromCharCode(...new Uint8Array(signature)));

  const isValid = computedSignature === twilioSignature;
  if (!isValid) {
    console.warn('[twilio-inbound-sms] Invalid Twilio signature');
  }
  return isValid;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { 
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      }
    });
  }

  try {
    console.log('[twilio-inbound-sms] Webhook received');

    // Parse form data from Twilio
    const formData = await req.formData();
    
    // Validate Twilio signature for security
    const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const isValidSignature = await validateTwilioSignature(req, formData, twilioAuthToken);
    if (!isValidSignature && twilioAuthToken) {
      console.error('[twilio-inbound-sms] Invalid Twilio signature, rejecting request');
      return new Response('Forbidden', { status: 403 });
    }
    
    const from = formData.get('From')?.toString();
    const to = formData.get('To')?.toString();
    const body = formData.get('Body')?.toString() || '';
    const messageSid = formData.get('MessageSid')?.toString();
    const numMedia = parseInt(formData.get('NumMedia')?.toString() || '0', 10);

    console.log('[twilio-inbound-sms] Inbound message:', {
      from: from?.slice(0, 4) + '***',
      to: to?.slice(0, 4) + '***',
      bodyLength: body.length,
      messageSid,
      numMedia
    });

    // Validate required fields
    if (!from || !to) {
      console.error('[twilio-inbound-sms] Missing From or To');
      return new Response('Missing required fields', { status: 400 });
    }

    // Create service role client
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Normalize phone numbers to E.164
    const participantE164 = normalizeE164(from);
    const twilioNumberE164 = normalizeE164(to);

    // Upsert conversation - create if doesn't exist
    const { data: conversation, error: convError } = await supabase
      .from('admin_sms_conversations')
      .upsert({
        participant_e164: participantE164,
        twilio_number_e164: twilioNumberE164,
        last_message_at: new Date().toISOString(),
        last_message_preview: body.slice(0, 100),
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'participant_e164,twilio_number_e164'
      })
      .select('id, unread_count')
      .single();

    if (convError) {
      console.error('[twilio-inbound-sms] Failed to upsert conversation:', convError);
      // Try to get existing conversation
      const { data: existingConv } = await supabase
        .from('admin_sms_conversations')
        .select('id, unread_count')
        .eq('participant_e164', participantE164)
        .eq('twilio_number_e164', twilioNumberE164)
        .single();
      
      if (!existingConv) {
        console.error('[twilio-inbound-sms] Could not find or create conversation');
        return new Response('OK', { status: 200 }); // Still return 200 to Twilio
      }
      
      // Use existing conversation
      const conversationId = existingConv.id;
      
      // Insert message
      await insertMessage(supabase, conversationId, {
        from: participantE164,
        to: twilioNumberE164,
        body,
        messageSid,
        direction: 'inbound'
      });
      
      // Increment unread count
      await supabase
        .from('admin_sms_conversations')
        .update({ 
          unread_count: (existingConv.unread_count || 0) + 1,
          last_message_at: new Date().toISOString(),
          last_message_preview: body.slice(0, 100)
        })
        .eq('id', conversationId);
      
    } else if (conversation) {
      // Insert message into conversation
      await insertMessage(supabase, conversation.id, {
        from: participantE164,
        to: twilioNumberE164,
        body,
        messageSid,
        direction: 'inbound'
      });
      
      // Note: unread_count is incremented by the database trigger
    }

    console.log('[twilio-inbound-sms] Message stored successfully');

    // Return TwiML with empty response (no auto-reply)
    const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;
    return new Response(twiml, { 
      status: 200,
      headers: { 'Content-Type': 'application/xml' }
    });

  } catch (error: any) {
    console.error('[twilio-inbound-sms] Error:', error);
    // Return 200 to prevent Twilio retries
    return new Response('Error processed', { status: 200 });
  }
});

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

// Helper to insert message
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
) {
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
    console.error('[twilio-inbound-sms] Failed to insert message:', error);
  }
}
