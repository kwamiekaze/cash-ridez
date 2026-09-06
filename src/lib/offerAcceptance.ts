/**
 * Offer acceptance helpers.
 *
 * Rule: an offer only becomes 'accepted' when the atomic server-side accept
 * succeeds. Nothing here marks an offer accepted up-front, so a failed accept
 * can never leave a falsely-accepted offer behind.
 */

type Invoke = (fn: string, body: Record<string, unknown>) => Promise<{ data: any; error: any }>;

export interface OfferGateway {
  invoke: Invoke;
  /** Insert a counter_offers row and return its id. */
  insertOffer(row: {
    ride_request_id: string;
    by_user_id: string;
    amount: number;
    message: string;
    role: 'driver' | 'rider';
  }): Promise<{ id: string | null; error: any }>;
  /** Update a counter_offers row status. */
  setOfferStatus(offerId: string, status: 'rejected'): Promise<{ error: any }>;
}

const acceptError = (data: any, error: any) =>
  new Error(data?.error || data?.message || error?.message || 'Failed to accept offer');

/** Rider accepts an existing pending driver offer / counter-offer. */
export async function acceptExistingOffer(
  gw: OfferGateway,
  args: { tripId: string; offerId: string; driverId: string },
): Promise<void> {
  const { data, error } = await gw.invoke('accept-ride', {
    rideId: args.tripId,
    driverId: args.driverId,
    etaMinutes: 0,
    skipEtaCheck: true,
    skipActiveRideCheck: true,
    acceptedOfferId: args.offerId,
  });

  if (error || data?.success !== true) throw acceptError(data, error);
}

/** Reject a pending offer. Unchanged behaviour: a local status write is enough. */
export async function rejectOffer(gw: OfferGateway, offerId: string): Promise<void> {
  const { error } = await gw.setOfferStatus(offerId, 'rejected');
  if (error) throw error;
}

/**
 * Driver accepts the rider's initial price. The matching counter_offers row is
 * created first (for history), its id is checked, and that exact id is passed
 * as acceptedOfferId so the server marks it accepted instead of rejecting it
 * along with the other pending offers.
 */
export async function acceptInitialRiderOffer(
  gw: OfferGateway,
  args: { tripId: string; driverId: string; amount: number },
): Promise<void> {
  const { id, error: insertError } = await gw.insertOffer({
    ride_request_id: args.tripId,
    by_user_id: args.driverId,
    amount: args.amount,
    message: 'Accepting initial offer',
    role: 'driver',
  });

  if (insertError) throw insertError;
  if (!id) throw new Error('Could not record your acceptance. Please try again.');

  const { data, error } = await gw.invoke('accept-ride', {
    rideId: args.tripId,
    driverId: args.driverId,
    etaMinutes: 0,
    skipEtaCheck: true,
    skipActiveRideCheck: true,
    acceptedOfferId: id,
  });

  if (error || data?.success !== true) throw acceptError(data, error);
}
