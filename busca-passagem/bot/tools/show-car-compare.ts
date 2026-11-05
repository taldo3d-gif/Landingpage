import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { rentalDayCount } from "../lib/car-buy-links.js";
import { carWatchSearchInput, searchCarPrices } from "../lib/car-prices.js";
import { airportStores } from "../lib/car-stores.js";
import { listCarWatches } from "../lib/car-watches.js";
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

function defaultLabel(iata: string): string {
  switch (iata) {
    case "REC":
      return "Aeroporto de Recife (REC / Guararapes)";
    case "MCZ":
      return "Aeroporto de Maceió (MCZ / Zumbi dos Palmares)";
    case "AJU":
      return "Aeroporto de Aracaju (AJU / Santa Maria)";
    default:
      return `Aeroporto ${iata}`;
  }
}

export default defineTool({
  description:
    "Compare car rental for 2+ airports (default REC + MCZ) on the same dates, with store directory. Paste ONLY chatMarkdown. Prefer active car watches when present.",
  effect: "read",
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
    category: categorySchema.optional(),
    maxPrice: z.number().positive().optional(),
    maxPricePerDay: z.number().positive().optional(),
  }),
  async execute(input, ctx) {
    const wanted = (input.iatas ?? ["REC", "MCZ"]).map((x) => x.toUpperCase());
    const all = await listCarWatches(ctx.host.kv);
    const active = all.filter((w) => w.active);

    const pickupDate = input.pickupDate ?? "2026-12-23";
    const dropoffDate = input.dropoffDate ?? "2027-01-01";
    const days = rentalDayCount(pickupDate, dropoffDate);
    const perDay = input.maxPricePerDay ?? 170;
    const totalCeiling = input.maxPrice ?? perDay * days;

    const picks: CarWatch[] = [];
    for (const iata of wanted) {
      const fromWatch =
        active.find((w) => w.pickupIata === iata) ??
        all.find((w) => w.pickupIata === iata && w.active !== false);
      if (fromWatch) {
        picks.push(fromWatch);
        continue;
      }
      picks.push({
        id: `adhoc-${iata}`,
        pickupIata: iata,
        pickupLabel: defaultLabel(iata),
        dropoffIata: iata,
        dropoffLabel: defaultLabel(iata),
        pickupDate,
        dropoffDate,
        pickupTime: input.pickupTime ?? "14:00",
        dropoffTime: input.dropoffTime ?? "12:00",
        category: input.category ?? "suv",
        modelHint: "T-Cross",
        maxPricePerDay: perDay,
        maxPrice: totalCeiling,
        marginPct: 15,
        currency: "BRL",
        driverAge: 25,
        active: true,
        notes: "SUV compacto tipo T-Cross, teto R$170/dia",
        lastSeenPrice: null,
        lastSeenAt: null,
        lastSeenSource: null,
        updatedAt: new Date().toISOString(),
      });
    }

    const rows = picks.map((w) => {
      const search = searchCarPrices({
        ...carWatchSearchInput(w),
        ...(input.category ? { category: input.category } : {}),
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

    const ranked = [...rows].sort(
      (a, b) => (a.best?.price ?? 1e12) - (b.best?.price ?? 1e12),
    );
    const winner = ranked[0];

    const summaryLines = ranked.map((r, i) => {
      const tag = r.recorded ? "visto" : "estimativa";
      const p = r.best;
      const dayCeil =
        r.watch.maxPricePerDay ??
        Math.round(r.watch.maxPrice / Math.max(1, r.search.days));
      return (
        `${i + 1}) ${r.watch.pickupIata} · ` +
        (p
          ? `${money(p.price, p.currency)} total (~${money(p.pricePerDay, p.currency)}/dia) · ${tag}`
          : "sem cotação") +
        ` · teto ${money(dayCeil, r.watch.currency)}/dia` +
        (r.watch.modelHint ? ` · alvo ${r.watch.modelHint}` : "")
      );
    });

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
        ` · ${rows[0]?.watch.pickupDate ?? "?"} → ${rows[0]?.watch.dropoffDate ?? "?"}` +
        ` · ${input.category ?? rows[0]?.watch.category ?? "suv"}` +
        ` · alvo T-Cross · teto R$${perDay}/dia`,
      "",
      "Locadoras no aeroporto:",
      ...storeSummary,
      "",
      "Resumo (faixa; abra Localiza/Kayak pra preço ao vivo):",
      ...summaryLines,
    ];
    if (winner?.best) {
      parts.push(
        "",
        `Faixa mais baixa agora: ${winner.watch.pickupIata} (~${money(winner.best.price, winner.best.currency)}). Confirme ao vivo — alta temporada costuma ficar acima de R$${perDay}/dia.`,
      );
    }
    parts.push(
      "",
      "Como escolher: 1) Localiza com datas preenchidas (grupo SUV/GX)  2) Foco/Movida  3) Kayak pra cruzar preço.",
      "",
      "— Detalhe por cidade —",
      "",
    );
    rows.forEach((r, i) => {
      if (i > 0) parts.push("", "———", "");
      parts.push(r.search.chatMarkdown);
    });

    return {
      iatas: wanted,
      winner: winner?.watch.pickupIata ?? null,
      cities: rows.map((r) => ({
        iata: r.watch.pickupIata,
        watchId: r.watch.id.startsWith("adhoc-") ? null : r.watch.id,
        mode: r.search.mode,
        bestTotal: r.best?.price ?? null,
        ceiling: r.search.ceiling,
        stores: airportStores(r.watch.pickupIata)?.stores.map((s) => s.brand) ?? [],
      })),
      chatMarkdown: parts.join("\n"),
    };
  },
});
