import prisma from "../../db.server";
import {
  downloadCatalog,
  parseCatalog,
  cleanCatalog,
  type CatalogOffer,
} from "./catalog";

export interface CategoriesResult {
  categories: string[];
  count: number;
}

/**
 * Estrae le categorie uniche (ordinate) dal listino pulito.
 */
export function extractCategories(offers: CatalogOffer[]): string[] {
  const set = new Set<string>();
  for (const offer of offers) {
    const category = offer.category?.trim();
    if (category) {
      set.add(category);
    }
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

/**
 * Sostituisce le categorie note del negozio con quelle estratte dal listino.
 * Usato sia dal mapping pre-import sia durante l'importazione completa.
 */
export async function saveCategories(
  shop: string,
  offers: CatalogOffer[],
): Promise<string[]> {
  const categories = extractCategories(offers);

  await prisma.supplies24Category.deleteMany({ where: { shop } });
  if (categories.length > 0) {
    await prisma.supplies24Category.createMany({
      data: categories.map((categoryText) => ({ shop, categoryText })),
    });
  }

  return categories;
}

/**
 * Raggruppa la categoria grezza del listino in una collezione SEO friendly
 * basata SOLO sul tipo di prodotto, ignorando i colori. I prodotti di ogni
 * categoria grezza finiscono quindi nella stessa collezione.
 */
export function curatedCollectionTitle(categoryText: string): string | null {
  const c = categoryText.toLowerCase();

  if (c.includes("toner")) return "Toner";
  if (c.includes("cartuccia")) return "Cartucce d'Inchiostro";
  if (c.includes("tambur")) return "Tamburi";
  if (c.includes("multipack") || c.includes("value pack")) return "Multipack e Value Pack";
  if (c.includes("stampante")) return "Stampanti";
  if (c.includes("etichett")) return "Etichette";
  if (c.includes("nastro")) return "Nastri Termici";
  if (c.includes("cassetta")) return "Cassette Carta";
  if (c.includes("carta")) return "Carta";
  if (c.includes("accessori")) return "Accessori";
  if (c.includes("vaschetta") || c.includes("recupero")) return "Vaschette di Recupero";
  if (c.includes("manutenzione")) return "Unità di Manutenzione";
  if (c.includes("trasferimento")) return "Unità di Trasferimento";
  if (c.includes("trasporto")) return "Unità di Trasporto";
  if (c.includes("fusor") || c.includes("rullo fusore")) return "Fusori";
  if (c.includes("stampante")) return "Stampanti";
  if (c.includes("testina")) return "Testine di Stampa";
  if (c.includes("cassetta")) return "Cassette Carta";
  if (c.includes("sviluppatore")) return "Unità Sviluppatore";
  if (c.includes("colorstix")) return "ColorStix";
  if (c.includes("igiene")) return "Igiene";

  // Categorie residue senza tipo riconoscibile (es. solo "nero", "Bianco")
  return "Consumabili";
}

/**
 * Raggruppa le categorie grezze in collezioni per tipo di prodotto.
 * Ritorna una mappa: titolo collezione -> categorie grezze che vi afferiscono.
 */
export function groupCategoriesByType(
  categoryTexts: string[],
): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const categoryText of categoryTexts) {
    if (!categoryText) {
      continue;
    }
    const title = curatedCollectionTitle(categoryText);
    if (!title) {
      continue;
    }
    const list = groups.get(title) ?? [];
    list.push(categoryText);
    groups.set(title, list);
  }
  return groups;
}

/**
 * Scarica il listino, lo pulisce e memorizza le categorie senza importare i
 * prodotti. Così il mapping delle collezioni può essere fatto prima dell'import.
 */
export async function syncCategoriesFromDownload(
  shop: string,
  downloadUrl: string,
): Promise<CategoriesResult> {
  if (!downloadUrl) {
    throw new Error(
      "URL di download non configurato. Impostalo dalla pagina Impostazioni.",
    );
  }

  const download = await downloadCatalog(downloadUrl);
  if (download.status !== "success" || !download.raw) {
    throw new Error(download.message);
  }

  const parsed = parseCatalog(download.raw);
  const cleaned = cleanCatalog(parsed);

  const categories = await saveCategories(shop, cleaned);

  return { categories, count: categories.length };
}
