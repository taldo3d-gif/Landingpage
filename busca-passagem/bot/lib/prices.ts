import { buildBuyLinks } from "./buy-links.js";
import type { BuyLinks, PriceQuote } from "./types.js";

export function travelpayoutsConfigured(): boolean {
  const t = process.env.TRAVELPAYOUTS_TOKEN?.trim();
  return Boolean(t);
}

function dayOnly(isoOrDate: string): string {
  return isoOrDate.slice(0, 10);
}

function parseDay(d: string): number {
  return Date.parse(`${dayOnly(d)}T12:00:00Z`);
}

function withinFlex(flightDate: string, target: string, flexDays: number): boolean {
  if (flexDays <= 0) return dayOnly(flightDate) === dayOnly(target);
  const diff = Math.abs(parseDay(flightDate) - parseDay(target));
  return diff <= flexDays * 86_400_000;
}

/** Effective buy ceiling: maxPrice + margin%. */
export function effectiveCeiling(
  maxPrice: number | undefined,
  marginPct: number,
): number | null {
  if (maxPrice == null) return null;
  return Math.round(maxPrice * (1 + Math.max(0, marginPct) / 100));
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
  const perAdult = Math.max(
    220,
    Math.round(((input.maxPrice ?? 1500) / input.adults) * 0.72),
  );
  const buy = buildBuyLinks(input);
  return [
    {
      price: perAdult * input.adults,
      pricePerAdult: perAdult,
      currency: input.currency,
      airline: "G3",
      flightNumber: "1234",
      flightDate: input.departDate,
      returnDate: input.returnDate ?? null,
      departures: [`${input.departDate}T08:15`],
      transfers: 0,
      source: "mock",
      buy,
    },
  ];
}

type RawRow = {
  price?: number;
  airline?: string;
  flight_number?: string | number;
  departure_at?: string;
  return_at?: string;
  transfers?: number;
};

function toQuotes(
  rows: RawRow[],
  input: {
    origin: string;
    destination: string;
    departDate: string;
    returnDate?: string | null;
    adults: number;
    currency: string;
    flexDays: number;
    /** If true, keep any date in the fetched set (still sorted by price). */
    anyDate?: boolean;
  },
): PriceQuote[] {
  const adults = Math.max(1, input.adults);
  const out: PriceQuote[] = [];
  for (const row of rows) {
    if (typeof row.price !== "number" || !row.departure_at) continue;
    const flightDate = dayOnly(row.departure_at);
    if (!input.anyDate && !withinFlex(flightDate, input.departDate, input.flexDays)) {
      continue;
    }
    const ret = row.return_at ? dayOnly(row.return_at) : input.returnDate ?? null;
    if (
      !input.anyDate &&
      input.returnDate &&
      ret &&
      !withinFlex(ret, input.returnDate, input.flexDays)
    ) {
      continue;
    }
    const pricePerAdult = row.price;
    const price = Math.round(pricePerAdult * adults);
    const buy = buildBuyLinks({
      origin: input.origin,
      destination: input.destination,
      departDate: flightDate,
      returnDate: ret,
      adults,
    });
    const fn =
      row.flight_number != null ? String(row.flight_number) : null;
    out.push({
      price,
      pricePerAdult,
      currency: input.currency.toUpperCase(),
      airline: row.airline ?? null,
      flightNumber: fn,
      flightDate,
      returnDate: ret,
      departures: [row.departure_at, row.return_at].filter(
        (v): v is string => typeof v === "string",
      ),
      transfers: typeof row.transfers === "number" ? row.transfers : null,
      source: "travelpayouts",
      buy,
    });
  }
  out.sort((a, b) => a.price - b.price || a.flightDate.localeCompare(b.flightDate));
  return out;
}

async function fetchPricesForDates(input: {
  origin: string;
  destination: string;
  departDate: string;
  returnDate?: string | null;
  currency: string;
  token: string;
}): Promise<RawRow[]> {
  const params = new URLSearchParams({
    origin: input.origin.toUpperCase(),
    destination: input.destination.toUpperCase(),
    departure_at: input.departDate,
    currency: input.currency.toLowerCase(),
    market: process.env.TRAVELPAYOUTS_MARKET ?? "br",
    sorting: "price",
    limit: "50",
    one_way: input.returnDate ? "false" : "true",
    unique: "false",
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
  const json = (await res.json()) as { data?: RawRow[] };
  return json.data ?? [];
}

/**
 * Travelpayouts Data API prices are **per adult** (cache).
 * We multiply by `adults` and build buy links for the **exact flight date**
 * of each quote — never the requested date if the fare is on another day.
 */
export async function searchPrices(input: {
  origin: string;
  destination: string;
  departDate: string;
  returnDate?: string | null;
  adults: number;
  maxPrice?: number;
  /** Extra headroom above maxPrice, percent. Default 15. */
  marginPct?: number;
  /** ± days around departDate. Default 0. */
  flexDays?: number;
  currency: string;
}): Promise<{
  quotes: PriceQuote[];
  underCeiling: PriceQuote[];
  /** Same month, other days — only when exact/flex window is empty. */
  nearby: PriceQuote[];
  mode: "travelpayouts" | "mock";
  links: BuyLinks;
  note: string;
  ceiling: number | null;
  marginPct: number;
  flexDays: number;
}> {
  const adults = Math.max(1, input.adults);
  const marginPct = input.marginPct ?? 15;
  const flexDays = input.flexDays ?? 0;
  const ceiling = effectiveCeiling(input.maxPrice, marginPct);
  const links = buildBuyLinks({ ...input, adults });

  if (!travelpayoutsConfigured()) {
    const quotes = mockQuotes({ ...input, adults });
    return {
      quotes,
      underCeiling:
        ceiling == null ? quotes : quotes.filter((q) => q.price <= ceiling),
      nearby: [],
      mode: "mock",
      links,
      note: "TRAVELPAYOUTS_TOKEN ausente — preços mock.",
      ceiling,
      marginPct,
      flexDays,
    };
  }

  const token = process.env.TRAVELPAYOUTS_TOKEN!.trim();
  const month = input.departDate.slice(0, 7);

  // 1) Exact / flex window (prefer day-specific API call first).
  let raw = await fetchPricesForDates({ ...input, token });
  let quotes = toQuotes(raw, { ...input, adults, flexDays });

  // 2) Month scan if empty — still filter to flex/exact day for `quotes`.
  let rawMonth: RawRow[] | null = null;
  if (quotes.length === 0) {
    rawMonth = await fetchPricesForDates({
      ...input,
      departDate: month,
      token,
    });
    quotes = toQuotes(rawMonth, { ...input, adults, flexDays });
  }

  // 3) Nearby alternatives in the same month (real dates + matching links).
  let nearby: PriceQuote[] = [];
  if (quotes.length === 0) {
    if (!rawMonth) {
      rawMonth = await fetchPricesForDates({
        ...input,
        departDate: month,
        token,
      });
    }
    nearby = toQuotes(rawMonth, {
      ...input,
      adults,
      flexDays: 0,
      anyDate: true,
    }).slice(0, 8);
  }

  const underCeiling =
    ceiling == null ? quotes : quotes.filter((q) => q.price <= ceiling);

  return {
    quotes,
    underCeiling,
    nearby,
    mode: "travelpayouts",
    links,
    note:
      `Total = tarifa/adulto × ${adults}. Cada link usa a DATA DO ITEM. ` +
      `Teto com margem ${marginPct}%: ${ceiling ?? "—"}. ` +
      `Confira o total na Decolar/Kayak antes de pagar (cache pode variar).`,
    ceiling,
    marginPct,
    flexDays,
  };
}
