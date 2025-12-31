// ============================================================================
// ADMIN BULK EMAIL WORKER FOR CASHRIDEZ
// ============================================================================
//
// Processes queued email campaign recipients, similar to SMS worker.
// Called by the runner function or scheduler.
//
// ENDPOINT:
//   POST /functions/v1/admin-bulk-email-worker
//
// REQUEST BODY:
//   { campaign_id?: string }
//
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { Resend } from "https://esm.sh/resend@4.0.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Email senders
const PRIMARY_SENDER = "CashRidez <connect@cashridez.com>";
const FALLBACK_SENDER = "CashRidez <noreply@updates.cashridez.com>";

// Processing limits
const MAX_RECIPIENTS_PER_RUN = 50;
const DEFAULT_THROTTLE_MS = 2000;

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
      console.error('[admin-bulk-email-worker] RESEND_API_KEY not configured');
      return new Response(
        JSON.stringify({ ok: false, error: 'Email service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const resend = new Resend(resendApiKey);

    // Parse request
    let targetCampaignId: string | null = null;
    try {
      const body = await req.json();
      targetCampaignId = body.campaign_id || null;
    } catch {
      // No body or invalid JSON is fine
    }

    // Find running campaigns
    let campaignsQuery = supabase
      .from('admin_email_campaigns')
      .select('*')
      .eq('status', 'running')
      .order('created_at', { ascending: true });

    if (targetCampaignId) {
      campaignsQuery = campaignsQuery.eq('id', targetCampaignId);
    }

    const { data: campaigns, error: campaignsError } = await campaignsQuery;

    if (campaignsError) {
      console.error('[admin-bulk-email-worker] Failed to fetch campaigns:', campaignsError);
      throw campaignsError;
    }

    if (!campaigns || campaigns.length === 0) {
      console.log('[admin-bulk-email-worker] No running campaigns found');
      return new Response(
        JSON.stringify({ ok: true, processed: 0, message: 'No running campaigns' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const lockId = crypto.randomUUID();
    let totalProcessed = 0;
    const processedCampaignIds: string[] = [];
    const errors: any[] = [];

    // Process each campaign
    for (const campaign of campaigns) {
      console.log(`[admin-bulk-email-worker] Processing campaign ${campaign.id}: ${campaign.name || 'Unnamed'}`);
      processedCampaignIds.push(campaign.id);

      const throttleMs = (campaign.throttle_seconds || 2) * 1000;
      let campaignProcessed = 0;

      // Process recipients up to limit
      while (campaignProcessed < MAX_RECIPIENTS_PER_RUN) {
        // Claim a recipient using atomic locking
        const { data: recipients, error: claimError } = await supabase
          .rpc('claim_email_recipient', {
            p_campaign_id: campaign.id,
            p_lock_id: lockId
          });

        if (claimError) {
          console.error('[admin-bulk-email-worker] Failed to claim recipient:', claimError);
          errors.push({ campaign_id: campaign.id, error: claimError.message });
          break;
        }

        if (!recipients || recipients.length === 0) {
          console.log(`[admin-bulk-email-worker] No more queued recipients for campaign ${campaign.id}`);
          break;
        }

        const recipient = recipients[0];
        console.log(`[admin-bulk-email-worker] Processing recipient ${recipient.id}: ${recipient.email}`);

        // Send the email
        let sendResult: any = null;
        let sendError: string | null = null;
        let senderUsed = PRIMARY_SENDER;

        try {
          // Convert body to HTML if needed
          const htmlBody = recipient.body_rendered.includes('<') 
            ? recipient.body_rendered 
            : `<pre style="font-family: sans-serif; white-space: pre-wrap;">${recipient.body_rendered}</pre>`;

          // Try primary sender
          const response = await resend.emails.send({
            from: PRIMARY_SENDER,
            to: [recipient.email],
            subject: recipient.subject_rendered,
            html: htmlBody,
            replyTo: 'connect@cashridez.com'
          });

          if (response.error) {
            throw new Error(response.error.message || 'Primary sender failed');
          }

          sendResult = response;
        } catch (primaryErr: any) {
          console.log('[admin-bulk-email-worker] Primary sender failed, trying fallback');
          senderUsed = FALLBACK_SENDER;

          try {
            const htmlBody = recipient.body_rendered.includes('<') 
              ? recipient.body_rendered 
              : `<pre style="font-family: sans-serif; white-space: pre-wrap;">${recipient.body_rendered}</pre>`;

            const fallbackResponse = await resend.emails.send({
              from: FALLBACK_SENDER,
              to: [recipient.email],
              subject: recipient.subject_rendered,
              html: htmlBody,
              replyTo: 'connect@cashridez.com'
            });

            if (fallbackResponse.error) {
              throw new Error(fallbackResponse.error.message || 'Fallback sender failed');
            }

            sendResult = fallbackResponse;
          } catch (fallbackErr: any) {
            sendError = fallbackErr.message || 'All senders failed';
          }
        }

        // Update recipient status
        const updateData: any = {
          attempt_count: recipient.attempt_count + 1,
          last_attempt_at: new Date().toISOString(),
          locked_at: null,
          lock_id: null
        };

        if (sendError) {
          updateData.status = 'failed';
          updateData.error = sendError;
          updateData.last_error = sendError;
        } else {
          updateData.status = 'sent';
          updateData.sent_at = new Date().toISOString();
          updateData.resend_message_id = sendResult?.data?.id || null;
        }

        await supabase
          .from('admin_email_campaign_recipients')
          .update(updateData)
          .eq('id', recipient.id);

        // Update campaign counters
        if (sendError) {
          await supabase
            .from('admin_email_campaigns')
            .update({ 
              failed_count: (campaign.failed_count || 0) + 1,
              queued_count: Math.max(0, (campaign.queued_count || 0) - 1)
            })
            .eq('id', campaign.id);
        } else {
          await supabase
            .from('admin_email_campaigns')
            .update({ 
              sent_count: (campaign.sent_count || 0) + 1,
              queued_count: Math.max(0, (campaign.queued_count || 0) - 1),
              last_run_at: new Date().toISOString()
            })
            .eq('id', campaign.id);
        }

        // Log to email_logs table
        await supabase
          .from('email_logs')
          .insert({
            user_id: campaign.created_by,
            admin_user_id: campaign.created_by,
            email_type: 'campaign',
            recipient_email: recipient.email,
            subject: recipient.subject_rendered,
            body_preview: recipient.body_rendered.slice(0, 200),
            status: sendError ? 'failed' : 'sent',
            error_message: sendError,
            campaign_id: campaign.id,
            campaign_recipient_id: recipient.id,
            resend_message_id: sendResult?.data?.id || null,
            metadata: { sender_used: senderUsed, first_name: recipient.first_name }
          });

        totalProcessed++;
        campaignProcessed++;

        // Throttle between sends
        if (campaignProcessed < MAX_RECIPIENTS_PER_RUN) {
          await new Promise(resolve => setTimeout(resolve, throttleMs));
        }
      }

      // Check if campaign is complete
      const { count: remainingCount } = await supabase
        .from('admin_email_campaign_recipients')
        .select('id', { count: 'exact', head: true })
        .eq('campaign_id', campaign.id)
        .eq('status', 'queued');

      if (remainingCount === 0 || remainingCount === null) {
        console.log(`[admin-bulk-email-worker] Campaign ${campaign.id} completed`);
        await supabase
          .from('admin_email_campaigns')
          .update({ 
            status: 'completed',
            finished_at: new Date().toISOString()
          })
          .eq('id', campaign.id);
      }
    }

    // Log worker run
    const durationMs = Date.now() - startTime;
    await supabase
      .from('admin_email_worker_runs')
      .insert({
        source: 'worker',
        processed_campaign_ids: processedCampaignIds,
        processed_recipients_count: totalProcessed,
        errors: errors.length > 0 ? errors : null,
        duration_ms: durationMs
      });

    console.log(`[admin-bulk-email-worker] Completed. Processed ${totalProcessed} recipients in ${durationMs}ms`);

    return new Response(
      JSON.stringify({
        ok: true,
        processed: totalProcessed,
        campaigns: processedCampaignIds,
        duration_ms: durationMs,
        errors: errors.length > 0 ? errors : undefined
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[admin-bulk-email-worker] Unexpected error:', error);
    return new Response(
      JSON.stringify({ ok: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
