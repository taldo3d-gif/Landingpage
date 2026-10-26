/** Shared JSON-shaped types for watches and deal alerts. */

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

export type PriceQuote = {
  price: number;
  currency: string;
  airline: string | null;
  departures: string[];
  source: "travelpayouts" | "mock";
  deepLink: string | null;
};

export type BuyLinks = {
  googleFlights: string;
  kayak: string;
  skyscanner: string;
  decolar: string;
};
