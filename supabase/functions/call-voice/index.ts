// ============================================================================
// TWILIO VOICE WEBHOOK FOR CASHRIDEZ
// ============================================================================
//
// This Supabase Edge Function handles Twilio voice webhook callbacks.
// 
// TWO MODES:
// 1. MASKED CALLING: When callId is provided - bridges rider/driver calls
// 2. CALL CENTER FALLBACK: When no callId - redirects to voicemail handler
//
// WEBHOOK URL:
//   https://wnajjqsqmrpwyffbpgsj.supabase.co/functions/v1/call-voice
//
// AUTHENTICATION: No JWT required (verify_jwt = false) - Twilio webhook
//
// CRITICAL: NO <Say> elements in this file. All voice output uses pre-recorded audio.
// On any error, redirect to voicemail or hangup - never use Polly/TTS.
//
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const APP_BASE_URL = Deno.env.get('SUPABASE_URL') || 'https://wnajjqsqmrpwyffbpgsj.supabase.co';

const TWIML_CONTENT_TYPE = 'text/xml; charset=utf-8';

function respondTwiml(endpoint: string, twiml: string) {
  const headers: Record<string, string> = {
    ...corsHeaders,
    'Content-Type': TWIML_CONTENT_TYPE,
    'Cache-Control': 'no-store',
  };

  console.log(`[${endpoint}] Returning TwiML (first 200 chars): ${twiml.slice(0, 200)}`);
  console.log(`[${endpoint}] Response Content-Type: ${headers['Content-Type']}`);

  return new Response(twiml, { status: 200, headers });
}

// Helper function to extract phone number from text
function extractPhoneNumber(text: string): string | null {
  if (!text) return null;
  const cleaned = text.replace(/[\s\-\(\)\.]/g, '');
  const phoneRegex = /(\+?1)?(\d{10})/;
  const match = cleaned.match(phoneRegex);
  if (match && match[2]) {
    return `+1${match[2]}`;
  }
  return null;
}

