import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { rentalDayCount } from "../lib/car-buy-links.js";
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
      return "Aeroporto de Maceió (MCZ / Zumbi dos Palmares)";
    case "AJU":
      return "Aeroporto de Aracaju (AJU / Santa Maria)";
    default:
      return `Aeroporto ${iata.toUpperCase()}`;
  }
}

export default defineTool({
  description:
    "Create/update a CAR rental watch. Prefer maxPricePerDay (e.g. 170 for T-Cross/SUV). maxPrice = TOTAL for the rental (auto = days × maxPricePerDay). Use lastSeenPrice for live totals.",
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
    modelHint: z
      .string()
      .nullable()
      .optional()
      .describe('e.g. "T-Cross" / SUV compacto'),
    maxPrice: z
      .number()
      .positive()
      .optional()
      .describe("Ceiling TOTAL for the full rental period"),
    maxPricePerDay: z
      .number()
      .positive()
      .optional()
      .describe("Preferred daily ceiling (BRL/day), e.g. 170"),
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
  dryRunResult: (input) => {
    const days = rentalDayCount(input.pickupDate, input.dropoffDate);
    const perDay = input.maxPricePerDay;
    const total =
      input.maxPrice ??
      (perDay != null ? Math.round(perDay * days) : undefined);
    return {
      dryRun: true,
      watch: {
        id: input.id ?? "dry-car-id",
        pickupIata: (input.pickupIata ?? "REC").toUpperCase(),
        pickupDate: input.pickupDate,
        dropoffDate: input.dropoffDate,
        maxPrice: total,
        maxPricePerDay: perDay ?? null,
        category: input.category ?? "suv",
        modelHint: input.modelHint ?? null,
      },
    };
  },
  async execute(input, ctx) {
    const now = new Date().toISOString();
    const pickupIata = (input.pickupIata ?? "REC").toUpperCase();
    const dropoffIata = (input.dropoffIata ?? pickupIata).toUpperCase();
    const pickupDate = input.pickupDate;
    const dropoffDate = input.dropoffDate;
    const days = rentalDayCount(pickupDate, dropoffDate);
    const id =
      input.id ??
      `car-${pickupIata}-${pickupDate}-${dropoffDate}-${Date.now().toString(36)}`;
    const existing = input.id
      ? await getCarWatch(ctx.host.kv, input.id)
      : undefined;

    const category = (input.category ??
      existing?.category ??
      "suv") as CarCategory;

    const maxPricePerDay =
      input.maxPricePerDay === undefined
        ? (existing?.maxPricePerDay ?? null)
        : input.maxPricePerDay;

    let maxPrice: number;
    if (input.maxPrice != null) {
      maxPrice = input.maxPrice;
    } else if (maxPricePerDay != null) {
      maxPrice = Math.round(maxPricePerDay * days);
    } else if (existing?.maxPrice != null) {
      maxPrice = existing.maxPrice;
    } else {
      throw new Error("Informe maxPricePerDay (ex.: 170) ou maxPrice total.");
    }

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

    const modelHint =
      input.modelHint === undefined
        ? (existing?.modelHint ?? null)
        : input.modelHint;

    const defaultNotes =
      maxPricePerDay != null
        ? `${pickupIata} ${pickupDate}→${dropoffDate}, ${category}` +
          (modelHint ? ` (~${modelHint})` : "") +
          `, teto R$${maxPricePerDay}/dia (total R$${maxPrice}, ${days}d)`
        : null;

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
      pickupDate,
      dropoffDate,
      pickupTime: input.pickupTime ?? existing?.pickupTime ?? "14:00",
      dropoffTime: input.dropoffTime ?? existing?.dropoffTime ?? "12:00",
      category,
      modelHint,
      maxPrice,
      maxPricePerDay,
      marginPct: input.marginPct ?? existing?.marginPct ?? 15,
      currency: (input.currency ?? existing?.currency ?? "BRL").toUpperCase(),
      driverAge: input.driverAge ?? existing?.driverAge ?? 25,
      active: input.active ?? existing?.active ?? true,
      notes:
        input.notes === undefined
          ? (existing?.notes ?? defaultNotes)
          : input.notes,
      lastSeenPrice,
      lastSeenAt,
      lastSeenSource,
      updatedAt: now,
    };
    await putCarWatch(ctx.host.kv, watch);
    return { created: !existing, days, watch };
  },
});
