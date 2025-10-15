import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Patterns to detect phone numbers and emails
const PHONE_PATTERN = /(\+?\d{1,4}[-.\s]?)?(\(?\d{1,4}\)?[-.\s]?)?\d{1,4}[-.\s]?\d{1,4}[-.\s]?\d{1,9}/g;
const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

interface ModerationRequest {
  content: string;
  contentType: 'message' | 'ride_request';
  contentId: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { content, contentType, contentId }: ModerationRequest = await req.json();

    // Check for phone numbers and emails
    const phoneMatches = content.match(PHONE_PATTERN);
    const emailMatches = content.match(EMAIL_PATTERN);
    
    const violations: string[] = [];
    if (phoneMatches && phoneMatches.length > 0) {
      violations.push(`phone number(s): ${phoneMatches.join(', ')}`);
    }
    if (emailMatches && emailMatches.length > 0) {
      violations.push(`email(s): ${emailMatches.join(', ')}`);
    }

    if (violations.length === 0) {
      return new Response(
        JSON.stringify({ flagged: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get current user profile
    const { data: profile, error: profileError } = await supabaseClient
      .from('profiles')
      .select('warning_count, blocked_until')
      .eq('id', user.id)
      .single();

    if (profileError) {
      console.error('Error fetching profile:', profileError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch user profile' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user is currently blocked
    if (profile.blocked_until && new Date(profile.blocked_until) > new Date()) {
      return new Response(
        JSON.stringify({ 
          error: 'Your account is temporarily blocked for sharing contact information. Please contact support.',
          blocked: true,
          blockedUntil: profile.blocked_until
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Increment warning count
    const newWarningCount = (profile.warning_count || 0) + 1;
    let blockedUntil = null;

    // Block user after 3 warnings (24 hour timeout)
    if (newWarningCount >= 3) {
      blockedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    }

    // Update user profile
    const { error: updateError } = await supabaseClient
      .from('profiles')
      .update({ 
        warning_count: newWarningCount,
        blocked_until: blockedUntil
      })
      .eq('id', user.id);

    if (updateError) {
      console.error('Error updating profile:', updateError);
    }

    // Log the flag
    await supabaseClient
      .from('user_message_flags')
      .insert({
        user_id: user.id,
        content_type: contentType,
        content_id: contentId,
        flagged_content: content,
        flag_reason: `Contained ${violations.join(' and ')}`
      });

    return new Response(
      JSON.stringify({ 
        flagged: true,
        warningCount: newWarningCount,
        blocked: newWarningCount >= 3,
        blockedUntil: blockedUntil,
        violations: violations
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in moderate-content function:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
