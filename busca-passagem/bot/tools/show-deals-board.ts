import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { renderDealsBoardHtml } from "../lib/deals-board.js";
import { searchPrices } from "../lib/prices.js";

export default defineTool({
  description:
    "Search prices and publish an HTML deals dashboard (table with price, airline, schedule, buy link). Prefer this over dumping raw links in chat.",
  effect: "write",
  inputSchema: z.object({
    origin: z.string().min(3).max(3),
    destination: z.string().min(3).max(3),
    departDate: z.string(),
    returnDate: z.string().nullable().optional(),
    adults: z.number().int().min(1).max(9).optional(),
    currency: z.string().min(3).max(3).optional(),
    maxPrice: z.number().positive().optional(),
  }),
  dryRunResult: () => ({ dryRun: true, boardUrl: null }),
  async execute(input, ctx) {
    const adults = input.adults ?? 2;
    const currency = (input.currency ?? "BRL").toUpperCase();
    const result = await searchPrices({
      origin: input.origin,
      destination: input.destination,
      departDate: input.departDate,
      returnDate: input.returnDate ?? null,
      adults,
      currency,
      maxPrice: input.maxPrice,
    });

    const html = renderDealsBoardHtml({
      origin: input.origin.toUpperCase(),
      destination: input.destination.toUpperCase(),
      departDate: input.departDate,
      returnDate: input.returnDate ?? null,
      adults,
      maxPrice: input.maxPrice ?? null,
      currency,
      mode: result.mode,
      quotes: result.quotes,
      links: result.links,
    });

    const key = `deals:${input.origin}-${input.destination}-${input.departDate}-${input.returnDate ?? "ow"}`;
    const record = await ctx.artifacts.tag({
      kind: "deals-board",
      key,
      title: `${input.origin.toUpperCase()}→${input.destination.toUpperCase()} ${input.departDate}`,
      data: {
        origin: input.origin.toUpperCase(),
        destination: input.destination.toUpperCase(),
        departDate: input.departDate,
        returnDate: input.returnDate ?? null,
        maxPrice: input.maxPrice ?? null,
        currency,
        mode: result.mode,
        dealCount: result.quotes.length,
      },
      contents: html,
      contentType: "text/html; charset=utf-8",
    });

    const boardUrl = `/busca-passagem/v1/artifacts/${record.id}/content`;
    const cheapest = result.quotes[0] ?? null;
    const underMax =
      input.maxPrice != null && cheapest != null
        ? cheapest.price <= input.maxPrice
        : null;

    return {
      mode: result.mode,
      note: result.note,
      dealCount: result.quotes.length,
      cheapest,
      underMax,
      maxPrice: input.maxPrice ?? null,
      boardUrl,
      boardAbsoluteHint: `Abra no browser: http://127.0.0.1:3000${boardUrl}`,
      topDeals: result.quotes.slice(0, 8).map((q) => ({
        price: q.price,
        currency: q.currency,
        airline: q.airline,
        when: q.departures,
        link: q.deepLink,
      })),
      compareLinks: result.links,
    };
  },
});
