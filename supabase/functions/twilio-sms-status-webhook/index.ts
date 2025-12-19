// ============================================================================
// TWILIO SMS STATUS WEBHOOK FOR CASHRIDEZ
// ============================================================================
//
// Receives delivery status updates from Twilio and updates admin_sms_logs.
//
// ENDPOINT:
//   POST /functions/v1/twilio-sms-status-webhook
//
// Expected form data from Twilio:
//   - MessageSid: string
//   - MessageStatus: queued|sending|sent|delivered|undelivered|failed
//   - ErrorCode: string (optional)
//   - ErrorMessage: string (optional)
//
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[twilio-sms-status-webhook] Webhook received');

    // Parse form data from Twilio
    const formData = await req.formData();
    const messageSid = formData.get('MessageSid')?.toString();
    const messageStatus = formData.get('MessageStatus')?.toString();
    const errorCode = formData.get('ErrorCode')?.toString();
    const errorMessage = formData.get('ErrorMessage')?.toString();

    console.log('[twilio-sms-status-webhook] Status update:', {
      messageSid,
      messageStatus,
      errorCode: errorCode || 'none',
    });

    if (!messageSid) {
      console.error('[twilio-sms-status-webhook] Missing MessageSid');
      return new Response('Missing MessageSid', { status: 400 });
    }

    // Create service role client for updating logs
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Build update object for logs
    const updateData: Record<string, any> = {
      twilio_status: messageStatus,
    };

    // Add error info if present
    if (errorCode || errorMessage) {
      updateData.error_message = errorMessage || `Error code: ${errorCode}`;
      updateData.metadata = {
        error_code: errorCode,
        error_message: errorMessage,
        updated_at: new Date().toISOString()
      };
    }

    // Update the audit log entry
    const { data, error } = await supabase
      .from('admin_sms_logs')
      .update(updateData)
      .eq('twilio_message_sid', messageSid)
      .select('id')
      .single();

    if (error) {
      console.error('[twilio-sms-status-webhook] Logs update failed:', error);
    } else {
      console.log('[twilio-sms-status-webhook] Log updated:', data?.id);
    }

    // Also update the conversation message status
    const msgUpdateData: Record<string, any> = {
      status: messageStatus,
    };
    if (errorCode) {
      msgUpdateData.error_code = errorCode;
    }
    if (errorMessage) {
      msgUpdateData.error_message = errorMessage;
    }

    const { error: msgError } = await supabase
      .from('admin_sms_messages')
      .update(msgUpdateData)
      .eq('twilio_message_sid', messageSid);

    if (msgError) {
      console.error('[twilio-sms-status-webhook] Message update failed:', msgError);
    } else {
      console.log('[twilio-sms-status-webhook] Message status updated');
    }

    // Return 200 to acknowledge receipt (Twilio expects this)
    return new Response('OK', { 
      status: 200,
      headers: { 'Content-Type': 'text/plain' }
    });

  } catch (error: any) {
    console.error('[twilio-sms-status-webhook] Error:', error);
    // Return 200 anyway to prevent Twilio retries
    return new Response('Error processed', { status: 200 });
  }
});
