import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { carWatchSearchInput, searchCarPrices } from "../lib/car-prices.js";
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

export default defineTool({
  description:
    "Compare car rental for 2+ airports (default REC + AJU) on the same dates. Paste ONLY chatMarkdown. Prefer active car watches when present.",
  effect: "read",
  inputSchema: z.object({
    iatas: z
      .array(z.string().min(3).max(3))
      .min(1)
      .max(5)
      .optional()
      .describe("Airports to compare, default [REC, AJU]"),
    pickupDate: z.string().optional(),
    dropoffDate: z.string().optional(),
    pickupTime: z.string().optional(),
    dropoffTime: z.string().optional(),
    category: categorySchema.optional(),
    maxPrice: z.number().positive().optional(),
  }),
  async execute(input, ctx) {
    const wanted = (input.iatas ?? ["REC", "AJU"]).map((x) => x.toUpperCase());
    const all = await listCarWatches(ctx.host.kv);
    const active = all.filter((w) => w.active);

    const picks: CarWatch[] = [];
    for (const iata of wanted) {
      const fromWatch =
        active.find((w) => w.pickupIata === iata) ??
        all.find((w) => w.pickupIata === iata);
      if (fromWatch) {
        picks.push(fromWatch);
        continue;
      }
      // Synthetic watch from args / defaults (Natal-Ano Novo)
      picks.push({
        id: `adhoc-${iata}`,
        pickupIata: iata,
        pickupLabel:
          iata === "REC"
            ? "Aeroporto de Recife (REC / Guararapes)"
            : iata === "AJU"
              ? "Aeroporto de Aracaju (AJU / Santa Maria)"
              : `Aeroporto ${iata}`,
        dropoffIata: iata,
        dropoffLabel:
          iata === "REC"
            ? "Aeroporto de Recife (REC / Guararapes)"
            : iata === "AJU"
              ? "Aeroporto de Aracaju (AJU / Santa Maria)"
              : `Aeroporto ${iata}`,
        pickupDate: input.pickupDate ?? "2026-12-23",
        dropoffDate: input.dropoffDate ?? "2027-01-01",
        pickupTime: input.pickupTime ?? "14:00",
        dropoffTime: input.dropoffTime ?? "12:00",
        category: input.category ?? "economy",
        maxPrice: input.maxPrice ?? 1800,
        marginPct: 15,
        currency: "BRL",
        driverAge: 25,
        active: true,
        notes: null,
        lastSeenPrice: null,
        lastSeenAt: null,
        lastSeenSource: null,
        updatedAt: new Date().toISOString(),
      });
    }

    // Optional overrides applied to every city
    const rows = picks.map((w) => {
      const search = searchCarPrices({
        ...carWatchSearchInput(w),
        ...(input.category ? { category: input.category } : {}),
        ...(input.maxPrice != null ? { maxPrice: input.maxPrice } : {}),
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
      return (
        `${i + 1}) ${r.watch.pickupIata} · ` +
        (p
          ? `${money(p.price, p.currency)} total (~${money(p.pricePerDay, p.currency)}/dia) · ${tag}`
          : "sem cotação") +
        (r.watch.maxPrice
          ? ` · teto ${money(r.watch.maxPrice, r.watch.currency)}`
          : "")
      );
    });

    const detailBlocks = rows.map((r) => r.search.chatMarkdown);

    const parts: string[] = [
      `Comparativo aluguel · ${wanted.join(" vs ")}` +
        ` · ${rows[0]?.watch.pickupDate ?? "?"} → ${rows[0]?.watch.dropoffDate ?? "?"}` +
        ` · ${input.category ?? rows[0]?.watch.category ?? "economy"}`,
      "",
      "Resumo (mais barato primeiro):",
      ...summaryLines,
    ];
    if (winner?.best) {
      parts.push(
        "",
        `Mais barato na faixa atual: ${winner.watch.pickupIata} (${money(winner.best.price, winner.best.currency)}).`,
      );
    }
    parts.push("", "— Detalhe por cidade —", "");
    detailBlocks.forEach((block, i) => {
      if (i > 0) parts.push("", "———", "");
      parts.push(block);
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
      })),
      chatMarkdown: parts.join("\n"),
    };
  },
});
