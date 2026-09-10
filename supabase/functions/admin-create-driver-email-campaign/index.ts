// ============================================================================
// ADMIN "RECENT DRIVERS" EMAIL CAMPAIGN CREATOR
// ============================================================================
//
// Admin-only. Selects the most recently active drivers SERVER-SIDE and creates
// an admin_email_campaigns row plus its recipient rows. The browser never
// supplies recipient email addresses.
//
// ENDPOINT: POST /functions/v1/admin-create-driver-email-campaign
// HEADERS:  Authorization: Bearer <user_jwt>
// BODY:     { limit: 10|20|30|50, subject: string, body: string,
//             name?: string, preview?: boolean }
//
// preview: true performs selection only and sends no email.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import {
  CAMPAIGN_SENDER,
  DEFAULT_THROTTLE_SECONDS,
  computeIdempotencyKey,
  dedupeByEmail,
  estimateCompletionSeconds,
  isValidAudienceSize,
  renderTemplate,
  validateTemplates,
} from "../_shared/email-campaign-core.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function errorResponse(code: string, message: string, status = 400) {
  console.error(`[admin-create-driver-email-campaign] ${code} - ${message}`);
  return new Response(
    JSON.stringify({ ok: false, error: message, code }),
    { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return errorResponse('UNAUTHORIZED', 'Authentication required.', 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return errorResponse('UNAUTHORIZED', 'Please log in.', 401);

    const { data: isAdmin } = await supabase.rpc('has_role', { _user_id: user.id, _role: 'admin' });
    if (!isAdmin) return errorResponse('FORBIDDEN', 'Admin access required.', 403);

    let payload: Record<string, unknown>;
    try {
      payload = await req.json();
    } catch {
      return errorResponse('INVALID_REQUEST', 'Invalid request format.', 400);
    }

    const limit = typeof payload.limit === 'number' ? payload.limit : Number(payload.limit);
    if (!isValidAudienceSize(limit)) {
      return errorResponse('INVALID_LIMIT', 'Audience size must be exactly 10, 20, 30, or 50.', 400);
    }

    const subject = typeof payload.subject === 'string' ? payload.subject.trim() : '';
    const body = typeof payload.body === 'string' ? payload.body.trim() : '';
    const templateCheck = validateTemplates(subject, body);
    if (!templateCheck.ok) {
      return errorResponse('INVALID_TEMPLATE', templateCheck.error ?? 'Invalid template.', 400);
    }

    const preview = payload.preview === true;
    const campaignName = typeof payload.name === 'string' && payload.name.trim()
      ? payload.name.trim().slice(0, 120)
      : `Recent Drivers (${limit})`;

    // --- Server-side recipient selection -----------------------------------
    const { data: candidates, error: selectError } = await supabaseAdmin
      .rpc('select_recent_active_drivers', { p_limit: limit });

    if (selectError) {
      console.error('[admin-create-driver-email-campaign] selection failed:', selectError);
      return errorResponse('SELECTION_FAILED', 'Could not load recent drivers.', 500);
    }

    const recipients = dedupeByEmail((candidates ?? []) as any[]).slice(0, limit);

    if (preview) {
      return new Response(
        JSON.stringify({
          ok: true,
          preview: true,
          requested: limit,
          eligible_count: recipients.length,
          sender: CAMPAIGN_SENDER,
          throttle_seconds: DEFAULT_THROTTLE_SECONDS,
          estimated_seconds: estimateCompletionSeconds(recipients.length, DEFAULT_THROTTLE_SECONDS),
          sample: recipients.slice(0, 5).map((r) => ({
            first_name: r.first_name ?? null,
            email_masked: `${r.email.slice(0, 2)}***@${r.email.split('@')[1] ?? ''}`,
            last_active_at: r.last_active_at ?? null,
          })),
          example_subject: renderTemplate(subject, recipients[0]?.first_name ?? null),
          example_body: renderTemplate(body, recipients[0]?.first_name ?? null),
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (recipients.length === 0) {
      return errorResponse('NO_RECIPIENTS', 'No eligible recent drivers were found.', 400);
    }

    // --- Create campaign ----------------------------------------------------
    const { data: campaign, error: campaignError } = await supabaseAdmin
      .from('admin_email_campaigns')
      .insert({
        created_by: user.id,
        name: campaignName,
        sender: CAMPAIGN_SENDER,
        subject_template: subject,
        body_template: body,
        status: 'running',
        total_recipients: recipients.length,
        queued_count: recipients.length,
        sent_count: 0,
        failed_count: 0,
        throttle_seconds: DEFAULT_THROTTLE_SECONDS,
        next_send_at: new Date().toISOString(),
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (campaignError || !campaign) {
      console.error('[admin-create-driver-email-campaign] campaign insert failed:', campaignError);
      return errorResponse('CREATE_FAILED', 'Could not create the campaign.', 500);
    }

    const rows = recipients.map((r) => ({
      campaign_id: campaign.id,
      raw_line: null,
      first_name: r.first_name ?? null,
      email: r.email,
      subject_rendered: renderTemplate(subject, r.first_name ?? null),
      body_rendered: renderTemplate(body, r.first_name ?? null),
      status: 'queued',
    }));

    const { data: insertedRows, error: recipientError } = await supabaseAdmin
      .from('admin_email_campaign_recipients')
      .insert(rows)
      .select('id');

    if (recipientError) {
      console.error('[admin-create-driver-email-campaign] recipient insert failed:', recipientError);
      await supabaseAdmin
        .from('admin_email_campaigns')
        .update({ status: 'cancelled', last_error: 'Recipient insert failed', finished_at: new Date().toISOString() })
        .eq('id', campaign.id);
      return errorResponse('CREATE_FAILED', 'Could not queue recipients.', 500);
    }

    // Deterministic idempotency key per recipient row.
    for (const row of insertedRows ?? []) {
      await supabaseAdmin
        .from('admin_email_campaign_recipients')
        .update({ idempotency_key: computeIdempotencyKey(campaign.id, row.id) })
        .eq('id', row.id);
    }

    // Immediate first runner trigger (cron keeps later batches going).
    // Kept off the response path: waitUntil lets the batch run after we reply.
    const triggerRunner = fetch(`${supabaseUrl}/functions/v1/admin-bulk-email-runner`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseServiceKey}` },
      body: JSON.stringify({ campaign_id: campaign.id }),
    })
      .then(() => console.log('[admin-create-driver-email-campaign] runner triggered for', campaign.id))
      .catch((err) => console.error('[admin-create-driver-email-campaign] runner trigger failed:', err));

    const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
    if (typeof runtime?.waitUntil === 'function') {
      runtime.waitUntil(triggerRunner);
    } else {
      // Fallback: await the dispatch so the request is at least sent before we return.
      await triggerRunner;
    }

    return new Response(
      JSON.stringify({
        ok: true,
        campaign_id: campaign.id,
        campaign,
        eligible_count: recipients.length,
        requested: limit,
        throttle_seconds: DEFAULT_THROTTLE_SECONDS,
        estimated_seconds: estimateCompletionSeconds(recipients.length, DEFAULT_THROTTLE_SECONDS),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('[admin-create-driver-email-campaign] Unexpected error:', error);
    return errorResponse('INTERNAL_ERROR', 'An unexpected error occurred.', 500);
  }
});
