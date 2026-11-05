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
  /**
   * Return-leg departure must be at/after this hour local (0–23).
   * e.g. 12 = volta só a partir do meio-dia. null = sem filtro.
   */
  returnAfterHour: number | null;
  currency: string;
  adults: number;
  active: boolean;
  notes: string | null;
  updatedAt: string;
};

/**
 * Cash-only BR comparison / buy deep links for one date set.
 * Metasearch + OTAs BR + cias. Sem milhas / MaxMilhas / 123milhas.
 */
export type BuyLinks = {
  kayak: string;
  skyscanner: string;
  googleFlights: string;
  momondo: string;
  expedia: string;
  voopter: string;
  viajanet: string;
  cvc: string;
  edestinos: string;
  booking: string;
  azul: string;
  latam: string;
  gol: string;
  /** Often flaky deep-link; kept last. */
  decolar: string;
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
  buy: BuyLinks;
};

/** Car category filter for rental watches. */
export type CarCategory =
  | "economy"
  | "compact"
  | "intermediate"
  | "suv"
  | "any";

/**
 * Car rental price watch (pickup/dropoff + total ceiling).
 * maxPrice = total for the whole rental; maxPricePerDay is the preferred user ceiling.
 */
export type CarWatch = {
  id: string;
  /** IATA when airport pickup (e.g. REC). */
  pickupIata: string;
  pickupLabel: string;
  dropoffIata: string;
  dropoffLabel: string;
  pickupDate: string;
  dropoffDate: string;
  /** Local HH:mm */
  pickupTime: string;
  /** Local HH:mm */
  dropoffTime: string;
  category: CarCategory;
  /**
   * Preferred model hint (e.g. "T-Cross") — category still drives filters.
   */
  modelHint: string | null;
  /** Ceiling for the FULL rental period (BRL total). */
  maxPrice: number;
  /** Preferred daily ceiling (BRL/day). Used to derive/display maxPrice. */
  maxPricePerDay: number | null;
  /** Allow up to maxPrice * (1 + marginPct/100). Default 15. */
  marginPct: number;
  currency: string;
  /** Minimum driver age for deep links (default 25). */
  driverAge: number;
  active: boolean;
  notes: string | null;
  /**
   * Last total price the user/agent saw live on a comparator (BRL).
   * Used to alert when ≤ ceiling until a lower price is recorded.
   */
  lastSeenPrice: number | null;
  lastSeenAt: string | null;
  lastSeenSource: string | null;
  updatedAt: string;
};

/** Cash-only BR car rental comparison / booking deep links. */
export type CarBuyLinks = {
  kayak: string;
  rentcars: string;
  booking: string;
  expedia: string;
  discoverCars: string;
  skyscanner: string;
  localiza: string;
  movida: string;
  unidas: string;
  foco: string;
};

export type CarQuote = {
  /** Total for the rental period. */
  price: number;
  /** Approximate per-day (total / days). */
  pricePerDay: number;
  currency: string;
  category: CarCategory;
  supplier: string | null;
  source: "recorded" | "estimate";
  buy: CarBuyLinks;
};
