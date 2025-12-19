// ============================================================================
// BULK SMS WORKER FOR CASHRIDEZ
// ============================================================================
// Processes queued SMS recipients for bulk campaigns with rate limiting.
// Called by admin-bulk-sms-runner or directly by admin UI.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Rate limits
const MAX_PER_MINUTE = 25;
const MAX_PER_HOUR = 400;
const MIN_INTERVAL_MS = 3000; // 3 seconds between sends per sender
const BATCH_SIZE = 10;

interface RateLimit {
  id: string;
  scope: string;
  minute_window_start: string;
  minute_count: number;
  hour_window_start: string;
  hour_count: number;
}

interface Campaign {
  id: string;
  sender: string;
  opt_out_footer_enabled: boolean;
  opt_out_footer_text: string;
  total_recipients: number;
  queued_count: number;
  sent_count: number;
  failed_count: number;
  skipped_count: number;
}

interface Recipient {
  id: string;
  campaign_id: string;
  phone_e164: string;
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

async function checkAndUpdateRateLimits(
  supabase: any,
  scope: string
): Promise<{ allowed: boolean; waitMs?: number }> {
  const now = new Date();
  const oneMinuteAgo = new Date(now.getTime() - 60000);
  const oneHourAgo = new Date(now.getTime() - 3600000);

  // Get or create rate limit row
  let { data: rateLimit, error } = await supabase
    .from('admin_sms_rate_limits')
    .select('*')
    .eq('scope', scope)
    .single();

  if (error || !rateLimit) {
    // Create new rate limit row
    const { data: newLimit, error: insertError } = await supabase
      .from('admin_sms_rate_limits')
      .upsert({
        scope,
        minute_window_start: now.toISOString(),
        minute_count: 0,
        hour_window_start: now.toISOString(),
        hour_count: 0,
        updated_at: now.toISOString()
      }, { onConflict: 'scope' })
      .select()
      .single();

    if (insertError) {
      console.error('[bulk-sms-worker] Failed to create rate limit:', insertError);
      return { allowed: false };
    }
    rateLimit = newLimit;
  }

  // Check if windows need to be reset
  const minuteStart = new Date(rateLimit.minute_window_start);
  const hourStart = new Date(rateLimit.hour_window_start);

  let newMinuteCount = rateLimit.minute_count;
  let newHourCount = rateLimit.hour_count;
  let newMinuteStart = rateLimit.minute_window_start;
  let newHourStart = rateLimit.hour_window_start;

  // Reset minute window if expired
  if (minuteStart < oneMinuteAgo) {
    newMinuteCount = 0;
    newMinuteStart = now.toISOString();
  }

  // Reset hour window if expired
  if (hourStart < oneHourAgo) {
    newHourCount = 0;
    newHourStart = now.toISOString();
  }

  // Check limits
  if (newMinuteCount >= MAX_PER_MINUTE) {
    const waitMs = 60000 - (now.getTime() - minuteStart.getTime());
    console.log(`[bulk-sms-worker] Rate limited: ${newMinuteCount}/${MAX_PER_MINUTE} per minute. Wait ${waitMs}ms`);
    return { allowed: false, waitMs };
  }

  if (newHourCount >= MAX_PER_HOUR) {
    const waitMs = 3600000 - (now.getTime() - hourStart.getTime());
    console.log(`[bulk-sms-worker] Rate limited: ${newHourCount}/${MAX_PER_HOUR} per hour. Wait ${waitMs}ms`);
    return { allowed: false, waitMs };
  }

  // Increment counters
  const { error: updateError } = await supabase
    .from('admin_sms_rate_limits')
    .update({
      minute_window_start: newMinuteStart,
      minute_count: newMinuteCount + 1,
      hour_window_start: newHourStart,
      hour_count: newHourCount + 1,
      updated_at: now.toISOString()
    })
    .eq('scope', scope);

  if (updateError) {
    console.error('[bulk-sms-worker] Failed to update rate limit:', updateError);
  }

  return { allowed: true };
}

async function sendSingleSms(
  twilioAccountSid: string,
  twilioAuthToken: string,
  twilioMessagingServiceSid: string | undefined,
  to: string,
  body: string,
  supabaseUrl: string
): Promise<{ ok: boolean; sid?: string; error?: string; status?: string }> {
  const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`;
  const authString = btoa(`${twilioAccountSid}:${twilioAuthToken}`);

  const formParams = new URLSearchParams();
  formParams.append('To', to);
  formParams.append('Body', body);
  
  if (twilioMessagingServiceSid) {
    formParams.append('MessagingServiceSid', twilioMessagingServiceSid);
  } else {
    const twilioPhoneNumber = Deno.env.get('TWILIO_PHONE_NUMBER');
    if (twilioPhoneNumber) {
      formParams.append('From', twilioPhoneNumber);
    } else {
      return { ok: false, error: 'No sender configured' };
    }
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
      status: twilioResponse.status || 'queued'
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

    if (!twilioAccountSid || !twilioAuthToken) {
      return errorResponse('CONFIG_ERROR', 'Twilio credentials not configured', 500);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request
    let campaignId: string | undefined;
    let dryRun = false;

    try {
      const body = await req.json();
      campaignId = body.campaign_id;
      dryRun = body.dry_run === true;
    } catch {
      // No body or invalid JSON is OK
    }

    // Find campaigns to process
    let campaignsQuery = supabase
      .from('admin_sms_campaigns')
      .select('*')
      .eq('status', 'running');

    if (campaignId) {
      campaignsQuery = campaignsQuery.eq('id', campaignId);
    }

    const { data: campaigns, error: campaignError } = await campaignsQuery;

    if (campaignError) {
      console.error('[bulk-sms-worker] Failed to fetch campaigns:', campaignError);
      return errorResponse('DB_ERROR', 'Failed to fetch campaigns', 500);
    }

    if (!campaigns || campaigns.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, processed: 0, message: 'No running campaigns' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let totalProcessed = 0;
    let totalSent = 0;
    let totalFailed = 0;
    let totalSkipped = 0;
    let rateLimitPaused = false;

    for (const campaign of campaigns as Campaign[]) {
      console.log(`[bulk-sms-worker] Processing campaign ${campaign.id}`);

      // Get queued recipients
      const { data: recipients, error: recipError } = await supabase
        .from('admin_sms_campaign_recipients')
        .select('*')
        .eq('campaign_id', campaign.id)
        .eq('status', 'queued')
        .order('created_at', { ascending: true })
        .limit(BATCH_SIZE);

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
          await supabase
            .from('admin_sms_campaigns')
            .update({
              status: 'completed',
              finished_at: new Date().toISOString()
            })
            .eq('id', campaign.id);
          
          console.log(`[bulk-sms-worker] Campaign ${campaign.id} completed`);
        }
        continue;
      }

      for (const recipient of recipients as Recipient[]) {
        // Check rate limits
        const { allowed, waitMs } = await checkAndUpdateRateLimits(supabase, 'global');
        
        if (!allowed) {
          rateLimitPaused = true;
          console.log(`[bulk-sms-worker] Rate limit reached, stopping. Wait ${waitMs}ms`);
          break;
        }

        // Check if phone is opted out
        const { data: optOut } = await supabase
          .from('admin_sms_opt_outs')
          .select('id')
          .eq('phone_e164', recipient.phone_e164)
          .single();

        if (optOut) {
          // Skip opted-out recipient
          await supabase
            .from('admin_sms_campaign_recipients')
            .update({
              status: 'skipped',
              error: 'Opted out'
            })
            .eq('id', recipient.id);
          
          totalSkipped++;
          totalProcessed++;
          continue;
        }

        // Mark as sending
        await supabase
          .from('admin_sms_campaign_recipients')
          .update({ status: 'sending' })
          .eq('id', recipient.id);

        if (dryRun) {
          // Simulate success in dry run
          await supabase
            .from('admin_sms_campaign_recipients')
            .update({
              status: 'sent',
              twilio_sid: `DRY_RUN_${Date.now()}`,
              sent_at: new Date().toISOString()
            })
            .eq('id', recipient.id);
          
          totalSent++;
          totalProcessed++;
          continue;
        }

        // Send SMS
        const result = await sendSingleSms(
          twilioAccountSid,
          twilioAuthToken,
          twilioMessagingServiceSid,
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
              sent_at: new Date().toISOString()
            })
            .eq('id', recipient.id);
          
          totalSent++;
        } else {
          await supabase
            .from('admin_sms_campaign_recipients')
            .update({
              status: 'failed',
              error: result.error
            })
            .eq('id', recipient.id);
          
          totalFailed++;
        }

        totalProcessed++;

        // Enforce minimum interval between sends
        await new Promise(resolve => setTimeout(resolve, MIN_INTERVAL_MS));
      }

      // Update campaign counts
      const { data: counts } = await supabase
        .from('admin_sms_campaign_recipients')
        .select('status')
        .eq('campaign_id', campaign.id);

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
            skipped_count: statusCounts.skipped || 0
          })
          .eq('id', campaign.id);
      }

      if (rateLimitPaused) break;
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
        rate_limit_paused: rateLimitPaused,
        elapsed_ms: elapsed
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[bulk-sms-worker] Unexpected error:', error);
    return errorResponse('INTERNAL_ERROR', error.message || 'Unexpected error', 500);
  }
});
