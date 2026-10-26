import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { formatLinksMessage } from "../lib/buy-links.js";
import { renderDealsBoardHtml } from "../lib/deals-board.js";
import { alertDedupeKey } from "../lib/kv-keys.js";
import { defaultWhatsAppTo, sendWhatsAppText } from "../lib/evolution.js";
import { searchPrices } from "../lib/prices.js";
import { listWatches } from "../lib/watches.js";

export default defineTool({
  description:
    "Scan active watches, find cheap quotes, WhatsApp you with buy links when price ≤ max (or forceNotify).",
  effect: "write",
  inputSchema: z.object({
    forceNotify: z
      .boolean()
      .optional()
      .describe("If true, always send digest even above maxPrice"),
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
      underMax: boolean;
      skipped: string | null;
    }> = [];

    for (const watch of watches) {
      const search = await searchPrices({
        origin: watch.origin,
        destination: watch.destination,
        departDate: watch.departDate,
        returnDate: watch.returnDate,
        adults: watch.adults,
        currency: watch.currency,
        maxPrice: watch.maxPrice,
      });
      const cheapest = search.quotes[0] ?? null;
      const underMax = cheapest != null && cheapest.price <= watch.maxPrice;

      if (!underMax && !forceNotify) {
        scanned.push({
          watchId: watch.id,
          mode: search.mode,
          cheapest: cheapest?.price ?? null,
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
            underMax: true,
            skipped: "already_alerted_same_price",
          });
          continue;
        }
      }

      const html = renderDealsBoardHtml({
        origin: watch.origin,
        destination: watch.destination,
        departDate: watch.departDate,
        returnDate: watch.returnDate,
        adults: watch.adults,
        maxPrice: watch.maxPrice,
        currency: watch.currency,
        mode: search.mode,
        quotes: search.quotes,
        links: search.links,
      });
      const art = await ctx.artifacts.tag({
        kind: "deals-board",
        key: `watch-alert:${watch.id}:${cheapest?.price ?? "none"}`,
        title: `${watch.origin}→${watch.destination} alert`,
        data: {
          origin: watch.origin,
          destination: watch.destination,
          departDate: watch.departDate,
          returnDate: watch.returnDate,
          maxPrice: watch.maxPrice,
          currency: watch.currency,
          mode: search.mode,
          dealCount: search.quotes.length,
        },
        contents: html,
        contentType: "text/html; charset=utf-8",
      });
      const boardUrl = `http://127.0.0.1:3000/busca-passagem/v1/artifacts/${art.id}/content`;

      const route = `${watch.origin}→${watch.destination} ${watch.departDate}${
        watch.returnDate ? ` / ${watch.returnDate}` : ""
      } (${watch.adults} pax)`;
      const priceLine = cheapest
        ? `Menor preço visto: ${cheapest.price} ${cheapest.currency}` +
          (cheapest.airline ? ` (${cheapest.airline})` : "") +
          ` via ${cheapest.source}`
        : "Sem cotação no momento — abra os links e confira.";
      const text = [
        underMax ? "🔥 Preço abaixo do teto!" : "🔎 Digest da rota",
        route,
        `Teto: ${watch.maxPrice} ${watch.currency}`,
        `Modo: ${search.mode}`,
        priceLine,
        `Lista completa: ${boardUrl}`,
        "",
        "Comprar / conferir:",
        formatLinksMessage(search.links),
        cheapest?.deepLink && cheapest.deepLink !== search.links.googleFlights
          ? `\nLink da cotação: ${cheapest.deepLink}`
          : "",
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
        });
      }

      scanned.push({
        watchId: watch.id,
        mode: search.mode,
        cheapest: cheapest?.price ?? null,
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
