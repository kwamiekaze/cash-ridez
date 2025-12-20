// ============================================================================
// BULK SMS WORKER FOR CASHRIDEZ
// ============================================================================
// Processes queued SMS recipients from running campaigns.
// - Uses atomic row locking to prevent double-sends
// - Logs each run to admin_sms_worker_runs for observability
// - Respects throttle_seconds per campaign (default 61)
// - Updates campaign.last_run_at on every execution
// - Creates conversations and messages so they appear in the Inbox
// - Creates admin notifications when campaigns complete
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DEFAULT_THROTTLE_SECONDS = 61;
const LOCK_TIMEOUT_SECONDS = 300; // 5 minutes - stale locks get reclaimed
const MAX_BATCH_PER_CAMPAIGN = 3; // Process up to 3 recipients per campaign per run if behind

interface Campaign {
  id: string;
  name: string | null;
  sender: string;
  opt_out_footer_enabled: boolean;
  opt_out_footer_text: string;
  total_recipients: number;
  queued_count: number;
  sent_count: number;
  failed_count: number;
  skipped_count: number;
  next_send_at: string | null;
  throttle_seconds: number | null;
  last_run_at: string | null;
}

interface Recipient {
  id: string;
  campaign_id: string;
  phone_e164: string;
  first_name: string | null;
  message_rendered: string;
  status: string;
  locked_at: string | null;
  lock_id: string | null;
  attempt_count: number;
}

