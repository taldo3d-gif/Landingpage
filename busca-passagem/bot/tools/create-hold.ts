import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { createFlightOrder, searchFlightOffers } from "../lib/amadeus.js";
import { dedupeHoldKey } from "../lib/kv-keys.js";
import {
  findPendingHoldForWatch,
  getWatch,
  putHold,
} from "../lib/watches.js";
import type { FlightHold, FlightOfferSummary } from "../lib/types.js";

const HOLD_TTL_MS = 30 * 60 * 1000;

export default defineTool({
  description:
    "Create a pending hold for a cheap offer on a watch. Does not finalize purchase; waits for WhatsApp SIM confirmation.",
  effect: "write",
  inputSchema: z.object({
    watchId: z.string(),
    offerId: z.string().optional().describe("Specific offer id; otherwise picks cheapest under maxPrice"),
    travelerFirstName: z.string().optional(),
    travelerLastName: z.string().optional(),
  }),
  dryRunResult: ({ watchId, offerId }) => ({
    dryRun: true,
    hold: {
      id: "dry-hold",
      watchId,
      offerId: offerId ?? "dry-offer",
      status: "pending_confirm",
    },
  }),
  async execute(input, ctx) {
    const watch = await getWatch(ctx.host.kv, input.watchId);
    if (!watch) return { ok: false as const, error: "watch_not_found" };
    if (!watch.active) return { ok: false as const, error: "watch_inactive" };

    const existing = await findPendingHoldForWatch(ctx.host.kv, watch.id);
    if (existing) {
      return { ok: true as const, reused: true, hold: existing };
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

    let offer: FlightOfferSummary | undefined;
    if (input.offerId) {
      offer = search.offers.find((o) => o.id === input.offerId);
    } else {
      offer = search.offers
        .filter((o) => o.price <= watch.maxPrice)
        .sort((a, b) => a.price - b.price)[0];
    }
    if (!offer) {
      return {
        ok: false as const,
        error: "no_offer_under_max",
        maxPrice: watch.maxPrice,
        cheapest: search.offers[0]
          ? { id: search.offers[0].id, price: search.offers[0].price }
          : null,
      };
    }
    if (offer.price > watch.maxPrice) {
      return {
        ok: false as const,
        error: "offer_above_max",
        price: offer.price,
        maxPrice: watch.maxPrice,
      };
    }

    const dedupe = dedupeHoldKey(watch.id, offer.id);
    const prior = await ctx.host.kv.get(dedupe);
    if (prior && typeof prior === "object" && "holdId" in prior) {
      const priorHold = prior as { holdId: string };
      return { ok: true as const, reused: true, holdId: priorHold.holdId };
    }

    const first =
      input.travelerFirstName ?? process.env.AMADEUS_TRAVELER_FIRST ?? "Passageiro";
    const last =
      input.travelerLastName ?? process.env.AMADEUS_TRAVELER_LAST ?? "Principal";

    const order = await createFlightOrder({
      offer,
      travelerName: { first, last },
    });

    const now = Date.now();
    const hold: FlightHold = {
      id: `h-${now.toString(36)}`,
      watchId: watch.id,
      offerId: offer.id,
      price: offer.price,
      currency: offer.currency,
      status: "pending_confirm",
      expiresAt: new Date(now + HOLD_TTL_MS).toISOString(),
      amadeusOrderId: order.orderId,
      mock: order.mock,
      createdAt: new Date(now).toISOString(),
      summary: `${watch.origin}→${watch.destination} ${watch.departDate} ${offer.price} ${offer.currency} (${offer.airlines.join(",") || "?"})`,
    };
    await putHold(ctx.host.kv, hold);
    await ctx.host.kv.put(dedupe, { holdId: hold.id, exp: hold.expiresAt });

    return { ok: true as const, reused: false, hold, searchMode: search.mode };
  },
});
