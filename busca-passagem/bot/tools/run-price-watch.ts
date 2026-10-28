import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { alertDedupeKey } from "../lib/kv-keys.js";
import { defaultWhatsAppTo, sendWhatsAppText } from "../lib/evolution.js";
import { effectiveCeiling, searchPrices } from "../lib/prices.js";
import { listWatches } from "../lib/watches.js";

export default defineTool({
  description:
    "Scan active watches, find cheap quotes (maxPrice is PER PERSON + margin), WhatsApp buy links for the SAME flight date when $/pessoa ≤ ceiling.",
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
      const directOnly = watch.directOnly ?? false;
      const maxLayoverMinutes = watch.maxLayoverMinutes ?? 180;
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
        directOnly,
        maxLayoverMinutes,
      });
      const pool =
        search.quotes.length > 0 ? search.quotes : search.nearby;
      const cheapest = pool[0] ?? null;
      // Ceiling is per person
      const underMax =
        cheapest != null &&
        ceiling != null &&
        cheapest.pricePerAdult <= ceiling;

      if (!underMax && !forceNotify) {
        scanned.push({
          watchId: watch.id,
          mode: search.mode,
          cheapest: cheapest?.pricePerAdult ?? null,
          ceiling,
          underMax: false,
          skipped: "above_max",
        });
        continue;
      }

      if (cheapest && underMax) {
        const dedupe = alertDedupeKey(watch.id, cheapest.pricePerAdult);
        const prior = await ctx.host.kv.get(dedupe);
        if (prior && !forceNotify) {
          scanned.push({
            watchId: watch.id,
            mode: search.mode,
            cheapest: cheapest.pricePerAdult,
            ceiling,
            underMax: true,
            skipped: "already_alerted_same_price",
          });
          continue;
        }
      }

      const route = `${watch.origin}→${watch.destination} pedido ${watch.departDate}${
        watch.returnDate ? ` / ${watch.returnDate}` : ""
      } (${watch.adults} pax${directOnly ? ", so direto" : `, escala<=${maxLayoverMinutes}min`})`;
      const priceLine = cheapest
        ? `Menor: ${cheapest.pricePerAdult} ${cheapest.currency}/pessoa` +
          ` (${cheapest.price} o casal)` +
          (cheapest.airline
            ? ` ${cheapest.airline}${cheapest.flightNumber ?? ""}`
            : "") +
          ` ${cheapest.flightDate}` +
          (cheapest.returnDate ? ` ↺ ${cheapest.returnDate}` : "")
        : "Sem cotacao direta no momento.";
      const topLines = pool.slice(0, 5).map((q, i) => {
        return (
          `${i + 1}) ${q.pricePerAdult} ${q.currency}/pessoa` +
          ` (${q.price} casal) · ${q.flightDate}` +
          (q.returnDate ? ` ↺ ${q.returnDate}` : "") +
          (q.airline ? ` · ${q.airline}${q.flightNumber ?? ""}` : "")
        );
      });
      const buy = cheapest?.buy ?? search.links;
      const text = [
        underMax ? "Preco abaixo do teto/pessoa (com margem)" : "Atualizacao de preco",
        route,
        `Teto: ${watch.maxPrice} ${watch.currency}/pessoa ida+volta (margem ${marginPct}% → ${ceiling}/pessoa)`,
        priceLine,
        ...topLines,
        "",
        "Comprar (mesma data do item — prefira Kayak):",
        `Kayak: ${buy.kayak}`,
        `Decolar: ${buy.decolar}`,
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
        await ctx.host.kv.put(alertDedupeKey(watch.id, cheapest.pricePerAdult), {
          at: new Date().toISOString(),
          pricePerAdult: cheapest.pricePerAdult,
          price: cheapest.price,
          flightDate: cheapest.flightDate,
        });
      }

      scanned.push({
        watchId: watch.id,
        mode: search.mode,
        cheapest: cheapest?.pricePerAdult ?? null,
        ceiling,
        underMax,
        skipped: null,
      });
      alerts.push({
        watchId: watch.id,
        price: cheapest?.pricePerAdult ?? null,
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
