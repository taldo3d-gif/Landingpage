import { buildBuyLinks } from "./buy-links.js";
import type { PriceQuote } from "./types.js";

export function travelpayoutsConfigured(): boolean {
  return Boolean(process.env.TRAVELPAYOUTS_TOKEN);
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

/**
 * Cached prices from Aviasales/Travelpayouts Data API (personal/affiliate token).
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
}): Promise<{ quotes: PriceQuote[]; mode: "travelpayouts" | "mock"; links: ReturnType<typeof buildBuyLinks> }> {
  const links = buildBuyLinks(input);

  if (!travelpayoutsConfigured()) {
    return { quotes: mockQuotes(input), mode: "mock", links };
  }

  const token = process.env.TRAVELPAYOUTS_TOKEN!;
  const params = new URLSearchParams({
    origin: input.origin.toUpperCase(),
    destination: input.destination.toUpperCase(),
    departure_at: input.departDate,
    currency: input.currency.toLowerCase(),
    market: process.env.TRAVELPAYOUTS_MARKET ?? "br",
    sorting: "price",
    limit: "10",
    one_way: input.returnDate ? "false" : "true",
    token,
  });
  if (input.returnDate) params.set("return_at", input.returnDate);

  const res = await fetch(
    `https://api.travelpayouts.com/aviasales/v3/prices_for_dates?${params}`,
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Travelpayouts failed (${res.status}): ${text.slice(0, 240)}`);
  }
  const json = (await res.json()) as {
    data?: Array<{
      price?: number;
      airline?: string;
      departure_at?: string;
      return_at?: string;
      link?: string;
    }>;
  };

  const quotes: PriceQuote[] = (json.data ?? [])
    .filter((row) => typeof row.price === "number")
    .map((row) => ({
      price: row.price as number,
      currency: input.currency.toUpperCase(),
      airline: row.airline ?? null,
      departures: [row.departure_at, row.return_at].filter(
        (v): v is string => typeof v === "string",
      ),
      source: "travelpayouts" as const,
      deepLink: row.link
        ? `https://www.aviasales.com${row.link.startsWith("/") ? row.link : `/${row.link}`}`
        : links.googleFlights,
    }))
    .sort((a, b) => a.price - b.price);

  return { quotes, mode: "travelpayouts", links };
}
