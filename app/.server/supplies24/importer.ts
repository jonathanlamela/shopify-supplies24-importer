import prisma from "../../db.server";
import {
  downloadCatalog,
  parseCatalog,
  cleanCatalog,
  computePrices,
  type CatalogOffer,
} from "./catalog";
import { getSettings, type AppSettings } from "./context";
import { saveCategories, curatedCollectionTitle } from "./categories";
import {
  type GraphqlLike,
  findProductByBarcode,
  createProduct,
  updateVariantPrice,
  updateProductCategory,
  setInventoryQuantity,
  setProductImage,
  publishProductToChannels,
  getFirstLocation,
  addProductsToCollection,
} from "./shopify";
import { findProductImageUrl } from "./images";

export interface ImportOptions {
  shop: string;
  mode: "full" | "update";
  graphql: GraphqlLike;
  onProgress?: (message: string, counts?: ImportCounts) => void;
  runId?: number;
}

export interface ImportCounts {
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  outOfStock: number;
  total: number;
}

export interface ImportResult {
  status: "success" | "fail";
  message: string;
  settings?: AppSettings;
  steps: {
    created?: number;
    updated?: number;
    skipped?: number;
    failed?: number;
    outOfStock?: number;
    errors?: string[];
    runId?: number;
  };
}

const emptyCounts = (total = 0): ImportCounts => ({
  created: 0,
  updated: 0,
  skipped: 0,
  failed: 0,
  outOfStock: 0,
  total,
});

interface QueueData {
  mode: "full" | "update";
  total: number;
  locationId: string;
  staleOffers: { internalCode: string | null; ean13: string | null }[];
  counts: ImportCounts;
}

interface OfferContext {
  mode: "full" | "update";
  locationId: string;
  collectionByCategory: Map<string, string>;
  shopifyCategoryByText: Map<
    string,
    { productType: string | null; taxonomyCategoryId: string | null }
  >;
  publicationIds: string[];
}

function parseQueue(data: string | null): QueueData | null {
  if (!data) {
    return null;
  }
  try {
    return JSON.parse(data) as QueueData;
  } catch {
    return null;
  }
}

async function buildOfferContext(
  shop: string,
  mode: "full" | "update",
  locationId: string,
): Promise<OfferContext> {
  const categoryMaps = await prisma.supplies24CollectionMap.findMany({
    where: { shop },
  });
  const collectionByCategory = new Map(
    categoryMaps
      .filter((m) => m.collectionId)
      .map((m) => [m.categoryText, m.collectionId as string]),
  );

  const shopifyCategoryMaps = await prisma.supplies24CategoryMap.findMany({
    where: { shop },
  });
  const shopifyCategoryByText = new Map(
    shopifyCategoryMaps
      .filter((m) => m.productType || m.taxonomyCategoryId)
      .map((m) => [
        m.categoryText,
        {
          productType: m.productType ?? null,
          taxonomyCategoryId: m.taxonomyCategoryId ?? null,
        },
      ]),
  );

  const settings = await getSettings(shop);

  return {
    mode,
    locationId,
    collectionByCategory,
    shopifyCategoryByText,
    publicationIds: settings.publicationIds,
  };
}

async function loadOffer(shop: string, index: number) {
  return prisma.supplies24Offer.findFirst({
    where: { shop },
    orderBy: { id: "asc" },
    skip: index,
    take: 1,
  });
}

/**
 * Fase 1 (UI "start"): scarica il listino, lo pulisce, calcola i ricarichi,
 * memorizza la coda delle offerte nel DB e restituisce la dimensione della coda.
 */
