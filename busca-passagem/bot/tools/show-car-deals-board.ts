import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { carWatchSearchInput, searchCarPrices } from "../lib/car-prices.js";
import { getCarWatch, listCarWatches } from "../lib/car-watches.js";

const categorySchema = z.enum([
  "economy",
  "compact",
  "intermediate",
  "suv",
  "any",
]);

export default defineTool({
  description:
    "Car rental deals board for pickup/dropoff dates. Prefer watchId when a car watch exists. Paste ONLY chatMarkdown in the reply.",
  effect: "read",
  inputSchema: z.object({
    watchId: z.string().optional(),
    pickupIata: z.string().min(3).max(3).optional(),
    pickupDate: z.string().optional(),
    dropoffDate: z.string().optional(),
    pickupTime: z.string().optional(),
    dropoffTime: z.string().optional(),
    category: categorySchema.optional(),
    maxPrice: z.number().positive().optional(),
    marginPct: z.number().min(0).max(50).optional(),
    driverAge: z.number().int().min(18).max(99).optional(),
    currency: z.string().min(3).max(3).optional(),
    lastSeenPrice: z.number().positive().nullable().optional(),
    lastSeenSource: z.string().nullable().optional(),
  }),
  async execute(input, ctx) {
    let watch =
      input.watchId != null
        ? await getCarWatch(ctx.host.kv, input.watchId)
        : undefined;

    if (!watch && !input.pickupDate) {
      const active = (await listCarWatches(ctx.host.kv)).filter((w) => w.active);
      watch = active[0];
    }

    if (watch) {
      const result = searchCarPrices({
        ...carWatchSearchInput(watch),
        ...(input.category ? { category: input.category } : {}),
        ...(input.maxPrice != null ? { maxPrice: input.maxPrice } : {}),
        ...(input.lastSeenPrice !== undefined
          ? { lastSeenPrice: input.lastSeenPrice }
          : {}),
        ...(input.lastSeenSource !== undefined
          ? { lastSeenSource: input.lastSeenSource }
          : {}),
      });
      return {
        watchId: watch.id,
        mode: result.mode,
        days: result.days,
        ceiling: result.ceiling,
        cheapest: result.quotes[0] ?? null,
        underCeilingCount: result.underCeiling.length,
        chatMarkdown: result.chatMarkdown,
        note: result.note,
      };
    }

    const pickupIata = (input.pickupIata ?? "REC").toUpperCase();
    const pickupDate = input.pickupDate;
    const dropoffDate = input.dropoffDate;
    if (!pickupDate || !dropoffDate) {
      return {
        ok: false as const,
        error:
          "Informe watchId ou pickupDate+dropoffDate (ex.: 2026-12-23 e 2027-01-01).",
      };
    }

    const result = searchCarPrices({
      pickupIata,
      pickupDate,
      dropoffDate,
      pickupTime: input.pickupTime,
      dropoffTime: input.dropoffTime,
      category: input.category,
      maxPrice: input.maxPrice,
      marginPct: input.marginPct,
      driverAge: input.driverAge,
      currency: input.currency,
      lastSeenPrice: input.lastSeenPrice,
      lastSeenSource: input.lastSeenSource,
    });

    return {
      watchId: null,
      mode: result.mode,
      days: result.days,
      ceiling: result.ceiling,
      cheapest: result.quotes[0] ?? null,
      underCeilingCount: result.underCeiling.length,
      chatMarkdown: result.chatMarkdown,
      note: result.note,
    };
  },
});
