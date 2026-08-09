export interface CatalogOffer {
  id: string;
  internalCode: string;
  reference: string;
  ean13: string;
  manufacturer: string;
  name: string;
  quantity: number;
  price: number;
  wholesalePrice: number;
  descriptionShort: string;
  category: string;
}

export interface DownloadResult {
  status: "success" | "fail";
  message: string;
  raw?: string;
  offers?: CatalogOffer[];
  count?: number;
}

/**
 * Scarica il listino Supplies24 dall'URL configurato.
 * Ritorna il contenuto raw del CSV.
 */
export async function downloadCatalog(url: string): Promise<DownloadResult> {
  if (!url) {
    return { status: "fail", message: "URL di download non configurato." };
  }

  try {
    const response = await fetch(url, {
      headers: { Accept: "text/csv,*/*;q=0.8" },
    });

    if (!response.ok) {
      return {
        status: "fail",
        message: `Errore nel download del file: HTTP ${response.status}`,
      };
    }

    const raw = await response.text();
    return { status: "success", message: "File scaricato.", raw };
  } catch (error) {
    return {
      status: "fail",
      message: `Errore nel download del file: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}

/**
 * Parser del CSV del listino Supplies24.
 * Colonne (delimitatore ";") in base al modulo PrestaShop:
 *   0 id, 1 produttore, 2 reference, 3 ean, 4 (non usato),
 *   5 descrizione, 6 prezzo, 7 disponibilita ("1" = disponibile)
 */
export function parseCatalog(raw: string): CatalogOffer[] {
  const rows: CatalogOffer[] = [];

  const lines = raw.replace(/\r/g, "").split("\n").filter((l) => l.trim() !== "");
  if (lines.length === 0) {
    return rows;
  }

  // Salta la riga di intestazione
  for (let i = 1; i < lines.length; i++) {
    const data = splitCsvLine(lines[i]);

    if (data.length < 8) {
      continue;
    }

    const id = data[0];
    const reference = data[2] ?? "";
    const ean = data[3] ?? "";
    const manufacturer = data[1] ?? "";
    const description = data[5] ?? "";

    const price = parsePrice(data[6]);

    const descriptionShort = cleanDescription(description);
    const name = buildName(description, reference, manufacturer);
    const category = buildCategory(description, reference, manufacturer);

    const quantity = data[7] === "1" ? 15 : 0;

    const internalCode = ean ? `4-EA-${ean}` : reference ? `4-MPN-${reference}` : null;

    if (!internalCode) {
      continue;
    }

    rows.push({
      id,
      internalCode,
      reference,
      ean13: ean,
      manufacturer,
      name,
      quantity,
      price,
      wholesalePrice: price,
      descriptionShort,
      category,
    });
  }

  return rows;
}

function splitCsvLine(line: string): string[] {
  // Gestione minimale delle virgolette: toglie eventuali quote intorno ai campi
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === ";" && !inQuotes) {
      fields.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  fields.push(current);

  return fields;
}

function parsePrice(value: string): number {
  const normalized = value.replace(",", ".");
  const parsed = parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function cleanDescription(value: string): string {
  return value
    .replace(/ORIGINAL/g, "")
    .replace(/Seiten/g, "pagine")
    .replace(/~'/g, "capacità indicativa")
    .trim();
}

function buildName(description: string, reference: string, _manufacturer: string): string {
  let name = reference ? description.split(reference)[0] + reference : description;
  name = name.replace(/ORIGINAL/g, "").replace(/Seiten/g, "pagine").replace(/~'/g, "capacità indicativa");
  return name.trim();
}

function buildCategory(description: string, reference: string, manufacturer: string): string {
  let category = description;
  category = category.replace(/ORIGINAL/g, "");
  if (manufacturer) {
    category = category.split(manufacturer).join("");
  }
  category = reference ? category.split(reference)[0] : category;
  return category.trim();
}

/**
 * Pulizia del listino: elimina righe non valide e normalizza le reference,
 * replicando la logica di clearListino del modulo PrestaShop.
 */
export function cleanCatalog(offers: CatalogOffer[]): CatalogOffer[] {
  const cleaned: CatalogOffer[] = [];

  for (const offer of offers) {
    if (offer.price === 0) {
      continue;
    }
    if (offer.reference.includes("'")) {
      continue;
    }
    if (/[a-zA-Z]/.test(offer.ean13) || offer.ean13 === "0" || offer.ean13 === "") {
      continue;
    }
    if (!/^[0-9]*$/.test(offer.ean13)) {
      continue;
    }
    if (offer.ean13 === "0000000000000") {
      continue;
    }

    cleaned.push({
      ...offer,
      reference: normalizeReference(offer.reference),
    });
  }

  return cleaned;
}

function normalizeReference(reference: string): string {
  let ref = reference;
  if (ref.includes("=")) {
    ref = ref.replace(/=/g, "");
  }
  if (/[_]/.test(ref)) {
    ref = ref.replace(/_/g, " ");
  }
  if (/[.]/.test(ref)) {
    ref = ref.replace(/\./g, "");
  }
  if (/[()]/.test(ref)) {
    ref = ref.replace(/[()]/g, "");
  }
  return ref;
}

/**
 * Applica le regole del listino (togliere l'IVA 22% dal prezzo di vendita)
 * e calcola i ricarichi configurabili per fascia di prezzo.
 * La fascia di ricarico viene valutata sul prezzo all'ingrosso lordo.
 */
export function computePrices(
  offers: CatalogOffer[],
  recharges: { min: number; max: number; profit: number }[],
): CatalogOffer[] {
  const result = offers.map((offer) => ({
    ...offer,
    price: round(offer.price / 1.22, 2),
  }));

  for (const recharge of recharges) {
    const percentuale = recharge.profit / 100;
    for (const offer of result) {
      if (
        offer.wholesalePrice >= recharge.min &&
        offer.wholesalePrice <= recharge.max
      ) {
        offer.price = offer.price + offer.price * percentuale;
      }
    }
  }

  for (const offer of result) {
    offer.price = round(offer.price, 2);
    offer.wholesalePrice = round(offer.wholesalePrice / 1.22, 3);
  }

  return result;
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}
