/**
 * accept-ride, extracted so the authorization contract is testable.
 *
 * Contract:
 *  - The RPC is ALWAYS called with the caller's own verified JWT, because
 *    accept_ride_atomic authorizes against auth.uid(). The service-role client
 *    is used only for trusted notification lookups AFTER a successful accept.
 *  - p_driver_id is never trusted here: the database decides whether the caller
 *    may assign that driver.
 *  - The free-connection quota is enforced in the database for BOTH
 *    participants. This function does not pre-check (and must not pre-approve).
 */

export interface AcceptRequestBody {
  rideId?: unknown;
  etaMinutes?: unknown;
  driverId?: unknown;
  skipEtaCheck?: unknown;
  skipActiveRideCheck?: unknown;
  acceptedOfferId?: unknown;
}

export interface AcceptRpcArgs {
  p_ride_id: string;
  p_driver_id: string;
  p_eta_minutes: number;
  p_skip_active_check: boolean;
  p_accepted_offer_id: string | null;
}

export interface AcceptDeps {
  /** Verify the bearer token and return the signed-in user, or null. */
  getUser(jwt: string): Promise<{ id: string } | null>;
  /** Call accept_ride_atomic as the signed-in user (user JWT, not service role). */
  acceptRide(jwt: string, args: AcceptRpcArgs): Promise<{ data: any; error: any }>;
  /** Best-effort notification, service role. Never affects the result. */
  notify?(ctx: { rideId: string; driverId: string; etaMinutes: number }): Promise<void>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

export async function handleAcceptRide(req: Request, deps: AcceptDeps): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return json({ success: false, error: "Unauthorized" }, 401);

  let user: { id: string } | null = null;
  try {
    user = await deps.getUser(jwt);
  } catch {
    user = null;
  }
  if (!user?.id) return json({ success: false, error: "Unauthorized" }, 401);

  let body: AcceptRequestBody;
  try {
    body = (await req.json()) as AcceptRequestBody;
  } catch {
    return json({ success: false, error: "Invalid request body" }, 400);
  }

  const rideId = typeof body.rideId === "string" ? body.rideId : "";
  if (!UUID.test(rideId)) return json({ success: false, error: "Missing or invalid rideId" }, 400);

  const acceptedOfferId = typeof body.acceptedOfferId === "string" ? body.acceptedOfferId : null;
  if (acceptedOfferId !== null && !UUID.test(acceptedOfferId)) {
    return json({ success: false, error: "Invalid acceptedOfferId" }, 400);
  }

  const driverId = typeof body.driverId === "string" && UUID.test(body.driverId) ? body.driverId : user.id;

  const skipEtaCheck = body.skipEtaCheck === true;
  const etaRaw = typeof body.etaMinutes === "number" ? body.etaMinutes : Number(body.etaMinutes);
  const eta = Number.isFinite(etaRaw) ? Math.trunc(etaRaw) : 0;
  if (!skipEtaCheck && (eta < 1 || eta > 240)) {
    return json({ success: false, error: "ETA must be between 1 and 240 minutes" }, 400);
  }

  const { data, error } = await deps.acceptRide(jwt, {
    p_ride_id: rideId,
    p_driver_id: driverId,
    p_eta_minutes: skipEtaCheck ? 0 : eta,
    p_skip_active_check: body.skipActiveRideCheck === true,
    p_accepted_offer_id: acceptedOfferId,
  });

  if (error) {
    console.error("accept_ride_atomic error", error?.message ?? error);
    return json({ success: false, error: error?.message || "Failed to accept ride" }, 400);
  }

  if (!data || data.success !== true) {
    return json(
      { success: false, error: data?.message || "Failed to accept ride", code: data?.code ?? null },
      400,
    );
  }

  if (deps.notify) {
    try {
      await deps.notify({ rideId, driverId, etaMinutes: skipEtaCheck ? 0 : eta });
    } catch (e) {
      console.error("accept-ride notification failed", e);
    }
  }

  return json({ success: true, message: "Ride accepted successfully" }, 200);
}
