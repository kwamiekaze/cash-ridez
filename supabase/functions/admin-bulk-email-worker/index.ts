// ============================================================================
// ADMIN BULK EMAIL WORKER FOR CASHRIDEZ
// ============================================================================
//
// Processes queued email campaign recipients.
//  - at most MAX_RECIPIENTS_PER_RUN recipients per run
//  - one at a time, >= throttle_seconds between Resend requests
//  - respects campaign.next_send_at
//  - deterministic Idempotency-Key per recipient (retries cannot duplicate)
//  - 429 / 5xx put the recipient back in the queue and honour Retry-After
//  - campaign counters are recalculated from recipient rows
//  - a campaign completes only when no queued/sending recipients remain
//
// ENDPOINT: POST /functions/v1/admin-bulk-email-worker
// BODY:     { campaign_id?: string }
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import {
  DEFAULT_THROTTLE_SECONDS,
  MAX_RECIPIENTS_PER_RUN,
  computeCampaignCounts,
  computeIdempotencyKey,
  isRateLimited,
  parseRetryAfterMs,
} from "../_shared/email-campaign-core.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PRIMARY_SENDER = "CashRidez <connect@cashridez.com>";
const FALLBACK_SENDER = "CashRidez <noreply@updates.cashridez.com>";
const STALE_SENDING_MINUTES = 5;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface SendOutcome {
  ok: boolean;
  messageId: string | null;
  senderUsed: string;
  error: string | null;
  rateLimited: boolean;
  retryAfterMs: number;
}

