/** Shared JSON-shaped types for watches and deal alerts. */

export type FlightWatch = {
  id: string;
  origin: string;
  destination: string;
  departDate: string;
  returnDate: string | null;
  /** Target ceiling **per adult** (e.g. 1500 = R$1500/pessoa). */
  maxPrice: number;
  /** Allow offers up to maxPrice * (1 + marginPct/100) per adult. Default 15. */
  marginPct: number;
  /** Accept flights within ±flexDays of departDate. Default 0 (exact). */
  flexDays: number;
  /** Only nonstop flights (transfers === 0). If false, maxLayoverMinutes applies. */
  directOnly: boolean;
  /**
   * Max connection wait in minutes (default 180 = 3h).
   * Used when directOnly is false; allows 0–1 stop with short layover.
   */
  maxLayoverMinutes: number;
  currency: string;
  adults: number;
  active: boolean;
  notes: string | null;
  updatedAt: string;
};

export type PriceQuote = {
  /** Total for all adults (what you pay). */
  price: number;
  /** Per-adult fare from the data source. */
  pricePerAdult: number;
  currency: string;
  airline: string | null;
  flightNumber: string | null;
  /** Exact flight date YYYY-MM-DD (must match buy links). */
  flightDate: string;
  returnDate: string | null;
  departures: string[];
  transfers: number | null;
  /** Outbound duration minutes (block time + layover), when known. */
  durationMinutes: number | null;
  source: "travelpayouts" | "mock";
  /** Trusted buy links for THIS flight date (not a generic search). */
  buy: {
    decolar: string;
    kayak: string;
    skyscanner: string;
    googleFlights: string;
  };
};

export type BuyLinks = {
  googleFlights: string;
  kayak: string;
  skyscanner: string;
  decolar: string;
};
