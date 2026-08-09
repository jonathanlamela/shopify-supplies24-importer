import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";

import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import {
  fetchCollections,
  createCollection,
  addProductsToCollection,
  removeProductsFromCollection,
  type GraphqlLike,
} from "../.server/supplies24/shopify";
import { getSettings } from "../.server/supplies24/context";
import {
  syncCategoriesFromDownload,
  groupCategoriesByType,
} from "../.server/supplies24/categories";

interface CategoryRow {
  categoryText: string;
  collectionId: string | null;
  collectionTitle: string | null;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);

  const [maps, discoveredRows, settings] = await Promise.all([
    prisma.supplies24CollectionMap.findMany({
      where: { shop: session.shop },
      orderBy: { categoryText: "asc" },
    }),
    prisma.supplies24Category.findMany({
      where: { shop: session.shop },
      orderBy: { categoryText: "asc" },
    }),
    getSettings(session.shop),
  ]);

  const collections = await fetchCollections(admin as unknown as GraphqlLike);

  const discovered = discoveredRows.map((row) => row.categoryText);
  const lastReadAt = discoveredRows.reduce<Date | null>(
    (max, row) => (max === null || row.createdAt > max ? row.createdAt : max),
    null,
  );
  const mapped = new Map(maps.map((m) => [m.categoryText, m]));
  const categories: CategoryRow[] = discovered.map((categoryText) => {
    const existing = mapped.get(categoryText);
    return {
      categoryText,
      collectionId: existing?.collectionId ?? null,
      collectionTitle: existing?.collectionTitle ?? null,
    };
  });

  const unmapped = categories.filter((c) => !c.collectionId);

  return {
    collections,
    categories,
    unmapped,
    mappedCount: maps.length,
    mappings: maps,
    hasDownloadUrl: Boolean(settings.downloadUrl),
    lastReadAt,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");

  if (intent === "downloadCategories") {
    const settings = await getSettings(session.shop);
    if (!settings.downloadUrl) {
      return {
        ok: false,
        error:
          "URL di download non configurato. Impostalo dalla pagina Impostazioni.",
      };
    }

    try {
      const { count } = await syncCategoriesFromDownload(
        session.shop,
        settings.downloadUrl,
      );
      return {
        ok: true,
        message: `Listino scaricato: ${count} categorie lette. Ora mappale con le collezioni.`,
      };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  if (intent === "delete") {
    const id = Number(formData.get("id"));
    await prisma.supplies24CollectionMap.deleteMany({
      where: { id, shop: session.shop },
    });
    return { ok: true, message: "Mapping eliminato." };
  }

  if (intent === "map") {
    const categoryText = String(formData.get("categoryText") ?? "").trim();
    const collectionId = String(formData.get("collectionId") ?? "").trim();

    if (!categoryText) {
      return { ok: false, error: "Categoria non valida." };
    }

    const collection = collectionId
      ? await fetchCollections(admin as unknown as GraphqlLike).then((cols) =>
          cols.find((c) => c.id === collectionId),
        )
      : null;

    const existing = await prisma.supplies24CollectionMap.findUnique({
      where: { shop_categoryText: { shop: session.shop, categoryText } },
    });

    const newCollectionId = collection?.id ?? null;
    const changed = (existing?.collectionId ?? null) !== newCollectionId;
    const previousCollectionId =
      changed && existing?.collectionId
        ? existing.collectionId
        : existing?.previousCollectionId ?? null;

    await prisma.supplies24CollectionMap.upsert({
      where: { shop_categoryText: { shop: session.shop, categoryText } },
      update: {
        collectionId: newCollectionId,
        collectionTitle: collection?.title ?? null,
        previousCollectionId,
      },
      create: {
        shop: session.shop,
        categoryText,
        collectionId: newCollectionId,
        collectionTitle: collection?.title ?? null,
      },
    });

    const message =
      changed && previousCollectionId
        ? `Categoria "${categoryText}" mappata su "${collection?.title}". Premi "Rimappa" per spostare i prodotti dalla vecchia collezione.`
        : collection
          ? `Categoria "${categoryText}" mappata su "${collection.title}".`
          : `Mapping rimosso per "${categoryText}".`;

    return { ok: true, message };
  }

  if (intent === "createCollections") {
    const client = admin as unknown as GraphqlLike;
    const existingMaps = await prisma.supplies24CollectionMap.findMany({
      where: { shop: session.shop },
    });
    const mappedRaws = new Set(existingMaps.map((m) => m.categoryText));

    const distinct = await prisma.supplies24Category.findMany({
      where: { shop: session.shop },
      select: { categoryText: true },
    });

    const groups = groupCategoriesByType(
      distinct.map((row) => row.categoryText).filter((t): t is string => Boolean(t)),
    );

    const existingCollections = await fetchCollections(client);
    const collectionByTitle = new Map(
      existingCollections.map((c) => [c.title, c]),
    );

    const created: string[] = [];
    for (const [title, raws] of groups) {
      const rawsToMap = raws.filter((raw) => !mappedRaws.has(raw));
      if (rawsToMap.length === 0) {
        continue;
      }
      let collection = collectionByTitle.get(title) ?? null;
      if (!collection) {
        collection = await createCollection(client, title);
        collectionByTitle.set(title, collection);
        created.push(title);
      }
      await prisma.supplies24CollectionMap.createMany({
        data: rawsToMap.map((categoryText) => ({
          shop: session.shop,
          categoryText,
          collectionId: collection.id,
          collectionTitle: collection.title,
        })),
      });
    }

    return {
      ok: true,
      message:
        created.length > 0
          ? `Collezioni create per tipo prodotto: ${created.join(", ")}`
          : "Nessuna collezione da creare.",
    };
  }

  if (intent === "remapCollections") {
    const client = admin as unknown as GraphqlLike;
    const maps = await prisma.supplies24CollectionMap.findMany({
      where: { shop: session.shop, collectionId: { not: null } },
    });

    const offers = await prisma.supplies24Offer.findMany({
      where: {
        shop: session.shop,
        category: { in: maps.map((m) => m.categoryText) },
        productId: { not: null },
      },
      select: { category: true, productId: true },
    });

    const productsByCategory = new Map<string, string[]>();
    for (const offer of offers) {
      if (!offer.category || !offer.productId) {
        continue;
      }
      const list = productsByCategory.get(offer.category) ?? [];
      list.push(offer.productId);
      productsByCategory.set(offer.category, list);
    }

    let added = 0;
    let removed = 0;
    const moved: string[] = [];

    for (const mapping of maps) {
      if (!mapping.collectionId) {
        continue;
      }
      const productIds = productsByCategory.get(mapping.categoryText) ?? [];
      if (productIds.length > 0) {
        await addProductsToCollection(client, mapping.collectionId, productIds);
        added += productIds.length;
      }
      if (
        mapping.previousCollectionId &&
        mapping.previousCollectionId !== mapping.collectionId
      ) {
        await removeProductsFromCollection(
          client,
          mapping.previousCollectionId,
          productIds,
        );
        removed += productIds.length;
        moved.push(mapping.categoryText);
      }
      await prisma.supplies24CollectionMap.update({
        where: { id: mapping.id },
        data: { previousCollectionId: null },
      });
    }

    const message = [
      added > 0 ? `${added} prodotti sincronizzati nelle collezioni mappate` : null,
      removed > 0 ? `${removed} prodotti spostati dalle vecchie collezioni` : null,
      added === 0 && removed === 0
        ? "Nessun prodotto da rimappare (importa prima il listino)."
        : null,
    ]
      .filter(Boolean)
      .join(". ");

    return { ok: true, message, moved };
  }

  return { ok: false, error: "Richiesta non valida." };
};

export default function CollectionsPage() {
  const { collections, categories, unmapped, mappedCount, mappings, hasDownloadUrl, lastReadAt } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submitting = navigation.state === "submitting";

  return (
    <s-page heading="Mapping collezioni">
      <s-section heading="Categorie Supplies24 e collezioni Shopify">
        {actionData?.ok && <div className="message success">{actionData.message}</div>}
        {actionData?.error && <div className="message error">{actionData.error}</div>}

        <p>
          Le categorie provengono dal listino Supplies24 (ultimo download). Assegna
          a ogni categoria una collezione Shopify: i prodotti importati verranno
          aggiunti automaticamente alla collezione mappata.
        </p>

        <div className="actions" style={{ marginBottom: "1.25rem" }}>
          <Form method="post">
            <input type="hidden" name="intent" value="downloadCategories" />
            <s-button type="submit" variant="primary" disabled={submitting}>
              Scarica listino e leggi categorie
            </s-button>
          </Form>
          <Form method="post">
            <input type="hidden" name="intent" value="remapCollections" />
            <s-button type="submit" disabled={submitting}>
              Rimappa prodotti nelle collezioni
            </s-button>
          </Form>
        </div>

        {!hasDownloadUrl && (
          <div className="message">
            Nessun URL di download configurato: imposta il listino dalla pagina
            Impostazioni prima di leggere le categorie.
          </div>
        )}
        {lastReadAt && (
          <p style={{ color: "var(--text-subdued, #8c9196)" }}>
            Ultima lettura categorie: {lastReadAt.toLocaleString()}.
          </p>
        )}

        {unmapped.length > 0 && (
          <Form method="post" className="actions" style={{ marginBottom: "1.25rem" }}>
            <input type="hidden" name="intent" value="createCollections" />
            <s-button type="submit" variant="primary">
              Crea collezioni per le {unmapped.length} categorie non mappate
            </s-button>
          </Form>
        )}

        {categories.length === 0 ? (
          <p>
            Nessuna categoria trovata. Esegui almeno una sincronizzazione del
            listino per popolare le categorie.
          </p>
        ) : (
          <div className="table-wrap">
            <s-table>
              <s-table-header>
                <s-table-header-row>
                  <s-table-cell>Categoria listino</s-table-cell>
                  <s-table-cell>Collezione Shopify</s-table-cell>
                  <s-table-cell>Azioni</s-table-cell>
                </s-table-header-row>
              </s-table-header>
              <s-table-body>
                {categories.map((category) => (
                  <s-table-row key={category.categoryText}>
                    <s-table-cell>{category.categoryText}</s-table-cell>
                    <s-table-cell>
                      <Form method="post" className="inline-form">
                        <input
                          type="hidden"
                          name="intent"
                          value="map"
                        />
                        <input
                          type="hidden"
                          name="categoryText"
                          value={category.categoryText}
                        />
                        <div className="field">
                          <select name="collectionId" defaultValue={category.collectionId ?? ""}>
                            <option value="">— Nessuna collezione —</option>
                            {collections.map((collection) => (
                              <option key={collection.id} value={collection.id}>
                                {collection.title}
                              </option>
                            ))}
                          </select>
                        </div>
                        <s-button type="submit">Salva</s-button>
                      </Form>
                    </s-table-cell>
                  </s-table-row>
                ))}
              </s-table-body>
            </s-table>
          </div>
        )}
      </s-section>

      {mappedCount > 0 && (
        <s-section heading="Mapping configurati">
          <div className="table-wrap">
            <s-table>
              <s-table-header>
                <s-table-header-row>
                  <s-table-cell>Categoria listino</s-table-cell>
                  <s-table-cell>Collezione</s-table-cell>
                  <s-table-cell>Azioni</s-table-cell>
                </s-table-header-row>
              </s-table-header>
              <s-table-body>
                {mappings
                  .filter((mapping) => mapping.collectionId)
                  .map((mapping) => (
                  <s-table-row key={mapping.id}>
                    <s-table-cell>{mapping.categoryText}</s-table-cell>
                    <s-table-cell>{mapping.collectionTitle ?? mapping.collectionId}</s-table-cell>
                    <s-table-cell>
                      <Form method="post" className="row-actions">
                        <input type="hidden" name="intent" value="delete" />
                        <input type="hidden" name="id" value={mapping.id} />
                        <s-button type="submit" tone="critical">
                          Elimina
                        </s-button>
                      </Form>
                    </s-table-cell>
                  </s-table-row>
                ))}
              </s-table-body>
            </s-table>
          </div>
        </s-section>
      )}
    </s-page>
  );
}