function errorResponse(code: string, message: string, status: number = 400) {
  console.error(`[bulk-sms-worker] Error: ${code} - ${message}`);
  return new Response(
    JSON.stringify({ ok: false, error: message, code }),
    { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

// Generate UUID for locking
function generateUUID(): string {
  return crypto.randomUUID();
}

// Upsert conversation and return conversation_id
async function upsertConversation(
  supabase: any,
  participantE164: string,
  twilioNumberE164: string,
  firstName: string | null,
  messagePreview: string
): Promise<string | null> {
  try {
    const { data: existing } = await supabase
      .from('admin_sms_conversations')
      .select('id')
      .eq('participant_e164', participantE164)
      .eq('twilio_number_e164', twilioNumberE164)
      .maybeSingle();

    if (existing) {
      await supabase
        .from('admin_sms_conversations')
        .update({
          last_message_at: new Date().toISOString(),
          last_message_preview: messagePreview.slice(0, 100),
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id);
      
      return existing.id;
    }

    const { data: newConv, error } = await supabase
      .from('admin_sms_conversations')
      .insert({
        participant_e164: participantE164,
        twilio_number_e164: twilioNumberE164,
        last_message_at: new Date().toISOString(),
        last_message_preview: messagePreview.slice(0, 100),
        unread_count: 0
      })
      .select('id')
      .single();

    if (error) {
      console.error('[bulk-sms-worker] Failed to create conversation:', error);
      return null;
    }

    return newConv.id;
  } catch (err: any) {
    console.error('[bulk-sms-worker] upsertConversation error:', err);
    return null;
  }
}

// Insert outbound message into admin_sms_messages
async function insertOutboundMessage(
  supabase: any,
  conversationId: string,
  fromE164: string,
  toE164: string,
  body: string,
  twilioSid: string | null,
  status: string
): Promise<void> {
  try {
    await supabase
      .from('admin_sms_messages')
      .insert({
        conversation_id: conversationId,
        direction: 'outbound',
        from_e164: fromE164,
        to_e164: toE164,
        body,
        twilio_message_sid: twilioSid,
        status,
        created_at: new Date().toISOString()
      });
  } catch (err: any) {
    console.error('[bulk-sms-worker] insertOutboundMessage error:', err);
  }
}

// Create admin notifications when campaign completes
async function notifyAdminsOfCampaignComplete(
  supabase: any,
  campaign: Campaign,
  finalStatus: string,
  completedAt: string
): Promise<void> {
  try {
    const { data: existingNotif } = await supabase
      .from('notifications')
      .select('id')
      .eq('type', 'campaign_complete')
      .ilike('link', `%campaign=${campaign.id}%`)
      .limit(1);

    if (existingNotif && existingNotif.length > 0) {
      console.log(`[bulk-sms-worker] Campaign ${campaign.id} notification already sent`);
      return;
    }

    const { data: adminSettings } = await supabase
      .from('admin_notification_settings')
      .select('admin_id')
      .eq('campaign_complete_enabled', true);

    if (!adminSettings || adminSettings.length === 0) {
      console.log('[bulk-sms-worker] No admins with campaign_complete_enabled');
      return;
    }

    const adminIds = adminSettings.map((s: any) => s.admin_id);
    const { data: adminRoles } = await supabase
      .from('user_roles')
      .select('user_id')
      .in('user_id', adminIds)
      .eq('role', 'admin');

    const verifiedAdminIds = adminRoles?.map((r: any) => r.user_id) || [];
    
    if (verifiedAdminIds.length === 0) {
      return;
    }

    const { data: counts } = await supabase
      .from('admin_sms_campaign_recipients')
      .select('status')
      .eq('campaign_id', campaign.id);

    const statusCounts = (counts || []).reduce((acc: any, r: any) => {
      acc[r.status] = (acc[r.status] || 0) + 1;
      return acc;
    }, {});

    const sentCount = statusCounts.sent || 0;
    const failedCount = statusCounts.failed || 0;
    const totalCount = campaign.total_recipients || 0;
    const campaignName = campaign.name || `Campaign ${campaign.id.slice(0, 8)}`;

    const notifications = verifiedAdminIds.map((adminId: string) => ({
      user_id: adminId,
      type: 'campaign_complete',
      title: `Campaign Complete: ${campaignName}`,
      message: `Sent ${sentCount}/${totalCount}. Failed ${failedCount}. Status: ${finalStatus}.`,
      link: `/admin/sms?tab=auto-text&campaign=${campaign.id}`,
      read: false,
      created_at: completedAt
    }));

    await supabase
      .from('notifications')
      .insert(notifications);

    console.log(`[bulk-sms-worker] Created ${notifications.length} admin notification(s) for campaign complete`);
  } catch (err: any) {
    console.error('[bulk-sms-worker] notifyAdminsOfCampaignComplete error:', err);
  }
}

async function sendSingleSms(
  twilioAccountSid: string,
  twilioAuthToken: string,
  twilioMessagingServiceSid: string | undefined,
  twilioPhoneNumber: string | undefined,
  to: string,
  body: string,
  supabaseUrl: string
): Promise<{ ok: boolean; sid?: string; error?: string; status?: string; fromNumber?: string }> {
  const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`;
  const authString = btoa(`${twilioAccountSid}:${twilioAuthToken}`);

  const formParams = new URLSearchParams();
  formParams.append('To', to);
  formParams.append('Body', body);
  
  let fromNumber = twilioPhoneNumber;
  
  if (twilioMessagingServiceSid) {
    formParams.append('MessagingServiceSid', twilioMessagingServiceSid);
    fromNumber = twilioPhoneNumber || '+16789288816';
  } else if (twilioPhoneNumber) {
    formParams.append('From', twilioPhoneNumber);
  } else {
    return { ok: false, error: 'No sender configured' };
  }

  const statusCallbackUrl = `${supabaseUrl}/functions/v1/twilio-sms-status-webhook`;
  formParams.append('StatusCallback', statusCallbackUrl);

  try {
    const response = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${authString}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formParams.toString(),
    });

    const twilioResponse = await response.json();

    if (!response.ok) {
      return { 
        ok: false, 
        error: twilioResponse.message || 'Twilio error',
        status: 'failed'
      };
    }

    return { 
      ok: true, 
      sid: twilioResponse.sid,
      status: twilioResponse.status || 'queued',
      fromNumber: twilioResponse.from || fromNumber
    };
  } catch (err: any) {
    return { ok: false, error: err.message || 'Network error' };
  }
}

// Atomically claim a recipient using RPC function with FOR UPDATE SKIP LOCKED
// This prevents the bug where UPDATE...LIMIT updates ALL rows then returns 1
async function claimRecipient(
  supabase: any, 
  campaignId: string,
  lockId: string
): Promise<Recipient | null> {
  // Use the RPC function for proper atomic claiming
  const { data, error } = await supabase
    .rpc('claim_sms_recipient', {
      p_campaign_id: campaignId,
      p_lock_id: lockId,
      p_stale_threshold: '5 minutes'
    });

  if (error) {
    console.error('[bulk-sms-worker] claimRecipient RPC error:', error);
    return null;
  }

  return data && data.length > 0 ? data[0] : null;
}

// Update campaign counts and next_send_at
async function updateCampaignAfterSend(
  supabase: any, 
  campaignId: string, 
  throttleSeconds: number
) {
  const now = new Date();
  const nextSendAt = new Date(now.getTime() + throttleSeconds * 1000);

  const { data: counts } = await supabase
    .from('admin_sms_campaign_recipients')
    .select('status')
    .eq('campaign_id', campaignId);

  if (counts) {
    const statusCounts = counts.reduce((acc: any, r: any) => {
      acc[r.status] = (acc[r.status] || 0) + 1;
      return acc;
    }, {});

    await supabase
      .from('admin_sms_campaigns')
      .update({
        queued_count: statusCounts.queued || 0,
        sent_count: statusCounts.sent || 0,
        failed_count: statusCounts.failed || 0,
        skipped_count: statusCounts.skipped || 0,
        next_send_at: nextSendAt.toISOString(),
        last_run_at: now.toISOString()
      })
      .eq('id', campaignId);
  }
}

// Log worker run
async function logWorkerRun(
  supabase: any,
  source: string,
  campaignIds: string[],
  recipientCount: number,
  durationMs: number,
  errors: any[] | null
) {
  try {
    await supabase
      .from('admin_sms_worker_runs')
      .insert({
        source,
        processed_campaign_ids: campaignIds,
        processed_recipients_count: recipientCount,
        duration_ms: durationMs,
        errors: errors && errors.length > 0 ? errors : null
      });
  } catch (err: any) {
    console.error('[bulk-sms-worker] Failed to log worker run:', err);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  console.log('[bulk-sms-worker] Function invoked');

  // Parse source (cron or manual)
  let source = 'cron';
  try {
    const body = await req.json();
    if (body.source) source = body.source;
  } catch {
    // No body is OK
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const twilioMessagingServiceSid = Deno.env.get('TWILIO_MESSAGING_SERVICE_SID');
    const twilioPhoneNumber = Deno.env.get('TWILIO_PHONE_NUMBER') || '+16789288816';

    if (!twilioAccountSid || !twilioAuthToken) {
      return errorResponse('CONFIG_ERROR', 'Twilio credentials not configured', 500);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const now = new Date();
    const nowIso = now.toISOString();
    
    // Find campaigns that are running AND ready to send
    const { data: campaigns, error: campaignError } = await supabase
      .from('admin_sms_campaigns')
      .select('*')
      .eq('status', 'running')
      .or(`next_send_at.is.null,next_send_at.lte.${nowIso}`)
      .order('next_send_at', { ascending: true, nullsFirst: true });

    console.log(`[bulk-sms-worker] Found ${campaigns?.length || 0} campaigns ready, now=${nowIso}`);

    if (campaignError) {
      console.error('[bulk-sms-worker] Failed to fetch campaigns:', campaignError);
      return errorResponse('DB_ERROR', 'Failed to fetch campaigns', 500);
    }

    if (!campaigns || campaigns.length === 0) {
      console.log('[bulk-sms-worker] No campaigns ready to send');
      
      // Still log this run
      await logWorkerRun(supabase, source, [], 0, Date.now() - startTime, null);
      
      return new Response(
        JSON.stringify({ ok: true, processed: 0, message: 'No campaigns ready' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let totalProcessed = 0;
    let totalSent = 0;
    let totalFailed = 0;
    let totalSkipped = 0;
    const processedCampaignIds: string[] = [];
    const errors: any[] = [];

    // Process each ready campaign
    for (const campaign of campaigns as Campaign[]) {
      console.log(`[bulk-sms-worker] Processing campaign ${campaign.id}`);
      processedCampaignIds.push(campaign.id);

      const throttleSeconds = campaign.throttle_seconds ?? DEFAULT_THROTTLE_SECONDS;

      // Check how many we can send this run (catch-up logic)
      // If next_send_at is far in the past, we might be behind - process up to MAX_BATCH
      let batchSize = 1;
      if (campaign.next_send_at) {
        const scheduledTime = new Date(campaign.next_send_at);
        const delayMs = now.getTime() - scheduledTime.getTime();
        if (delayMs > throttleSeconds * 1000) {
          // We're behind - calculate how many sends we missed
          const missedSends = Math.floor(delayMs / (throttleSeconds * 1000));
          batchSize = Math.min(missedSends + 1, MAX_BATCH_PER_CAMPAIGN);
          console.log(`[bulk-sms-worker] Campaign ${campaign.id} is behind by ${missedSends} sends, processing batch of ${batchSize}`);
        }
      }

      let sentThisCampaign = 0;

      for (let i = 0; i < batchSize; i++) {
        const lockId = generateUUID();
        
        // Atomically claim a recipient
        const recipient = await claimRecipient(supabase, campaign.id, lockId);

        if (!recipient) {
          // No more queued recipients - check if campaign should complete
          const { count: queuedCount } = await supabase
            .from('admin_sms_campaign_recipients')
            .select('*', { count: 'exact', head: true })
            .eq('campaign_id', campaign.id)
            .eq('status', 'queued');

          if (queuedCount === 0) {
            const completedAt = nowIso;
            await supabase
              .from('admin_sms_campaigns')
              .update({
                status: 'completed',
                finished_at: completedAt,
                last_run_at: nowIso
              })
              .eq('id', campaign.id);
            
            console.log(`[bulk-sms-worker] Campaign ${campaign.id} completed`);
            await notifyAdminsOfCampaignComplete(supabase, campaign, 'completed', completedAt);
          } else {
            console.log(`[bulk-sms-worker] Campaign ${campaign.id}: ${queuedCount} queued but none claimed`);
          }
          break; // Move to next campaign
        }

        // Check if phone is opted out
        const { data: optOut } = await supabase
          .from('admin_sms_opt_outs')
          .select('id')
          .eq('phone_e164', recipient.phone_e164)
          .maybeSingle();

        if (optOut) {
          // Skip opted-out recipient
          await supabase
            .from('admin_sms_campaign_recipients')
            .update({
              status: 'skipped',
              error: 'Opted out',
              last_error: 'Opted out',
              locked_at: null,
              lock_id: null
            })
            .eq('id', recipient.id);

          totalSkipped++;
          totalProcessed++;
          console.log(`[bulk-sms-worker] Skipped opted-out ${recipient.phone_e164}`);
          continue;
        }

        // Upsert conversation
        const conversationId = await upsertConversation(
          supabase,
          recipient.phone_e164,
          twilioPhoneNumber,
          recipient.first_name,
          recipient.message_rendered
        );

        // Send SMS
        const result = await sendSingleSms(
          twilioAccountSid,
          twilioAuthToken,
          twilioMessagingServiceSid,
          twilioPhoneNumber,
          recipient.phone_e164,
          recipient.message_rendered,
          supabaseUrl
        );

        if (result.ok) {
          await supabase
            .from('admin_sms_campaign_recipients')
            .update({
              status: 'sent',
              twilio_sid: result.sid,
              sent_at: nowIso,
              locked_at: null,
              lock_id: null,
              attempt_count: (recipient.attempt_count || 0) + 1
            })
            .eq('id', recipient.id);

          if (conversationId) {
            await insertOutboundMessage(
              supabase,
              conversationId,
              result.fromNumber || twilioPhoneNumber,
              recipient.phone_e164,
              recipient.message_rendered,
              result.sid || null,
              result.status || 'sent'
            );
          }

          console.log(`[bulk-sms-worker] Sent to ${recipient.phone_e164}, SID: ${result.sid}`);
          totalSent++;
          sentThisCampaign++;
        } else {
          await supabase
            .from('admin_sms_campaign_recipients')
            .update({
              status: 'failed',
              error: result.error,
              last_error: result.error,
              locked_at: null,
              lock_id: null,
              attempt_count: (recipient.attempt_count || 0) + 1
            })
            .eq('id', recipient.id);

          if (conversationId) {
            await insertOutboundMessage(
              supabase,
              conversationId,
              twilioPhoneNumber,
              recipient.phone_e164,
              recipient.message_rendered,
              null,
              'failed'
            );
          }

          console.log(`[bulk-sms-worker] Failed to send to ${recipient.phone_e164}: ${result.error}`);
          totalFailed++;
          errors.push({ campaign_id: campaign.id, phone: recipient.phone_e164, error: result.error });
        }

        totalProcessed++;
      }

      // Update campaign counts and next_send_at
      await updateCampaignAfterSend(supabase, campaign.id, throttleSeconds);
    }

    const elapsed = Date.now() - startTime;
    console.log(`[bulk-sms-worker] Completed in ${elapsed}ms. Processed: ${totalProcessed}, Sent: ${totalSent}, Failed: ${totalFailed}, Skipped: ${totalSkipped}`);

    // Log this worker run
    await logWorkerRun(
      supabase, 
      source, 
      processedCampaignIds, 
      totalProcessed, 
      elapsed, 
      errors.length > 0 ? errors : null
    );

    return new Response(
      JSON.stringify({
        ok: true,
        processed: totalProcessed,
        sent: totalSent,
        failed: totalFailed,
        skipped: totalSkipped,
        elapsed_ms: elapsed
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[bulk-sms-worker] Unexpected error:', error);
    return errorResponse('INTERNAL_ERROR', error.message || 'Unexpected error', 500);
  }
});
