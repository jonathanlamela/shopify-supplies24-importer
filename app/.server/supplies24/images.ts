/**
 * Recupero immagine prodotto tramite la ricerca live di toner24.it per EAN.
 */

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
 * Cerca l'immagine del prodotto per EAN su toner24.it.
 * Ritorna null se non trovata.
 */
export async function findProductImageUrl(ean: string): Promise<string | null> {
  if (!ean) {
    return null;
  }
  return fetchToner24ImageUrl(ean);
}
