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

type AirportMeta = {
  placeName: string;
  /** Kayak/Momondo airport car search uses bare IATA in /cars/{IATA}/dates */
  iata: string;
  rentcarsPath: string | null;
  skyscannerSlug: string;
  localizaAgencyCode: string | null;
  movidaStorePath: string | null;
  focoReservaHint: string | null;
};

function airportMeta(iataRaw: string): AirportMeta {
  const iata = iataRaw.toUpperCase();
  switch (iata) {
    case "REC":
      return {
        placeName: "Aeroporto de Recife",
        iata: "REC",
        rentcarsPath:
          "aeroportos/brasil/rec-guararapes-gilberto-freyre-recife-pernambuco",
        skyscannerSlug: "rec/rec",
        localizaAgencyCode: "AAREC",
        movidaStorePath: "loja/recife-aeroporto",
        focoReservaHint: "Recife Aeroporto",
      };
    case "MCZ":
      return {
        placeName: "Aeroporto de Maceió",
        iata: "MCZ",
        rentcarsPath: "aeroportos/brasil/mcz-zumbi-dos-palmares-maceio-alagoas",
        skyscannerSlug: "mcz/mcz",
        localizaAgencyCode: "AAMCZ",
        movidaStorePath: "loja/maceio-aeroporto",
        focoReservaHint: "Maceió Aeroporto",
      };
    case "AJU":
      return {
        placeName: "Aeroporto de Aracaju",
        iata: "AJU",
        rentcarsPath: "aeroportos/brasil/aju-santa-maria-aracaju-sergipe",
        skyscannerSlug: "aju/aju",
        localizaAgencyCode: "AAAJU",
        movidaStorePath: null,
        focoReservaHint: "Aracaju Aeroporto",
      };
    default:
      return {
        placeName: iata,
        iata,
        rentcarsPath: null,
        skyscannerSlug: `${iata.toLowerCase()}/${iata.toLowerCase()}`,
        localizaAgencyCode: null,
        movidaStorePath: null,
        focoReservaHint: null,
      };
  }
}

/** Localiza SPA expects DD-MM-YYYY HH:mm:ss in query params. */
function localizaDateTime(isoDate: string, hhmm: string): string {
  const [y, m, d] = isoDate.split("-");
  return `${d}-${m}-${y} ${padTime(hhmm)}:00`;
}

/**
 * Deep link into Localiza booking form with airport + dates prefilled.
 * Site still needs "Continuar" — prefills passo 1, does not skip to groups.
 */
