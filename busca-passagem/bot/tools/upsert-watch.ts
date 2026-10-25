import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { getWatch, putWatch } from "../lib/watches.js";
import type { FlightWatch } from "../lib/types.js";

export default defineTool({
  description:
    "Create or update a flight price watch. IATA codes for origin/destination (e.g. GRU, GIG).",
  effect: "idempotent",
  inputSchema: z.object({
    id: z
      .string()
      .optional()
      .describe("Existing watch id to update; omit to create a new one"),
    origin: z.string().min(3).max(3).describe("IATA origin, e.g. GRU"),
    destination: z.string().min(3).max(3).describe("IATA destination, e.g. LIS"),
    departDate: z.string().describe("YYYY-MM-DD"),
    returnDate: z.string().nullable().optional().describe("YYYY-MM-DD or null for one-way"),
    maxPrice: z.number().positive().describe("Alert/hold when price is at or below this"),
    currency: z.string().min(3).max(3).optional().describe("Default BRL"),
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
      currency: (input.currency ?? "BRL").toUpperCase(),
      adults: input.adults ?? 1,
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
      returnDate: input.returnDate === undefined ? (existing?.returnDate ?? null) : input.returnDate,
      maxPrice: input.maxPrice,
      currency: (input.currency ?? existing?.currency ?? "BRL").toUpperCase(),
      adults: input.adults ?? existing?.adults ?? 1,
      active: input.active ?? existing?.active ?? true,
      notes: input.notes === undefined ? (existing?.notes ?? null) : input.notes,
      updatedAt: now,
    };
    await putWatch(ctx.host.kv, watch);
    return { created: !existing, watch };
  },
});
