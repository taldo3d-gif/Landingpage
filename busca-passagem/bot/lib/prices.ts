import { buildBuyLinks } from "./buy-links.js";
import type { PriceQuote } from "./types.js";

export function travelpayoutsConfigured(): boolean {
  const t = process.env.TRAVELPAYOUTS_TOKEN?.trim();
  return Boolean(t);
}

function mockQuotes(input: {
  origin: string;
  destination: string;
  departDate: string;
  returnDate?: string | null;
  adults: number;
  maxPrice?: number;
  currency: string;
}): PriceQuote[] {
  const base = Math.max(220, Math.round((input.maxPrice ?? 1500) * 0.68));
  const links = buildBuyLinks(input);
  return [
    {
      price: base,
      currency: input.currency,
      airline: "G3",
      departures: [`${input.departDate}T08:15`],
      source: "mock",
      deepLink: links.googleFlights,
    },
    {
      price: base + 180,
      currency: input.currency,
      airline: "LA",
      departures: [`${input.departDate}T14:40`],
      source: "mock",
      deepLink: links.kayak,
    },
  ];
}

function mapRows(
  rows: Array<{
    price?: number;
    airline?: string;
    departure_at?: string;
    return_at?: string;
    link?: string;
    transfers?: number;
  }>,
  currency: string,
  /** Always a trusted buy URL (Google/Decolar/…), never Aviasales/Kiwi affiliate. */
  trustedBuyLink: string,
): PriceQuote[] {
  return rows
    .filter((row) => typeof row.price === "number")
    .map((row) => ({
      price: row.price as number,
      currency: currency.toUpperCase(),
      airline: row.airline ?? null,
      departures: [row.departure_at, row.return_at].filter(
        (v): v is string => typeof v === "string",
      ),
      source: "travelpayouts" as const,
      // Price from Travelpayouts; checkout only via trusted meta/OTA links.
      deepLink: trustedBuyLink,
    }))
    .sort((a, b) => a.price - b.price);
}

async function fetchPricesForDates(input: {
  origin: string;
  destination: string;
  departDate: string;
  returnDate?: string | null;
  currency: string;
  token: string;
}): Promise<PriceQuote[]> {
  const params = new URLSearchParams({
    origin: input.origin.toUpperCase(),
    destination: input.destination.toUpperCase(),
    departure_at: input.departDate,
    currency: input.currency.toLowerCase(),
    market: process.env.TRAVELPAYOUTS_MARKET ?? "br",
    sorting: "price",
    limit: "30",
    one_way: input.returnDate ? "false" : "true",
    token: input.token,
  });
  if (input.returnDate) params.set("return_at", input.returnDate);

  const res = await fetch(
    `https://api.travelpayouts.com/aviasales/v3/prices_for_dates?${params}`,
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Travelpayouts prices_for_dates (${res.status}): ${text.slice(0, 240)}`);
  }
  const json = (await res.json()) as { data?: Array<Record<string, unknown>> };
  const links = buildBuyLinks({
    origin: input.origin,
    destination: input.destination,
    departDate: input.departDate,
    returnDate: input.returnDate,
    adults: 2,
  });
  return mapRows(
    (json.data ?? []) as Array<{
      price?: number;
      airline?: string;
      departure_at?: string;
      return_at?: string;
      link?: string;
    }>,
    input.currency,
    links.googleFlights,
  );
}

/** Cheapest cached tickets for the month of departDate (broader net for "bugs"). */
async function fetchCheapMonth(input: {
  origin: string;
  destination: string;
  departDate: string;
  currency: string;
  token: string;
}): Promise<PriceQuote[]> {
  const month = input.departDate.slice(0, 7); // YYYY-MM
  const params = new URLSearchParams({
    origin: input.origin.toUpperCase(),
    destination: input.destination.toUpperCase(),
    departure_at: month,
    currency: input.currency.toLowerCase(),
    market: process.env.TRAVELPAYOUTS_MARKET ?? "br",
    sorting: "price",
    limit: "30",
    one_way: "true",
    token: input.token,
  });
  const res = await fetch(
    `https://api.travelpayouts.com/aviasales/v3/prices_for_dates?${params}`,
  );
  if (!res.ok) return [];
  const json = (await res.json()) as { data?: Array<Record<string, unknown>> };
  const links = buildBuyLinks({
    origin: input.origin,
    destination: input.destination,
    departDate: input.departDate,
    returnDate: null,
    adults: 2,
  });
  return mapRows(
    (json.data ?? []) as Array<{
      price?: number;
      airline?: string;
      departure_at?: string;
      return_at?: string;
      link?: string;
    }>,
    input.currency,
    links.googleFlights,
  );
}

/**
 * Cached prices from Aviasales/Travelpayouts Data API.
 * Docs: https://support.travelpayouts.com/hc/en-us/articles/203956163
 */
export async function searchPrices(input: {
  origin: string;
  destination: string;
  departDate: string;
  returnDate?: string | null;
  adults: number;
  maxPrice?: number;
  currency: string;
  includeMonthScan?: boolean;
}): Promise<{
  quotes: PriceQuote[];
  mode: "travelpayouts" | "mock";
  links: ReturnType<typeof buildBuyLinks>;
  note: string;
}> {
  const links = buildBuyLinks(input);

  if (!travelpayoutsConfigured()) {
    return {
      quotes: mockQuotes(input),
      mode: "mock",
      links,
      note: "TRAVELPAYOUTS_TOKEN ausente — preços mock. Links de compra são reais.",
    };
  }

  const token = process.env.TRAVELPAYOUTS_TOKEN!.trim();
  const exact = await fetchPricesForDates({ ...input, token });
  let quotes = exact;
  if ((input.includeMonthScan ?? true) && exact.length < 3) {
    const month = await fetchCheapMonth({ ...input, token });
    const seen = new Set(exact.map((q) => `${q.price}-${q.airline}-${q.departures[0]}`));
    for (const q of month) {
      const k = `${q.price}-${q.airline}-${q.departures[0]}`;
      if (!seen.has(k)) {
        quotes.push(q);
        seen.add(k);
      }
    }
    quotes.sort((a, b) => a.price - b.price);
  }

  return {
    quotes,
    mode: "travelpayouts",
    links,
    note:
      "Preços do cache Aviasales (referência). Compra só via Google Flights / Decolar / Kayak / Skyscanner — nunca Kiwi/Kiwifi nem checkout Aviasales. Confira o valor no site antes de pagar. Valores tipicamente por adulto.",
  };
}
