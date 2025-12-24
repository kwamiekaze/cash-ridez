// ============================================================================
// TWILIO SMS STATUS WEBHOOK FOR CASHRIDEZ
// ============================================================================
//
// Receives delivery status updates from Twilio and updates admin_sms_logs
// and admin_sms_messages.
//
// ERROR CODE REFERENCE (common ones):
//   30001 - Queue Overflow
//   30002 - Account Suspended
//   30003 - Unreachable destination handset
//   30004 - Message Blocked (carrier filtering)
//   30005 - Unknown destination handset
//   30006 - Landline or unreachable carrier
//   30007 - Carrier violation
//   30008 - Unknown error
//   30034 - Message Blocked (A2P 10DLC - carrier filtering)
//
// ENDPOINT:
//   POST /functions/v1/twilio-sms-status-webhook
//
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Human-readable error descriptions for common Twilio error codes
const ERROR_CODE_DESCRIPTIONS: Record<string, string> = {
  '30001': 'Queue Overflow - Twilio queue is full',
  '30002': 'Account Suspended',
  '30003': 'Unreachable - destination handset unavailable',
  '30004': 'Message Blocked - carrier filtering',
  '30005': 'Unknown destination handset',
  '30006': 'Landline or unreachable carrier',
  '30007': 'Carrier violation',
  '30008': 'Unknown error',
  '30034': 'A2P 10DLC Blocked - carrier filtering unregistered traffic',
  '21408': 'Permission not enabled for region',
  '21610': 'Attempt to send to unsubscribed recipient',
  '21611': 'Invalid To number',
  '21612': 'Invalid From number for SMS',
  '21614': 'To number is not SMS-capable',
  '21617': 'Message body exceeds max length',
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
    const to = formData.get('To')?.toString();
    const from = formData.get('From')?.toString();

    // Build human-readable error description
    const errorDescription = errorCode 
      ? (ERROR_CODE_DESCRIPTIONS[errorCode] || `Unknown error code: ${errorCode}`)
      : null;
    const fullErrorMessage = errorCode 
      ? `[${errorCode}] ${errorDescription}${errorMessage ? ` - ${errorMessage}` : ''}`
      : (errorMessage || null);

    console.log('[twilio-sms-status-webhook] Status update:', {
      messageSid,
      messageStatus,
      errorCode: errorCode || 'none',
      errorDescription: errorDescription || 'none',
      to: to?.slice(0, 6) + '***',
      from: from?.slice(0, 6) + '***',
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

    // Add error info if present (with human-readable description)
    if (errorCode || errorMessage) {
      updateData.error_message = fullErrorMessage;
      updateData.metadata = {
        error_code: errorCode,
        error_code_description: errorDescription,
        error_message_raw: errorMessage,
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
    if (fullErrorMessage) {
      msgUpdateData.error_message = fullErrorMessage;
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
