import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { createFlightOrder, searchFlightOffers } from "../lib/amadeus.js";
import { defaultWhatsAppTo, sendWhatsAppText } from "../lib/evolution.js";
import { dedupeHoldKey } from "../lib/kv-keys.js";
import {
  findPendingHoldForWatch,
  listWatches,
  putHold,
} from "../lib/watches.js";
import type { FlightHold } from "../lib/types.js";

const HOLD_TTL_MS = 30 * 60 * 1000;

export default defineTool({
  description:
    "Deterministic price-watch cycle: scan active watches, hold when cheap, WhatsApp alert for SIM/NÃO.",
  effect: "write",
  inputSchema: z.object({
    dryNotify: z
      .boolean()
      .optional()
      .describe("If true, skip WhatsApp send and only return draft messages"),
  }),
  dryRunResult: () => ({ dryRun: true, scanned: 0, alerts: [] as string[] }),
  async execute({ dryNotify }, ctx) {
    const watches = (await listWatches(ctx.host.kv)).filter((w) => w.active);
    const alerts: Array<{
      holdId: string;
      summary: string;
      text: string;
      notifyOk: boolean;
      notifyMode: string;
    }> = [];
    const scanned: Array<{
      watchId: string;
      mode: string;
      offerCount: number;
      cheapest: number | null;
      hit: boolean;
      skipped: string | null;
    }> = [];

    for (const watch of watches) {
      const pending = await findPendingHoldForWatch(ctx.host.kv, watch.id);
      if (pending) {
        scanned.push({
          watchId: watch.id,
          mode: "n/a",
          offerCount: 0,
          cheapest: null,
          hit: false,
          skipped: `pending_hold:${pending.id}`,
        });
        continue;
      }

      const search = await searchFlightOffers({
        origin: watch.origin,
        destination: watch.destination,
        departDate: watch.departDate,
        returnDate: watch.returnDate,
        adults: watch.adults,
        currency: watch.currency,
        maxPrice: watch.maxPrice,
      });
      const cheap = search.offers
        .filter((o) => o.price <= watch.maxPrice)
        .sort((a, b) => a.price - b.price)[0];

      if (!cheap) {
        scanned.push({
          watchId: watch.id,
          mode: search.mode,
          offerCount: search.offers.length,
          cheapest: search.offers[0]?.price ?? null,
          hit: false,
          skipped: null,
        });
        continue;
      }

      const dedupe = dedupeHoldKey(watch.id, cheap.id);
      const prior = await ctx.host.kv.get(dedupe);
      if (prior) {
        scanned.push({
          watchId: watch.id,
          mode: search.mode,
          offerCount: search.offers.length,
          cheapest: cheap.price,
          hit: true,
          skipped: "deduped_offer",
        });
        continue;
      }

      const order = await createFlightOrder({
        offer: cheap,
        travelerName: {
          first: process.env.AMADEUS_TRAVELER_FIRST ?? "Passageiro",
          last: process.env.AMADEUS_TRAVELER_LAST ?? "Principal",
        },
      });
      const now = Date.now();
      const hold: FlightHold = {
        id: `h-${now.toString(36)}`,
        watchId: watch.id,
        offerId: cheap.id,
        price: cheap.price,
        currency: cheap.currency,
        status: "pending_confirm",
        expiresAt: new Date(now + HOLD_TTL_MS).toISOString(),
        amadeusOrderId: order.orderId,
        mock: order.mock,
        createdAt: new Date(now).toISOString(),
        summary: `${watch.origin}→${watch.destination} ${watch.departDate} ${cheap.price} ${cheap.currency}`,
      };
      await putHold(ctx.host.kv, hold);
      await ctx.host.kv.put(dedupe, { holdId: hold.id, exp: hold.expiresAt });

      const text =
        `✈️ Preço baixo achado!\n` +
        `${hold.summary}\n` +
        `Hold: ${hold.id} (expira ${hold.expiresAt})\n` +
        `Responda SIM para confirmar ou NÃO para cancelar.`;

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

      scanned.push({
        watchId: watch.id,
        mode: search.mode,
        offerCount: search.offers.length,
        cheapest: cheap.price,
        hit: true,
        skipped: null,
      });
      alerts.push({
        holdId: hold.id,
        summary: hold.summary,
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
