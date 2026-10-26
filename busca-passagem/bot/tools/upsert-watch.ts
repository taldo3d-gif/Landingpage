import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { getWatch, putWatch } from "../lib/watches.js";
import type { FlightWatch } from "../lib/types.js";

export default defineTool({
  description:
    "Create or update a flight price watch. maxPrice is TOTAL for all adults. marginPct allows a bit above (default 15).",
  effect: "idempotent",
  inputSchema: z.object({
    id: z.string().optional(),
    origin: z.string().min(3).max(3),
    destination: z.string().min(3).max(3),
    departDate: z.string(),
    returnDate: z.string().nullable().optional(),
    maxPrice: z.number().positive().describe("Total ceiling for the group"),
    marginPct: z.number().min(0).max(50).optional().describe("Default 15"),
    flexDays: z.number().int().min(0).max(7).optional().describe("Default 0 exact date"),
    currency: z.string().min(3).max(3).optional(),
    adults: z.number().int().min(1).max(9).optional(),
    active: z.boolean().optional(),
    notes: z.string().nullable().optional(),
  }),
  dryRunResult: (input) => ({
    dryRun: true,
    watch: {
      id: input.id ?? "dry-run-id",
      origin: input.origin.toUpperCase(),
      destination: input.destination.toUpperCase(),
      departDate: input.departDate,
      returnDate: input.returnDate ?? null,
      maxPrice: input.maxPrice,
      marginPct: input.marginPct ?? 15,
      flexDays: input.flexDays ?? 0,
      currency: (input.currency ?? "BRL").toUpperCase(),
      adults: input.adults ?? 2,
      active: input.active ?? true,
      notes: input.notes ?? null,
      updatedAt: new Date().toISOString(),
    },
  }),
  async execute(input, ctx) {
    const now = new Date().toISOString();
    const id =
      input.id ??
      `w-${input.origin}-${input.destination}-${input.departDate}-${Date.now().toString(36)}`;
    const existing = input.id ? await getWatch(ctx.host.kv, input.id) : undefined;
    const watch: FlightWatch = {
      id,
      origin: input.origin.toUpperCase(),
      destination: input.destination.toUpperCase(),
      departDate: input.departDate,
      returnDate:
        input.returnDate === undefined ? (existing?.returnDate ?? null) : input.returnDate,
      maxPrice: input.maxPrice,
      marginPct: input.marginPct ?? existing?.marginPct ?? 15,
      flexDays: input.flexDays ?? existing?.flexDays ?? 0,
      currency: (input.currency ?? existing?.currency ?? "BRL").toUpperCase(),
      adults: input.adults ?? existing?.adults ?? 2,
      active: input.active ?? existing?.active ?? true,
      notes: input.notes === undefined ? (existing?.notes ?? null) : input.notes,
      updatedAt: now,
    };
    await putWatch(ctx.host.kv, watch);
    return { created: !existing, watch };
  },
});