export async function prepareImport(
  shop: string,
  mode: "full" | "update",
  graphql: GraphqlLike,
  opts: { runId?: number; onProgress?: (message: string) => void } = {},
): Promise<{ runId: number; mode: "full" | "update"; total: number }> {
  const settings = await getSettings(shop);
  if (!settings.downloadUrl) {
    throw new Error(
      "URL di download non configurato. Impostalo dalla pagina Impostazioni.",
    );
  }

  const run =
    opts.runId != null
      ? await prisma.supplies24ImportRun.findUnique({
          where: { id: opts.runId },
        })
      : await prisma.supplies24ImportRun.create({
          data: { shop, mode, status: "running" },
        });
  if (!run) {
    throw new Error("Esecuzione non trovata.");
  }

  const progress = (message: string) => {
    opts.onProgress?.(message);
    void prisma.supplies24ImportRun.update({
      where: { id: run.id },
      data: { progress: JSON.stringify({ message }) },
    });
  };

  progress("Download del listino");
  const download = await downloadCatalog(settings.downloadUrl);
  if (download.status !== "success" || !download.raw) {
    throw new Error(download.message);
  }

  progress("Parsing del listino");
  const parsed = parseCatalog(download.raw);

  progress("Pulizia del listino");
  const cleaned = cleanCatalog(parsed);

  progress("Lettura categorie");
  await saveCategories(shop, cleaned);

  const recharges = await prisma.supplies24Recharge.findMany({
    where: { shop },
    orderBy: { min: "asc" },
  });

  progress("Calcolo ricarichi");
  const priced = computePrices(
    cleaned,
    recharges.map((r) => ({ min: r.min, max: r.max, profit: r.profit })),
  );

  // Riuso dei productId già creati nei run precedenti
  const existingOffers = await prisma.supplies24Offer.findMany({
    where: { shop },
    select: { internalCode: true, ean13: true, productId: true },
  });
  const productIdByInternalCode = new Map<string, string>();
  const productIdByEan = new Map<string, string>();
  for (const offer of existingOffers) {
    if (offer.internalCode && offer.productId) {
      productIdByInternalCode.set(offer.internalCode, offer.productId);
    }
    if (offer.ean13 && offer.productId) {
      productIdByEan.set(offer.ean13, offer.productId);
    }
  }

  await prisma.supplies24Offer.deleteMany({ where: { shop } });
  await prisma.supplies24Offer.createMany({
    data: priced.map((offer) => ({
      shop,
      internalCode: offer.internalCode,
      reference: offer.reference,
      ean13: offer.ean13,
      manufacturer: offer.manufacturer,
      name: offer.name,
      quantity: offer.quantity,
      price: offer.price,
      wholesalePrice: offer.wholesalePrice,
      descriptionShort: offer.descriptionShort,
      category: offer.category,
      executed: false,
      productId:
        productIdByInternalCode.get(offer.internalCode) ??
        productIdByEan.get(offer.ean13) ??
        null,
    })),
  });

  progress("Preparazione sincronizzazione Shopify");
  const locationId = await getFirstLocation(graphql);
  if (!locationId) {
    throw new Error("Nessuna location trovata nel negozio Shopify");
  }

  const catalogKeys = new Set(priced.map((o) => o.internalCode));
  const staleOffers = existingOffers
    .filter((o) => o.productId && !catalogKeys.has(o.internalCode ?? ""))
    .map((o) => ({ internalCode: o.internalCode ?? null, ean13: o.ean13 ?? null }));

  const queueData: QueueData = {
    mode,
    total: priced.length,
    locationId,
    staleOffers,
    counts: emptyCounts(priced.length),
  };

  await prisma.supplies24ImportRun.update({
    where: { id: run.id },
    data: { data: JSON.stringify(queueData) },
  });

  return { runId: run.id, mode, total: priced.length };
}

/**
 * Elabora una singola offerta (un prodotto) come fa il modulo PrestaShop.
 */
export async function processOffer(
  graphql: GraphqlLike,
  offer: {
    internalCode: string | null;
    reference: string | null;
    ean13: string | null;
    manufacturer: string | null;
    name: string | null;
    quantity: number;
    price: number;
    descriptionShort: string | null;
    category: string | null;
    productId: string | null;
  },
  ctx: OfferContext,
): Promise<{ outcome: "created" | "updated" | "skipped"; productId: string | null }> {
  const { mode, locationId, shopifyCategoryByText, publicationIds } = ctx;

  const found = await findProductByBarcode(graphql, offer.ean13 ?? "");
  let productId = offer.productId ?? null;
  let variantId = found?.variants[0]?.id ?? null;
  let inventoryItemId = found?.variants[0]?.inventoryItemId ?? null;

  const shopifyCategory = offer.category
    ? shopifyCategoryByText.get(offer.category)
    : undefined;

  const applyUpdate = async (id: string) => {
    if (variantId) {
      await updateVariantPrice(graphql, id, variantId, offer.price.toFixed(2));
    }
    if (inventoryItemId) {
      await setInventoryQuantity(graphql, locationId, inventoryItemId, offer.quantity);
    }
    if (shopifyCategory?.taxonomyCategoryId) {
      await updateProductCategory(graphql, id, {
        taxonomyCategoryId: shopifyCategory.taxonomyCategoryId,
      });
    }
    if (!found?.hasImage && offer.ean13) {
      const imageUrl = await findProductImageUrl(offer.ean13);
      if (imageUrl) {
        try {
          await setProductImage(graphql, id, imageUrl, offer.name ?? "");
        } catch {
          // Immagine non essenziale: un URL non valido non deve far fallire l'aggiornamento.
        }
      }
    }
  };

  if (productId && found) {
    await applyUpdate(productId);
    return { outcome: "updated", productId };
  }

  if (!productId && found) {
    productId = found.id;
    variantId = found.variants[0]?.id ?? null;
    inventoryItemId = found.variants[0]?.inventoryItemId ?? null;
    await applyUpdate(productId);
    return { outcome: "updated", productId };
  }

  if (mode === "update") {
    return { outcome: "skipped", productId: null };
  }

  const productType =
    shopifyCategory?.productType ??
    (offer.category ? curatedCollectionTitle(offer.category) : undefined);

  const product = await createProduct(graphql, {
    title: (offer.name ?? "").slice(0, 255),
    vendor: offer.manufacturer ?? undefined,
    productType: productType?.slice(0, 255),
    descriptionHtml: offer.descriptionShort
      ? `<p>${offer.descriptionShort}</p>`
      : undefined,
    tags: offer.category ? [offer.category] : undefined,
    barcode: offer.ean13 ?? undefined,
    sku: offer.reference ?? undefined,
    price: offer.price.toFixed(2),
    taxonomyCategoryId: shopifyCategory?.taxonomyCategoryId ?? undefined,
  });

  const newVariant = product.variants[0];
  if (newVariant?.inventoryItemId) {
    await setInventoryQuantity(
      graphql,
      locationId,
      newVariant.inventoryItemId,
      offer.quantity,
    );
  }

  if (offer.ean13) {
    const imageUrl = await findProductImageUrl(offer.ean13);
    if (imageUrl) {
      try {
        await setProductImage(graphql, product.id, imageUrl, product.title);
      } catch {
        // Immagine non essenziale: un URL non valido non deve far fallire l'import del prodotto.
      }
    }
  }

  if (publicationIds.length > 0) {
    await publishProductToChannels(graphql, product.id, publicationIds);
  }

  return { outcome: "created", productId: product.id };
}

