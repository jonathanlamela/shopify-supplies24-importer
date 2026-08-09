import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData, useFetcher } from "react-router";

import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import { curatedCollectionTitle } from "../.server/supplies24/categories";

interface CategoryMapRow {
  id: number;
  categoryText: string;
  productType: string | null;
  defaultProductType: string | null;
  taxonomyCategoryId: string | null;
  taxonomyCategoryName: string | null;
}

interface TaxonomySearchResult {
  categories: { id: string; name: string; fullName: string }[];
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const [discovered, maps] = await Promise.all([
    prisma.supplies24Category.findMany({
      where: { shop: session.shop },
      orderBy: { categoryText: "asc" },
    }),
    prisma.supplies24CategoryMap.findMany({
      where: { shop: session.shop },
    }),
  ]);

  const mappingByText = new Map(maps.map((m) => [m.categoryText, m]));

  const rows: CategoryMapRow[] = discovered.map((row) => {
    const existing = mappingByText.get(row.categoryText);
    return {
      id: existing?.id ?? 0,
      categoryText: row.categoryText,
      productType: existing?.productType ?? null,
      defaultProductType: curatedCollectionTitle(row.categoryText),
      taxonomyCategoryId: existing?.taxonomyCategoryId ?? null,
      taxonomyCategoryName: existing?.taxonomyCategoryName ?? null,
    };
  });

