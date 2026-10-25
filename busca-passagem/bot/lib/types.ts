/** Shared JSON-shaped types for watches and holds (no interfaces). */

export type FlightWatch = {
  id: string;
  origin: string;
  destination: string;
  departDate: string;
  returnDate: string | null;
  maxPrice: number;
  currency: string;
  adults: number;
  active: boolean;
  notes: string | null;
  updatedAt: string;
};

export type FlightOfferSummary = {
  id: string;
  price: number;
  currency: string;
  airlines: string[];
  departures: string[];
  /** Full Amadeus offer JSON (string) for order creation; empty for thin summaries. */
  rawOfferJson: string;
  mock: boolean;
};

export type FlightHold = {
  id: string;
  watchId: string;
  offerId: string;
  price: number;
  currency: string;
  status: "pending_confirm" | "confirmed" | "cancelled" | "expired";
  expiresAt: string;
  amadeusOrderId: string | null;
  mock: boolean;
  createdAt: string;
  summary: string;
};
