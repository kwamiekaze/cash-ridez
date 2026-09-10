/**
 * Authenticated server-side address lookup (geocoding) proxy.
 *
 * SAFETY MODEL
 *   * Requires a valid user JWT. No anonymous use.
 *   * Input is a single free-text address string, strictly validated.
 *   * Nominatim is called from the server only, with the identifying
 *     User-Agent/Referer its usage policy requires, and never more than once
 *     per second globally (a database-backed reservation slot).
 *   * Normalized results are cached in a service-only table.
 *   * Fails closed: no result, no Georgia match, or no ZIP -> error, never a
 *     default coordinate.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import {
  buildNominatimUrl,
  failureMessage,
  type GeocodeFailure,
  type GeocodeResult,
  NOMINATIM_MIN_INTERVAL_MS,
  NOMINATIM_REFERER,
  NOMINATIM_USER_AGENT,
  normalizeAddressKey,
  parseNominatimResult,
  validateAddressInput,
} from "../_shared/geocode-core.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const service = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false } },
);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function fail(reason: GeocodeFailure, status = 422): Response {
  return json({ error: reason, message: failureMessage(reason) }, status);
}

/** Wait for the global one-request-per-second slot. */
async function reserveUpstreamSlot(): Promise<boolean> {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    const { data, error } = await service.rpc("reserve_geocode_slot", {
      p_min_interval_ms: NOMINATIM_MIN_INTERVAL_MS,
    });
    if (error) {
      console.error("[GEOCODE] slot reservation failed:", error.message);
      return false;
    }
    if (data === true) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

async function readCache(key: string): Promise<GeocodeResult | null> {
  const { data, error } = await service
    .from("geocode_cache")
    .select("lat, lng, zip, display_name")
    .eq("address_key", key)
    .maybeSingle();
  if (error) {
    console.error("[GEOCODE] cache read failed:", error.message);
    return null;
  }
  if (!data) return null;
  return {
    lat: Number(data.lat),
    lng: Number(data.lng),
    zip: String(data.zip),
    displayName: data.display_name ?? null,
  };
}

async function writeCache(key: string, result: GeocodeResult): Promise<void> {
  const { error } = await service.from("geocode_cache").upsert(
    {
      address_key: key,
      lat: result.lat,
      lng: result.lng,
      zip: result.zip,
      display_name: result.displayName,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "address_key" },
  );
  if (error) console.error("[GEOCODE] cache write failed:", error.message);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) return json({ error: "unauthorized" }, 401);

  const authClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
  );
  const { data: claims, error: authError } = await authClient.auth.getClaims(token);
  if (authError || !claims?.claims?.sub) return json({ error: "unauthorized" }, 401);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail("invalid_input", 400);
  }

  const address = validateAddressInput((body as Record<string, unknown> | null)?.address);
  if (!address) return fail("invalid_input", 400);

  const key = normalizeAddressKey(address);

  const cached = await readCache(key);
  if (cached) return json({ ...cached, cached: true });

  if (!(await reserveUpstreamSlot())) return fail("rate_limited", 429);

  let payload: unknown;
  try {
    const response = await fetch(buildNominatimUrl(address), {
      headers: {
        "User-Agent": NOMINATIM_USER_AGENT,
        "Referer": NOMINATIM_REFERER,
        "Accept": "application/json",
        "Accept-Language": "en-US",
      },
    });
    if (!response.ok) {
      console.error(`[GEOCODE] upstream status ${response.status}`);
      return fail("upstream_error", 502);
    }
    payload = await response.json();
  } catch (err) {
    console.error("[GEOCODE] upstream request failed:", (err as Error)?.message);
    return fail("upstream_error", 502);
  }

  const first = Array.isArray(payload) ? payload[0] : null;
  if (!first) return fail("not_found");

  const parsed = parseNominatimResult(first);
  if (!parsed.ok) return fail(parsed.reason);

  await writeCache(key, parsed.result);
  return json({ ...parsed.result, cached: false });
});
