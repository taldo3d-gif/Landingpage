import {
  buildCarBuyLinks,
  formatCarLinksMessage,
  rentalDayCount,
} from "./car-buy-links.js";
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
  maxPrice?: number;
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
  const ceiling = effectiveCarCeiling(input.maxPrice, marginPct);
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
    return (
      `${i + 1}. ${money(q.price)} total (~${money(q.pricePerDay)}/dia)` +
      ` · ${q.category} · ${q.supplier ?? "—"} · ${tag}`
    );
  });

  const teto =
    input.maxPrice != null
      ? ` · teto ${money(input.maxPrice)} total` +
        ` (margem ${marginPct}% → ${money(ceiling ?? input.maxPrice)})`
      : "";

  const note =
    mode === "recorded"
      ? "Há preço registrado pelo usuário/agente; abra os links para confirmar ao vivo."
      : "Sem API de preço de carro no token atual — use os links para cotação ao vivo. Estimativa só como faixa.";

  const chatMarkdown = [
    `🚗 ${place} · ${input.pickupDate} ${input.pickupTime ?? "14:00"}` +
      ` → ${input.dropoffDate} ${input.dropoffTime ?? "12:00"}` +
      ` · ${days} dia(s) · ${category}${teto}`,
    "",
    ...quoteLines,
    "",
    note,
    "",
    formatCarLinksMessage(links, category),
    "",
    "Confira proteção (CDW), condutor extra, km livre e taxa aeroporto antes de pagar.",
  ].join("\n");

  return {
    mode,
    days,
    ceiling,
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
    maxPrice: watch.maxPrice,
    marginPct: watch.marginPct,
    driverAge: watch.driverAge,
    currency: watch.currency,
    lastSeenPrice: watch.lastSeenPrice,
    lastSeenSource: watch.lastSeenSource,
  };
}
