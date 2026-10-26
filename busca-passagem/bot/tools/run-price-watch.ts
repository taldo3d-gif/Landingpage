import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { alertDedupeKey } from "../lib/kv-keys.js";
import { defaultWhatsAppTo, sendWhatsAppText } from "../lib/evolution.js";
import { effectiveCeiling, searchPrices } from "../lib/prices.js";
import { listWatches } from "../lib/watches.js";

export default defineTool({
  description:
    "Scan active watches, find cheap quotes (total × adults, with margin), WhatsApp buy links for the SAME flight date when price ≤ ceiling.",
  effect: "write",
  inputSchema: z.object({
    forceNotify: z
      .boolean()
      .optional()
      .describe("If true, always send digest even above ceiling"),
    dryNotify: z
      .boolean()
      .optional()
      .describe("If true, skip WhatsApp and only return draft messages"),
  }),
  dryRunResult: () => ({ dryRun: true, alertCount: 0 }),
  async execute({ forceNotify, dryNotify }, ctx) {
    const watches = (await listWatches(ctx.host.kv)).filter((w) => w.active);
    const alerts: Array<{
      watchId: string;
      price: number | null;
      underMax: boolean;
      text: string;
      notifyOk: boolean;
      notifyMode: string;
    }> = [];
    const scanned: Array<{
      watchId: string;
      mode: string;
      cheapest: number | null;
      ceiling: number | null;
      underMax: boolean;
      skipped: string | null;
    }> = [];

    for (const watch of watches) {
      const marginPct = watch.marginPct ?? 15;
      const flexDays = watch.flexDays ?? 0;
      const ceiling = effectiveCeiling(watch.maxPrice, marginPct);
      const search = await searchPrices({
        origin: watch.origin,
        destination: watch.destination,
        departDate: watch.departDate,
        returnDate: watch.returnDate,
        adults: watch.adults,
        currency: watch.currency,
        maxPrice: watch.maxPrice,
        marginPct,
        flexDays,
      });
      const pool =
        search.quotes.length > 0 ? search.quotes : search.nearby;
      const cheapest = pool[0] ?? null;
      const underMax =
        cheapest != null && ceiling != null && cheapest.price <= ceiling;

      if (!underMax && !forceNotify) {
        scanned.push({
          watchId: watch.id,
          mode: search.mode,
          cheapest: cheapest?.price ?? null,
          ceiling,
          underMax: false,
          skipped: "above_max",
        });
        continue;
      }

      if (cheapest && underMax) {
        const dedupe = alertDedupeKey(watch.id, cheapest.price);
        const prior = await ctx.host.kv.get(dedupe);
        if (prior && !forceNotify) {
          scanned.push({
            watchId: watch.id,
            mode: search.mode,
            cheapest: cheapest.price,
            ceiling,
            underMax: true,
            skipped: "already_alerted_same_price",
          });
          continue;
        }
      }

      const route = `${watch.origin}→${watch.destination} pedido ${watch.departDate}${
        watch.returnDate ? ` / ${watch.returnDate}` : ""
      } (${watch.adults} pax)`;
      const priceLine = cheapest
        ? `Menor: ${cheapest.price} ${cheapest.currency} total` +
          ` (${cheapest.pricePerAdult}/adulto × ${watch.adults})` +
          (cheapest.airline
            ? ` ${cheapest.airline}${cheapest.flightNumber ?? ""}`
            : "") +
          ` data ${cheapest.flightDate}`
        : "Sem cotação — confira nos links.";
      const topLines = pool.slice(0, 5).map((q, i) => {
        return (
          `${i + 1}) ${q.price} ${q.currency} total · ${q.flightDate}` +
          (q.airline ? ` · ${q.airline}${q.flightNumber ?? ""}` : "") +
          (q.departures[0] ? ` · ${q.departures[0]}` : "")
        );
      });
      const buy = cheapest?.buy ?? search.links;
      const text = [
        underMax ? "Preco abaixo do teto (com margem)" : "Atualizacao de preco",
        route,
        `Teto: ${watch.maxPrice} ${watch.currency} (margem ${marginPct}% → ${ceiling})`,
        priceLine,
        ...topLines,
        "",
        "Comprar (mesma data do item):",
        `Decolar: ${buy.decolar}`,
        `Kayak: ${buy.kayak}`,
        `Skyscanner: ${buy.skyscanner}`,
        `Google Flights: ${buy.googleFlights}`,
      ]
        .filter(Boolean)
        .join("\n");

      let notifyOk = false;
      let notifyMode = "skipped";
      if (!dryNotify) {
        const to = defaultWhatsAppTo();
        if (!to) {
          notifyMode = "missing_WHATSAPP_TO";
        } else {
          const notify = await sendWhatsAppText({ to, text });
          notifyOk = notify.ok;
          notifyMode = notify.ok ? notify.mode : "error";
        }
      }

      if (cheapest && underMax) {
        await ctx.host.kv.put(alertDedupeKey(watch.id, cheapest.price), {
          at: new Date().toISOString(),
          price: cheapest.price,
          flightDate: cheapest.flightDate,
        });
      }

      scanned.push({
        watchId: watch.id,
        mode: search.mode,
        cheapest: cheapest?.price ?? null,
        ceiling,
        underMax,
        skipped: null,
      });
      alerts.push({
        watchId: watch.id,
        price: cheapest?.price ?? null,
        underMax,
        text,
        notifyOk,
        notifyMode,
      });
    }

    return {
      ok: true as const,
      watchCount: watches.length,
      scanned,
      alertCount: alerts.length,
      alerts,
    };
  },
});
