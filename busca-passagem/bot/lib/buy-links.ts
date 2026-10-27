import type { BuyLinks } from "./types.js";

function yymmdd(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  return `${y?.slice(2) ?? ""}${m ?? ""}${d ?? ""}`;
}

/**
 * Google Flights — prefer query string (survives reload better than #flt= alone).
 * Prices still load client-side in a real browser.
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
    ? `${o}.${d}.${input.departDate}*${d}.${o}.${input.returnDate};c:BRL;e:1;sd:1;t:f`
    : `${o}.${d}.${input.departDate};c:BRL;e:1;sd:1;t:f`;
  const q = input.returnDate
    ? `Voos de ${o} para ${d} em ${input.departDate} voltando ${input.returnDate} ${adults} adultos`
    : `Voos de ${o} para ${d} em ${input.departDate} só ida ${adults} adultos`;
  return `https://www.google.com/travel/flights?hl=pt-BR&gl=br&curr=BRL&q=${encodeURIComponent(q)}#flt=${flt}`;
}

/**
 * Build trusted checkout search URLs.
 * Decolar needs the full `/NA/.../NA` path or reload drops into an empty search.
 * Kayak adults go in the path (`/2adults`), not only `?adults=`.
 */
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

  // Kayak BR: adults in path survive reload; query-only gets stripped on redirect.
  const kayakAdults = adults === 1 ? "" : `/${adults}adults`;
  const kayakPath = ret
    ? `${o}-${d}/${input.departDate}/${ret}${kayakAdults}`
    : `${o}-${d}/${input.departDate}${kayakAdults}`;
  const kayak = `https://www.kayak.com.br/flights/${kayakPath}?sort=price_a`;

  const skyOut = yymmdd(input.departDate);
  const skyRet = ret ? yymmdd(ret) : "";
  const skyscanner = ret
    ? `https://www.skyscanner.com.br/transporte/voos/${o.toLowerCase()}/${d.toLowerCase()}/${skyOut}/${skyRet}/?adults=${adults}&adultsv2=${adults}&cabinclass=economy&rtn=1&preferdirects=false&outboundaltsenabled=false&inboundaltsenabled=false`
    : `https://www.skyscanner.com.br/transporte/voos/${o.toLowerCase()}/${d.toLowerCase()}/${skyOut}/?adults=${adults}&adultsv2=${adults}&cabinclass=economy&rtn=0&preferdirects=false&outboundaltsenabled=false&inboundaltsenabled=false`;

  // Decolar/Despegar documented results path (NA placeholders required).
  // oneway:  /oneway/O/D/DATE/A/C/I/NA/CABIN/NA/NA
  // roundtrip: /roundtrip/O/D/OUT/IN/A/C/I/NA/NA/CABIN/NA/NA
  const cabin = "NA"; // economy
  const decolar = ret
    ? `https://www.decolar.com/shop/flights/results/roundtrip/${o}/${d}/${input.departDate}/${ret}/${adults}/0/0/NA/NA/${cabin}/NA/NA?from=SB&sort=price_asc`
    : `https://www.decolar.com/shop/flights/results/oneway/${o}/${d}/${input.departDate}/${adults}/0/0/NA/${cabin}/NA/NA?from=SB&sort=price_asc`;

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
