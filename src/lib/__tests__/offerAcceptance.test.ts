import { describe, it, expect, vi } from 'vitest';
import {
  acceptExistingOffer,
  acceptInitialRiderOffer,
  rejectOffer,
  type OfferGateway,
} from '../offerAcceptance';

const TRIP = 'trip-1';
const OFFER = 'offer-1';
const DRIVER = 'driver-1';

const gateway = (over: Partial<OfferGateway> = {}): OfferGateway => ({
  invoke: vi.fn(async () => ({ data: { success: true }, error: null })),
  insertOffer: vi.fn(async () => ({ id: 'new-offer', error: null })),
  setOfferStatus: vi.fn(async () => ({ error: null })),
  ...over,
});

describe('acceptExistingOffer', () => {
  it('never marks the offer accepted from the client', async () => {
    const gw = gateway();
    await acceptExistingOffer(gw, { tripId: TRIP, offerId: OFFER, driverId: DRIVER });
    expect(gw.setOfferStatus).not.toHaveBeenCalled();
    expect(gw.invoke).toHaveBeenCalledWith(
      'accept-ride',
      expect.objectContaining({ rideId: TRIP, driverId: DRIVER, acceptedOfferId: OFFER }),
    );
  });

  it('throws and writes nothing when the accept fails', async () => {
    const gw = gateway({ invoke: vi.fn(async () => ({ data: { success: false, error: 'limit' }, error: null })) });
    await expect(acceptExistingOffer(gw, { tripId: TRIP, offerId: OFFER, driverId: DRIVER })).rejects.toThrow('limit');
    expect(gw.setOfferStatus).not.toHaveBeenCalled();
  });

  it('throws on a transport error', async () => {
    const gw = gateway({ invoke: vi.fn(async () => ({ data: null, error: { message: 'network' } })) });
    await expect(acceptExistingOffer(gw, { tripId: TRIP, offerId: OFFER, driverId: DRIVER })).rejects.toThrow('network');
  });
});

describe('rejectOffer', () => {
  it('still marks the offer rejected', async () => {
    const gw = gateway();
    await rejectOffer(gw, OFFER);
    expect(gw.setOfferStatus).toHaveBeenCalledWith(OFFER, 'rejected');
  });

  it('surfaces the error', async () => {
    const gw = gateway({ setOfferStatus: vi.fn(async () => ({ error: new Error('nope') })) });
    await expect(rejectOffer(gw, OFFER)).rejects.toThrow('nope');
  });
});

describe('acceptInitialRiderOffer', () => {
  it('passes the inserted offer id as acceptedOfferId', async () => {
    const gw = gateway();
    await acceptInitialRiderOffer(gw, { tripId: TRIP, driverId: DRIVER, amount: 40 });
    expect(gw.invoke).toHaveBeenCalledWith(
      'accept-ride',
      expect.objectContaining({ acceptedOfferId: 'new-offer', driverId: DRIVER }),
    );
  });

  it('stops when the offer insert fails', async () => {
    const gw = gateway({ insertOffer: vi.fn(async () => ({ id: null, error: new Error('insert failed') })) });
    await expect(acceptInitialRiderOffer(gw, { tripId: TRIP, driverId: DRIVER, amount: 40 })).rejects.toThrow('insert failed');
    expect(gw.invoke).not.toHaveBeenCalled();
  });

  it('stops when no offer id comes back', async () => {
    const gw = gateway({ insertOffer: vi.fn(async () => ({ id: null, error: null })) });
    await expect(acceptInitialRiderOffer(gw, { tripId: TRIP, driverId: DRIVER, amount: 40 })).rejects.toThrow(/record your acceptance/);
    expect(gw.invoke).not.toHaveBeenCalled();
  });

  it('propagates a failed accept without claiming success', async () => {
    const gw = gateway({ invoke: vi.fn(async () => ({ data: { success: false, message: 'Ride is no longer available' }, error: null })) });
    await expect(acceptInitialRiderOffer(gw, { tripId: TRIP, driverId: DRIVER, amount: 40 })).rejects.toThrow('Ride is no longer available');
  });
});