  return {
    rows,
    mappedCount: maps.length,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");

  if (intent === "delete") {
    const id = Number(formData.get("id"));
    await prisma.supplies24CategoryMap.deleteMany({
      where: { id, shop: session.shop },
    });
    return { ok: true, message: "Mapping eliminato." };
  }

  if (intent === "save") {
    const categoryText = String(formData.get("categoryText") ?? "").trim();
    const productType = String(formData.get("productType") ?? "").trim();
    const taxonomyCategoryId = String(
      formData.get("taxonomyCategoryId") ?? "",
    ).trim();
    const taxonomyCategoryName = String(
      formData.get("taxonomyCategoryName") ?? "",
    ).trim();

    if (!categoryText) {
      return { ok: false, error: "Categoria non valida." };
    }
    if (!productType && !taxonomyCategoryId) {
      return {
        ok: false,
        error: "Indica almeno il tipo di prodotto (productType) o la categoria Shopify.",
      };
    }

    await prisma.supplies24CategoryMap.upsert({
      where: {
        shop_categoryText: { shop: session.shop, categoryText },
      },
      update: {
        productType: productType || null,
        taxonomyCategoryId: taxonomyCategoryId || null,
        taxonomyCategoryName: taxonomyCategoryName || null,
      },
      create: {
        shop: session.shop,
        categoryText,
        productType: productType || null,
        taxonomyCategoryId: taxonomyCategoryId || null,
        taxonomyCategoryName: taxonomyCategoryName || null,
      },
    });

    return {
      ok: true,
      message: `Mapping salvato per "${categoryText}".`,
    };
  }

  return { ok: false, error: "Richiesta non valida." };
};

function TaxonomyPicker({
  defaultValueId,
  defaultValueName,
}: {
  defaultValueId: string | null;
  defaultValueName: string | null;
}) {
  const fetcher = useFetcher<TaxonomySearchResult>();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<{
    id: string;
    fullName: string;
  } | null>(
    defaultValueId
      ? { id: defaultValueId, fullName: defaultValueName ?? "" }
      : null,
  );

  const results = fetcher.data?.categories ?? [];

  const handleSearch = (value: string) => {
    setQuery(value);
    setSelected(null);
    setOpen(true);
    const term = value.trim();
    if (term.length >= 2) {
      fetcher.load(`/api/supplies24/taxonomy?q=${encodeURIComponent(term)}`);
    }
  };

  return (
    <div className="taxonomy-picker">
      <input
        type="text"
        value={selected ? selected.fullName : query}
        placeholder="Cerca categoria Shopify (es. toner)..."
        onChange={(e) => handleSearch(e.target.value)}
      />
      {open && results.length > 0 && (
        <ul className="taxonomy-results">
          {results.map((result) => (
            <li key={result.id}>
              <button
                type="button"
                onClick={() => {
                  setSelected({ id: result.id, fullName: result.fullName });
                  setOpen(false);
                }}
              >
                {result.fullName}
              </button>
            </li>
          ))}
        </ul>
      )}
      {selected && (
        <div className="taxonomy-selected">
          Categoria: {selected.fullName}
        </div>
      )}
      <input type="hidden" name="taxonomyCategoryId" value={selected?.id ?? ""} />
      <input
        type="hidden"
        name="taxonomyCategoryName"
        value={selected?.fullName ?? ""}
      />
    </div>
  );
}

export default function CategoriesPage() {
  const { rows, mappedCount } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <s-page heading="Categorie Shopify">
      <s-section heading="Categoria fornitore -> categoria Shopify">
        {actionData?.ok && <div className="message success">{actionData.message}</div>}
        {actionData?.error && <div className="message error">{actionData.error}</div>}

        <p>
          Associa a ogni categoria del listino il <strong>productType</strong> e,
          opzionalmente, la categoria standardizzata della tassonomia Shopify. I
          prodotti creati o aggiornati durante l&apos;importazione riceveranno questi
          valori. Se non imposti nulla, il productType suggerito deriva dal tipo
          di prodotto.
        </p>

        {rows.length === 0 ? (
          <p>
            Nessuna categoria trovata. Scarica prima il listino dalla pagina
            Collezioni.
          </p>
        ) : (
          <div className="table-wrap">
            <s-table>
              <s-table-header>
                <s-table-header-row>
                  <s-table-cell>Categoria listino</s-table-cell>
                  <s-table-cell>productType (testo libero)</s-table-cell>
                  <s-table-cell>Categoria Shopify (tassonomia)</s-table-cell>
                  <s-table-cell>Azioni</s-table-cell>
                </s-table-header-row>
              </s-table-header>
              <s-table-body>
                {rows.map((row) => (
                  <s-table-row key={row.categoryText}>
                    <s-table-cell>{row.categoryText}</s-table-cell>
                    <s-table-cell>
                      <Form method="post" className="inline-form">
                        <input
                          type="hidden"
                          name="intent"
                          value="save"
                        />
                        <input
                          type="hidden"
                          name="categoryText"
                          value={row.categoryText}
                        />
                        <div className="field">
                          <input
                            type="text"
                            name="productType"
                            defaultValue={
                              row.productType ?? row.defaultProductType ?? ""
                            }
                            placeholder="Es. Toner"
                          />
                        </div>
                        <TaxonomyPicker
                          key={`${row.categoryText}-${row.taxonomyCategoryId ?? ""}-${row.taxonomyCategoryName ?? ""}`}
                          defaultValueId={row.taxonomyCategoryId}
                          defaultValueName={row.taxonomyCategoryName}
                        />
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
                  <s-table-cell>productType</s-table-cell>
                  <s-table-cell>Categoria Shopify</s-table-cell>
                  <s-table-cell>Azioni</s-table-cell>
                </s-table-header-row>
              </s-table-header>
              <s-table-body>
                {rows
                  .filter(
                    (row) =>
                      row.productType ||
                      row.taxonomyCategoryId,
                  )
                  .map((row) => (
                    <s-table-row key={row.id}>
                      <s-table-cell>{row.categoryText}</s-table-cell>
                      <s-table-cell>{row.productType ?? "-"}</s-table-cell>
                      <s-table-cell>
                        {row.taxonomyCategoryName ?? row.taxonomyCategoryId ?? "-"}
                      </s-table-cell>
                      <s-table-cell>
                        <Form method="post" className="row-actions">
                          <input type="hidden" name="intent" value="delete" />
                          <input type="hidden" name="id" value={row.id} />
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