async function sendViaResend(
  apiKey: string,
  from: string,
  to: string,
  subject: string,
  html: string,
  idempotencyKey: string,
): Promise<{ status: number; id: string | null; error: string | null; retryAfter: string | null }> {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify({ from, to: [to], subject, html, reply_to: 'connect@cashridez.com' }),
  });

  const retryAfter = response.headers.get('retry-after');
  let json: any = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }

  if (!response.ok) {
    return {
      status: response.status,
      id: null,
      error: json?.message || json?.error?.message || `Resend returned ${response.status}`,
      retryAfter,
    };
  }

  return { status: response.status, id: json?.id ?? null, error: null, retryAfter };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  console.log('[admin-bulk-email-worker] Starting worker run');

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const resendApiKey = Deno.env.get('RESEND_API_KEY');

    if (!resendApiKey) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Email service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let targetCampaignId: string | null = null;
    try {
      const body = await req.json();
      targetCampaignId = body?.campaign_id || null;
    } catch {
      // no body is fine
    }

    const nowIso = new Date().toISOString();
    let campaignsQuery = supabase
      .from('admin_email_campaigns')
      .select('*')
      .eq('status', 'running')
      .or(`next_send_at.is.null,next_send_at.lte.${nowIso}`)
      .order('created_at', { ascending: true });

    if (targetCampaignId) campaignsQuery = campaignsQuery.eq('id', targetCampaignId);

    const { data: campaigns, error: campaignsError } = await campaignsQuery;
    if (campaignsError) throw campaignsError;

    if (!campaigns || campaigns.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, processed: 0, message: 'No campaigns due' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const lockId = crypto.randomUUID();
    let totalProcessed = 0;
    const processedCampaignIds: string[] = [];
    const errors: any[] = [];

    for (const campaign of campaigns) {
      if (totalProcessed >= MAX_RECIPIENTS_PER_RUN) break;

      processedCampaignIds.push(campaign.id);
      const throttleSeconds = Math.max(1, campaign.throttle_seconds || DEFAULT_THROTTLE_SECONDS);
      const throttleMs = throttleSeconds * 1000;

      // Recover rows stuck in "sending" from a crashed run.
      const staleCutoff = new Date(Date.now() - STALE_SENDING_MINUTES * 60_000).toISOString();
      await supabase
        .from('admin_email_campaign_recipients')
        .update({ status: 'queued', locked_at: null, lock_id: null })
        .eq('campaign_id', campaign.id)
        .eq('status', 'sending')
        .lt('last_attempt_at', staleCutoff);

      let campaignProcessed = 0;
      let backoffMs = 0;

      while (totalProcessed < MAX_RECIPIENTS_PER_RUN) {
        const { data: claimed, error: claimError } = await supabase
          .rpc('claim_email_recipient', { p_campaign_id: campaign.id, p_lock_id: lockId });

        if (claimError) {
          errors.push({ campaign_id: campaign.id, error: claimError.message });
          break;
        }
        if (!claimed || claimed.length === 0) break;

        const recipient = claimed[0];

        // Honour a per-recipient backoff set by an earlier rate-limited attempt.
        if (recipient.retry_after && new Date(recipient.retry_after).getTime() > Date.now()) {
          await supabase
            .from('admin_email_campaign_recipients')
            .update({ status: 'queued', locked_at: null, lock_id: null })
            .eq('id', recipient.id);
          backoffMs = Math.max(backoffMs, new Date(recipient.retry_after).getTime() - Date.now());
          break;
        }

        const idempotencyKey = recipient.idempotency_key
          || computeIdempotencyKey(campaign.id, recipient.id);

        await supabase
          .from('admin_email_campaign_recipients')
          .update({
            status: 'sending',
            idempotency_key: idempotencyKey,
            last_attempt_at: new Date().toISOString(),
          })
          .eq('id', recipient.id);

        // Throttle: at least throttleSeconds between two Resend requests.
        if (campaignProcessed > 0 || totalProcessed > 0) {
          await sleep(throttleMs);
        }

        const htmlBody = recipient.body_rendered.includes('<')
          ? recipient.body_rendered
          : `<pre style="font-family: sans-serif; white-space: pre-wrap;">${recipient.body_rendered}</pre>`;

        const outcome: SendOutcome = {
          ok: false, messageId: null, senderUsed: PRIMARY_SENDER,
          error: null, rateLimited: false, retryAfterMs: 0,
        };

        const primary = await sendViaResend(
          resendApiKey, PRIMARY_SENDER, recipient.email,
          recipient.subject_rendered, htmlBody, idempotencyKey,
        );

        if (!primary.error) {
          outcome.ok = true;
          outcome.messageId = primary.id;
        } else if (isRateLimited(primary.status, primary.error)) {
          outcome.rateLimited = true;
          outcome.error = primary.error;
          outcome.retryAfterMs = parseRetryAfterMs(primary.retryAfter, (recipient.attempt_count ?? 0) + 1);
        } else {
          // Hard failure on the primary identity: try the fallback domain once.
          const fallback = await sendViaResend(
            resendApiKey, FALLBACK_SENDER, recipient.email,
            recipient.subject_rendered, htmlBody,
            computeIdempotencyKey(campaign.id, recipient.id, 'fallback'),
          );
          outcome.senderUsed = FALLBACK_SENDER;
          if (!fallback.error) {
            outcome.ok = true;
            outcome.messageId = fallback.id;
          } else if (isRateLimited(fallback.status, fallback.error)) {
            outcome.rateLimited = true;
            outcome.error = fallback.error;
            outcome.retryAfterMs = parseRetryAfterMs(fallback.retryAfter, (recipient.attempt_count ?? 0) + 1);
          } else {
            outcome.error = fallback.error;
          }
        }

        const attemptCount = (recipient.attempt_count ?? 0) + 1;

        if (outcome.rateLimited) {
          // Return the recipient to the queue; do NOT mark it failed.
          const retryAt = new Date(Date.now() + outcome.retryAfterMs).toISOString();
          await supabase
            .from('admin_email_campaign_recipients')
            .update({
              status: 'queued',
              locked_at: null,
              lock_id: null,
              attempt_count: attemptCount,
              last_attempt_at: new Date().toISOString(),
              last_error: outcome.error,
              retry_after: retryAt,
            })
            .eq('id', recipient.id);

          backoffMs = Math.max(backoffMs, outcome.retryAfterMs);
          console.warn(`[admin-bulk-email-worker] Rate limited; requeued recipient ${recipient.id}`);
          break;
        }

        await supabase
          .from('admin_email_campaign_recipients')
          .update({
            status: outcome.ok ? 'sent' : 'failed',
            sent_at: outcome.ok ? new Date().toISOString() : null,
            resend_message_id: outcome.messageId,
            error: outcome.ok ? null : outcome.error,
            last_error: outcome.ok ? null : outcome.error,
            attempt_count: attemptCount,
            last_attempt_at: new Date().toISOString(),
            locked_at: null,
            lock_id: null,
            retry_after: null,
          })
          .eq('id', recipient.id);

        await supabase.from('email_logs').insert({
          user_id: campaign.created_by,
          admin_user_id: campaign.created_by,
          email_type: 'campaign',
          recipient_email: recipient.email,
          subject: recipient.subject_rendered,
          body_preview: recipient.body_rendered.slice(0, 200),
          status: outcome.ok ? 'sent' : 'failed',
          error_message: outcome.error,
          campaign_id: campaign.id,
          campaign_recipient_id: recipient.id,
          resend_message_id: outcome.messageId,
          metadata: { sender_used: outcome.senderUsed, first_name: recipient.first_name },
        });

        totalProcessed++;
        campaignProcessed++;
      }

      // Recalculate counters from the recipient rows (never increment).
      const { data: statusRows } = await supabase
        .from('admin_email_campaign_recipients')
        .select('status')
        .eq('campaign_id', campaign.id);

      const counts = computeCampaignCounts((statusRows ?? []) as { status: string }[]);
      const update: Record<string, unknown> = {
        total_recipients: counts.total,
        queued_count: counts.queued,
        sent_count: counts.sent,
        failed_count: counts.failed,
        skipped_count: counts.skipped,
        last_run_at: new Date().toISOString(),
      };

      if (counts.isComplete) {
        update.status = 'completed';
        update.finished_at = new Date().toISOString();
        update.next_send_at = null;
      } else {
        update.next_send_at = new Date(Date.now() + Math.max(backoffMs, throttleMs)).toISOString();
      }

      await supabase.from('admin_email_campaigns').update(update).eq('id', campaign.id);
    }

    const durationMs = Date.now() - startTime;
    await supabase.from('admin_email_worker_runs').insert({
      source: 'worker',
      processed_campaign_ids: processedCampaignIds,
      processed_recipients_count: totalProcessed,
      errors: errors.length > 0 ? errors : null,
      duration_ms: durationMs,
    });

    console.log(`[admin-bulk-email-worker] Processed ${totalProcessed} in ${durationMs}ms`);

    return new Response(
      JSON.stringify({
        ok: true,
        processed: totalProcessed,
        campaigns: processedCampaignIds,
        duration_ms: durationMs,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error: any) {
    console.error('[admin-bulk-email-worker] Unexpected error:', error);
    return new Response(
      JSON.stringify({ ok: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
