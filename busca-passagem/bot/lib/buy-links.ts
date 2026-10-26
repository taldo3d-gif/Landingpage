import type { BuyLinks } from "./types.js";

function yymmdd(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  return `${y?.slice(2) ?? ""}${m ?? ""}${d ?? ""}`;
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
  const ret = input.returnDate;

  const googleQ = ret
    ? `Voos de ${o} para ${d} de ${input.departDate} a ${ret} ${adults} adultos`
    : `Voos de ${o} para ${d} em ${input.departDate} ${adults} adultos`;
  const googleFlights = `https://www.google.com/travel/flights?hl=pt-BR&curr=BRL&q=${encodeURIComponent(googleQ)}`;

  const kayakPath = ret
    ? `${o}-${d}/${input.departDate}/${ret}`
    : `${o}-${d}/${input.departDate}`;
  const kayak = `https://www.kayak.com.br/flights/${kayakPath}?sort=price_a&adults=${adults}`;

  const skyOut = yymmdd(input.departDate);
  const skyRet = ret ? yymmdd(ret) : "";
  const skyscanner = ret
    ? `https://www.skyscanner.com.br/transporte/voos/${o.toLowerCase()}/${d.toLowerCase()}/${skyOut}/${skyRet}/?adults=${adults}&adultsv2=${adults}&cabinclass=economy&rtn=1&preferdirects=false&outboundaltsenabled=false&inboundaltsenabled=false`
    : `https://www.skyscanner.com.br/transporte/voos/${o.toLowerCase()}/${d.toLowerCase()}/${skyOut}/?adults=${adults}&adultsv2=${adults}&cabinclass=economy&rtn=0&preferdirects=false&outboundaltsenabled=false&inboundaltsenabled=false`;

  const tripType = ret ? "roundtrip" : "oneway";
  const decolarDates = ret
    ? `${input.departDate}/${ret}`
    : input.departDate;
  const decolar = `https://www.decolar.com/shop/flights/results/${tripType}/${o}/${d}/${decolarDates}/${adults}/0/0/NA/NA/NA/NA/?from=SB&sort=price_asc`;

  return { googleFlights, kayak, skyscanner, decolar };
}

export function formatLinksMessage(links: BuyLinks): string {
  return [
    `Google Flights: ${links.googleFlights}`,
    `Kayak: ${links.kayak}`,
    `Skyscanner: ${links.skyscanner}`,
    `Decolar: ${links.decolar}`,
  ].join("\n");
}
