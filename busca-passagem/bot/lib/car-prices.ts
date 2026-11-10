import {
  buildCarBuyLinks,
  formatCarLinksMessage,
  rentalDayCount,
} from "./car-buy-links.js";
import { formatAirportStoresMarkdown } from "./car-stores.js";
import type { CarBuyLinks, CarCategory, CarQuote, CarWatch } from "./types.js";

export function effectiveCarCeiling(
  maxPrice: number | undefined,
  marginPct: number,
): number | null {
  if (maxPrice == null) return null;
  return Math.round(maxPrice * (1 + Math.max(0, marginPct) / 100));
}

/**
 * Rough seasonal reference totals for REC airport (cash, economy-ish).
 * High season (Christmas/NY) is marked up. Not a live quote.
 */
function estimateTotal(input: {
  days: number;
  category: CarCategory;
  pickupDate: string;
}): number {
  const month = Number(input.pickupDate.slice(5, 7));
  const highSeason = month === 12 || month === 1 || month === 7;
  const basePerDay =
    input.category === "suv"
      ? 220
      : input.category === "intermediate"
        ? 160
        : input.category === "compact"
          ? 140
          : 120;
  const season = highSeason ? 1.45 : 1;
  return Math.round(basePerDay * season * input.days);
}

export function searchCarPrices(input: {
  pickupIata: string;
  pickupLabel?: string;
  dropoffIata?: string;
  pickupDate: string;
  dropoffDate: string;
  pickupTime?: string;
  dropoffTime?: string;
  category?: CarCategory;
  modelHint?: string | null;
  maxPrice?: number;
  maxPricePerDay?: number | null;
  marginPct?: number;
  driverAge?: number;
  currency?: string;
  /** Optional live total recorded by user/agent. */
  lastSeenPrice?: number | null;
  lastSeenSource?: string | null;
}): {
  mode: "recorded" | "estimate";
  days: number;
  ceiling: number | null;
  ceilingPerDay: number | null;
  links: CarBuyLinks;
  quotes: CarQuote[];
  underCeiling: CarQuote[];
  note: string;
  chatMarkdown: string;
} {
  const category = input.category ?? "economy";
  const currency = (input.currency ?? "BRL").toUpperCase();
  const marginPct = input.marginPct ?? 15;
  const days = rentalDayCount(input.pickupDate, input.dropoffDate);
  const derivedTotal =
    input.maxPrice ??
    (input.maxPricePerDay != null
      ? Math.round(input.maxPricePerDay * days)
      : undefined);
  const ceiling = effectiveCarCeiling(derivedTotal, marginPct);
  const ceilingPerDay =
    ceiling != null ? Math.round(ceiling / days) : null;
  const targetPerDay =
    input.maxPricePerDay ??
    (derivedTotal != null ? Math.round(derivedTotal / days) : null);
  const links = buildCarBuyLinks({
    pickupIata: input.pickupIata,
    pickupDate: input.pickupDate,
    dropoffDate: input.dropoffDate,
    pickupTime: input.pickupTime,
    dropoffTime: input.dropoffTime,
    category,
    driverAge: input.driverAge,
  });

  const quotes: CarQuote[] = [];
  if (
    typeof input.lastSeenPrice === "number" &&
    Number.isFinite(input.lastSeenPrice) &&
    input.lastSeenPrice > 0
  ) {
    quotes.push({
      price: Math.round(input.lastSeenPrice),
      pricePerDay: Math.round(input.lastSeenPrice / days),
      currency,
      category,
      supplier: input.lastSeenSource ?? "registrado",
      source: "recorded",
      buy: links,
    });
  }

  const estimate = estimateTotal({
    days,
    category,
    pickupDate: input.pickupDate,
  });
  quotes.push({
    price: estimate,
    pricePerDay: Math.round(estimate / days),
    currency,
    category,
    supplier: "faixa estimada alta temporada",
    source: "estimate",
    buy: links,
  });

  const underCeiling =
    ceiling == null
      ? quotes.filter((q) => q.source === "recorded")
      : quotes.filter((q) => q.price <= ceiling);

  const mode = quotes.some((q) => q.source === "recorded")
    ? "recorded"
    : "estimate";

  const place =
    input.pickupLabel ?? `Aeroporto ${input.pickupIata.toUpperCase()}`;
  const modelBit = input.modelHint ? ` · alvo ${input.modelHint}` : "";
  const money = (n: number) => {
    try {
      return new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
      }).format(n);
    } catch {
      return `${n} ${currency}`;
    }
  };

  const quoteLines = quotes.map((q, i) => {
    const tag = q.source === "recorded" ? "visto ao vivo" : "estimativa";
    const vsDaily =
      targetPerDay != null
        ? q.pricePerDay <= targetPerDay
          ? " ≤ teto/dia"
          : " acima do teto/dia"
        : "";
    return (
      `${i + 1}. ${money(q.price)} total (~${money(q.pricePerDay)}/dia${vsDaily})` +
      ` · ${q.category} · ${q.supplier ?? "—"} · ${tag}`
    );
  });

  const teto =
    derivedTotal != null
      ? ` · teto ${money(targetPerDay ?? Math.round(derivedTotal / days))}/dia` +
        ` (= ${money(derivedTotal)} total, margem ${marginPct}% → ${money(ceiling ?? derivedTotal)}` +
        (ceilingPerDay != null ? ` / ~${money(ceilingPerDay)}/dia` : "") +
        ")"
      : "";

  const note =
    mode === "recorded"
      ? "Há preço registrado; confirme ao vivo (SUV/T-Cross ou hatch Polo/HB20 conforme o watch)."
      : "Sem API de preço ao vivo — abra Kayak/Momondo (filtro SUV ou pequeno/hatch). Locadoras podem pedir Continuar. Estimativa só como faixa.";

  const chatMarkdown = [
    `🚗 ${place} · ${input.pickupDate} ${input.pickupTime ?? "14:00"}` +
      ` → ${input.dropoffDate} ${input.dropoffTime ?? "12:00"}` +
      ` · ${days} dia(s) · ${category}${modelBit}${teto}`,
    "",
    ...quoteLines,
    "",
    note,
    "",
    formatCarLinksMessage(links, category),
    "",
    formatAirportStoresMarkdown(input.pickupIata),
    "",
    "Confira proteção (CDW), condutor extra, km livre e taxa aeroporto antes de pagar.",
  ].join("\n");

  return {
    mode,
    days,
    ceiling,
    ceilingPerDay,
    links,
    quotes,
    underCeiling,
    note,
    chatMarkdown,
  };
}

export function carWatchSearchInput(watch: CarWatch) {
  return {
    pickupIata: watch.pickupIata,
    pickupLabel: watch.pickupLabel,
    dropoffIata: watch.dropoffIata,
    pickupDate: watch.pickupDate,
    dropoffDate: watch.dropoffDate,
    pickupTime: watch.pickupTime,
    dropoffTime: watch.dropoffTime,
    category: watch.category,
    modelHint: watch.modelHint,
    maxPrice: watch.maxPrice,
    maxPricePerDay: watch.maxPricePerDay,
    marginPct: watch.marginPct,
    driverAge: watch.driverAge,
    currency: watch.currency,
    lastSeenPrice: watch.lastSeenPrice,
    lastSeenSource: watch.lastSeenSource,
  };
}
