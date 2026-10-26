import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { searchPrices } from "../lib/prices.js";

export default defineTool({
  description:
    "Search flight prices. maxPrice is PER PERSON. Prefer show-deals-board for chat lists. Returns mode mock|travelpayouts.",
  effect: "read",
  inputSchema: z.object({
    origin: z.string().min(3).max(3),
    destination: z.string().min(3).max(3),
    departDate: z.string().describe("YYYY-MM-DD"),
    returnDate: z.string().nullable().optional(),
    adults: z.number().int().min(1).max(9).optional().describe("Default 2 for casal"),
    currency: z.string().min(3).max(3).optional(),
    maxPrice: z
      .number()
      .positive()
      .optional()
      .describe("Ceiling PER PERSON (e.g. 1500)"),
    marginPct: z.number().min(0).max(50).optional(),
    flexDays: z.number().int().min(0).max(7).optional(),
  }),
  async execute(input) {
    const adults = input.adults ?? 2;
    const result = await searchPrices({
      origin: input.origin,
      destination: input.destination,
      departDate: input.departDate,
      returnDate: input.returnDate ?? null,
      adults,
      currency: (input.currency ?? "BRL").toUpperCase(),
      maxPrice: input.maxPrice,
      marginPct: input.marginPct,
      flexDays: input.flexDays,
    });
    const pool =
      result.quotes.length > 0 ? result.quotes : result.nearby;
    const cheapest = pool[0] ?? null;
    return {
      mode: result.mode,
      note: result.note,
      count: result.quotes.length,
      nearbyCount: result.nearby.length,
      ceiling: result.ceiling,
      ceilingTotal: result.ceilingTotal,
      cheapest,
      quotes: pool.slice(0, 10).map((q) => ({
        price: q.price,
        pricePerAdult: q.pricePerAdult,
        currency: q.currency,
        airline: q.airline,
        flightNumber: q.flightNumber,
        flightDate: q.flightDate,
        departures: q.departures,
        transfers: q.transfers,
        buy: q.buy,
        source: q.source,
      })),
      buyLinks: result.links,
      underMax:
        result.ceiling != null && cheapest != null
          ? cheapest.pricePerAdult <= result.ceiling
          : null,
    };
  },
});
