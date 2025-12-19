// ============================================================================
// BULK SMS WORKER FOR CASHRIDEZ
// ============================================================================
// Processes ONE queued SMS recipient per campaign per invocation.
// Enforces strict 61-second throttle per sender number.
// Called by cron every minute via admin-bulk-sms-runner.
// Creates conversations and messages so they appear in the Inbox.
// Creates admin notifications when campaigns complete.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Strict throttle: exactly 61 seconds between sends per campaign
const THROTTLE_SECONDS = 61;
const MAX_RETRIES = 3;

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
}

interface Recipient {
  id: string;
  campaign_id: string;
  phone_e164: string;
  first_name: string | null;
  message_rendered: string;
  status: string;
}

function errorResponse(code: string, message: string, status: number = 400) {
  console.error(`[bulk-sms-worker] Error: ${code} - ${message}`);
  return new Response(
    JSON.stringify({ ok: false, error: message, code }),
    { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
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
    // Check if conversation exists
    const { data: existing } = await supabase
      .from('admin_sms_conversations')
      .select('id')
      .eq('participant_e164', participantE164)
      .eq('twilio_number_e164', twilioNumberE164)
      .maybeSingle();

    if (existing) {
      // Update existing conversation
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

    // Create new conversation
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

    console.log(`[bulk-sms-worker] Created conversation ${newConv.id} for ${participantE164}`);
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
    const { error } = await supabase
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

    if (error) {
      console.error('[bulk-sms-worker] Failed to insert message:', error);
    }
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
    // Check if we already sent a notification for this campaign
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

    // Find all admins with campaign_complete_enabled
    const { data: adminSettings, error: settingsError } = await supabase
      .from('admin_notification_settings')
      .select('admin_id')
      .eq('campaign_complete_enabled', true);

    if (settingsError) {
      console.error('[bulk-sms-worker] Failed to fetch admin settings:', settingsError);
      return;
    }

    if (!adminSettings || adminSettings.length === 0) {
      console.log('[bulk-sms-worker] No admins with campaign_complete_enabled');
      return;
    }

    // Verify these are actually admins
    const adminIds = adminSettings.map((s: any) => s.admin_id);
    const { data: adminRoles } = await supabase
      .from('user_roles')
      .select('user_id')
      .in('user_id', adminIds)
      .eq('role', 'admin');

    const verifiedAdminIds = adminRoles?.map((r: any) => r.user_id) || [];
    
    if (verifiedAdminIds.length === 0) {
      console.log('[bulk-sms-worker] No verified admins found');
      return;
    }

    // Get final counts
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

    // Create notifications for each admin
    const notifications = verifiedAdminIds.map((adminId: string) => ({
      user_id: adminId,
      type: 'campaign_complete',
      title: `Campaign Complete: ${campaignName}`,
      message: `Sent ${sentCount}/${totalCount}. Failed ${failedCount}. Status: ${finalStatus}.`,
      link: `/admin/sms?tab=auto-text&campaign=${campaign.id}`,
      read: false,
      created_at: completedAt
    }));

    const { error: insertError } = await supabase
      .from('notifications')
      .insert(notifications);

    if (insertError) {
      console.error('[bulk-sms-worker] Failed to insert campaign notifications:', insertError);
    } else {
      console.log(`[bulk-sms-worker] Created ${notifications.length} admin notification(s) for campaign complete`);
    }
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

  // Add status callback
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  console.log('[bulk-sms-worker] Function invoked');

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

    // Find campaigns ready to send (status = running/queued AND next_send_at <= now)
    const now = new Date();
    const { data: campaigns, error: campaignError } = await supabase
      .from('admin_sms_campaigns')
      .select('*')
      .in('status', ['running', 'queued'])
      .lte('next_send_at', now.toISOString())
      .order('next_send_at', { ascending: true });

    if (campaignError) {
      console.error('[bulk-sms-worker] Failed to fetch campaigns:', campaignError);
      return errorResponse('DB_ERROR', 'Failed to fetch campaigns', 500);
    }

    if (!campaigns || campaigns.length === 0) {
      console.log('[bulk-sms-worker] No campaigns ready to send');
      return new Response(
        JSON.stringify({ ok: true, processed: 0, message: 'No campaigns ready' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let totalProcessed = 0;
    let totalSent = 0;
    let totalFailed = 0;
    let totalSkipped = 0;

    // Process ONE recipient from each ready campaign
    for (const campaign of campaigns as Campaign[]) {
      console.log(`[bulk-sms-worker] Processing campaign ${campaign.id}`);

      // Double-check throttle timing (idempotency)
      if (campaign.next_send_at && new Date(campaign.next_send_at) > now) {
        console.log(`[bulk-sms-worker] Campaign ${campaign.id} not ready yet`);
        continue;
      }

      // Get ONE queued recipient (oldest first)
      const { data: recipients, error: recipError } = await supabase
        .from('admin_sms_campaign_recipients')
        .select('*')
        .eq('campaign_id', campaign.id)
        .eq('status', 'queued')
        .order('created_at', { ascending: true })
        .limit(1);

      if (recipError) {
        console.error('[bulk-sms-worker] Failed to fetch recipients:', recipError);
        continue;
      }

      if (!recipients || recipients.length === 0) {
        // No more queued recipients - check if campaign should complete
        const { count: queuedCount } = await supabase
          .from('admin_sms_campaign_recipients')
          .select('*', { count: 'exact', head: true })
          .eq('campaign_id', campaign.id)
          .eq('status', 'queued');

        if (queuedCount === 0) {
          // Mark campaign as completed
          const completedAt = new Date().toISOString();
          await supabase
            .from('admin_sms_campaigns')
            .update({
              status: 'completed',
              finished_at: completedAt
            })
            .eq('id', campaign.id);
          
          console.log(`[bulk-sms-worker] Campaign ${campaign.id} completed`);
          
          // Notify admins of campaign completion
          await notifyAdminsOfCampaignComplete(supabase, campaign, 'completed', completedAt);
        }
        continue;
      }

      const recipient = recipients[0] as Recipient;

      // Check if phone is opted out
      const { data: optOut } = await supabase
        .from('admin_sms_opt_outs')
        .select('id')
        .eq('phone_e164', recipient.phone_e164)
        .maybeSingle();

      if (optOut) {
        // Skip opted-out recipient and set next_send_at for next recipient
        await supabase
          .from('admin_sms_campaign_recipients')
          .update({
            status: 'skipped',
            error: 'Opted out',
            sent_at: new Date().toISOString()
          })
          .eq('id', recipient.id);

        // Update campaign counts and next_send_at (still throttle to prevent rapid skipping)
        const nextSendAt = new Date(Date.now() + THROTTLE_SECONDS * 1000);
        await updateCampaignCounts(supabase, campaign.id, nextSendAt);
        
        totalSkipped++;
        totalProcessed++;
        continue;
      }

      // Upsert conversation for this recipient (so it appears in Inbox)
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

      // Calculate next send time (61 seconds from now)
      const nextSendAt = new Date(Date.now() + THROTTLE_SECONDS * 1000);

      if (result.ok) {
        await supabase
          .from('admin_sms_campaign_recipients')
          .update({
            status: 'sent',
            twilio_sid: result.sid,
            sent_at: new Date().toISOString()
          })
          .eq('id', recipient.id);

        // Insert outbound message into conversation
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
      } else {
        await supabase
          .from('admin_sms_campaign_recipients')
          .update({
            status: 'failed',
            error: result.error,
            sent_at: new Date().toISOString()
          })
          .eq('id', recipient.id);

        // Still insert the failed message into conversation for audit trail
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
      }

      // Update campaign counts and next_send_at
      await updateCampaignCounts(supabase, campaign.id, nextSendAt);
      totalProcessed++;
    }

    const elapsed = Date.now() - startTime;
    console.log(`[bulk-sms-worker] Completed in ${elapsed}ms. Processed: ${totalProcessed}, Sent: ${totalSent}, Failed: ${totalFailed}, Skipped: ${totalSkipped}`);

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

async function updateCampaignCounts(supabase: any, campaignId: string, nextSendAt: Date) {
  // Get current counts
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
        next_send_at: nextSendAt.toISOString()
      })
      .eq('id', campaignId);
  }
}
