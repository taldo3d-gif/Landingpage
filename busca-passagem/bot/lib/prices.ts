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
  const perAdult = Math.max(220, Math.round((input.maxPrice ?? 1500) * 0.72));
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
      durationMinutes: 170,
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
  /** Total outbound minutes (flying + layover). */
  duration_to?: number;
  duration?: number;
};

/** Min block time guess so we can estimate layover ≈ duration - minBlock. */
const MIN_BLOCK_MINUTES = 120;

function estimatedLayoverMinutes(row: RawRow): number | null {
  const transfers = row.transfers ?? 0;
  if (transfers <= 0) return 0;
  const dur =
    typeof row.duration_to === "number"
      ? row.duration_to
      : typeof row.duration === "number"
        ? row.duration
        : null;
  if (dur == null) return null;
  return Math.max(0, dur - MIN_BLOCK_MINUTES);
}

/**
 * Accept nonstop, or 1 stop with layover ≤ maxLayoverMinutes.
 * directOnly=true → nonstop only.
 * Unknown layover on a connection → reject (avoids 17h surprises).
 */
function passesStops(
  row: RawRow,
  directOnly: boolean,
  maxLayoverMinutes: number,
): boolean {
  const transfers = row.transfers ?? 0;
  if (directOnly) return transfers === 0;
  if (transfers === 0) return true;
  if (transfers > 1) return false;
  const layover = estimatedLayoverMinutes(row);
  if (layover == null) return false;
  return layover <= maxLayoverMinutes;
}

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
    directOnly: boolean;
    maxLayoverMinutes: number;
    anyDate?: boolean;
  },
): PriceQuote[] {
  const adults = Math.max(1, input.adults);
  const out: PriceQuote[] = [];
  for (const row of rows) {
    if (typeof row.price !== "number" || !row.departure_at) continue;
    if (!passesStops(row, input.directOnly, input.maxLayoverMinutes)) continue;
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
      directOnly: input.directOnly,
      maxLayoverMinutes: input.maxLayoverMinutes,
    });
    const fn = row.flight_number != null ? String(row.flight_number) : null;
    const durationMinutes =
      typeof row.duration_to === "number"
        ? row.duration_to
        : typeof row.duration === "number"
          ? row.duration
          : null;
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
      durationMinutes,
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
  oneWay?: boolean;
}): Promise<RawRow[]> {
  const oneWay = input.oneWay ?? !input.returnDate;
  const params = new URLSearchParams({
    origin: input.origin.toUpperCase(),
    destination: input.destination.toUpperCase(),
    departure_at: input.departDate,
    currency: input.currency.toLowerCase(),
    market: process.env.TRAVELPAYOUTS_MARKET ?? "br",
    sorting: "price",
    limit: "50",
    one_way: oneWay ? "true" : "false",
    unique: "false",
    token: input.token,
  });
  if (!oneWay && input.returnDate) params.set("return_at", input.returnDate);

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

/** Compose RT from cheapest matching one-way outbound + inbound (both direct when asked). */
async function composeRoundTrip(input: {
  origin: string;
  destination: string;
  departDate: string;
  returnDate: string;
  adults: number;
  currency: string;
  flexDays: number;
  directOnly: boolean;
  maxLayoverMinutes: number;
  token: string;
  anyDate: boolean;
}): Promise<PriceQuote[]> {
  const adults = Math.max(1, input.adults);
  const outMonth = input.departDate.slice(0, 7);
  const retMonth = input.returnDate.slice(0, 7);

  const [rawOutDay, rawOutMonth, rawRetDay, rawRetMonth] = await Promise.all([
    fetchPricesForDates({
      origin: input.origin,
      destination: input.destination,
      departDate: input.departDate,
      currency: input.currency,
      token: input.token,
      oneWay: true,
    }),
    fetchPricesForDates({
      origin: input.origin,
      destination: input.destination,
      departDate: outMonth,
      currency: input.currency,
      token: input.token,
      oneWay: true,
    }),
    fetchPricesForDates({
      origin: input.destination,
      destination: input.origin,
      departDate: input.returnDate,
      currency: input.currency,
      token: input.token,
      oneWay: true,
    }),
    fetchPricesForDates({
      origin: input.destination,
      destination: input.origin,
      departDate: retMonth,
      currency: input.currency,
      token: input.token,
      oneWay: true,
    }),
  ]);

  const outRows = [...rawOutDay, ...rawOutMonth];
  const retRows = [...rawRetDay, ...rawRetMonth];

  const outs = toQuotes(outRows, {
    origin: input.origin,
    destination: input.destination,
    departDate: input.departDate,
    returnDate: null,
    adults: 1, // per-adult legs; we re-multiply below
    currency: input.currency,
    flexDays: input.anyDate ? 31 : input.flexDays,
    directOnly: input.directOnly,
    maxLayoverMinutes: input.maxLayoverMinutes,
    anyDate: input.anyDate,
  });
  const rets = toQuotes(retRows, {
    origin: input.destination,
    destination: input.origin,
    departDate: input.returnDate,
    returnDate: null,
    adults: 1,
    currency: input.currency,
    flexDays: input.anyDate ? 31 : input.flexDays,
    directOnly: input.directOnly,
    maxLayoverMinutes: input.maxLayoverMinutes,
    anyDate: input.anyDate,
  });

  if (outs.length === 0 || rets.length === 0) return [];

  // Pair top outs with top rets (cheapest combinations).
  const pairs: PriceQuote[] = [];
  for (const o of outs.slice(0, 5)) {
    for (const r of rets.slice(0, 5)) {
      const pricePerAdult = o.pricePerAdult + r.pricePerAdult;
      const buy = buildBuyLinks({
        origin: input.origin,
        destination: input.destination,
        departDate: o.flightDate,
        returnDate: r.flightDate,
        adults,
        directOnly: input.directOnly,
        maxLayoverMinutes: input.maxLayoverMinutes,
      });
      const airline =
        o.airline && r.airline
          ? o.airline === r.airline
            ? o.airline
            : `${o.airline}+${r.airline}`
          : o.airline ?? r.airline;
      const flightNumber = [o.flightNumber, r.flightNumber].filter(Boolean).join("/");
      const transfers = Math.max(o.transfers ?? 0, r.transfers ?? 0);
      pairs.push({
        price: Math.round(pricePerAdult * adults),
        pricePerAdult,
        currency: input.currency.toUpperCase(),
        airline,
        flightNumber: flightNumber || null,
        flightDate: o.flightDate,
        returnDate: r.flightDate,
        departures: [...o.departures, ...r.departures],
        transfers,
        durationMinutes: o.durationMinutes,
        source: "travelpayouts",
        buy,
      });
    }
  }
  pairs.sort((a, b) => a.price - b.price);
  // Dedupe by dates + price
  const seen = new Set<string>();
  const uniq: PriceQuote[] = [];
  for (const p of pairs) {
    const key = `${p.flightDate}|${p.returnDate}|${p.pricePerAdult}`;
    if (seen.has(key)) continue;
    seen.add(key);
    uniq.push(p);
  }
  return uniq.slice(0, 8);
}

/**
 * Travelpayouts prices are **per adult**.
 * `maxPrice` = ceiling **per person** (ida+volta when returnDate set).
 * `directOnly` keeps transfers === 0.
 * Round-trips: try RT cache first; if empty, compose OW ida + OW volta.
 */
export async function searchPrices(input: {
  origin: string;
  destination: string;
  departDate: string;
  returnDate?: string | null;
  adults: number;
  maxPrice?: number;
  marginPct?: number;
  flexDays?: number;
  /** Only nonstop (transfers === 0). Default false. */
  directOnly?: boolean;
  /** Max connection wait minutes when not directOnly. Default 180 (3h). */
  maxLayoverMinutes?: number;
  currency: string;
}): Promise<{
  quotes: PriceQuote[];
  underCeiling: PriceQuote[];
  nearby: PriceQuote[];
  mode: "travelpayouts" | "mock";
  links: BuyLinks;
  note: string;
  ceiling: number | null;
  ceilingTotal: number | null;
  marginPct: number;
  flexDays: number;
  directOnly: boolean;
  maxLayoverMinutes: number;
}> {
  const adults = Math.max(1, input.adults);
  const marginPct = input.marginPct ?? 15;
  const flexDays = input.flexDays ?? 0;
  const directOnly = input.directOnly ?? false;
  const maxLayoverMinutes = input.maxLayoverMinutes ?? 180;
  const ceiling = effectiveCeiling(input.maxPrice, marginPct);
  const ceilingTotal = ceiling == null ? null : ceiling * adults;
  const links = buildBuyLinks({
    ...input,
    adults,
    directOnly,
    maxLayoverMinutes,
  });

  const under = (list: PriceQuote[]) =>
    ceiling == null ? list : list.filter((q) => q.pricePerAdult <= ceiling);

  if (!travelpayoutsConfigured()) {
    const quotes = mockQuotes({ ...input, adults });
    return {
      quotes,
      underCeiling: under(quotes),
      nearby: [],
      mode: "mock",
      links,
      note: "TRAVELPAYOUTS_TOKEN ausente — preços mock.",
      ceiling,
      ceilingTotal,
      marginPct,
      flexDays,
      directOnly,
      maxLayoverMinutes,
    };
  }

  const token = process.env.TRAVELPAYOUTS_TOKEN!.trim();
  const month = input.departDate.slice(0, 7);
  const base = { ...input, adults, flexDays, directOnly, maxLayoverMinutes };

  let quotes: PriceQuote[] = [];
  let nearby: PriceQuote[] = [];

  if (input.returnDate) {
    // 1) Combined RT cache for exact/flex window
    let raw = await fetchPricesForDates({ ...input, token });
    quotes = toQuotes(raw, { ...base, returnDate: input.returnDate });

    if (quotes.length === 0) {
      const rawMonth = await fetchPricesForDates({
        ...input,
        departDate: month,
        token,
      });
      quotes = toQuotes(rawMonth, { ...base, returnDate: input.returnDate });
    }

    // 2) Compose from one-ways (needed when RT cache empty — common on BR domestic)
    if (quotes.length === 0) {
      quotes = await composeRoundTrip({
        origin: input.origin,
        destination: input.destination,
        departDate: input.departDate,
        returnDate: input.returnDate,
        adults,
        currency: input.currency,
        flexDays,
        directOnly,
        maxLayoverMinutes,
        token,
        anyDate: false,
      });
    }

    if (quotes.length === 0) {
      nearby = await composeRoundTrip({
        origin: input.origin,
        destination: input.destination,
        departDate: input.departDate,
        returnDate: input.returnDate,
        adults,
        currency: input.currency,
        flexDays,
        directOnly,
        maxLayoverMinutes,
        token,
        anyDate: true,
      });
    }
  } else {
    let raw = await fetchPricesForDates({ ...input, token });
    quotes = toQuotes(raw, { ...base, returnDate: null });

    let rawMonth: RawRow[] | null = null;
    if (quotes.length === 0) {
      rawMonth = await fetchPricesForDates({
        ...input,
        departDate: month,
        token,
      });
      quotes = toQuotes(rawMonth, { ...base, returnDate: null });
    }

    if (quotes.length === 0) {
      if (!rawMonth) {
        rawMonth = await fetchPricesForDates({
          ...input,
          departDate: month,
          token,
        });
      }
      nearby = toQuotes(rawMonth, {
        ...base,
        returnDate: null,
        anyDate: true,
      }).slice(0, 8);
    }
  }

  return {
    quotes,
    underCeiling: under(quotes),
    nearby,
    mode: "travelpayouts",
    links,
    note:
      `Teto = por pessoa ida+volta (margem ${marginPct}% → ${ceiling ?? "—"}/adulto). ` +
      (directOnly
        ? "Somente voo DIRETO. "
        : `Direto ou 1 escala ≤ ${maxLayoverMinutes} min. `) +
      `Total = × ${adults}. Prefira Kayak se Decolar falhar.`,
    ceiling,
    ceilingTotal,
    marginPct,
    flexDays,
    directOnly,
    maxLayoverMinutes,
  };
}