export function buildLocalizaSearchUrl(input: {
  agencyCode: string;
  pickupDate: string;
  dropoffDate: string;
  pickupTime: string;
  dropoffTime: string;
}): string {
  const params = new URLSearchParams({
    pickUpLocation: input.agencyCode,
    pickUpDateTime: localizaDateTime(input.pickupDate, input.pickupTime),
    dropOffLocation: input.agencyCode,
    dropOffDateTime: localizaDateTime(input.dropoffDate, input.dropoffTime),
  });
  return `https://www.localiza.com/brasil/pt-br?${params.toString()}`;
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

function kayakCarFs(category: CarCategory): string {
  if (category === "economy" || category === "compact") return "carclass=small";
  if (category === "suv") return "carclass=suv";
  return "";
}

/**
 * Deep links that preferably land on RESULTS with dates (Kayak/Momondo IATA),
 * then fleet sites (often need one click Continuar).
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
  const meta = airportMeta(input.pickupIata);
  const pickupTime = padTime(input.pickupTime ?? "14:00");
  const dropoffTime = padTime(input.dropoffTime ?? "12:00");
  const pickupHour = timeHour(pickupTime);
  const dropoffHour = timeHour(dropoffTime);
  const age = Math.max(18, Math.min(99, input.driverAge ?? 25));
  const category = input.category ?? "suv";
  const fs = kayakCarFs(category);

  // Airport IATA in path → Kayak/Momondo open search results for those dates
  // (city slug Recife,Brasil-c… often dumped users on a blank search).
  const kayakPath = `${meta.iata}/${input.pickupDate}-${pickupHour}h/${input.dropoffDate}-${dropoffHour}h`;
  // Keep fs=carclass=suv unescaped — Kayak car filters break if '=' is %3D-encoded.
  const kayak =
    `https://www.kayak.com.br/cars/${kayakPath}?sort=price_a` +
    (fs ? `&fs=${fs}` : "");
  const momondo =
    `https://www.momondo.com.br/cars/${kayakPath}?sort=price_a` +
    (fs ? `&fs=${fs}` : "");

  const rentcarsParams = new URLSearchParams({
    pickupLocation: meta.placeName,
    pickupDate: input.pickupDate,
    returnDate: input.dropoffDate,
    pickupTime,
    returnTime: dropoffTime,
  });
  const rentcars = meta.rentcarsPath
    ? `https://www.rentcars.com/pt-br/${meta.rentcarsPath}?${rentcarsParams.toString()}`
    : `https://www.rentcars.com/pt-br/?${rentcarsParams.toString()}`;

  // Booking airport cars landing (user fills dates on SPA — keep airport locked)
  const booking = `https://www.booking.com/cars/airport/br/${meta.iata.toLowerCase()}.pt-br.html`;

  // Expedia Cars-Search — ISO dates + 24h times
  const expedia = `https://www.expedia.com.br/Cars-Search?${new URLSearchParams(
    {
      date1: input.pickupDate,
      date2: input.dropoffDate,
      locn: `${meta.placeName} (${meta.iata})`,
      time1: `${pickupHour}00`,
      time2: `${dropoffHour}00`,
    },
  ).toString()}`;

  const discoverCars = `https://www.discovercars.com/br/brazil?date_from=${input.pickupDate}&date_to=${input.dropoffDate}&time_from=${pickupTime}&time_to=${dropoffTime}`;

  // Skyscanner carhire results path (dates YYMMDD)
  const skyPick = yymmdd(input.pickupDate);
  const skyDrop = yymmdd(input.dropoffDate);
  const skyscanner = `https://www.skyscanner.com.br/carhire/results/${meta.iata}/${meta.iata}/${skyPick}/${skyDrop}/${pickupTime}/${dropoffTime}/${age}/`;

  const localiza = meta.localizaAgencyCode
    ? buildLocalizaSearchUrl({
        agencyCode: meta.localizaAgencyCode,
        pickupDate: input.pickupDate,
        dropoffDate: input.dropoffDate,
        pickupTime,
        dropoffTime,
      })
    : "https://www.localiza.com/brasil/pt-br";

  const movidaQ = new URLSearchParams({
    localRetirada: meta.placeName,
    dataRetirada: ddmmyyyy(input.pickupDate),
    dataDevolucao: ddmmyyyy(input.dropoffDate),
    horaRetirada: pickupTime,
    horaDevolucao: dropoffTime,
  });
  const movida = meta.movidaStorePath
    ? `https://www.movida.com.br/${meta.movidaStorePath}?${movidaQ.toString()}`
    : `https://aluguel.movida.com.br/?${movidaQ.toString()}`;

  // Foco booking engine — query hints; SPA may still ask to confirm store
  const focoQ = new URLSearchParams({
    retirada: meta.focoReservaHint ?? meta.placeName,
    dataRetirada: input.pickupDate,
    dataDevolucao: input.dropoffDate,
    horaRetirada: pickupTime,
    horaDevolucao: dropoffTime,
  });
  const foco = `https://reservas.aluguefoco.com.br/?${focoQ.toString()}`;

  const unidas = "https://www.unidas.com.br/";

  return {
    kayak,
    momondo,
    skyscanner,
    rentcars,
    booking,
    expedia,
    discoverCars,
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
    `1) Abrir RESULTADOS já com datas${hint} — use estes primeiro:`,
    `Kayak aeroporto: ${links.kayak}`,
    `Momondo aeroporto: ${links.momondo}`,
    `Skyscanner: ${links.skyscanner}`,
    "",
    `2) Locadoras (form costuma vir preenchido; se pedir, clique Continuar/Buscar):`,
    `Localiza: ${links.localiza}`,
    `Foco reservas: ${links.foco}`,
    `Movida: ${links.movida}`,
    `Unidas (site; buscar manualmente): ${links.unidas}`,
    "",
    `3) Outros comparadores:`,
    `Rentcars: ${links.rentcars}`,
    `Expedia: ${links.expedia}`,
  ].join("\n");
}

export function rentalDayCount(pickupDate: string, dropoffDate: string): number {
  const a = Date.parse(`${pickupDate.slice(0, 10)}T12:00:00Z`);
  const b = Date.parse(`${dropoffDate.slice(0, 10)}T12:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 1;
  return Math.max(1, Math.round((b - a) / 86_400_000));
}
