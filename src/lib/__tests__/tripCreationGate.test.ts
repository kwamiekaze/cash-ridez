import { describe, it, expect } from "vitest";
import { evaluateTripCreationGate, type MembershipView } from "../tripCreationGate";

const view = (over: Partial<MembershipView> = {}): MembershipView => ({
  loading: false,
  unknown: false,
  confirmed: true,
  isPremium: false,
  connected_trips: 0,
  connected_trips_known: true,
  ...over,
});

describe("trip creation gate", () => {
  it("blocks while membership is still loading", () => {
    expect(evaluateTripCreationGate(view({ loading: true }))).toEqual({ status: "checking" });
  });

  it("never treats unknown membership as zero connections", () => {
    expect(evaluateTripCreationGate(view({ unknown: true, confirmed: false }))).toEqual({
      status: "checking",
    });
    expect(
      evaluateTripCreationGate(view({ connected_trips_known: false, connected_trips: 0 })),
    ).toEqual({ status: "checking" });
  });

  it("allows a confirmed free user below the limit", () => {
    expect(evaluateTripCreationGate(view({ connected_trips: 2 }))).toEqual({ status: "allowed" });
  });

  it("blocks a confirmed free user at or above three connections", () => {
    expect(evaluateTripCreationGate(view({ connected_trips: 3 }))).toEqual({
      status: "limit_reached",
    });
    expect(evaluateTripCreationGate(view({ connected_trips: 9 }))).toEqual({
      status: "limit_reached",
    });
  });

  it("allows an entitled member regardless of count", () => {
    expect(evaluateTripCreationGate(view({ isPremium: true, connected_trips: 42 }))).toEqual({
      status: "allowed",
    });
  });

  it("does not unlock on an unconfirmed premium-looking state", () => {
    expect(
      evaluateTripCreationGate(view({ isPremium: true, confirmed: false, unknown: true })),
    ).toEqual({ status: "checking" });
  });
});
