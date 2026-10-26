import type { BuyLinks } from "./types.js";

function yymmdd(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  return `${y?.slice(2) ?? ""}${m ?? ""}${d ?? ""}`;
}

/**
 * Google Flights link using the classic `#flt=` hash.
 * Opens the results UI in a real browser (prices load client-side).
 * Prefer Decolar/Kayak when you need prices visible immediately.
 */
function googleFlightsResultsUrl(input: {
  origin: string;
  destination: string;
  departDate: string;
  returnDate?: string | null;
  adults: number;
}): string {
  const o = input.origin.toUpperCase();
  const d = input.destination.toUpperCase();
  const adults = Math.max(1, Math.min(9, input.adults));
  const flt = input.returnDate
    ? `${o}.${d}.${input.departDate}*${d}.${o}.${input.returnDate};c:BRL;e:1;sd:1;t:f;tt:o;sp:2;sc:b`
    : `${o}.${d}.${input.departDate};c:BRL;e:1;sd:1;t:f;tt:o;sp:2;sc:b`;
  // `sp` is not official; adults also mirrored in q= for the empty-form fallback.
  const q = input.returnDate
    ? `Flights from ${o} to ${d} on ${input.departDate} returning ${input.returnDate} ${adults} adults`
    : `Flights from ${o} to ${d} on ${input.departDate} one way ${adults} adults`;
  return `https://www.google.com/travel/flights?hl=pt-BR&gl=br&curr=BRL&q=${encodeURIComponent(q)}#flt=${flt}`;
}

export function buildBuyLinks(input: {
  origin: string;
  destination: string;
  departDate: string;
  returnDate?: string | null;
  adults: number;
}): BuyLinks {
  const o = input.origin.toUpperCase();
  const d = input.destination.toUpperCase();
  const adults = Math.max(1, Math.min(9, input.adults));
  const ret = input.returnDate ?? null;

  const googleFlights = googleFlightsResultsUrl({
    origin: o,
    destination: d,
    departDate: input.departDate,
    returnDate: ret,
    adults,
  });

  const kayakPath = ret ? `${o}-${d}/${input.departDate}/${ret}` : `${o}-${d}/${input.departDate}`;
  const kayak = `https://www.kayak.com.br/flights/${kayakPath}?sort=price_a&adults=${adults}`;

  const skyOut = yymmdd(input.departDate);
  const skyRet = ret ? yymmdd(ret) : "";
  const skyscanner = ret
    ? `https://www.skyscanner.com.br/transporte/voos/${o.toLowerCase()}/${d.toLowerCase()}/${skyOut}/${skyRet}/?adults=${adults}&adultsv2=${adults}&cabinclass=economy&rtn=1&preferdirects=false&outboundaltsenabled=false&inboundaltsenabled=false`
    : `https://www.skyscanner.com.br/transporte/voos/${o.toLowerCase()}/${d.toLowerCase()}/${skyOut}/?adults=${adults}&adultsv2=${adults}&cabinclass=economy&rtn=0&preferdirects=false&outboundaltsenabled=false&inboundaltsenabled=false`;

  const tripType = ret ? "roundtrip" : "oneway";
  const decolarDates = ret ? `${input.departDate}/${ret}` : input.departDate;
  // Results page (sorted by price) — shows fares in the browser.
  const decolar = `https://www.decolar.com/shop/flights/results/${tripType}/${o}/${d}/${decolarDates}/${adults}/0/0/?from=SB&sort=price_asc`;

  return { googleFlights, kayak, skyscanner, decolar };
}

export function formatLinksMessage(links: BuyLinks): string {
  return [
    `Decolar: ${links.decolar}`,
    `Kayak: ${links.kayak}`,
    `Skyscanner: ${links.skyscanner}`,
    `Google Flights: ${links.googleFlights}`,
  ].join("\n");
}
