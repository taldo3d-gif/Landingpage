import type { FlightOfferSummary } from "./types.js";

type TokenCache = { accessToken: string; expiresAtMs: number };

let tokenCache: TokenCache | null = null;

function amadeusBaseUrl(): string {
  const env = (process.env.AMADEUS_ENV ?? "test").toLowerCase();
  return env === "production" || env === "prod"
    ? "https://api.amadeus.com"
    : "https://test.api.amadeus.com";
}

export function amadeusConfigured(): boolean {
  return Boolean(process.env.AMADEUS_CLIENT_ID && process.env.AMADEUS_CLIENT_SECRET);
}

async function getAccessToken(): Promise<string> {
  const clientId = process.env.AMADEUS_CLIENT_ID;
  const clientSecret = process.env.AMADEUS_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("AMADEUS_CLIENT_ID / AMADEUS_CLIENT_SECRET not set");
  }
  if (tokenCache && Date.now() < tokenCache.expiresAtMs - 30_000) {
    return tokenCache.accessToken;
  }
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
  });
  const res = await fetch(`${amadeusBaseUrl()}/v1/security/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Amadeus token failed (${res.status}): ${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };
  tokenCache = {
    accessToken: json.access_token,
    expiresAtMs: Date.now() + json.expires_in * 1000,
  };
  return tokenCache.accessToken;
}

function mockOffers(input: {
  origin: string;
  destination: string;
  departDate: string;
  maxPrice?: number;
  currency: string;
}): FlightOfferSummary[] {
  const base = Math.max(180, Math.round((input.maxPrice ?? 900) * 0.72));
  const currency = input.currency || "BRL";
  return [
    {
      id: `mock-${input.origin}-${input.destination}-${input.departDate}-a`,
      price: base,
      currency,
      airlines: ["G3"],
      departures: [`${input.departDate}T08:15`],
      rawOfferJson: JSON.stringify({ mock: true, tier: "a" }),
      mock: true,
    },
    {
      id: `mock-${input.origin}-${input.destination}-${input.departDate}-b`,
      price: base + 140,
      currency,
      airlines: ["LA"],
      departures: [`${input.departDate}T14:40`],
      rawOfferJson: JSON.stringify({ mock: true, tier: "b" }),
      mock: true,
    },
  ];
}

function summarizeOffer(offer: Record<string, unknown>): FlightOfferSummary | null {
  const id = typeof offer.id === "string" ? offer.id : null;
  const priceObj = offer.price as { total?: string; currency?: string } | undefined;
  const total = priceObj?.total ? Number(priceObj.total) : NaN;
  if (!id || !Number.isFinite(total)) return null;
  const itineraries = (offer.itineraries as Array<{
    segments?: Array<{ carrierCode?: string; departure?: { at?: string } }>;
  }>) ?? [];
  const airlines = new Set<string>();
  const departures: string[] = [];
  for (const it of itineraries) {
    for (const seg of it.segments ?? []) {
      if (seg.carrierCode) airlines.add(seg.carrierCode);
      if (seg.departure?.at) departures.push(seg.departure.at);
    }
  }
  return {
    id,
    price: total,
    currency: priceObj?.currency ?? "EUR",
    airlines: [...airlines],
    departures,
    rawOfferJson: JSON.stringify(offer),
    mock: false,
  };
}

export async function searchFlightOffers(input: {
  origin: string;
  destination: string;
  departDate: string;
  returnDate?: string | null;
  adults: number;
  currency: string;
  maxPrice?: number;
}): Promise<{ offers: FlightOfferSummary[]; mode: "live" | "mock" }> {
  if (!amadeusConfigured()) {
    return { offers: mockOffers(input), mode: "mock" };
  }

  const token = await getAccessToken();
  const params = new URLSearchParams({
    originLocationCode: input.origin.toUpperCase(),
    destinationLocationCode: input.destination.toUpperCase(),
    departureDate: input.departDate,
    adults: String(input.adults),
    currencyCode: input.currency.toUpperCase(),
    max: "10",
  });
  if (input.returnDate) params.set("returnDate", input.returnDate);
  if (input.maxPrice != null) params.set("maxPrice", String(Math.floor(input.maxPrice)));

  const res = await fetch(
    `${amadeusBaseUrl()}/v2/shopping/flight-offers?${params}`,
    { headers: { authorization: `Bearer ${token}` } },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Amadeus search failed (${res.status}): ${text.slice(0, 300)}`);
  }
  const json = (await res.json()) as { data?: Record<string, unknown>[] };
  const offers = (json.data ?? [])
    .map(summarizeOffer)
    .filter((o): o is FlightOfferSummary => o != null);
  return { offers, mode: "live" };
}

export async function createFlightOrder(input: {
  offer: FlightOfferSummary;
  travelerName: { first: string; last: string };
}): Promise<{ orderId: string; mock: boolean }> {
  if (!amadeusConfigured() || input.offer.mock) {
    return { orderId: `mock-order-${input.offer.id}`, mock: true };
  }

  let flightOffer: unknown;
  try {
    flightOffer = JSON.parse(input.offer.rawOfferJson);
  } catch {
    throw new Error("offer rawOfferJson is not valid JSON");
  }

  const token = await getAccessToken();
  const body = {
    data: {
      type: "flight-order",
      flightOffers: [flightOffer],
      travelers: [
        {
          id: "1",
          dateOfBirth: process.env.AMADEUS_TRAVELER_DOB ?? "1990-01-01",
          name: {
            firstName: input.travelerName.first,
            lastName: input.travelerName.last,
          },
          contact: {
            emailAddress: process.env.AMADEUS_TRAVELER_EMAIL ?? "owner@example.com",
            phones: [
              {
                deviceType: "MOBILE",
                countryCallingCode: "55",
                number: (process.env.AMADEUS_TRAVELER_PHONE ?? "11999999999").replace(
                  /\D/g,
                  "",
                ),
              },
            ],
          },
        },
      ],
    },
  };

  const res = await fetch(`${amadeusBaseUrl()}/v1/booking/flight-orders`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Amadeus order failed (${res.status}): ${text.slice(0, 400)}`);
  }
  const json = (await res.json()) as { data?: { id?: string } };
  const orderId = json.data?.id;
  if (!orderId) throw new Error("Amadeus order response missing id");
  return { orderId, mock: false };
}
