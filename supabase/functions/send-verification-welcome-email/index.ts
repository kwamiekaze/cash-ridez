import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@4.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { sendEmail, getEmailSystemStatus } from "../_shared/email-sender.ts";
import {
  buildDecisionEmail,
  decisionEmailType,
  decisionIdempotencyKey,
  DecisionQueueRow,
  getPrimaryRole,
  isSyntheticQueueId,
  MAX_DECISION_ATTEMPTS,
  normalizeDecision,
  resolveRejectionReason,
  retryDelayMs,
  shouldRetry,
} from "../_shared/verification-decision-core.ts";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const BATCH_SIZE = 10;

function getTestEmailHtml(systemStatus: any): string {
  const statusColor = systemStatus.fallbackActive ? "#f59e0b" : "#10b981";
  const statusText = systemStatus.fallbackActive
    ? "⚠️ Temporary sender fallback active. Domain verification still pending."
    : "✅ Primary domain verified and active.";

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #000 0%, #1a1a1a 100%); padding: 30px; border-radius: 12px; margin-bottom: 20px;">
    <h1 style="color: #facc15; margin: 0; font-size: 24px;">✅ Email Test Successful</h1>
    <p style="color: #fff; margin: 10px 0 0 0; font-size: 16px;">CashRidez Email System is Working</p>
  </div>

  <p style="font-size: 16px;">This is a test email from the CashRidez admin panel.</p>

  <div style="background: ${systemStatus.fallbackActive ? '#fef3c7' : '#f0fdf4'}; padding: 16px; border-radius: 8px; margin: 20px 0; border-left: 4px solid ${statusColor};">
    <p style="margin: 0; font-size: 14px; color: ${statusColor};">${statusText}</p>
  </div>

  <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 20px 0;">
    <p style="margin: 0; font-size: 14px; color: #666;">
      <strong>Timestamp:</strong> ${new Date().toISOString()}<br>
      <strong>Current Sender:</strong> ${systemStatus.currentSender}<br>
      <strong>Domain Verified:</strong> ${systemStatus.domainVerified ? 'Yes' : 'No'}<br>
      <strong>Fallback Active:</strong> ${systemStatus.fallbackActive ? 'Yes' : 'No'}
    </p>
  </div>

  <div style="background: #000; color: #facc15; padding: 20px; border-radius: 8px; margin-top: 30px; text-align: center;">
    <p style="margin: 0; font-size: 14px; color: #fff;">— CashRidez Team</p>
  </div>
</body>
</html>
  `;
}

interface ProcessResult {
  success: boolean;
  error?: string;
  fallbackActive?: boolean;
  skipped?: boolean;
}

/**
 * Send one verification decision email.
 *
 * Idempotency is per queue decision event (queue id) so a later rejection or
 * re-approval after a fresh review is still delivered. Direct/test calls use
 * synthetic ids and fall back to the historical per-user check.
 */
async function processQueuedEmail(
  supabase: any,
  queueItem: DecisionQueueRow,
  isTest = false,
  forceResend = false,
  overrideIdempotencyKey?: string,
): Promise<ProcessResult> {
  const { id, user_id, user_email, first_name, is_driver, is_rider } = queueItem;
  const decision = normalizeDecision(queueItem.decision);
  const synthetic = isSyntheticQueueId(id);

  console.log(
    `Processing ${decision} email for user ${user_id} (queue ${id}), isTest: ${isTest}, forceResend: ${forceResend}`,
  );

  const systemStatus = await getEmailSystemStatus(resend);
  const primaryRole = getPrimaryRole(is_driver, is_rider);
  const emailType = isTest ? "email_test" : decisionEmailType(decision, primaryRole);
  // Queue decisions are deterministic by queue UUID; an explicit admin resend
  // supplies a per-request key so repeat resends are intentionally allowed.
  const idempotencyKey = overrideIdempotencyKey ?? decisionIdempotencyKey(id);

  if (!isTest && !forceResend) {
    if (!synthetic) {
      // Per-event dedupe: has this exact queue row already been delivered?
      const { data: existing } = await supabase
        .from("email_logs")
        .select("id")
        .eq("status", "success")
        .contains("metadata", { queue_id: id })
        .maybeSingle();

      if (existing) {
        console.log(`Queue row ${id} already delivered, marking as already_sent`);
        await supabase
          .from("verification_email_queue")
          .update({ status: "already_sent", processed_at: new Date().toISOString() })
          .eq("id", id);
        return {
          success: false,
          skipped: true,
          error: "Email already sent for this decision",
          fallbackActive: systemStatus.fallbackActive,
        };
      }
    } else {
      // Direct call (no queue row): keep the legacy per-user guard.
      const { data: existingLog } = await supabase
        .from("email_logs")
        .select("id")
        .eq("user_id", user_id)
        .eq("email_type", emailType)
        .eq("status", "success")
        .maybeSingle();

      if (existingLog) {
        return {
          success: false,
          skipped: true,
          error: "Email already sent to this user",
          fallbackActive: systemStatus.fallbackActive,
        };
      }
    }
  }

  const baseMetadata = {
    first_name,
    is_driver,
    is_rider,
    primaryRole,
    isTest,
    decision,
    queue_id: synthetic ? null : id,
    idempotency_key: idempotencyKey,
  };

  const { data: logEntry, error: logError } = await supabase
    .from("email_logs")
    .insert({
      user_id,
      email_type: emailType,
      recipient_email: user_email,
      status: "pending",
      metadata: {
        ...baseMetadata,
        fallbackActive: systemStatus.fallbackActive,
        senderUsed: systemStatus.currentSender,
      },
    })
    .select("id")
    .single();

  if (logError) console.error("Failed to create log entry:", logError);
  const logId = logEntry?.id;

  let subject: string;
  let html: string;

  if (isTest) {
    subject = "[CashRidez] Email Test – Production";
    html = getTestEmailHtml(systemStatus);
  } else {
    const built = buildDecisionEmail(decision, {
      firstName: first_name,
      isDriver: is_driver,
      isRider: is_rider,
      rejectionReason: queueItem.rejection_reason,
    });
    subject = built.subject;
    html = built.html;
  }

  let result = { success: false, error: "", senderUsed: "", fallbackActive: false };

  for (let attempt = 1; attempt <= 3; attempt++) {
    const sendResult = await sendEmail(resend, {
      to: [user_email],
      subject,
      html,
      idempotencyKey,
    });

    if (sendResult.success) {
      result = {
        success: true,
        error: "",
        senderUsed: sendResult.senderUsed,
        fallbackActive: sendResult.fallbackActive,
      };
      break;
    }

    result = {
      success: false,
      error: sendResult.error || "Unknown error",
      senderUsed: sendResult.senderUsed,
      fallbackActive: sendResult.fallbackActive,
    };

    if (attempt < 3) await new Promise((r) => setTimeout(r, 1000 * attempt));
  }

  if (logId) {
    await supabase
      .from("email_logs")
      .update({
        status: result.success ? "success" : "failed",
        error_message: result.success ? null : result.error,
        timestamp_sent: new Date().toISOString(),
        metadata: {
          ...baseMetadata,
          fallbackActive: result.fallbackActive,
          senderUsed: result.senderUsed,
        },
      })
      .eq("id", logId);
  }

  if (!synthetic) {
    if (result.success) {
      await supabase
        .from("verification_email_queue")
        .update({
          status: "sent",
          processed_at: new Date().toISOString(),
          last_error: null,
        })
        .eq("id", id);
    } else {
      const attempts = (queueItem.attempts ?? 0) + 1;
      const retry = shouldRetry(queueItem.attempts ?? 0);
      await supabase
        .from("verification_email_queue")
        .update({
          status: retry ? "pending" : "failed",
          attempts,
          last_error: String(result.error).slice(0, 500),
          next_attempt_at: new Date(Date.now() + retryDelayMs(attempts)).toISOString(),
          claimed_at: null,
          processed_at: retry ? null : new Date().toISOString(),
        })
        .eq("id", id);
      console.error(
        `Queue row ${id} failed (attempt ${attempts}/${MAX_DECISION_ATTEMPTS}): ${result.error}`,
      );
    }
  }

  return result.success
    ? { success: true, fallbackActive: result.fallbackActive }
    : { success: false, error: result.error, fallbackActive: result.fallbackActive };
}

/** Claim a bounded batch so overlapping cron runs cannot double-send. */
/**
 * Return rows abandoned mid-send (worker crash, failed status write) to
 * pending so they are retried. Only 'sending' rows are touched — sent,
 * failed and skipped_backlog rows are never revived.
 */
async function recoverStaleClaims(supabase: any): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_CLAIM_TIMEOUT_MS).toISOString();

  const { data, error } = await supabase
    .from("verification_email_queue")
    .update({
      status: "pending",
      claimed_at: null,
      next_attempt_at: new Date().toISOString(),
      last_error: `Recovered stale claim: no result recorded within ${
        Math.round(STALE_CLAIM_TIMEOUT_MS / 60000)
      } minutes`,
    })
    .eq("status", "sending")
    .lt("claimed_at", cutoff)
    .lt("attempts", MAX_DECISION_ATTEMPTS)
    .select("id");

  if (error) {
    console.error("Failed to recover stale claims:", error);
    return 0;
  }
  const count = data?.length ?? 0;
  if (count > 0) console.log(`Recovered ${count} stale 'sending' row(s)`);
  return count;
}

async function claimBatch(supabase: any): Promise<DecisionQueueRow[]> {
  await recoverStaleClaims(supabase);
  const nowIso = new Date().toISOString();


  const { data: candidates, error } = await supabase
    .from("verification_email_queue")
    .select("id")
    .eq("status", "pending")
    .lte("next_attempt_at", nowIso)
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (error) throw error;
  if (!candidates || candidates.length === 0) return [];

  const { data: claimed, error: claimError } = await supabase
    .from("verification_email_queue")
    .update({ status: "sending", claimed_at: nowIso })
    .in("id", candidates.map((c: { id: string }) => c.id))
    .eq("status", "pending")
    .select("*");

  if (claimError) throw claimError;
  return (claimed || []) as DecisionQueueRow[];
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      // Empty body = process queue (cron)
    }

    if (body.action === "status") {
      const status = await getEmailSystemStatus(resend);
      return new Response(JSON.stringify(status), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Direct single-user invocation (admin "Resend Welcome Email", etc.)
    if (body.userId) {
      const { userId, userEmail, firstName, isDriver, isRider, isTest, forceResend, decision, rejectionReason } = body;

      const result = await processQueuedEmail(
        supabase,
        {
          id: (isTest ? "test-" : "direct-") + userId,
          user_id: userId,
          user_email: userEmail,
          first_name: firstName,
          is_driver: isDriver ?? false,
          is_rider: isRider ?? false,
          decision: normalizeDecision(decision),
          rejection_reason: rejectionReason ?? null,
        },
        isTest,
        forceResend ?? false,
      );

      if (result.skipped) {
        return new Response(JSON.stringify({ ...result, skipped: true }), {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      return new Response(JSON.stringify(result), {
        status: result.success ? 200 : 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    console.log("Processing verification decision email queue...");
    const queueItems = await claimBatch(supabase);

    if (queueItems.length === 0) {
      const status = await getEmailSystemStatus(resend);
      return new Response(JSON.stringify({ success: true, processed: 0, ...status }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const results: ProcessResult[] = [];
    for (let i = 0; i < queueItems.length; i++) {
      results.push(await processQueuedEmail(supabase, queueItems[i]));
      if (i < queueItems.length - 1) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const failedCount = results.length - successCount;

    console.log(`Processed ${successCount} emails successfully, ${failedCount} failed`);

    return new Response(
      JSON.stringify({
        success: true,
        processed: queueItems.length,
        successful: successCount,
        failed: failedCount,
        fallbackActive: results.some((r) => r.fallbackActive),
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  } catch (error: any) {
    console.error("Error in send-verification-welcome-email function:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

serve(handler);
