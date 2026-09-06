import { describe, it, expect, vi } from "vitest";
import { handleAcceptRide, type AcceptDeps } from "../accept-core.ts";

const RIDE = "11111111-1111-4111-8111-111111111111";
const DRIVER = "22222222-2222-4222-8222-222222222222";
const OFFER = "33333333-3333-4333-8333-333333333333";
const USER = "44444444-4444-4444-8444-444444444444";

const req = (body: unknown, auth: string | null = "Bearer token-abc") =>
  new Request("https://x/accept-ride", {
    method: "POST",
    headers: auth ? { Authorization: auth, "Content-Type": "application/json" } : {},
    body: JSON.stringify(body),
  });

const deps = (over: Partial<AcceptDeps> = {}): AcceptDeps => ({
  getUser: vi.fn(async () => ({ id: USER })),
  acceptRide: vi.fn(async () => ({ data: { success: true }, error: null })),
  notify: vi.fn(async () => {}),
  ...over,
});

describe("accept-ride handler", () => {
  it("rejects an unauthenticated call", async () => {
    const d = deps();
    const res = await handleAcceptRide(req({ rideId: RIDE, etaMinutes: 10 }, null), d);
    expect(res.status).toBe(401);
    expect(d.acceptRide).not.toHaveBeenCalled();
  });

  it("rejects an invalid token", async () => {
    const d = deps({ getUser: vi.fn(async () => null) });
    const res = await handleAcceptRide(req({ rideId: RIDE, etaMinutes: 10 }), d);
    expect(res.status).toBe(401);
    expect(d.acceptRide).not.toHaveBeenCalled();
  });

  it("calls the RPC with the caller's JWT, not a service role", async () => {
    const d = deps();
    await handleAcceptRide(req({ rideId: RIDE, etaMinutes: 10 }), d);
    expect(d.acceptRide).toHaveBeenCalledWith(
      "token-abc",
      expect.objectContaining({ p_ride_id: RIDE, p_driver_id: USER, p_eta_minutes: 10 }),
    );
  });

  it("forwards driverId and acceptedOfferId for the DB to authorize", async () => {
    const d = deps();
    await handleAcceptRide(
      req({ rideId: RIDE, driverId: DRIVER, acceptedOfferId: OFFER, skipEtaCheck: true, skipActiveRideCheck: true }),
      d,
    );
    expect(d.acceptRide).toHaveBeenCalledWith(
      "token-abc",
      expect.objectContaining({
        p_driver_id: DRIVER,
        p_accepted_offer_id: OFFER,
        p_skip_active_check: true,
        p_eta_minutes: 0,
      }),
    );
  });

  it("does not pre-approve any quota of its own", async () => {
    const d = deps({
      acceptRide: vi.fn(async () => ({
        data: { success: false, code: "driver_limit_reached", message: "limit" },
        error: null,
      })),
    });
    const res = await handleAcceptRide(req({ rideId: RIDE, etaMinutes: 10 }), d);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ success: false, code: "driver_limit_reached" });
    expect(d.notify).not.toHaveBeenCalled();
  });

  it("validates ids and eta", async () => {
    const d = deps();
    expect((await handleAcceptRide(req({ rideId: "nope", etaMinutes: 5 }), d)).status).toBe(400);
    expect((await handleAcceptRide(req({ rideId: RIDE, acceptedOfferId: "x" }), d)).status).toBe(400);
    expect((await handleAcceptRide(req({ rideId: RIDE, etaMinutes: 999 }), d)).status).toBe(400);
    expect(d.acceptRide).not.toHaveBeenCalled();
  });

  it("notifies only after success, and survives a notification failure", async () => {
    const d = deps({ notify: vi.fn(async () => { throw new Error("smtp down"); }) });
    const res = await handleAcceptRide(req({ rideId: RIDE, etaMinutes: 10 }), d);
    expect(res.status).toBe(200);
    expect(d.notify).toHaveBeenCalled();
  });

  it("surfaces an RPC error as a failure", async () => {
    const d = deps({ acceptRide: vi.fn(async () => ({ data: null, error: { message: "permission denied" } })) });
    const res = await handleAcceptRide(req({ rideId: RIDE, etaMinutes: 10 }), d);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "permission denied" });
  });
});
