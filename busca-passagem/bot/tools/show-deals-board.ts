import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { searchPrices } from "../lib/prices.js";
import type { PriceQuote } from "../lib/types.js";

function money(price: number, currency: string): string {
  try {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(price);
  } catch {
    return `${price} ${currency}`;
  }
}

function formatQuote(q: PriceQuote, i: number, adults: number): string {
  const when = q.departures[0] ? ` · sai ${q.departures[0]}` : "";
  const cia = q.airline
    ? ` · ${q.airline}${q.flightNumber ?? ""}`
    : "";
  const stops =
    q.transfers == null
      ? ""
      : q.transfers === 0
        ? " · direto"
        : ` · ${q.transfers} parada(s)`;
  const per =
    adults > 1
      ? ` (${money(q.pricePerAdult, q.currency)}/adulto × ${adults})`
      : "";
  return (
    `${i + 1}. ${money(q.price, q.currency)} total${per}${cia}${stops} · data ${q.flightDate}${when}\n` +
    `   Decolar: ${q.buy.decolar}\n` +
    `   Kayak: ${q.buy.kayak}`
  );
}

export default defineTool({
  description:
    "Search real fares for the exact date (total for all adults). Each item has Decolar/Kayak links for THAT same flight date. Supports margin above maxPrice. If exact day is empty, returns nearby dates in the month with matching links.",
  effect: "read",
  inputSchema: z.object({
    origin: z.string().min(3).max(3),
    destination: z.string().min(3).max(3),
    departDate: z.string(),
    returnDate: z.string().nullable().optional(),
    adults: z.number().int().min(1).max(9).optional(),
    currency: z.string().min(3).max(3).optional(),
    maxPrice: z.number().positive().optional().describe("Total ceiling for all adults"),
    marginPct: z
      .number()
      .min(0)
      .max(50)
      .optional()
      .describe("Allow this % above maxPrice (default 15)"),
    flexDays: z
      .number()
      .int()
      .min(0)
      .max(7)
      .optional()
      .describe("Accept flights ±N days (default 0 = exact date)"),
  }),
  async execute(input) {
    const adults = input.adults ?? 2;
    const currency = (input.currency ?? "BRL").toUpperCase();
    const marginPct = input.marginPct ?? 15;
    const flexDays = input.flexDays ?? 0;
    const result = await searchPrices({
      origin: input.origin,
      destination: input.destination,
      departDate: input.departDate,
      returnDate: input.returnDate ?? null,
      adults,
      currency,
      maxPrice: input.maxPrice,
      marginPct,
      flexDays,
    });

    const primary =
      result.underCeiling.length > 0
        ? result.underCeiling
        : result.quotes.length > 0
          ? result.quotes
          : result.nearby;
    const quotes = primary.slice(0, 5);
    const cheapest = quotes[0] ?? null;
    const usingNearby =
      result.underCeiling.length === 0 &&
      result.quotes.length === 0 &&
      result.nearby.length > 0;

    const headerLabel = usingNearby
      ? `Sem voo em ${input.departDate} no cache — datas próximas no mês (cada link = data do item):`
      : result.underCeiling.length > 0
        ? "Dentro do teto (com margem):"
        : result.quotes.length > 0
          ? "Nada dentro do teto — mais baratos na data pedida:"
          : `Nenhum voo na data ${input.departDate}` +
            (flexDays ? ` (±${flexDays}d)` : "") +
            ".";

    const priceLines =
      quotes.length === 0
        ? [headerLabel]
        : [headerLabel, ...quotes.map((q, i) => formatQuote(q, i, adults))];

    const chatMarkdown = [
      `${input.origin.toUpperCase()} → ${input.destination.toUpperCase()} · pedido ${input.departDate}` +
        (input.returnDate ? ` ↺ ${input.returnDate}` : "") +
        ` · ${adults} adulto(s)` +
        (input.maxPrice != null
          ? ` · teto ${money(input.maxPrice, currency)} (margem ${marginPct}% → até ${money(result.ceiling ?? input.maxPrice, currency)})`
          : ""),
      "",
      ...priceLines,
      "",
      "Abra Decolar ou Kayak do item — a data do link é a do preço.",
    ].join("\n");

    return {
      mode: result.mode,
      dealCount: result.quotes.length,
      underCeilingCount: result.underCeiling.length,
      nearbyCount: result.nearby.length,
      usingNearby,
      cheapest,
      ceiling: result.ceiling,
      marginPct,
      flexDays,
      chatMarkdown,
      note: result.note,
    };
  },
});
