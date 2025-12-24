import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  // Return valid TwiML XML - no JSON, no debug output
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">
    Hello, this is Cash Ridez Connect LLC.
    We responded to your Indeed application.
    Please text us back with the word CASH for the next steps.
  </Say>
</Response>`;

  return new Response(twiml, {
    status: 200,
    headers: {
      'Content-Type': 'text/xml',
    },
  });
});
