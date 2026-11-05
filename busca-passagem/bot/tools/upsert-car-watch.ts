import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { getCarWatch, putCarWatch } from "../lib/car-watches.js";
import type { CarCategory, CarWatch } from "../lib/types.js";

const categorySchema = z.enum([
  "economy",
  "compact",
  "intermediate",
  "suv",
  "any",
]);

function defaultLabel(iata: string): string {
  switch (iata.toUpperCase()) {
    case "REC":
      return "Aeroporto de Recife (REC / Guararapes)";
    case "MCZ":
      return "Aeroporto de Maceió (MCZ)";
    case "AJU":
      return "Aeroporto de Aracaju (AJU / Santa Maria)";
    default:
      return `Aeroporto ${iata.toUpperCase()}`;
  }
}

export default defineTool({
  description:
    "Create/update a CAR rental watch. maxPrice = TOTAL for the whole rental (BRL). Default pickup REC airport. Use lastSeenPrice when you or the user saw a live total.",
  effect: "idempotent",
  inputSchema: z.object({
    id: z.string().optional(),
    pickupIata: z.string().min(3).max(3).optional(),
    pickupLabel: z.string().optional(),
    dropoffIata: z.string().min(3).max(3).optional(),
    dropoffLabel: z.string().optional(),
    pickupDate: z.string(),
    dropoffDate: z.string(),
    pickupTime: z.string().optional().describe("HH:mm local, default 14:00"),
    dropoffTime: z.string().optional().describe("HH:mm local, default 12:00"),
    category: categorySchema.optional(),
    maxPrice: z
      .number()
      .positive()
      .describe("Ceiling TOTAL for the full rental period"),
    marginPct: z.number().min(0).max(50).optional(),
    currency: z.string().min(3).max(3).optional(),
    driverAge: z.number().int().min(18).max(99).optional(),
    active: z.boolean().optional(),
    notes: z.string().nullable().optional(),
    lastSeenPrice: z
      .number()
      .positive()
      .nullable()
      .optional()
      .describe("Live total seen on a comparator (BRL)"),
    lastSeenSource: z.string().nullable().optional(),
  }),
  dryRunResult: (input) => ({
    dryRun: true,
    watch: {
      id: input.id ?? "dry-car-id",
      pickupIata: (input.pickupIata ?? "REC").toUpperCase(),
      pickupDate: input.pickupDate,
      dropoffDate: input.dropoffDate,
      maxPrice: input.maxPrice,
      category: input.category ?? "economy",
    },
  }),
  async execute(input, ctx) {
    const now = new Date().toISOString();
    const pickupIata = (input.pickupIata ?? "REC").toUpperCase();
    const dropoffIata = (input.dropoffIata ?? pickupIata).toUpperCase();
    const id =
      input.id ??
      `car-${pickupIata}-${input.pickupDate}-${input.dropoffDate}-${Date.now().toString(36)}`;
    const existing = input.id
      ? await getCarWatch(ctx.host.kv, input.id)
      : undefined;

    const category = (input.category ??
      existing?.category ??
      "economy") as CarCategory;

    let lastSeenPrice =
      input.lastSeenPrice === undefined
        ? (existing?.lastSeenPrice ?? null)
        : input.lastSeenPrice;
    let lastSeenAt =
      input.lastSeenPrice === undefined
        ? (existing?.lastSeenAt ?? null)
        : input.lastSeenPrice == null
          ? null
          : now;
    let lastSeenSource =
      input.lastSeenSource === undefined
        ? (existing?.lastSeenSource ?? null)
        : input.lastSeenSource;

    if (
      input.lastSeenPrice !== undefined &&
      input.lastSeenPrice != null &&
      input.lastSeenSource === undefined
    ) {
      lastSeenSource = existing?.lastSeenSource ?? "manual";
    }

    const watch: CarWatch = {
      id,
      pickupIata,
      pickupLabel:
        input.pickupLabel ?? existing?.pickupLabel ?? defaultLabel(pickupIata),
      dropoffIata,
      dropoffLabel:
        input.dropoffLabel ??
        existing?.dropoffLabel ??
        defaultLabel(dropoffIata),
      pickupDate: input.pickupDate,
      dropoffDate: input.dropoffDate,
      pickupTime: input.pickupTime ?? existing?.pickupTime ?? "14:00",
      dropoffTime: input.dropoffTime ?? existing?.dropoffTime ?? "12:00",
      category,
      maxPrice: input.maxPrice,
      marginPct: input.marginPct ?? existing?.marginPct ?? 15,
      currency: (input.currency ?? existing?.currency ?? "BRL").toUpperCase(),
      driverAge: input.driverAge ?? existing?.driverAge ?? 25,
      active: input.active ?? existing?.active ?? true,
      notes: input.notes === undefined ? (existing?.notes ?? null) : input.notes,
      lastSeenPrice,
      lastSeenAt,
      lastSeenSource,
      updatedAt: now,
    };
    await putCarWatch(ctx.host.kv, watch);
    return { created: !existing, watch };
  },
});