export interface StepResult {
  ok: boolean;
  index: number;
  total: number;
  current: string;
  outcome: string;
  counts: ImportCounts;
  error?: string;
}

/**
 * Fase 2 (UI "step"): elabora l'offerta all'indice della coda, aggiorna i
 * contatori e restituisce lo stato. Ogni richiesta processa un solo prodotto.
 */
export async function stepImport(
  shop: string,
  runId: number,
  index: number,
  graphql: GraphqlLike,
): Promise<StepResult> {
  const run = await prisma.supplies24ImportRun.findUnique({
    where: { id: runId },
  });
  if (!run || run.shop !== shop || run.status !== "running") {
    return {
      ok: false,
      index,
      total: 0,
      current: "",
      outcome: "failed",
      counts: emptyCounts(),
      error: "Esecuzione non in corso.",
    };
  }

  const queueData = parseQueue(run.data) ?? {
    mode: run.mode as "full" | "update",
    total: 0,
    locationId: "",
    staleOffers: [],
    counts: emptyCounts(),
  };

  const offer = await loadOffer(shop, index);
  if (!offer) {
    return {
      ok: false,
      index,
      total: queueData.total,
      current: "",
      outcome: "failed",
      counts: queueData.counts,
      error: "Fine coda.",
    };
  }

  const ctx = await buildOfferContext(shop, queueData.mode, queueData.locationId);

  try {
    const { outcome, productId } = await processOffer(graphql, offer, ctx);
    if (outcome !== "skipped") {
      await prisma.supplies24Offer.update({
        where: { id: offer.id },
        data: { executed: true, productId: productId ?? offer.productId },
      });
    }
    if (outcome === "created") queueData.counts.created++;
    else if (outcome === "updated") queueData.counts.updated++;
    else if (outcome === "skipped") queueData.counts.skipped++;

    await persistQueue(run, queueData, `Elaborato ${index + 1}/${queueData.total}`);

    return {
      ok: true,
      index,
      total: queueData.total,
      current: offer.name ?? "",
      outcome,
      counts: queueData.counts,
    };
  } catch (error) {
    queueData.counts.failed++;
    await persistQueue(run, queueData, `Errore su ${offer.internalCode ?? index}`);
    return {
      ok: false,
      index,
      total: queueData.total,
      current: offer.name ?? "",
      outcome: "failed",
      counts: queueData.counts,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function persistQueue(
  run: { id: number },
  queueData: QueueData,
  message: string,
): Promise<void> {
  await prisma.supplies24ImportRun.update({
    where: { id: run.id },
    data: {
      data: JSON.stringify(queueData),
      progress: JSON.stringify({ message, counts: queueData.counts }),
    },
  });
}

/**
 * Fase 3 (UI "finish"): aggiunge i prodotti alle collezioni mappate, azzera lo
 * stock dei prodotti rimossi dal listino e chiude l'esecuzione.
 */
export async function finalizeImport(
  shop: string,
  runId: number,
  graphql: GraphqlLike,
): Promise<ImportResult> {
  const run = await prisma.supplies24ImportRun.findUnique({
    where: { id: runId },
  });
  if (!run || run.shop !== shop) {
    return {
      status: "fail",
      message: "Esecuzione non trovata.",
      steps: {},
    };
  }

  const queueData = parseQueue(run.data) ?? {
    mode: run.mode as "full" | "update",
    total: 0,
    locationId: "",
    staleOffers: [],
    counts: emptyCounts(),
  };
  const errors: string[] = [];

  // Collezioni: tutti i prodotti elaborati in questa esecuzione
  const ctx = await buildOfferContext(shop, queueData.mode, queueData.locationId);
  const executed = await prisma.supplies24Offer.findMany({
    where: { shop, executed: true },
    select: { category: true, productId: true },
  });
  const collectionAdds = new Map<string, Set<string>>();
  for (const offer of executed) {
    if (!offer.category || !offer.productId) {
      continue;
    }
    const collectionId = ctx.collectionByCategory.get(offer.category);
    if (!collectionId) {
      continue;
    }
    if (!collectionAdds.has(collectionId)) {
      collectionAdds.set(collectionId, new Set());
    }
    collectionAdds.get(collectionId)!.add(offer.productId);
  }
  for (const [collectionId, productIds] of collectionAdds) {
    await addProductsToCollection(graphql, collectionId, Array.from(productIds));
  }

  // Stock a 0 per i prodotti non più nel listino
  for (const stale of queueData.staleOffers) {
    try {
      const found = await findProductByBarcode(graphql, stale.ean13 ?? "");
      if (found && found.variants[0]?.inventoryItemId) {
        await setInventoryQuantity(
          graphql,
          queueData.locationId,
          found.variants[0].inventoryItemId,
          0,
        );
        queueData.counts.outOfStock++;
      }
    } catch (error) {
      errors.push(
        `OutOfStock ${stale.internalCode}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  await prisma.supplies24ImportRun.update({
    where: { id: run.id },
    data: {
      status: "success",
      finishedAt: new Date(),
      data: JSON.stringify(queueData),
      summary: JSON.stringify({ counts: queueData.counts, errors }),
      progress: JSON.stringify({
        message: "Operazione completata",
        counts: queueData.counts,
      }),
    },
  });

  return {
    status: "success",
    message: "Operazione completata",
    settings: await getSettings(shop),
    steps: {
      created: queueData.counts.created,
      updated: queueData.counts.updated,
      skipped: queueData.counts.skipped,
      failed: queueData.counts.failed,
      outOfStock: queueData.counts.outOfStock,
      errors,
      runId: run.id,
    },
  };
}

/**
 * Importazione completa e sincrona (usata dal cron). Processa un prodotto alla
 * volta riusando gli stessi step dell'interfaccia.
 */
export async function runImport(options: ImportOptions): Promise<ImportResult> {
  const { shop, mode, graphql, onProgress, runId } = options;
  const settings = await getSettings(shop);

  if (!settings.downloadUrl) {
    return {
      status: "fail",
      message:
        "URL di download non configurato. Impostalo dalla pagina Impostazioni.",
      settings,
      steps: {},
    };
  }

  const run =
    runId != null
      ? await prisma.supplies24ImportRun.findUnique({ where: { id: runId } })
      : await prisma.supplies24ImportRun.create({
          data: { shop, mode, status: "running" },
        });
  if (!run) {
    return {
      status: "fail",
      message: "Esecuzione non trovata.",
      settings,
      steps: {},
    };
  }

  const progress = (message: string, counts?: ImportCounts) => {
    onProgress?.(message, counts);
    void prisma.supplies24ImportRun.update({
      where: { id: run.id },
      data: { progress: JSON.stringify({ message, counts }) },
    });
  };

  try {
    await prepareImport(shop, mode, graphql, { runId: run.id, onProgress: progress });

    const freshRun = await prisma.supplies24ImportRun.findUnique({
      where: { id: run.id },
    });
    const queueData = parseQueue(freshRun?.data ?? null) ?? {
      mode,
      total: 0,
      locationId: "",
      staleOffers: [],
      counts: emptyCounts(),
    };

    for (let index = 0; index < queueData.total; index++) {
      await stepImport(shop, run.id, index, graphql);
      if ((index + 1) % 25 === 0) {
        progress(`Elaborati ${index + 1}/${queueData.total}`);
      }
    }

    return await finalizeImport(shop, run.id, graphql);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.supplies24ImportRun.update({
      where: { id: run.id },
      data: {
        status: "error",
        finishedAt: new Date(),
        summary: JSON.stringify({ errors: [message] }),
      },
    });
    return {
      status: "fail",
      message,
      settings,
      steps: { errors: [message], runId: run.id },
    };
  }
}

export type { CatalogOffer };
