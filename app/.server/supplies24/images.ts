/**
 * Recupero immagine prodotto, replicando la logica del modulo PrestaShop
 * originale: scheda Icecat per EAN (Pic500x500 / HighPic) con fallback sulla
 * ricerca live di toner24.it quando Icecat non ha la scheda.
 */

const ICECAT_USERNAME = "puntoclassic";

interface IcecatImage {
  Pic500x500?: string | null;
  HighPic?: string | null;
}

interface IcecatResponse {
  data?: {
    Image?: IcecatImage;
  };
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      return null;
    }
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function fetchIcecatImageUrl(ean: string): Promise<string | null> {
  const url =
    "https://live.icecat.biz/api/?" +
    new URLSearchParams({ UserName: ICECAT_USERNAME, lang: "it", GTIN: ean });

  const scheda = await fetchJson<IcecatResponse>(url);
  const image = scheda?.data?.Image;
  return image?.Pic500x500 || image?.HighPic || null;
}

interface Toner24Article {
  ImageURL?: string;
}

interface Toner24SearchResponse {
  article?: Toner24Article[];
}

async function fetchToner24ImageUrl(ean: string): Promise<string | null> {
  const url =
    "https://www.toner24.it/Handler/LiveSearch.ashx?queryString=" +
    encodeURIComponent(ean) +
    "&action=&page=%2FCerca%2F";

  const result = await fetchJson<Toner24SearchResponse>(url);
  const article = result?.article?.[0];
  if (!article?.ImageURL) {
    return null;
  }
  return article.ImageURL.replace("/60/", "/500/");
}

/**
 * Cerca l'immagine del prodotto per EAN: prima su Icecat, poi su toner24.it.
 * Ritorna null se nessuna delle due fonti ha un'immagine.
 */
export async function findProductImageUrl(ean: string): Promise<string | null> {
  if (!ean) {
    return null;
  }
  const icecatImage = await fetchIcecatImageUrl(ean);
  if (icecatImage) {
    return icecatImage;
  }
  return fetchToner24ImageUrl(ean);
}
