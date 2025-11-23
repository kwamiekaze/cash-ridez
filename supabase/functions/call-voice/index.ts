const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Always return static TwiML - no logic, no errors
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Your CashRidez call reached the server successfully. Goodbye.</Say>
  <Hangup/>
</Response>`;

  return new Response(twiml, {
    status: 200,
    headers: { 
      ...corsHeaders, 
      'Content-Type': 'text/xml' 
    }
  });
});