// Helper function to extract contact info from rider_note
function extractContactFromRiderNote(riderNote: string | null): string | null {
  if (!riderNote) return null;
  const contactMatch = riderNote.match(/Contact:\s*([^|]+)/i);
  if (contactMatch && contactMatch[1]) {
    return extractPhoneNumber(contactMatch[1].trim());
  }
  return null;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Build voicemail redirect TwiML - used for all error cases
function getVoicemailRedirectTwiml(): string {
  const voicemailUrl = `${APP_BASE_URL}/functions/v1/call-inbound-voicemail`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Redirect method="POST">${escapeXml(voicemailUrl)}</Redirect>
</Response>`;
}

// Build simple hangup TwiML
function getHangupTwiml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Hangup/>
</Response>`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Parse query parameters
    const url = new URL(req.url);
    const callId = url.searchParams.get('callId');
    const role = url.searchParams.get('role');

    // Also parse form data from Twilio
    let callSid = '';
    let fromNumber = '';
    let toNumber = '';
    let direction = '';
    
    const contentType = req.headers.get('content-type') || '';
    if (contentType.includes('application/x-www-form-urlencoded')) {
      try {
        const formData = await req.formData();
        callSid = formData.get('CallSid') as string || '';
        fromNumber = formData.get('From') as string || '';
        toNumber = formData.get('To') as string || '';
        direction = formData.get('Direction') as string || '';
      } catch (e) {
        console.log('[call-voice] Could not parse form data:', e);
      }
    }

    console.log(`[call-voice] Webhook received - callId: ${callId}, role: ${role}, CallSid: ${callSid}, Direction: ${direction}`);

    // =========================================================================
    // MODE 1: MASKED CALLING (callId provided)
    // =========================================================================
    if (callId) {
      console.log(`[call-voice] MASKED CALLING mode for callId: ${callId}`);
      
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      // Look up the call record and associated trip
      const { data: call, error: callError } = await supabase
        .from('calls')
        .select('*')
        .eq('id', callId)
        .single();

      if (callError || !call) {
        console.error('[call-voice] Call not found:', callError);
        // Redirect to voicemail instead of using Polly
        return respondTwiml('call-voice', getVoicemailRedirectTwiml());
      }

      // Fetch trip details to get rider_note for fallback contact
      const { data: trip } = await supabase
        .from('ride_requests')
        .select('rider_note')
        .eq('id', call.trip_id)
        .single();

      // Fetch both profiles
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, phone_number')
        .in('id', [call.rider_id, call.driver_id]);

      if (profilesError || !profiles || profiles.length !== 2) {
        console.error('[call-voice] Failed to fetch profiles:', profilesError);
        // Redirect to voicemail instead of using Polly
        return respondTwiml('call-voice', getVoicemailRedirectTwiml());
      }

      // Find rider and driver profiles
      const riderProfile = profiles.find(p => p.id === call.rider_id);
      const driverProfile = profiles.find(p => p.id === call.driver_id);

      // Get rider phone number - fallback to contact info from rider_note if profile phone is missing
      let riderPhoneNumber = riderProfile?.phone_number?.trim() || '';
      if (!riderPhoneNumber && trip?.rider_note) {
        console.log('[call-voice] Rider has no profile phone, attempting to extract from rider_note');
        const extractedPhone = extractContactFromRiderNote(trip.rider_note);
        if (extractedPhone) {
          console.log('[call-voice] Successfully extracted phone from rider_note');
          riderPhoneNumber = extractedPhone;
        }
      }

      // Get driver phone number from profile
      const driverPhoneNumber = driverProfile?.phone_number?.trim() || '';

      if (!riderPhoneNumber || !driverPhoneNumber) {
        console.error('[call-voice] Missing phone numbers after fallback attempts');
        // Redirect to voicemail instead of using Polly
        return respondTwiml('call-voice', getVoicemailRedirectTwiml());
      }

      // Determine which party to dial based on role parameter
      let otherPartyPhone: string;
      
      if (role === 'rider') {
        otherPartyPhone = driverPhoneNumber;
      } else if (role === 'driver') {
        otherPartyPhone = riderPhoneNumber;
      } else {
        if (call.initiated_by_user_id === call.rider_id) {
          otherPartyPhone = driverPhoneNumber;
        } else {
          otherPartyPhone = riderPhoneNumber;
        }
      }

      // Get Twilio phone number for caller ID
      const twilioPhoneNumber = Deno.env.get('TWILIO_PHONE_NUMBER');
      
      if (!twilioPhoneNumber) {
        console.error('[call-voice] Missing TWILIO_PHONE_NUMBER environment variable');
        // Redirect to voicemail instead of using Polly
        return respondTwiml('call-voice', getVoicemailRedirectTwiml());
      }

      // Build TwiML to dial the other party
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial callerId="${twilioPhoneNumber}">
    <Number>${otherPartyPhone}</Number>
  </Dial>
</Response>`;

      console.log(`[call-voice] MASKED CALLING - Bridging call ${callId}`);

      return respondTwiml('call-voice', twiml);
    }

    // =========================================================================
    // MODE 2: CALL CENTER FALLBACK (no callId - inbound call or fallback)
    // Redirect to voicemail handler - NO TTS/Polly here
    // =========================================================================
    console.log(`[call-voice] CALL CENTER FALLBACK mode - redirecting to voicemail handler`);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Log the inbound call if we have a CallSid
    if (callSid) {
      try {
        // Check if this call is already logged
        const { data: existingLog } = await supabase
          .from('admin_call_logs')
          .select('id')
          .eq('twilio_call_sid', callSid)
          .single();

        if (!existingLog) {
          // Create new log entry
          await supabase
            .from('admin_call_logs')
            .insert({
              admin_user_id: '00000000-0000-0000-0000-000000000000',
              phone_e164: fromNumber || 'unknown',
              status: 'voicemail',
              call_type: direction === 'outbound-api' ? 'outbound' : 'inbound',
              direction: direction === 'outbound-api' ? 'outbound' : 'inbound',
              twilio_call_sid: callSid,
              voicemail_left: true,
            });
        }
      } catch (dbErr) {
        console.error('[call-voice] DB logging failed:', dbErr);
      }
    }

    // Redirect to the voicemail handler which uses pre-recorded audio
    return respondTwiml('call-voice', getVoicemailRedirectTwiml());

  } catch (error) {
    console.error('[call-voice] Critical error:', error);
    
    // On error, just hangup - NO TTS fallback ever
    return respondTwiml('call-voice', getHangupTwiml());
  }
});
