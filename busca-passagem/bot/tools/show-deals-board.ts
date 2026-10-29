import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import {
  formatLinksMessage,
  formatQuoteLinkLine,
} from "../lib/buy-links.js";
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
  const whenOut = q.departures[0] ? ` · ida ${q.departures[0]}` : "";
  const whenRet = q.departures[1] ? ` · volta ${q.departures[1]}` : "";
  const dates =
    q.returnDate != null
      ? ` · ${q.flightDate} ↺ ${q.returnDate}`
      : ` · data ${q.flightDate}`;
  const cia = q.airline
    ? ` · ${q.airline}${q.flightNumber ? " " + q.flightNumber : ""}`
    : "";
  const stops =
    q.transfers == null
      ? ""
      : q.transfers === 0
        ? " · direto"
        : ` · ${q.transfers} parada(s)`;
  const total =
    adults > 1
      ? ` → ${money(q.price, q.currency)} o casal`
      : "";
  return (
    `${i + 1}. ${money(q.pricePerAdult, q.currency)}/pessoa${total}${cia}${stops}${dates}${whenOut}${whenRet}\n` +
    formatQuoteLinkLine(q.buy)
  );
}

export default defineTool({
  description:
    "Search real fares. maxPrice PER PERSON (ida+volta). Prefer Kayak links. directOnly or maxLayoverMinutes (default 180).",
  effect: "read",
  inputSchema: z.object({
    origin: z.string().min(3).max(3),
    destination: z.string().min(3).max(3),
    departDate: z.string(),
    returnDate: z.string().nullable().optional(),
    adults: z.number().int().min(1).max(9).optional(),
    currency: z.string().min(3).max(3).optional(),
    maxPrice: z
      .number()
      .positive()
      .optional()
      .describe("Ceiling PER PERSON for the trip (ida+volta)"),
    marginPct: z.number().min(0).max(50).optional(),
    flexDays: z.number().int().min(0).max(7).optional(),
    directOnly: z
      .boolean()
      .optional()
      .describe("Only nonstop flights (default false)"),
    maxLayoverMinutes: z
      .number()
      .int()
      .min(0)
      .max(720)
      .optional()
      .describe("Max layover minutes if not directOnly (default 180)"),
  }),
  async execute(input) {
    const adults = input.adults ?? 2;
    const currency = (input.currency ?? "BRL").toUpperCase();
    const marginPct = input.marginPct ?? 15;
    const flexDays = input.flexDays ?? 0;
    const directOnly = input.directOnly ?? false;
    const maxLayoverMinutes = input.maxLayoverMinutes ?? 180;
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
      directOnly,
      maxLayoverMinutes,
    });

    const primary =
      result.underCeiling.length > 0
        ? result.underCeiling
        : result.quotes.length > 0
          ? result.quotes
          : result.nearby;
    const quotes = primary.slice(0, 5);
    const usingNearby =
      result.underCeiling.length === 0 &&
      result.quotes.length === 0 &&
      result.nearby.length > 0;

    const headerLabel = usingNearby
      ? `Sem voo nas datas exatas no cache — combinações próximas:`
      : result.underCeiling.length > 0
        ? "Dentro do teto/pessoa (com margem):"
        : result.quotes.length > 0
          ? "Nada dentro do teto — melhores encontrados:"
          : `Nenhum voo ${input.departDate}` +
            (input.returnDate ? ` ↺ ${input.returnDate}` : "") +
            ".";

    const priceLines =
      quotes.length === 0
        ? [headerLabel]
        : [headerLabel, ...quotes.map((q, i) => formatQuote(q, i, adults))];

    const tetoLine =
      input.maxPrice != null
        ? ` · teto ${money(input.maxPrice, currency)}/pessoa ida+volta` +
          ` (margem ${marginPct}% → ${money(result.ceiling ?? input.maxPrice, currency)}/pessoa)`
        : "";

    const chatMarkdown = [
      `${input.origin.toUpperCase()} → ${input.destination.toUpperCase()} · ${input.departDate}` +
        (input.returnDate ? ` ↺ ${input.returnDate}` : "") +
        ` · ${adults} adulto(s)` +
        (directOnly
          ? " · SÓ DIRETO"
          : ` · direto ou escala ≤${maxLayoverMinutes}min`) +
        tetoLine,
      "",
      ...priceLines,
      "",
      `Todas as opções (datas pedidas ${input.departDate}` +
        (input.returnDate ? ` ↺ ${input.returnDate}` : "") +
        "):",
      formatLinksMessage(result.links),
      "",
      "Abra Kayak/cias primeiro. Confira o total antes de pagar. Só reais — sem milhas.",
    ].join("\n");

    return {
      mode: result.mode,
      dealCount: result.quotes.length,
      underCeilingCount: result.underCeiling.length,
      nearbyCount: result.nearby.length,
      usingNearby,
      cheapest: quotes[0] ?? null,
      ceiling: result.ceiling,
      ceilingTotal: result.ceilingTotal,
      marginPct,
      flexDays,
      directOnly,
      maxLayoverMinutes,
      chatMarkdown,
      note: result.note,
    };
  },
});
