import type { CarBuyLinks, CarCategory } from "./types.js";

function padTime(t: string): string {
  const m = t.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return "10:00";
  return `${String(Number(m[1])).padStart(2, "0")}:${m[2]}`;
}

function timeHour(t: string): string {
  return padTime(t).slice(0, 2);
}

function ddmmyyyy(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  return `${d}/${m}/${y}`;
}

function yymmdd(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  return `${y?.slice(2) ?? ""}${m ?? ""}${d ?? ""}`;
}

/** Kayak city slug for common BR airport pickups. */
function kayakCitySlug(iata: string): string {
  switch (iata.toUpperCase()) {
    case "REC":
      return "Recife,Brasil-c15630";
    case "MCZ":
      return "Maceio,Brasil-c31221";
    case "AJU":
      return "Aracaju,Brasil-c42895";
    case "GRU":
    case "CGH":
    case "SAO":
      return "Sao-Paulo,Brasil-c29856";
    default:
      return `${iata.toUpperCase()}`;
  }
}

function categoryHint(category: CarCategory): string {
  switch (category) {
    case "economy":
      return "econômico";
    case "compact":
      return "compacto";
    case "intermediate":
      return "intermediário";
    case "suv":
      return "SUV";
    default:
      return "qualquer categoria";
  }
}

/**
 * Deep links for Recife (and other BR airport) car rentals on fixed dates.
 * Comparators first, then major BR fleets.
 */
export function buildCarBuyLinks(input: {
  pickupIata: string;
  pickupDate: string;
  dropoffDate: string;
  pickupTime?: string;
  dropoffTime?: string;
  category?: CarCategory;
  driverAge?: number;
}): CarBuyLinks {
  const iata = input.pickupIata.toUpperCase();
  const pickupTime = padTime(input.pickupTime ?? "14:00");
  const dropoffTime = padTime(input.dropoffTime ?? "12:00");
  const pickupHour = timeHour(pickupTime);
  const dropoffHour = timeHour(dropoffTime);
  const age = Math.max(18, Math.min(99, input.driverAge ?? 25));
  const category = input.category ?? "economy";
  const city = kayakCitySlug(iata);

  const kayak = `https://www.kayak.com.br/cars/${city}/${input.pickupDate}-${pickupHour}h/${input.dropoffDate}-${dropoffHour}h?sort=price_a`;

  const rentcarsParams = new URLSearchParams({
    pickupLocation: iata === "REC" ? "Aeroporto de Recife" : iata,
    pickupDate: input.pickupDate,
    returnDate: input.dropoffDate,
    pickupTime,
    returnTime: dropoffTime,
  });
  const rentcars =
    iata === "REC"
      ? `https://www.rentcars.com/pt-br/aeroportos/brasil/rec-guararapes-gilberto-freyre-recife-pernambuco?${rentcarsParams.toString()}`
      : `https://www.rentcars.com/pt-br/?${rentcarsParams.toString()}`;

  const booking = `https://www.booking.com/cars/airport/br/${iata.toLowerCase()}.pt-br.html`;

  const expedia = `https://www.expedia.com.br/Cars-Search?${new URLSearchParams(
    {
      date1: input.pickupDate,
      date2: input.dropoffDate,
      locn: iata === "REC" ? "Recife, Brazil (REC-Guararapes Intl.)" : iata,
      time1: `${pickupHour}00AM`,
      time2: `${dropoffHour}00AM`,
    },
  ).toString()}`;

  const discoverCars = `https://www.discovercars.com/br/brazil/recife?date_from=${input.pickupDate}&date_to=${input.dropoffDate}`;

  const skyPick = yymmdd(input.pickupDate);
  const skyDrop = yymmdd(input.dropoffDate);
  const skyscanner =
    iata === "REC"
      ? `https://www.skyscanner.com.br/aluguel-de-carros/recife/recife/${skyPick}/${skyDrop}/?pickuptime=${pickupTime}&dropofftime=${dropoffTime}&driversage=${age}`
      : `https://www.skyscanner.com.br/aluguel-de-carros/?pickupplace=${iata}&pickupdate=${skyPick}&dropoffdate=${skyDrop}`;

  // Fleet sites — SPA forms; land on airport / search with query hints
  const localiza =
    iata === "REC"
      ? "https://www.localiza.com/brasil/pt-br/rede-de-agencias/aeroporto-de-recife"
      : "https://www.localiza.com/brasil/pt-br";

  const movidaQ = new URLSearchParams({
    localRetirada: iata === "REC" ? "Aeroporto de Recife" : iata,
    dataRetirada: ddmmyyyy(input.pickupDate),
    dataDevolucao: ddmmyyyy(input.dropoffDate),
    horaRetirada: pickupTime,
    horaDevolucao: dropoffTime,
  });
  const movida = `https://www.movida.com.br/?${movidaQ.toString()}`;

  const unidas = "https://www.unidas.com.br/";
  const foco =
    iata === "REC"
      ? "https://www.focoalugueldecarros.com.br/lojas/aeroporto-internacional-do-recife/"
      : "https://www.focoalugueldecarros.com.br/";

  // Prefer economy/compact sorts on Kayak when asked
  const kayakWithClass =
    category === "economy" || category === "compact"
      ? `${kayak}&fs=carclass=small`
      : category === "suv"
        ? `${kayak}&fs=carclass=suv`
        : kayak;

  return {
    kayak: kayakWithClass,
    rentcars,
    booking,
    expedia,
    discoverCars,
    skyscanner,
    localiza,
    movida,
    unidas,
    foco,
  };
}

export function formatCarLinksMessage(
  links: CarBuyLinks,
  category?: CarCategory,
): string {
  const hint = category ? ` (${categoryHint(category)})` : "";
  return [
    `Comparar aluguel${hint}:`,
    `Kayak: ${links.kayak}`,
    `Rentcars: ${links.rentcars}`,
    `Skyscanner: ${links.skyscanner}`,
    `Booking Cars: ${links.booking}`,
    `Expedia: ${links.expedia}`,
    `DiscoverCars: ${links.discoverCars}`,
    "",
    "Locadoras BR (aeroporto):",
    `Localiza: ${links.localiza}`,
    `Movida: ${links.movida}`,
    `Unidas: ${links.unidas}`,
    `Foco: ${links.foco}`,
  ].join("\n");
}

export function rentalDayCount(pickupDate: string, dropoffDate: string): number {
  const a = Date.parse(`${pickupDate.slice(0, 10)}T12:00:00Z`);
  const b = Date.parse(`${dropoffDate.slice(0, 10)}T12:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 1;
  return Math.max(1, Math.round((b - a) / 86_400_000));
}
