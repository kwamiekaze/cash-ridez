// ============================================================================
// ADMIN EMAIL SENDER FOR CASHRIDEZ
// ============================================================================
//
// Secure edge function for admin-only email sending via Resend.
// Uses connect@cashridez.com as primary sender.
//
// ENDPOINT:
//   POST /functions/v1/admin-send-email
//
// REQUIRED HEADERS:
//   Authorization: Bearer <user_jwt>
//
// REQUEST BODY:
//   {
//     to: string (email address),
//     subject: string,
//     body: string (plain text or HTML),
//     firstName?: string (optional, for personalization)
//   }
//
// RESPONSE:
//   Success: { ok: true, id, senderUsed }
//   Error: { ok: false, error, code }
//
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { Resend } from "https://esm.sh/resend@4.0.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Rate limit: max sends per minute per admin
const RATE_LIMIT_SENDS_PER_MINUTE = 60;

// Email sender (connect@cashridez.com or fallback)
const PRIMARY_SENDER = "CashRidez <connect@cashridez.com>";
const FALLBACK_SENDER = "CashRidez <noreply@updates.cashridez.com>";

function errorResponse(code: string, message: string, status: number = 400) {
  console.error(`[admin-send-email] Error: ${code} - ${message}`);
  return new Response(
    JSON.stringify({ ok: false, error: message, code, status }),
    { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[admin-send-email] Function invoked');

    // Check authorization
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return errorResponse('UNAUTHORIZED', 'Authentication required.', 401);
    }

    // Create Supabase clients
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const resendApiKey = Deno.env.get('RESEND_API_KEY');

    if (!resendApiKey) {
      return errorResponse('SERVER_CONFIG_ERROR', 'Email service not configured.', 500);
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user is authenticated
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return errorResponse('UNAUTHORIZED', 'Please log in.', 401);
    }

    console.log('[admin-send-email] User authenticated:', user.id);

    // Verify user is admin
    const { data: isAdmin } = await supabase.rpc('has_role', {
      _user_id: user.id,
      _role: 'admin'
    });

    if (!isAdmin) {
      console.error('[admin-send-email] Non-admin access attempt by:', user.id);
      return errorResponse('FORBIDDEN', 'Admin access required.', 403);
    }

    console.log('[admin-send-email] Admin verified');

    // Parse request body
    let to: string;
    let subject: string;
    let body: string;
    let firstName: string | null = null;

    try {
      const requestBody = await req.json();
      to = requestBody.to?.trim();
      subject = requestBody.subject?.trim();
      body = requestBody.body?.trim();
      firstName = requestBody.firstName?.trim() || null;
    } catch {
      return errorResponse('INVALID_REQUEST', 'Invalid request format.', 400);
    }

    // Validate inputs
    if (!to) {
      return errorResponse('MISSING_RECIPIENT', 'Recipient email is required.', 400);
    }

    if (!isValidEmail(to)) {
      return errorResponse('INVALID_EMAIL', 'Invalid email address format.', 400);
    }

    if (!subject) {
      return errorResponse('MISSING_SUBJECT', 'Email subject is required.', 400);
    }

    if (!body) {
      return errorResponse('MISSING_BODY', 'Email body is required.', 400);
    }

    // Rate limiting check
    const oneMinuteAgo = new Date(Date.now() - 60000).toISOString();
    const { count: recentSendCount } = await supabaseAdmin
      .from('email_logs')
      .select('id', { count: 'exact', head: true })
      .eq('admin_user_id', user.id)
      .gte('created_at', oneMinuteAgo);

    if ((recentSendCount || 0) >= RATE_LIMIT_SENDS_PER_MINUTE) {
      return errorResponse('RATE_LIMITED', `Rate limit exceeded. Max ${RATE_LIMIT_SENDS_PER_MINUTE} sends per minute.`, 429);
    }

    // Initialize Resend
    const resend = new Resend(resendApiKey);

    // Convert plain text to HTML if needed
    const htmlBody = body.includes('<') ? body : `<pre style="font-family: sans-serif; white-space: pre-wrap;">${body}</pre>`;

    console.log('[admin-send-email] Sending email:', {
      to: to.slice(0, 3) + '***',
      subjectLength: subject.length,
      bodyLength: body.length
    });

    // Try sending with primary sender, fallback on failure
    let result: any = null;
    let senderUsed = PRIMARY_SENDER;
    let sendError: string | null = null;

    // Try primary sender first
    try {
      const response = await resend.emails.send({
        from: PRIMARY_SENDER,
        to: [to],
        subject,
        html: htmlBody,
        replyTo: 'connect@cashridez.com'
      });

      if (response.error) {
        console.error('[admin-send-email] Primary sender failed:', response.error);
        throw new Error(response.error.message || 'Primary sender failed');
      }

      result = response;
    } catch (primaryErr: any) {
      console.log('[admin-send-email] Trying fallback sender...');
      senderUsed = FALLBACK_SENDER;

      try {
        const fallbackResponse = await resend.emails.send({
          from: FALLBACK_SENDER,
          to: [to],
          subject,
          html: htmlBody,
          replyTo: 'connect@cashridez.com'
        });

        if (fallbackResponse.error) {
          throw new Error(fallbackResponse.error.message || 'Fallback sender failed');
        }

        result = fallbackResponse;
      } catch (fallbackErr: any) {
        sendError = fallbackErr.message || 'All senders failed';
      }
    }

    // Log the email send attempt
    const { error: logError } = await supabaseAdmin
      .from('email_logs')
      .insert({
        user_id: user.id,
        admin_user_id: user.id,
        email_type: 'admin_compose',
        recipient_email: to,
        subject,
        body_preview: body.slice(0, 200),
        status: sendError ? 'failed' : 'sent',
        error_message: sendError,
        resend_message_id: result?.data?.id || null,
        metadata: {
          sender_used: senderUsed,
          first_name: firstName
        }
      });

    if (logError) {
      console.error('[admin-send-email] Failed to log email:', logError);
    }

    if (sendError) {
      return new Response(
        JSON.stringify({ ok: false, error: sendError, code: 'SEND_FAILED' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[admin-send-email] Email sent successfully:', result?.data?.id);

    return new Response(
      JSON.stringify({
        ok: true,
        id: result?.data?.id,
        senderUsed
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[admin-send-email] Unexpected error:', error);
    return errorResponse('INTERNAL_ERROR', 'An unexpected error occurred.', 500);
  }
});
