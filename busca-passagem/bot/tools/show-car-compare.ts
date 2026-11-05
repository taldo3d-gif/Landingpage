import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { rentalDayCount } from "../lib/car-buy-links.js";
import { carWatchSearchInput, searchCarPrices } from "../lib/car-prices.js";
import { airportStores } from "../lib/car-stores.js";
import {
  DEFAULT_CAR_TRIP,
  ensureDefaultCarWatches,
  listCarWatches,
} from "../lib/car-watches.js";
import type { CarWatch } from "../lib/types.js";

const categorySchema = z.enum([
  "economy",
  "compact",
  "intermediate",
  "suv",
  "any",
]);

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

function groupLabel(w: CarWatch): string {
  if (w.modelHint) return w.modelHint;
  return w.category;
}

export default defineTool({
  description:
    "Compare car rental for REC + MCZ (default) across ALL active watches — SUV/T-Cross and hatch Polo/HB20. Seeds default watches if missing. Paste ONLY chatMarkdown.",
  effect: "idempotent",
  inputSchema: z.object({
    iatas: z
      .array(z.string().min(3).max(3))
      .min(1)
      .max(5)
      .optional()
      .describe("Airports to compare, default [REC, MCZ]"),
    pickupDate: z.string().optional(),
    dropoffDate: z.string().optional(),
    pickupTime: z.string().optional(),
    dropoffTime: z.string().optional(),
    /** If set, filter watches to this category only. */
    category: categorySchema.optional(),
    maxPrice: z.number().positive().optional(),
    maxPricePerDay: z.number().positive().optional(),
  }),
  async execute(input, ctx) {
    await ensureDefaultCarWatches(ctx.host.kv);
    const wanted = (input.iatas ?? ["REC", "MCZ"]).map((x) => x.toUpperCase());
    const all = await listCarWatches(ctx.host.kv);
    let active = all.filter(
      (w) => w.active && wanted.includes(w.pickupIata.toUpperCase()),
    );
    if (input.category) {
      active = active.filter((w) => w.category === input.category);
    }

    // Stable order: by city (wanted), then SUV before hatch/compact
    const catRank = (c: string) =>
      c === "suv" ? 0 : c === "intermediate" ? 1 : c === "compact" ? 2 : 3;
    active.sort((a, b) => {
      const ia = wanted.indexOf(a.pickupIata);
      const ib = wanted.indexOf(b.pickupIata);
      if (ia !== ib) return ia - ib;
      return catRank(a.category) - catRank(b.category);
    });

    const pickupDate = input.pickupDate ?? DEFAULT_CAR_TRIP.pickupDate;
    const dropoffDate = input.dropoffDate ?? DEFAULT_CAR_TRIP.dropoffDate;
    const days = rentalDayCount(pickupDate, dropoffDate);

    const rows = active.map((w) => {
      const search = searchCarPrices({
        ...carWatchSearchInput(w),
        ...(input.maxPrice != null ? { maxPrice: input.maxPrice } : {}),
        ...(input.maxPricePerDay != null
          ? { maxPricePerDay: input.maxPricePerDay }
          : {}),
        ...(input.pickupDate ? { pickupDate: input.pickupDate } : {}),
        ...(input.dropoffDate ? { dropoffDate: input.dropoffDate } : {}),
        ...(input.pickupTime ? { pickupTime: input.pickupTime } : {}),
        ...(input.dropoffTime ? { dropoffTime: input.dropoffTime } : {}),
      });
      const recorded = search.quotes.find((q) => q.source === "recorded");
      const estimate = search.quotes.find((q) => q.source === "estimate");
      const best = recorded ?? estimate ?? null;
      return { watch: w, search, best, recorded, estimate };
    });

    const byGroup = new Map<string, typeof rows>();
    for (const r of rows) {
      const key = groupLabel(r.watch);
      const list = byGroup.get(key) ?? [];
      list.push(r);
      byGroup.set(key, list);
    }

    const storeSummary = wanted
      .map((iata) => {
        const info = airportStores(iata);
        if (!info) return null;
        const brands = info.stores.map((s) => s.brand).join(", ");
        return `• ${iata}: ${brands}`;
      })
      .filter(Boolean) as string[];

    const parts: string[] = [
      `Comparativo aluguel · ${wanted.join(" vs ")}` +
        ` · ${pickupDate} → ${dropoffDate} · ${days} dias`,
      "Grupos monitorados: T-Cross (SUV, teto R$170/dia) · Polo / HB20 Hatch (compacto, teto R$120/dia)",
      "",
      "Locadoras no aeroporto:",
      ...storeSummary,
      "",
      "Resumo por grupo (faixa; abra Kayak/Momondo pra preço ao vivo):",
    ];

    for (const [group, groupRows] of byGroup) {
      parts.push("", `▸ ${group}`);
      const ranked = [...groupRows].sort(
        (a, b) => (a.best?.price ?? 1e12) - (b.best?.price ?? 1e12),
      );
      ranked.forEach((r, i) => {
        const tag = r.recorded ? "visto" : "estimativa";
        const p = r.best;
        const dayCeil =
          r.watch.maxPricePerDay ??
          Math.round(r.watch.maxPrice / Math.max(1, r.search.days));
        parts.push(
          `  ${i + 1}) ${r.watch.pickupIata} · ` +
            (p
              ? `${money(p.price, p.currency)} total (~${money(p.pricePerDay, p.currency)}/dia) · ${tag}`
              : "sem cotação") +
            ` · teto ${money(dayCeil, r.watch.currency)}/dia`,
        );
      });
      const winner = ranked[0];
      if (winner?.best) {
        parts.push(
          `  → faixa mais baixa: ${winner.watch.pickupIata} (~${money(winner.best.price, winner.best.currency)})`,
        );
      }
    }

    parts.push(
      "",
      "Como abrir: 1) Kayak/Momondo (filtro SUV ou pequeno/hatch)  2) Localiza/Foco (Continuar)  3) Movida.",
      "",
      "— Detalhe por watch —",
      "",
    );
    rows.forEach((r, i) => {
      if (i > 0) parts.push("", "———", "");
      parts.push(r.search.chatMarkdown);
    });

    return {
      iatas: wanted,
      groups: [...byGroup.keys()],
      watches: rows.map((r) => ({
        iata: r.watch.pickupIata,
        watchId: r.watch.id,
        category: r.watch.category,
        modelHint: r.watch.modelHint,
        mode: r.search.mode,
        bestTotal: r.best?.price ?? null,
        ceiling: r.search.ceiling,
        ceilingPerDay: r.watch.maxPricePerDay,
      })),
      chatMarkdown: parts.join("\n"),
    };
  },
});
